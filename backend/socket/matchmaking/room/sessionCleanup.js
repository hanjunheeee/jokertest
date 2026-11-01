// 게임 시작·끝 정리 파일
// 판 참가자들의 대기방·줄·입장 시도 정리, socket gameSession이 부름 (지도 02·07)
const channelMembership = require('../../channelMembership')
const { bumpGeneration } = require('../join/transition')
const { invalidateAttempt, compensateAttempt } = require('../admission/attempts')
const { removePublished } = require('../admission/release')
const { matchmakingQueue, playerRoom, gameRooms } = require('../core/state')
const { forgetSettingsResults, getSettingsVersion } = require('../settings/receipts')
const { emitPublicRoomList, computeCanStart } = require('./view')
const { BOOT_EPOCH } = require('../core/constants')

// 판 참가자 정리: 줄에서 빼고, 남은 대기방 소속·입장 시도 지우고, 세대 번호 올림
function cleanupRoomStateForSessionParticipants(io, uuids) {
    for (const uuid of uuids) {
        bumpGeneration(uuid)
        const attempt = invalidateAttempt(uuid, 'SESSION_ENDED')
        if (attempt) {
            removePublished(io, null, attempt)
            compensateAttempt(attempt, 'SESSION_ENDED')
        }
    }

    const affected = []
    for (const uuid of uuids) {
        matchmakingQueue.delete(uuid)

        const roomId = playerRoom.get(uuid)
        if (!roomId) continue
        const room = gameRooms.get(roomId)
        if (!room || !room.players.has(uuid)) {
            playerRoom.delete(uuid)
            continue
        }

        const ownedSockets = []
        for (const s of io.sockets.sockets.values()) {
            if (s.data?.user?.uuid !== uuid) continue
            if (!s.rooms?.has(roomId)) continue
            ownedSockets.push(s)
        }

        affected.push({ uuid, roomId, room, ownedSockets })
    }

    for (const entry of affected) {
        entry.room.players.delete(entry.uuid)
        playerRoom.delete(entry.uuid)
    }

    for (const entry of affected) {
        for (const s of entry.ownedSockets) {
            try {
                s.leave(entry.roomId)
            } catch (err) {
                console.error('[세션 종료 Room 소켓 정리 실패]', err)
            }
        }
    }

    const removedUuidsByRoom = new Map()
    for (const entry of affected) {
        if (!removedUuidsByRoom.has(entry.roomId)) removedUuidsByRoom.set(entry.roomId, [])
        removedUuidsByRoom.get(entry.roomId).push(entry.uuid)
    }

    const processedRoomIds = new Set()
    for (const entry of affected) {
        if (processedRoomIds.has(entry.roomId)) continue
        processedRoomIds.add(entry.roomId)

        const room = entry.room
        try {
            if (room.players.size === 0) {
                gameRooms.delete(entry.roomId)
                forgetSettingsResults(entry.roomId)
                emitPublicRoomList(io)
                continue
            }
            if (!room.players.has(room.hostUuid)) {
                room.hostUuid = room.players.keys().next().value
                channelMembership.emitToChannel(io, entry.roomId, 'host_changed', {
                    hostUuid: room.hostUuid,
                    canStart: computeCanStart(room),
                    roomId: entry.roomId,
                    roomInstanceId: room.instanceId ?? null,
                    bootEpoch: BOOT_EPOCH,
                    settingsVersion: getSettingsVersion(room),
                })
            }
        } catch (err) {
            console.error('[세션 종료 Room 정리 실패]', err)
        }

        for (const removedUuid of removedUuidsByRoom.get(entry.roomId) ?? []) {
            try {
                channelMembership.emitToChannel(io, entry.roomId, 'player_left_room', {
                    uuid: removedUuid,
                    canStart: computeCanStart(room),
                    roomId: entry.roomId,
                    roomInstanceId: room.instanceId ?? null,
                    bootEpoch: BOOT_EPOCH,
                })
            } catch (err) {
                console.error('[세션 종료 Room 정리 실패]', err)
            }
        }

        emitPublicRoomList(io)
    }
}

module.exports = {
    cleanupRoomStateForSessionParticipants,
}
