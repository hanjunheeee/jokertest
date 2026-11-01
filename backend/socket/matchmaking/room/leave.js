// 방 나가기 파일
// 방 나가기 확정·알림 + 끊긴 사람 15초 뒤 빼기, matchmaking.js·host(강퇴)·reconnect(끊김)가 씀 (지도 08·11)
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
    // 방에 없으면 걸 것 없음
    const roomId = playerRoom.get(uuid)
    if (!roomId) return

    // 옛 예약은 지우고 지금 순번 기억 (이 뒤에 방에 있음 확인되면 안 뺌)
    cancelRoomRetention(uuid)
    const scheduledTick = roomPresenceTick

    // 15초 뒤 실행: 그사이 확인됐거나 다른 방으로 갔으면 안 뺌, 빼면 그때 살아 있는 소켓으로 알림
    const run = () => {
        pendingRoomRemovals.delete(uuid)
        if ((presenceConfirmedTick.get(uuid) ?? -1) > scheduledTick) return
        if (playerRoom.get(uuid) !== roomId) return
        removeFromRoom(io, findLiveSocket(io, uuid), uuid)
    }

    // 이 타이머 때문에 서버가 안 꺼지는 일 없게 unref
    const timer = setTimeout(run, ROOM_RECONNECT_GRACE_MS)
    if (typeof timer.unref === 'function') timer.unref()

    // run도 같이 보관 (시험이 15초 안 기다리고 바로 실행)
    pendingRoomRemovals.set(uuid, { roomId, timer, run })
}

// 방 나가기 확정: 명단·소속 지우고 입장 시도·초대 정리, 방장 넘기기
function commitRoomDeparture(io, socket, uuid, reason) {
    // 끊김 빼기 예약 먼저 취소 (나중에 한 번 더 빼지 않게)
    cancelRoomRetention(uuid)

    // 내 입장 시도 있으면 없애고 명단에 넣은 것·초대 되돌림
    const ownAttempt = invalidateAttempt(uuid, reason)
    if (ownAttempt) {
        removePublished(io, socket, ownAttempt)
        compensateAttempt(ownAttempt, reason)
    }

    // 방에 없으면 뺄 것 없음 (알림도 안 감)
    const roomId = playerRoom.get(uuid)
    if (!roomId) return { removed: false }

    const room = gameRooms.get(roomId)
    if (!room) return { removed: false }

    // 여기부터 진짜 바뀜: 명단·소속에서 뺌
    const removedPlayer = room.players.get(uuid)
    room.players.delete(uuid)
    playerRoom.delete(uuid)

    // 마지막 사람이면 방 지우고 입장 시도·영수증·초대 정리
    if (room.players.size === 0) {
        gameRooms.delete(roomId)
        invalidateRoomAttempts(roomId, 'ROOM_GONE')
        forgetSettingsResults(roomId)
        cancelRoomInvitesAsync(roomId, 'ROOM_GONE')
        return { removed: true, uuid, roomId, room, removedPlayer, roomDeleted: true, hostChanged: false }
    }

    // 방장이 나갔으면 남은 사람 중 먼저 들어온 사람이 방장
    let hostChanged = false
    if (room.hostUuid === uuid) {
        room.hostUuid = room.players.keys().next().value
        hostChanged = true
    }
    return { removed: true, uuid, roomId, room, removedPlayer, roomDeleted: false, hostChanged }
}

// 나간 걸 본인·방 사람들·공개 목록에 알림
function notifyRoomDeparture(io, outcome, departingSockets = []) {
    // 실제로 빠진 게 없으면 알릴 것 없음
    if (!outcome.removed) return
    const { roomId, room, roomDeleted, hostChanged } = outcome

    // 나간 사람 소켓 채널 떼기 (그사이 다시 앉았으면 안 뗌, 다른 방·판 소속 남으면 연결 유지)
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

    // 방 없어졌으면 공개 목록만 새로
    if (roomDeleted) {
        try { emitPublicRoomList(io) } catch (err) { console.error('[공개 방 목록 갱신 실패]', err) }
        return
    }

    // 방장 바뀜 → 나감 → 공개 목록 순, 알림마다 따로 잡아 하나 실패해도 나머지는 보냄
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

// 나가기 확정 + 알림 한 번에 (나가기 사건·15초 끊김 만료가 씀)
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
