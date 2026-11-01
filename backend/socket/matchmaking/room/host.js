// 방장 행동 파일
// 방장 강퇴 + 방 지우기, matchmaking.js가 사건 받아 부름 (지도 11-③④)
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
    // ack 보내다 터져도 처리기는 계속 (로그만)
    const respond = (result) => {
        try {
            callback(result)
        } catch (ackErr) {
            console.error('[추방 ack 실패]', ackErr)
        }
    }
    // 영수증 없이 거절만 (모양·소켓·부팅 번호·자리 부족 같은 판단 전 거절)
    const reject = (code, message, extra = {}) => respond({ ok: false, code, message, ...extra })

    // 모양 먼저 (지문 만들려면 필요), 그다음 지금 소켓
    const validated = kickReceiptStore.validateKickPayload(payload, kickReceiptStore.KICK_COMMANDS.ROOM)
    if (!validated.ok) {
        reject(validated.code, validated.message)
        return
    }
    const input = validated.value
    const fingerprint = kickReceiptStore.fingerprintKickRequest(kickReceiptStore.KICK_COMMANDS.ROOM, input)

    // 끊긴 소켓·새 탭에 밀린 옛 소켓 요청은 거절
    if (socket?.data?.user?.uuid !== uuid || socket?.connected === false) {
        reject(CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }
    if (typeof getCurrentSocketId === 'function' && getCurrentSocketId(uuid) !== socket.id) {
        reject(CODES.STALE_SOCKET, '연결이 만료되었습니다. 다시 시도해주세요.')
        return
    }

    // 같은 요청 id 다시 오면 저장된 답 그대로 (내용 다르면 재사용 거절)
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

    // 서버 재시작 전 화면에서 온 요청이면 방 정보 다시 받게
    if (input.bootEpoch !== BOOT_EPOCH) {
        reject(CODES.STALE_BOOT, '서버가 재시작되었습니다. 방 정보를 다시 불러와주세요.')
        return
    }
    // 판단 거절은 영수증에 남겨 재시도에도 같은 답 (자리 없으면 기록 없이 잠시 후 다시)
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

    // 자기 강퇴·내 입장 처리 중·게임 중이면 거절
    if (input.targetUuid === uuid) {
        decideReject(CODES.SELF_KICK, '자신을 추방할 수 없습니다.')
        return
    }
    if (getAdmissionAttempt(uuid)) {
        decideReject(CODES.ADMISSION_PENDING, '입장 처리가 아직 끝나지 않았습니다.')
        return
    }
    if (rejectIfInGame(uuid, ({ message }) => decideReject(CODES.ALREADY_IN_GAME, message))) return

    // 요청이 가리킨 방·인스턴스가 지금 내 방 그대로인지
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
    // 내가 화면에서 본 그 자리 그대로인 방장인지
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

    // 대상이 확인한 그 자리로 아직 있고 입장 처리 중 아닌지 (다시 들어온 새 자리는 못 쫓음)
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

    // 성공 영수증 남길 자리 없으면 실행 전에 거절 (실행만 하고 기록 못 하면 재시도가 다른 답 받음)
    if (!kickReceiptStore.hasKickReceiptCapacity()) {
        reject(CODES.RECEIPT_CAPACITY, '잠시 후 다시 시도해주세요.')
        return
    }

    // 대상 소켓은 빼기 전에 잡아 둠 (빠지면 앉은 사람 소켓 찾기에서 안 나옴)
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
    // 여기부터 진짜 바뀜: 대상 방에서 빼고 성공 영수증 남김
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

    // 방장 답 먼저, 그다음 대상 개인 통지(하나 실패해도 계속) → 채널 떼기·방 사람들 알림
    respond(result)
    for (const targetSocket of targetSockets) {
        try {
            targetSocket.emit(kickReceiptStore.KICK_EVENTS.ROOM_KICKED, kickedEvent)
        } catch {
            console.error('[추방 개인 통지 실패]', { code: 'KICK_NOTIFY_ERROR', roomId: room.id })
        }
    }
    notifyRoomDeparture(io, outcome, targetSockets)
}

// 방장 방 지우기: 입장 시도·초대 정리하고 공개 목록 새로
function handleDeleteRoom(io, uuid) {
    // 방에 있는 방장만 (아니면 답 없이 무시, ack 없는 사건)
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || room.hostUuid !== uuid) return

    // 여기부터 진짜 바뀜: 방 사람들한테 먼저 알리고 명단·방·입장 시도·영수증·초대 정리
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
