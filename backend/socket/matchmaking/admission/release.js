// 입장 되돌리기 파일
// 명단에 넣은 입장 되돌리기 + 늦게 붙은 소켓 떼기 (지도 23)
// accept와 room 쪽(나가기·끊김·판 끝 정리·시작·삭제)이 사용
const channelMembership = require('../../channelMembership')
const { gameRooms, publishedAdmissions, playerRoom, roomAdmissionAttempts } = require('../core/state')
const { releasePublished } = require('./attempts')
const { isSeatedInRoom, detachSocketFromChannel, isCanonicalSocket, hasRoomMembership, hasLiveGameMembership, isOwnedByOtherSocket } = require('../room/membership')
const { getSettingsVersion } = require('../settings/receipts')
const { emitPublicRoomList, computeCanStart } = require('../room/view')
const { BOOT_EPOCH } = require('../core/constants')
const { disposeRoom } = require('../room/dispose')

// 명단에 넣었던 입장 시도 되돌리기 (내가 넣은 것일 때만, 방 사람들한테 알림)
function removePublished(io, socket, attempt) {
    // 명단에 넣은 시도만 되돌릴 게 있음
    if (!attempt || attempt.phase !== 'published') return
    const room = gameRooms.get(attempt.roomId)

    const stillMine = isStillMine(room, attempt)
    // 여기부터 진짜 바뀜: 명단·소속에서 뺌
    if (stillMine) {
        releasePublished(attempt)
        room.players.delete(attempt.accountUuid)
        playerRoom.delete(attempt.accountUuid)
    }

    // 이 시도의 소켓이면 채널 떼기, 다른 길로 다시 앉았으면 그대로 둠
    const accountStillSeated = isSeatedInRoom(attempt.accountUuid, attempt.roomId)
    if (socket && typeof socket.leave === 'function' && socket.id === attempt.socketId
        && (stillMine || !accountStillSeated)) {
        detachSocketFromChannel(socket, attempt.roomId, '[초대 입장 채널 정리 실패]', {
            ownsChannel: () =>
                isSeatedInRoom(attempt.accountUuid, attempt.roomId)
                && isCanonicalSocket(io, attempt.accountUuid, socket, attempt.roomId),
            keepsConnection: () =>
                hasRoomMembership(attempt.accountUuid) || hasLiveGameMembership(attempt.accountUuid),
        })
    }
    // 내가 뺀 게 아니면 알릴 것 없음
    if (!stillMine || !room) return
    // 빈 방이 됐으면 공통 정리로 방·입장 시도·영수증·우편함·초대 같이 지움 (known 1-11)
    if (room.players.size === 0) {
        disposeRoom(attempt.roomId, 'ROOM_GONE')
        emitPublicRoomList(io)
        return
    }
    announceRelease(io, room, attempt)
}

// 아직 이 시도가 넣은 그 자리인지 (같은 방 인스턴스·같은 소속 번호)
// 그사이 다른 길로 새로 앉았으면 안 건드림
function isStillMine(room, attempt) {
    const ownsPublication = publishedAdmissions.get(attempt.accountUuid) === attempt
    const seatedMembershipId = room?.players.get(attempt.accountUuid)?.membershipId
    return ownsPublication
        && room === attempt.room
        && room?.instanceId === attempt.roomInstanceId
        && playerRoom.get(attempt.accountUuid) === attempt.roomId
        && (attempt.publicationMembershipId === undefined
            || seatedMembershipId === attempt.publicationMembershipId)
}

// 되돌린 뒤 남은 방 사람들한테 알림: 방장 바뀜(필요할 때만) → 나간 사람 → 공개 방 목록
function announceRelease(io, room, attempt) {
    // 방장이 빠졌으면 남은 첫 사람이 방장, 방송 실패는 로그만
    if (!room.players.has(room.hostUuid)) {
        room.hostUuid = room.players.keys().next().value
        try {
            channelMembership.emitToChannel(io, attempt.roomId, 'host_changed', {
                hostUuid: room.hostUuid,
                canStart: computeCanStart(room),
                roomInstanceId: room.instanceId ?? null,
                bootEpoch: BOOT_EPOCH,
                roomId: attempt.roomId,
                settingsVersion: getSettingsVersion(room),
            })
        } catch (err) { console.error('[초대 입장 보상 방송 실패]', err) }
    }
    // 방 사람들한테 나간 것 알림, 방송 실패해도 되돌리기는 그대로
    try {
        channelMembership.emitToChannel(io, attempt.roomId, 'player_left_room', {
            uuid: attempt.accountUuid,
            membershipId: attempt.publicationMembershipId ?? null,
            roomId: attempt.roomId,
            roomInstanceId: room.instanceId ?? null,
            bootEpoch: BOOT_EPOCH,
            canStart: computeCanStart(room),
        })
    } catch (err) { console.error('[초대 입장 보상 방송 실패]', err) }
    emitPublicRoomList(io)
}

// join 시간 초과 뒤 늦게 채널에 붙은 소켓 떼기 예약
function scheduleLateJoinCleanup(io, socket, roomId, uuid, attempt, joinPromise) {
    if (!joinPromise || typeof joinPromise.then !== 'function') return
    // join 끝나면 봄, 이 시도의 소켓일 때만 (join 실패면 붙은 게 없어 할 일 없음)
    joinPromise.then(() => {
        if (!socket || typeof socket.leave !== 'function') return
        if (socket.id !== attempt.socketId) return
        // 채널 떼기, 그사이 정식으로 앉았으면 떼기 쪽이 되돌림
        const leaveNow = () => {
            detachSocketFromChannel(socket, roomId, '[늦은 초대 채널 정리 실패]', {
                ownsChannel: () =>
                    isSeatedInRoom(uuid, roomId)
                    && isCanonicalSocket(io, uuid, socket, roomId),
                keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
            })
        }
        // 새 탭이 이 방 자리 가졌으면 바로 뗌
        if (isOwnedByOtherSocket(io, roomId, uuid, socket)) { leaveNow(); return }
        // 그사이 이 방에 정식으로 들어왔거나, 같은 소켓으로 이 방 새 입장 중이면 그대로 둠
        if (playerRoom.get(uuid) === roomId) return
        const current = roomAdmissionAttempts.get(uuid)
        if (current && current !== attempt && current.roomId === roomId && current.socketId === socket.id) return
        leaveNow()
    }, () => {})
}

module.exports = {
    removePublished,
    scheduleLateJoinCleanup,
}
