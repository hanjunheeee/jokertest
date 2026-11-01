// 끊김·재접속 파일
// 소켓 끊김 처리·재접속 때 방 채널 다시 붙이기 + 지금 방 묻기 (지도 08)
const channelMembership = require('../../channelMembership')
const kickReceiptStore = require('../../kickReceiptStore')
const { roomAdmissionAttempts, playerRoom, gameRooms, matchmakingQueue, pendingRoomTransitions } = require('../core/state')
const { invalidateAdmissionAttempt, compensateInvalidatedAttempt, getAdmissionAttempt } = require('../admission/attempts')
const { removePublishedAdmission } = require('../admission/release')
const { isCanonicalSocketForAccount, detachSocketFromChannel, isAccountSeatedInRoom, hasRoomMembership, hasLiveGameMembership } = require('./membership')
const { scheduleRoomRetentionOnDisconnect, cancelRoomRetention, markRoomPresenceConfirmed } = require('./leave')
const { buildRoomPayload } = require('./view')

// 재접속한 소켓을 원래 방 채널에 다시 붙임 (자리 그대로일 때만)
async function resyncRoomChannelOnReconnect(socket, uuid) {
    if (!socket) return

    const attempt = roomAdmissionAttempts.get(uuid)
    if (attempt && attempt.socketId !== socket.id) {
        invalidateAdmissionAttempt(uuid, 'CANONICAL_SOCKET_REPLACED')
        removePublishedAdmission(socket.server ?? null, null, attempt)
        compensateInvalidatedAttempt(attempt, 'CANONICAL_SOCKET_REPLACED')
    }

    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || !room.players.has(uuid)) return

    const seatAtCapture = room.players.get(uuid)
    const capturedMembershipId = seatAtCapture?.membershipId ?? null
    const capturedInstanceId = room.instanceId ?? room.id
    const capturedBootEpoch = kickReceiptStore.BOOT_EPOCH
    const io = socket.server ?? null

    const stillOwnsCapturedSeat = () => {
        if (playerRoom.get(uuid) !== roomId) return false
        const current = gameRooms.get(roomId)
        if (current !== room) return false
        if ((current.instanceId ?? current.id) !== capturedInstanceId) return false
        if (kickReceiptStore.BOOT_EPOCH !== capturedBootEpoch) return false
        const seat = current.players.get(uuid)
        if (!seat) return false
        if (capturedMembershipId !== null && (seat.membershipId ?? null) !== capturedMembershipId) return false
        return isCanonicalSocketForAccount(io, uuid, socket, roomId)
    }

    if (!stillOwnsCapturedSeat()) return

    if (socket.data) socket.data.activeRoomId = roomId

    try {
        await socket.join(roomId)
    } catch (err) {
        console.error('\x1b[31m[방 채널 재가입 실패]\x1b[0m', err)
        return
    }

    if (stillOwnsCapturedSeat()) return

    detachSocketFromChannel(
        socket, roomId, '[방 채널 재가입 보상 실패]',
        {
            ownsChannel: () =>
                isAccountSeatedInRoom(uuid, roomId)
                && isCanonicalSocketForAccount(io, uuid, socket, roomId),
            keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
        },
    )
}

// 소켓 끊김: 줄에서 빼고 입장 시도 정리, 방에 있으면 15초 유예 걸기
function onDisconnect(io, socket, uuid) {
    if (typeof socket?.id === 'string') channelMembership.releaseSocketFromAllChannels(socket.id)
    const queuedEntry = matchmakingQueue.get(uuid)
    if (queuedEntry && queuedEntry.socketId === socket?.id) {
        matchmakingQueue.delete(uuid)
    }

    const ownAttempt = roomAdmissionAttempts.get(uuid)
    if (ownAttempt && (socket?.id === undefined || ownAttempt.socketId === socket.id)) {
        const invalidated = invalidateAdmissionAttempt(uuid, 'DISCONNECTED')
        if (invalidated?.phase === 'published') removePublishedAdmission(io, socket, invalidated)
        compensateInvalidatedAttempt(invalidated, 'DISCONNECTED')
    }

    const currentRoomId = playerRoom.get(uuid)
    if (!currentRoomId) return

    const expectedRoomId = socket?.data?.activeRoomId
    if (expectedRoomId !== undefined && expectedRoomId !== currentRoomId) return

    scheduleRoomRetentionOnDisconnect(io, socket, uuid)
}

// 새로고침 뒤 지금 방 묻기 (확인되면 빼기 예약 취소)
function handleGetCurrentRoom(uuid, callback) {
    if (typeof callback !== 'function') return

    const attempt = getAdmissionAttempt(uuid)
    if (attempt) {
        callback({ ok: true, room: null, pending: true })
        return
    }

    const roomId = playerRoom.get(uuid)

    if (!roomId) {
        if (pendingRoomTransitions.has(uuid)) {
            callback({ ok: true, room: null, pending: true })
            return
        }
        callback({ ok: true, room: null })
        return
    }

    const room = gameRooms.get(roomId)

    if (!room || !room.players.has(uuid)) {
        playerRoom.delete(uuid)
        cancelRoomRetention(uuid)
        callback({ ok: true, room: null })
        return
    }

    markRoomPresenceConfirmed(uuid)
    cancelRoomRetention(uuid)

    callback({ ok: true, room: buildRoomPayload(room) })
}

module.exports = {
    resyncRoomChannelOnReconnect,
    onDisconnect,
    handleGetCurrentRoom,
}
