// 방장 행동 파일
// 방장 강퇴 + 방 지우기 (지도 11-③④)
const channelMembership = require('../../channelMembership')
const kickReceiptStore = require('../../kickReceiptStore')
const { BOOT_EPOCH } = require('../core/constants')
const { getAdmissionAttempt, invalidateRoomAttempts } = require('../admission/attempts')
const { rejectIfInGame } = require('../join/guards')
const { playerRoom, gameRooms } = require('../core/state')
const { resolveParticipantSockets } = require('./membership')
const { commitRoomDeparture, notifyRoomDeparture } = require('./leave')
const { forgetSettingsResults } = require('../settings/receipts')
const { cancelRoomInvitesAsync } = require('../admission/release')
const { emitPublicRoomList } = require('./view')

// 방장 강퇴: 같은 요청 다시 오면 영수증으로 결과 재생, 내용 다르면 거절
function handleKickRoomPlayer(io, socket, uuid, payload, callback, getCurrentSocketId) {
    if (typeof callback !== 'function') return

    const CODES = kickReceiptStore.KICK_ERROR_CODES
    const respond = (result) => {
        try {
            callback(result)
        } catch (ackErr) {
            console.error('[추방 ack 실패]', ackErr)
        }
    }
    const reject = (code, message, extra = {}) => respond({ ok: false, code, message, ...extra })

    const validated = kickReceiptStore.validateKickPayload(payload, kickReceiptStore.KICK_COMMANDS.ROOM)
    if (!validated.ok) {
        reject(validated.code, validated.message)
        return
    }
    const input = validated.value
    const fingerprint = kickReceiptStore.fingerprintKickRequest(kickReceiptStore.KICK_COMMANDS.ROOM, input)

    if (socket?.data?.user?.uuid !== uuid || socket?.connected === false) {
        reject(CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }
    if (typeof getCurrentSocketId === 'function' && getCurrentSocketId(uuid) !== socket.id) {
        reject(CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }

    const receiptKey = kickReceiptStore.kickReceiptKey(input.bootEpoch, uuid, input.requestId)
    const recorded = kickReceiptStore.lookupKickReceipt(receiptKey)
    if (recorded) {
        if (recorded.fingerprint !== fingerprint) {
            reject(CODES.REQUEST_ID_REUSED, '이미 사용한 요청 식별자입니다.')
            return
        }
        respond({ ...recorded.result, replayed: true })
        return
    }

    if (input.bootEpoch !== BOOT_EPOCH) {
        reject(CODES.STALE_BOOT, '서버가 재시작되었습니다. 방 정보를 다시 불러와주세요.')
        return
    }
    const decideReject = (code, message) => {
        if (!kickReceiptStore.hasKickRejectionCapacity()) {
            reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
            return
        }
        kickReceiptStore.recordKickReceipt(receiptKey, {
            command: kickReceiptStore.KICK_COMMANDS.ROOM,
            fingerprint,
            result: { ok: false, code, message },
        })
        reject(code, message)
    }

    if (input.targetUuid === uuid) {
        decideReject(CODES.SELF_KICK, '자신을 추방할 수 없습니다.')
        return
    }
    if (getAdmissionAttempt(uuid)) {
        decideReject(CODES.ADMISSION_PENDING, '입장 처리가 아직 끝나지 않았습니다.')
        return
    }
    if (rejectIfInGame(uuid, ({ message }) => decideReject(CODES.ALREADY_IN_GAME, message))) return

    const currentRoomId = playerRoom.get(uuid)
    if (!currentRoomId) {
        decideReject(CODES.NOT_IN_ROOM, '참여 중인 방이 없습니다.')
        return
    }
    if (currentRoomId !== input.roomId) {
        decideReject(CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    const room = gameRooms.get(input.roomId)
    if (!room) {
        decideReject(CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    if ((room.instanceId ?? room.id) !== input.roomInstanceId) {
        decideReject(CODES.ROOM_NOT_FOUND, '참여 중인 방을 찾을 수 없습니다.')
        return
    }
    const requester = room.players.get(uuid)
    if (!requester) {
        decideReject(CODES.NOT_IN_ROOM, '참여 중인 방이 없습니다.')
        return
    }
    if (requester.membershipId !== input.requesterMembershipId) {
        decideReject(CODES.STALE_MEMBERSHIP, '방 정보가 변경되었습니다. 다시 불러와주세요.')
        return
    }
    if (room.hostUuid !== uuid) {
        decideReject(CODES.NOT_HOST, '방장만 추방할 수 있습니다.')
        return
    }

    const target = room.players.get(input.targetUuid)
    if (!target || playerRoom.get(input.targetUuid) !== room.id) {
        decideReject(CODES.ALREADY_LEFT, '이미 방에서 나간 참가자입니다.')
        return
    }
    if (target.membershipId !== input.targetMembershipId) {
        decideReject(CODES.STALE_MEMBERSHIP, '대상이 변경되었습니다. 다시 확인해주세요.')
        return
    }
    if (getAdmissionAttempt(input.targetUuid)) {
        decideReject(CODES.ADMISSION_PENDING, '상대의 입장 처리가 아직 끝나지 않았습니다.')
        return
    }

    if (!kickReceiptStore.hasKickReceiptCapacity()) {
        reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
        return
    }

    const kickedEvent = {
        roomId: room.id,
        roomInstanceId: room.instanceId ?? room.id,
        bootEpoch: BOOT_EPOCH,
        targetUuid: input.targetUuid,
        targetMembershipId: target.membershipId,
        hostUuid: uuid,
        requestId: input.requestId,
    }
    const targetSockets = resolveParticipantSockets(io, [input.targetUuid], room.id).get(input.targetUuid) ?? []
    const outcome = commitRoomDeparture(io, null, input.targetUuid, 'KICKED_FROM_ROOM')
    const result = {
        ok: true,
        status: 'KICKED',
        roomId: input.roomId,
        requestId: input.requestId,
        targetUuid: input.targetUuid,
        targetMembershipId: input.targetMembershipId,
    }
    kickReceiptStore.recordKickReceipt(receiptKey, {
        command: kickReceiptStore.KICK_COMMANDS.ROOM,
        fingerprint,
        result,
    })

    respond(result)
    for (const targetSocket of targetSockets) {
        try {
            targetSocket.emit(kickReceiptStore.KICK_EVENTS.ROOM_KICKED, kickedEvent)
        } catch (err) {
            console.error('[추방 개인 통지 실패]', { code: 'KICK_NOTIFY_ERROR', roomId: room.id })
        }
    }
    notifyRoomDeparture(io, outcome, targetSockets)
}

// 방장 방 지우기: 입장 시도·초대 정리하고 공개 목록 새로
function handleDeleteRoom(io, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || room.hostUuid !== uuid) return

    channelMembership.emitToChannel(io, roomId, 'room_deleted', {})

    room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    gameRooms.delete(roomId)
    invalidateRoomAttempts(roomId, 'ROOM_DELETED')
    forgetSettingsResults(roomId)
    cancelRoomInvitesAsync(roomId, 'ROOM_DELETED')
    emitPublicRoomList(io)
}

module.exports = {
    handleKickRoomPlayer,
    handleDeleteRoom,
}
