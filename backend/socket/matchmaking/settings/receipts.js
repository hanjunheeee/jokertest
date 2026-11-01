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

// 영수증 최대 500개
const MAX_SETTINGS_RESULTS = 500

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

// 500개 넘으면 오래된 것부터 지움 (Map은 넣은 순서라 맨 앞이 가장 오래됨)
function enforceResultCapacity() {
    while (roomSettingsUpdateResults.size > MAX_SETTINGS_RESULTS) {
        const oldest = roomSettingsUpdateResults.keys().next().value
        if (oldest === undefined) break
        roomSettingsUpdateResults.delete(oldest)
    }
}

// 설정 저장 결과 영수증 남기기
function recordSettingsResult(key, entry) {
    roomSettingsUpdateResults.set(key, entry)
    enforceResultCapacity()
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
    settingsUpdateResultKey,
    pruneSettingsResults,
    enforceResultCapacity,
    recordSettingsResult,
    forgetSettingsResults,
}
