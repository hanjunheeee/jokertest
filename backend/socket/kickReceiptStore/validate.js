// 추방 요청 모양 검사 파일
// 추방 요청·결과 조회 payload가 허용 키·식별자 모양인지
// index 거쳐 matchmaking 방장 추방(요청)·gameSession 결과 조회가 씀
const { isPlainObject, hasOnlyKeys } = require('../common/shape')
const {
    MAX_IDENTIFIER_LENGTH,
    KICK_ERROR_CODES,
    ROOM_KICK_KEYS,
    KICK_RESULT_QUERY_KEYS,
} = require('./constants')

// 식별자 모양: 비지 않고, 공백만이 아니고, 길이 한도 안
function isIdentifier(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= MAX_IDENTIFIER_LENGTH
        && value.trim().length > 0
}

// 모양 틀림 답 (어디가 틀렸는지는 안 알려 줌, 부를 때마다 새 객체)
function invalidRequest() {
    return { ok: false, code: KICK_ERROR_CODES.INVALID_REQUEST, message: '잘못된 요청입니다.' }
}

// 추방 요청 검사: 허용 키만, 키마다 식별자 모양, 통과면 허용 키만 복사 (대기방 추방 키만)
function validateKickPayload(payload) {
    if (!isPlainObject(payload)) return invalidRequest()

    // 허용 키만, 빠진 키·모양 틀린 값도 거절
    if (!hasOnlyKeys(payload, ROOM_KICK_KEYS)) return invalidRequest()
    if (!ROOM_KICK_KEYS.every((key) => isIdentifier(payload[key]))) return invalidRequest()

    // 허용 키만 새 객체로 복사 (받은 객체 그대로 안 씀)
    const value = {}
    for (const key of ROOM_KICK_KEYS) value[key] = payload[key]
    return { ok: true, value }
}

// 추방 결과 조회 검사: 부팅 id·요청 id 두 칸만
function validateKickResultQuery(payload) {
    if (!isPlainObject(payload)) return invalidRequest()
    if (!hasOnlyKeys(payload, KICK_RESULT_QUERY_KEYS)) return invalidRequest()
    if (!isIdentifier(payload.bootEpoch) || !isIdentifier(payload.requestId)) return invalidRequest()
    return { ok: true, value: { bootEpoch: payload.bootEpoch, requestId: payload.requestId } }
}

module.exports = { validateKickPayload, validateKickResultQuery }
