// 입장 되돌리기 파일
// 명단에 넣은 입장 시도 되돌리기·늦게 붙은 소켓 정리 + 방 초대 취소 (지도 23)
const channelMembership = require('../../channelMembership')
const { gameRooms, publishedAdmissions, playerRoom, roomAdmissionAttempts } = require('../core/state')
const { releasePublished } = require('./attempts')
const { isSeatedInRoom, detachSocketFromChannel, isCanonicalSocket, hasRoomMembership, hasLiveGameMembership, isOwnedByOtherSocket } = require('../room/membership')
const { forgetSettingsResults, getSettingsVersion } = require('../settings/receipts')
const { emitPublicRoomList, computeCanStart } = require('../room/view')
const { BOOT_EPOCH } = require('../core/constants')
const { deps } = require('../core/deps')

// 명단에 넣었던 입장 시도 되돌리기 (내가 넣은 것일 때만, 방 사람들한테 알림)
function removePublished(io, socket, attempt) {
    if (!attempt || attempt.phase !== 'published') return
    const room = gameRooms.get(attempt.roomId)

    const ownsPublication = publishedAdmissions.get(attempt.accountUuid) === attempt
    const seatedMembershipId = room?.players.get(attempt.accountUuid)?.membershipId
    const stillMine = ownsPublication
        && room === attempt.room
        && room?.instanceId === attempt.roomInstanceId
        && playerRoom.get(attempt.accountUuid) === attempt.roomId
        && (attempt.publicationMembershipId === undefined
            || seatedMembershipId === attempt.publicationMembershipId)
    if (stillMine) {
        releasePublished(attempt)
        room.players.delete(attempt.accountUuid)
        playerRoom.delete(attempt.accountUuid)
    }

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
    if (!stillMine || !room) return
    if (room.players.size === 0) {
        gameRooms.delete(attempt.roomId)
        forgetSettingsResults(attempt.roomId)
        emitPublicRoomList(io)
        return
    }
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

// 입장 실패 뒤 늦게 채널에 붙은 소켓 떼기 예약
function scheduleLateJoinCleanup(io, socket, roomId, uuid, attempt, joinPromise) {
    if (!joinPromise || typeof joinPromise.then !== 'function') return
    joinPromise.then(() => {
        if (!socket || typeof socket.leave !== 'function') return
        if (socket.id !== attempt.socketId) return
        const leaveNow = () => {
            detachSocketFromChannel(socket, roomId, '[늦은 초대 채널 정리 실패]', {
                ownsChannel: () =>
                    isSeatedInRoom(uuid, roomId)
                    && isCanonicalSocket(io, uuid, socket, roomId),
                keepsConnection: () => hasRoomMembership(uuid) || hasLiveGameMembership(uuid),
            })
        }
        if (isOwnedByOtherSocket(io, roomId, uuid, socket)) { leaveNow(); return }
        if (playerRoom.get(uuid) === roomId) return
        const current = roomAdmissionAttempts.get(uuid)
        if (current && current !== attempt && current.roomId === roomId && current.socketId === socket.id) return
        leaveNow()
    }, () => {})
}

// 방이 없어지거나 시작되면 그 방 초대 전부 취소 (실패해도 무시)
function cancelRoomInvitesAsync(roomId, reason) {
    Promise.resolve()
        .then(() => deps.gameInviteService.cancelPendingInvitesForRoom(roomId, reason))
        .catch((err) => console.error('[방 소멸 초대 정리 실패]', err))
}

module.exports = {
    removePublished,
    scheduleLateJoinCleanup,
    cancelRoomInvitesAsync,
}
