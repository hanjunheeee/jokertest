// 판 참가자 대기방 정리 파일
// 판 참가자 대기방·줄·입장 시도 정리, gameSession departure/end가 matchmaking.js 거쳐 부름 (지도 02·07)
// 판 끝·판에서 나가기·게임 중 추방 때 불림
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
    // 세대 번호 올려 그 전에 시작한 방 만들기·입장 요청이 커밋 못 하게, 입장 시도는 없애고 되돌림
    for (const uuid of uuids) {
        bumpGeneration(uuid)
        const attempt = invalidateAttempt(uuid, 'SESSION_ENDED')
        if (attempt) {
            removePublished(io, null, attempt)
            compensateAttempt(attempt, 'SESSION_ENDED')
        }
    }

    // 줄에서 빼고, 아직 대기방에 앉은 사람만 모음 (소속 장부만 남은 흔적은 바로 지움)
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

        // 그 방 채널에 붙은 그 사람 소켓 전부 (나중에 떼려고)
        const ownedSockets = []
        for (const s of io.sockets.sockets.values()) {
            if (s.data?.user?.uuid !== uuid) continue
            if (!s.rooms?.has(roomId)) continue
            ownedSockets.push(s)
        }

        affected.push({ uuid, roomId, room, ownedSockets })
    }

    // 여기부터 진짜 바뀜: 명단·소속에서 뺌 (다 빼고 나서 방마다 방장·알림 정함)
    for (const entry of affected) {
        entry.room.players.delete(entry.uuid)
        playerRoom.delete(entry.uuid)
    }

    // 방 채널에서 소켓 떼기 (하나 실패해도 계속)
    for (const entry of affected) {
        for (const s of entry.ownedSockets) {
            try {
                s.leave(entry.roomId)
            } catch (err) {
                console.error('[세션 종료 Room 소켓 정리 실패]', err)
            }
        }
    }

    // 방마다 빠진 사람 묶기 (나감 알림용)
    const removedUuidsByRoom = new Map()
    for (const entry of affected) {
        if (!removedUuidsByRoom.has(entry.roomId)) removedUuidsByRoom.set(entry.roomId, [])
        removedUuidsByRoom.get(entry.roomId).push(entry.uuid)
    }

    // 방마다 한 번만: 빈 방 지우기 또는 방장 넘기기 → 빠진 사람 알림 → 공개 목록 새로
    const processedRoomIds = new Set()
    for (const entry of affected) {
        if (processedRoomIds.has(entry.roomId)) continue
        processedRoomIds.add(entry.roomId)

        const room = entry.room
        try {
            // 빈 방이면 지우고 공개 목록만 새로 (알릴 사람 없음)
            if (room.players.size === 0) {
                gameRooms.delete(entry.roomId)
                forgetSettingsResults(entry.roomId)
                emitPublicRoomList(io)
                continue
            }
            // 방장이 빠졌으면 남은 사람 중 먼저 들어온 사람에게
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

        // 빠진 사람마다 나감 알림 (하나 실패해도 계속)
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
