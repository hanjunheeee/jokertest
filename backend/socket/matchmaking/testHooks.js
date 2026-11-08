// 대기방·매칭 시험 손잡이 파일, 장부 비우기·넣기·복사본·끊김 예약 바로 돌리기
// matchmaking.js가 이름 그대로 다시 내보냄 (시험만 씀, 실제 흐름은 안 부름)
const kickReceiptStore = require('../kickReceiptStore')
const channelMembership = require('../channelMembership')
const {
    matchmakingQueue,
    gameRooms,
    playerRoom,
    partyRoomByGameId,
    pendingRoomTransitions,
    roomAdmissionAttempts,
    publishedAdmissions,
    roomSettingsUpdateResults,
    startedRoomMarks,
    pendingRoomRemovals,
    presenceConfirmedTick,
} = require('./core/state')
const { BOOT_EPOCH } = require('./core/constants')
const { forgetSettingsResults } = require('./settings/receipts')
const { invalidateRoomAttempts, nextAttemptId } = require('./admission/attempts')
const { getTotalTimeoutMs } = require('./admission/timeouts')
const { getGeneration } = require('./join/transition')
const { resetRoomPresenceTick } = require('./room/leave')
const { __resetEntryLimitsForTests } = require('./join/entryLimits')

// 시험용: 장부·영수증·제외 기록 전부 비우고 끊김 예약 타이머 끔 (세대 번호 장부는 그대로)
function __resetStateForTests() {
    matchmakingQueue.clear()
    gameRooms.clear()
    playerRoom.clear()
    pendingRoomTransitions.clear()
    roomAdmissionAttempts.clear()
    publishedAdmissions.clear()
    startedRoomMarks.clear()
    roomSettingsUpdateResults.clear()
    partyRoomByGameId.clear()
    kickReceiptStore.__resetKickReceiptsForTests()
    channelMembership.__resetChannelExclusionsForTests()
    for (const pending of pendingRoomRemovals.values()) clearTimeout(pending.timer)
    pendingRoomRemovals.clear()
    presenceConfirmedTick.clear()
    resetRoomPresenceTick()
    __resetEntryLimitsForTests()
}

// 시험용: 15초 안 기다리고 끊김 빼기 예약 바로 실행
function __flushRoomRetentionForTests() {
    for (const pending of [...pendingRoomRemovals.values()]) {
        clearTimeout(pending.timer)
        pending.run()
    }
}

// 시험용: 끊김 빼기 예약 목록 [uuid, 방 id]
function __getPendingRoomRemovalsForTests() {
    return [...pendingRoomRemovals.entries()].map(([uuid, { roomId }]) => [uuid, roomId])
}

// 시험용: 장부 복사본 (설정은 깊은 복사, 시험이 고쳐도 진짜 장부 안 바뀌게)
function __getStateSnapshotForTests() {
    return {
        matchmakingQueue: [...matchmakingQueue.entries()],
        gameRooms: [...gameRooms.entries()].map(([id, room]) => [
            id,
            {
                ...room,
                players: [...room.players.entries()],
                settings: room.settings === undefined || room.settings === null
                    ? room.settings
                    : JSON.parse(JSON.stringify(room.settings)),
            },
        ]),
        playerRoom: [...playerRoom.entries()],
        roomSettingsUpdateResults: [...roomSettingsUpdateResults.entries()].map(([key, entry]) => [key, {
            roomId: entry.roomId,
            changed: entry.changed,
            settingsVersion: entry.settingsVersion,
        }]),
        pendingRoomTransitions: [...pendingRoomTransitions.keys()],
        roomAdmissionAttempts: [...roomAdmissionAttempts.entries()].map(([uuid, attempt]) => [uuid, {
            attemptId: attempt.attemptId,
            inviteId: attempt.inviteId,
            roomId: attempt.roomId,
            roomInstanceId: attempt.roomInstanceId,
            phase: attempt.phase,
            socketId: attempt.socketId,
        }]),
        bootEpoch: BOOT_EPOCH,
    }
}

// 시험용: 매칭 줄에 바로 넣기 (검사 없이)
function __seedMatchmakingQueueForTests(uuid, entry) {
    matchmakingQueue.set(uuid, entry)
}

// 시험용: 방 바로 넣기
function __seedRoomForTests(room) {
    gameRooms.set(room.id, room)
}

// 시험용: 소속 장부 바로 넣기
function __seedPlayerRoomForTests(uuid, roomId) {
    playerRoom.set(uuid, roomId)
}

// 시험용: 알림 없이 방 지우기 (소속·입장 시도·영수증만 같이 정리, 초대는 안 건드림)
function __removeRoomForTests(roomId) {
    const room = gameRooms.get(roomId)
    if (room) {
        room.players.forEach((_, playerUuid) => playerRoom.delete(playerUuid))
    }
    gameRooms.delete(roomId)
    invalidateRoomAttempts(roomId, 'ROOM_GONE')
    forgetSettingsResults(roomId)
}

// 시험용: 이 서버 부팅 번호
function __getBootEpochForTests() {
    return BOOT_EPOCH
}

// 시험용: 입장 시도 기한 지난 걸로 만들기 (다음 조회 때 사라짐, 명단에 넣은 시도는 안 사라짐)
function __expireAdmissionAttemptForTests(uuid) {
    const attempt = roomAdmissionAttempts.get(uuid)
    if (attempt) attempt.expiresAt = Date.now() - 1
}

// 시험용: 입장 시도 하나 심기 (published면 되돌릴 권리까지)
function __seedAdmissionAttemptForTests(uuid, attempt) {
    const seeded = {
        attemptId: attempt.attemptId ?? nextAttemptId(),
        accountUuid: uuid,
        inviteId: attempt.inviteId ?? null,
        roomId: attempt.roomId,
        room: gameRooms.get(attempt.roomId) ?? null,
        roomInstanceId: attempt.roomInstanceId ?? gameRooms.get(attempt.roomId)?.instanceId ?? attempt.roomId,
        bootEpoch: BOOT_EPOCH,
        generation: getGeneration(uuid),
        socketId: attempt.socketId ?? null,
        phase: attempt.phase ?? 'reserved',
        expiresAt: Date.now() + getTotalTimeoutMs(),
    }
    roomAdmissionAttempts.set(uuid, seeded)
    if (seeded.phase === 'published') publishedAdmissions.set(uuid, seeded)
}

module.exports = {
    __resetStateForTests,
    __flushRoomRetentionForTests,
    __getPendingRoomRemovalsForTests,
    __getStateSnapshotForTests,
    __seedMatchmakingQueueForTests,
    __seedRoomForTests,
    __seedPlayerRoomForTests,
    __removeRoomForTests,
    __getBootEpochForTests,
    __expireAdmissionAttemptForTests,
    __seedAdmissionAttemptForTests,
}
