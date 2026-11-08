// 방 설정 영수증 파일
// 설정 버전 읽기 + 설정 저장 결과 영수증, settings 처리기·방 알림 만드는 곳·방 없애는 곳이 사용 (지도 11-③)
const { roomSettingsUpdateResults } = require('../core/state')

// 방 설정 첫 버전 (join/create가 새 방에 넣음)
const INIT_SETTINGS_VERSION = 1

// 방 설정 버전 (이상한 값이면 첫 버전)
function getSettingsVersion(room) {
    const version = room?.settingsVersion
    return Number.isSafeInteger(version) && version > 0 ? version : INIT_SETTINGS_VERSION
}

// 영수증 10분 보관
const SETTINGS_RESULT_TTL_MS = 10 * 60 * 1000

// 영수증 방마다 최대 50개 (방이 많아도 남의 방 영수증이 10분 전에 밀려나지 않게, BE-030)
const MAX_SETTINGS_RESULTS_PER_ROOM = 50

// 영수증 서버 전체 최대 10000개 (메모리 지키는 마지막 막, 보통은 방마다 한도·10분 기한이 먼저 걸림)
const MAX_SETTINGS_RESULTS = 10000

// 영수증 열쇠 (사람·방·요청 id)
function settingsUpdateResultKey(uuid, roomId, requestId) {
    return JSON.stringify([uuid, roomId, requestId])
}

// 기한 지난 영수증 지우고 개수 한도 맞춤
function pruneSettingsResults(now = Date.now()) {
    for (const [key, entry] of roomSettingsUpdateResults) {
        if (entry.expiresAt <= now) roomSettingsUpdateResults.delete(key)
    }
    enforceResultCapacity()
}

// 한도 넘으면 오래된 것부터 지움 (Map은 넣은 순서라 앞쪽이 오래됨)
// roomId 주면 그 방 한도 먼저 맞춤
function enforceResultCapacity(roomId = null) {
    if (roomId !== null) {
        let count = 0
        for (const entry of roomSettingsUpdateResults.values()) {
            if (entry.roomId === roomId) count += 1
        }
        for (const [key, entry] of roomSettingsUpdateResults) {
            if (count <= MAX_SETTINGS_RESULTS_PER_ROOM) break
            if (entry.roomId !== roomId) continue
            roomSettingsUpdateResults.delete(key)
            count -= 1
        }
    }
    while (roomSettingsUpdateResults.size > MAX_SETTINGS_RESULTS) {
        const oldest = roomSettingsUpdateResults.keys().next().value
        if (oldest === undefined) break
        roomSettingsUpdateResults.delete(oldest)
    }
}

// 설정 저장 결과 영수증 남기기
function recordSettingsResult(key, entry) {
    roomSettingsUpdateResults.set(key, entry)
    enforceResultCapacity(entry?.roomId ?? null)
}

// 방 없어지면 그 방 영수증 지움
function forgetSettingsResults(roomId) {
    for (const [key, entry] of roomSettingsUpdateResults) {
        if (entry.roomId === roomId) roomSettingsUpdateResults.delete(key)
    }
}

module.exports = {
    INIT_SETTINGS_VERSION,
    getSettingsVersion,
    SETTINGS_RESULT_TTL_MS,
    MAX_SETTINGS_RESULTS,
    MAX_SETTINGS_RESULTS_PER_ROOM,
    settingsUpdateResultKey,
    pruneSettingsResults,
    enforceResultCapacity,
    recordSettingsResult,
    forgetSettingsResults,
}
