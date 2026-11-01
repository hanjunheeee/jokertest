// 방 나가기 파일
// 방 나가기 확정·알림 + 끊긴 사람 15초 뒤 빼기 예약 (지도 08·11)
const channelMembership = require('../../channelMembership')
const { presenceConfirmedTick, pendingRoomRemovals, playerRoom, gameRooms } = require('../core/state')
const { findLiveSocket, detachSocketFromChannel, isSeatedInRoom, isCanonicalSocket, hasRoomMembership, hasLiveGameMembership } = require('./membership')
const { ROOM_RECONNECT_GRACE_MS, BOOT_EPOCH } = require('../core/constants')
const { invalidateAttempt, compensateAttempt, invalidateRoomAttempts } = require('../admission/attempts')
const { removePublished, cancelRoomInvitesAsync } = require('../admission/release')
const { forgetSettingsResults, getSettingsVersion } = require('../settings/receipts')
const { emitPublicRoomList, computeCanStart } = require('./view')

// "방에 있음" 확인 순번 시계 (벽시계 대신 하나씩 올림)
let roomPresenceTick = 0

// 방에 있다고 확인된 순번 기록 (늦게 온 끊김이 이걸 못 뒤집게)
function markPresenceConfirmed(uuid) {
    roomPresenceTick += 1
    presenceConfirmedTick.set(uuid, roomPresenceTick)
}

// 끊긴 사람 빼기 예약 취소 (돌아왔을 때)
function cancelRoomRetention(uuid) {
    const pending = pendingRoomRemovals.get(uuid)
    if (!pending) return
    clearTimeout(pending.timer)
    pendingRoomRemovals.delete(uuid)
}

// 끊긴 사람 15초 뒤 방에서 빼기 예약 (그사이 다시 오거나 확인되면 안 뺌)
function scheduleRoomRetention(io, socket, uuid) {
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    cancelRoomRetention(uuid)
    const scheduledTick = roomPresenceTick

    const run = () => {
        pendingRoomRemovals.delete(uuid)
        if ((presenceConfirmedTick.get(uuid) ?? -1) > scheduledTick) return
        if (playerRoom.get(uuid) !== roomId) return
        removeFromRoom(io, findLiveSocket(io, uuid), uuid)
    }

    const timer = setTimeout(run, ROOM_RECONNECT_GRACE_MS)
    if (typeof timer.unref === 'function') timer.unref()

    pendingRoomRemovals.set(uuid, { roomId, timer, run })
}

// 방 나가기 확정: 명단·소속 지우고 입장 시도·초대 정리, 방장 넘기기
function commitRoomDeparture(io, socket, uuid, reason) {
    cancelRoomRetention(uuid)

    const ownAttempt = invalidateAttempt(uuid, reason)
    if (ownAttempt) {
        removePublished(io, socket, ownAttempt)
        compensateAttempt(ownAttempt, reason)
    }

    const roomId = playerRoom.get(uuid)
    if (!roomId) return { removed: false }

    const room = gameRooms.get(roomId)
    if (!room) return { removed: false }

    const removedPlayer = room.players.get(uuid)
    room.players.delete(uuid)
    playerRoom.delete(uuid)

    if (room.players.size === 0) {
        gameRooms.delete(roomId)
        invalidateRoomAttempts(roomId, 'ROOM_GONE')
        forgetSettingsResults(roomId)
        cancelRoomInvitesAsync(roomId, 'ROOM_GONE')
        return { removed: true, uuid, roomId, room, removedPlayer, roomDeleted: true, hostChanged: false }
    }

    let hostChanged = false
    if (room.hostUuid === uuid) {
        room.hostUuid = room.players.keys().next().value
        hostChanged = true
    }
    return { removed: true, uuid, roomId, room, removedPlayer, roomDeleted: false, hostChanged }
}

// 나간 걸 본인·방 사람들·공개 목록에 알림
function notifyRoomDeparture(io, outcome, departingSockets = []) {
    if (!outcome.removed) return
    const { roomId, room, roomDeleted, hostChanged } = outcome

    for (const departing of departingSockets) {
        detachSocketFromChannel(
            departing, roomId, '[대기방 채널 이탈 실패]',
            {
                ownsChannel: () =>
                    isSeatedInRoom(outcome.uuid, roomId)
                    && isCanonicalSocket(io, outcome.uuid, departing, roomId),
                keepsConnection: () =>
                    hasRoomMembership(outcome.uuid) || hasLiveGameMembership(outcome.uuid),
            },
        )
    }

    if (roomDeleted) {
        try { emitPublicRoomList(io) } catch (err) { console.error('[공개 방 목록 갱신 실패]', err) }
        return
    }

    if (hostChanged) {
        try {
            channelMembership.emitToChannel(io, roomId, 'host_changed', {
                hostUuid: room.hostUuid,
                canStart: computeCanStart(room),
                roomId,
                roomInstanceId: room.instanceId ?? null,
                bootEpoch: BOOT_EPOCH,
                settingsVersion: getSettingsVersion(room),
            })
        } catch (err) {
            console.error('[방장 변경 방송 실패]', err)
        }
    }

    try {
        channelMembership.emitToChannel(io, roomId, 'player_left_room', {
            uuid: outcome.uuid,
            membershipId: outcome.removedPlayer?.membershipId ?? null,
            roomId,
            roomInstanceId: room.instanceId ?? null,
            bootEpoch: BOOT_EPOCH,
            canStart: computeCanStart(room),
        })
    } catch (err) {
        console.error('[참가자 이탈 방송 실패]', err)
    }

    try { emitPublicRoomList(io) } catch (err) { console.error('[공개 방 목록 갱신 실패]', err) }
}

// 나가기 확정 + 알림 한 번에
function removeFromRoom(io, socket, uuid) {
    const outcome = commitRoomDeparture(io, socket, uuid, 'LEFT_ROOM')
    notifyRoomDeparture(io, outcome, socket ? [socket] : [])
}

// 시험 초기화 때 순번 시계 0으로 되돌림
function resetRoomPresenceTick() {
    roomPresenceTick = 0
}

module.exports = {
    resetRoomPresenceTick,
    markPresenceConfirmed,
    cancelRoomRetention,
    scheduleRoomRetention,
    commitRoomDeparture,
    notifyRoomDeparture,
    removeFromRoom,
}
