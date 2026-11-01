// 방 설정 영수증 파일
// 설정 버전 읽기 + 설정 저장 결과 영수증 (지도 11-③)
const { roomSettingsUpdateResults } = require('../core/state')

// 방 설정 첫 버전
const INITIAL_SETTINGS_VERSION = 1

// 방 설정 버전 (이상한 값이면 첫 버전)
function getSettingsVersion(room) {
    const version = room?.settingsVersion
    return Number.isSafeInteger(version) && version > 0 ? version : INITIAL_SETTINGS_VERSION
}

// 영수증 10분 보관
const SETTINGS_UPDATE_RESULT_TTL_MS = 10 * 60 * 1000

// 영수증 최대 500개
const SETTINGS_UPDATE_RESULT_MAX_ENTRIES = 500

// 영수증 열쇠 (사람·방·요청 id)
function settingsUpdateResultKey(uuid, roomId, requestId) {
    return JSON.stringify([uuid, roomId, requestId])
}

// 기한 지난 영수증 지움
function pruneSettingsUpdateResults(now = Date.now()) {
    for (const [key, entry] of roomSettingsUpdateResults) {
        if (entry.expiresAt <= now) roomSettingsUpdateResults.delete(key)
    }
    enforceSettingsUpdateResultCapacity()
}

// 500개 넘으면 오래된 것부터 지움
function enforceSettingsUpdateResultCapacity() {
    while (roomSettingsUpdateResults.size > SETTINGS_UPDATE_RESULT_MAX_ENTRIES) {
        const oldest = roomSettingsUpdateResults.keys().next().value
        if (oldest === undefined) break
        roomSettingsUpdateResults.delete(oldest)
    }
}

// 설정 저장 결과 영수증 남기기
function recordSettingsUpdateResult(key, entry) {
    roomSettingsUpdateResults.set(key, entry)
    enforceSettingsUpdateResultCapacity()
}

// 방 없어지면 그 방 영수증 지움
function forgetSettingsUpdateResultsForRoom(roomId) {
    for (const [key, entry] of roomSettingsUpdateResults) {
        if (entry.roomId === roomId) roomSettingsUpdateResults.delete(key)
    }
}

module.exports = {
    INITIAL_SETTINGS_VERSION,
    getSettingsVersion,
    SETTINGS_UPDATE_RESULT_TTL_MS,
    SETTINGS_UPDATE_RESULT_MAX_ENTRIES,
    settingsUpdateResultKey,
    pruneSettingsUpdateResults,
    enforceSettingsUpdateResultCapacity,
    recordSettingsUpdateResult,
    forgetSettingsUpdateResultsForRoom,
}
