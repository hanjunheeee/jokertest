// 끊김·재접속 파일
// 소켓 끊김 처리·재접속 때 방 채널 다시 붙이기 + 지금 방 묻기, matchmaking.js가 내보냄 (지도 08)
// 끊김은 socket.js, 재접속은 connection/presence, 지금 방 묻기는 사건 등록으로 불림
const channelMembership = require('../../channelMembership')
const kickReceiptStore = require('../../kickReceiptStore')
const { roomAdmissionAttempts, playerRoom, gameRooms, matchmakingQueue, pendingRoomTransitions } = require('../core/state')
const { invalidateAttempt, compensateAttempt, getAdmissionAttempt } = require('../admission/attempts')
const { removePublished } = require('../admission/release')
const { isCanonicalSocket, detachSocketFromChannel, isSeatedInRoom, hasRoomMembership, hasLiveGameMembership } = require('./membership')
const { scheduleRoomRetention, cancelRoomRetention, markPresenceConfirmed } = require('./leave')
const { buildRoomPayload } = require('./view')

// 재접속한 소켓을 원래 방 채널에 다시 붙임 (자리 그대로일 때만)
async function resyncRoomChannelOnReconnect(socket, uuid) {
    if (!socket) return

    // 다른 소켓으로 하던 입장 시도는 새 소켓이 못 이어받으니 없애고 되돌림
    const attempt = roomAdmissionAttempts.get(uuid)
    if (attempt && attempt.socketId !== socket.id) {
        invalidateAttempt(uuid, 'CANONICAL_SOCKET_REPLACED')
        removePublished(socket.server ?? null, null, attempt)
        compensateAttempt(attempt, 'CANONICAL_SOCKET_REPLACED')
    }

    // 방에 앉아 있을 때만
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    const room = gameRooms.get(roomId)
    if (!room || !room.players.has(uuid)) return

    // join 기다리는 사이 바뀌었는지 보려고 지금 방·인스턴스·부팅·자리 찍어 둠
    const seatAtCapture = room.players.get(uuid)
    const capturedMembershipId = seatAtCapture?.membershipId ?? null
    const capturedInstanceId = room.instanceId ?? room.id
    const capturedBootEpoch = kickReceiptStore.BOOT_EPOCH
    const io = socket.server ?? null

    // 찍어 둔 그 자리 그대로고 이 소켓이 계정의 진짜 소켓인지
    const stillOwnsCapturedSeat = () => {
        if (playerRoom.get(uuid) !== roomId) return false
        const current = gameRooms.get(roomId)
        if (current !== room) return false
        if ((current.instanceId ?? current.id) !== capturedInstanceId) return false
        if (kickReceiptStore.BOOT_EPOCH !== capturedBootEpoch) return false
        const seat = current.players.get(uuid)
        if (!seat) return false
        if (capturedMembershipId !== null && (seat.membershipId ?? null) !== capturedMembershipId) return false
        return isCanonicalSocket(io, uuid, socket, roomId)
    }

    if (!stillOwnsCapturedSeat()) return

    // 이 소켓 끊김이 이 방 끊김으로 처리되게 지금 방 적어 둠
    if (socket.data) socket.data.activeRoomId = roomId

    try {
        await socket.join(roomId)
    } catch (err) {
        console.error('\x1b[31m[방 채널 재가입 실패]\x1b[0m', err)
        return
    }

    // join 사이 자리 그대로면 끝
    if (stillOwnsCapturedSeat()) return

    // 그사이 나갔거나 강퇴·새 탭에 밀렸으면 방금 붙인 채널 도로 뗌
    detachSocketFromChannel(
        socket, roomId, '[방 채널 재가입 보상 실패]',
        {
            ownsChannel: () =>
                isSeatedInRoom(uuid, roomId)
                && isCanonicalSocket(io, uuid, socket, roomId),
            keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
        },
    )
}

// 소켓 끊김: 줄에서 빼고 입장 시도 정리, 방에 있으면 15초 유예 걸기
function onDisconnect(io, socket, uuid) {
    // 끊긴 소켓의 전달 제외 기록 전부 풂 (안 풀면 계속 쌓임)
    if (typeof socket?.id === 'string') channelMembership.releaseSocketFromAllChannels(socket.id)
    // 줄은 이 소켓으로 선 것만 빼기 (새 탭으로 다시 선 줄은 그대로)
    const queuedEntry = matchmakingQueue.get(uuid)
    if (queuedEntry && queuedEntry.socketId === socket?.id) {
        matchmakingQueue.delete(uuid)
    }

    // 이 소켓 입장 시도면 없애고 명단에 넣은 것·초대 되돌림
    const ownAttempt = roomAdmissionAttempts.get(uuid)
    if (ownAttempt && (socket?.id === undefined || ownAttempt.socketId === socket.id)) {
        const invalidated = invalidateAttempt(uuid, 'DISCONNECTED')
        if (invalidated?.phase === 'published') removePublished(io, socket, invalidated)
        compensateAttempt(invalidated, 'DISCONNECTED')
    }

    // 방에 있고 이 소켓이 그 방 소켓일 때만 유예 (다른 방 들던 옛 소켓 끊김은 무시)
    const currentRoomId = playerRoom.get(uuid)
    if (!currentRoomId) return

    const expectedRoomId = socket?.data?.activeRoomId
    if (expectedRoomId !== undefined && expectedRoomId !== currentRoomId) return

    scheduleRoomRetention(io, socket, uuid)
}

// 새로고침 뒤 지금 방 묻기 (확인되면 빼기 예약 취소)
function handleGetCurrentRoom(uuid, callback) {
    if (typeof callback !== 'function') return

    // 초대 입장 처리 중이면 아직 방 없음 + 기다리라고 (pending)
    const attempt = getAdmissionAttempt(uuid)
    if (attempt) {
        callback({ ok: true, room: null, pending: true })
        return
    }

    const roomId = playerRoom.get(uuid)

    // 방 없음, 방 만들기·입장·매칭 처리 중이면 pending
    if (!roomId) {
        if (pendingRoomTransitions.has(uuid)) {
            callback({ ok: true, room: null, pending: true })
            return
        }
        callback({ ok: true, room: null })
        return
    }

    const room = gameRooms.get(roomId)

    // 소속 장부만 남고 방·자리가 없으면 흔적 지우고 방 없음
    if (!room || !room.players.has(uuid)) {
        playerRoom.delete(uuid)
        cancelRoomRetention(uuid)
        callback({ ok: true, room: null })
        return
    }

    // 방에 있음 확인: 순번 올리고 끊김 빼기 예약 취소
    markPresenceConfirmed(uuid)
    cancelRoomRetention(uuid)

    callback({ ok: true, room: buildRoomPayload(room) })
}

module.exports = {
    resyncRoomChannelOnReconnect,
    onDisconnect,
    handleGetCurrentRoom,
}
