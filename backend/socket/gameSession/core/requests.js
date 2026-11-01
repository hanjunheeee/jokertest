// 게임 요청 앞단 검사 파일
// 요청 모양 검사(지금 소켓 → 객체 → 칸) + core 결과를 ack 답으로 바꾸기, socket gameSession 핸들러가 씀
const { isPlainObject, isNonEmptyString } = require('../../common/shape')
const { rejectedReply, invalidPayloadReply, internalErrorReply } = require('../../common/replies')
const { isCurrentSocketForUuid } = require('../connection/ownership')
const { INTERNAL_ONLY_CODES } = require('./constants')

// 요청 칸 꺼내기 모음: 모양 맞으면 칸 묶음, 틀리면 null (payload는 칸마다 한 번만 읽음)

// 판 id만
function pickGameId({ gameId }) {
    return typeof gameId === 'string' ? { gameId } : null
}

// 판 id 앞뒤 공백 뺀 값, 비면 거절 (나가기, 지도 12-④)
function pickTrimmedGameId({ gameId }) {
    if (typeof gameId !== 'string') return null
    const normalizedGameId = gameId.trim()
    return normalizedGameId ? { gameId: normalizedGameId } : null
}

// 판 id 없어도 됨, 있으면 문자열만 (스냅샷)
function pickOptionalGameId({ gameId }) {
    return gameId === undefined || typeof gameId === 'string' ? { gameId } : null
}

// 판 id + 대상 (대상은 문자열 또는 null = 기권, 지도 05-②)
function pickGameTarget({ gameId, targetId }) {
    if (typeof gameId !== 'string') return null
    if (targetId !== null && typeof targetId !== 'string') return null
    return { gameId, targetId }
}

// 판 id + 채팅 글
function pickGameText({ gameId, text }) {
    if (typeof gameId !== 'string' || typeof text !== 'string') return null
    return { gameId, text }
}

// 판 id + 이모티콘 id (하나라도 비면 거절)
function pickGameItem({ gameId, itemId }) {
    if (!isNonEmptyString(gameId) || !isNonEmptyString(itemId)) return null
    return { gameId, itemId }
}

// 판 id + 날짜 (정수, 지도 04-①)
function pickGameDay({ gameId, dayIndex }) {
    if (typeof gameId !== 'string') return null
    if (!Number.isInteger(dayIndex)) return null
    return { gameId, dayIndex }
}

// 요청 앞단 검사: 지금 소켓 → 객체 → 칸 모양 순서 (누가 보냈는지는 소켓 uuid로만, 지도 05-①②)
// 통과면 { fields }, 아니면 { code } (STALE_SOCKET / INVALID_PAYLOAD)
function readRequest(uuid, socket, payload, pickFields) {
    if (!isCurrentSocketForUuid(uuid, socket)) return { code: 'STALE_SOCKET' }
    if (!isPlainObject(payload)) return { code: 'INVALID_PAYLOAD' }
    const fields = pickFields(payload)
    if (fields === null) return { code: 'INVALID_PAYLOAD' }
    return { fields }
}

// 앞단 검사 + 거절이면 표준 답까지 보냄, 통과면 칸 묶음 (거절이면 null)
function acceptRequest(ack, uuid, socket, payload, pickFields) {
    const request = readRequest(uuid, socket, payload, pickFields)
    // 옛 소켓은 거절 문구, 모양 틀림은 잘못된 요청 문구로 답 (문구가 다름)
    if (request.code === 'STALE_SOCKET') {
        ack(rejectedReply(request.code))
        return null
    }
    if (request.code === 'INVALID_PAYLOAD') {
        ack(invalidPayloadReply())
        return null
    }
    return request.fields
}

// 내부 전용 코드 없는 단계용 빈 묶음 (실패 코드를 그대로 보여 줌)
const NO_INTERNAL_ONLY_CODES = new Set()

// core 호출 결과 받기: 던지면 INTERNAL_ERROR, 내부 전용 코드도 INTERNAL_ERROR로 숨김,
// 나머지 실패는 코드 그대로 거절 (지도 03-⑥ · 06-⑨), 통과면 결과 · 실패면 답 보내고 null
function acceptCoreResult(ack, call, {
    internalCodes = NO_INTERNAL_ONLY_CODES,
    onThrow,
    onInternal = () => {},
    publicReply = rejectedReply,
}) {
    // core가 던지면 원인 안 보이게 INTERNAL_ERROR
    let result
    try {
        result = call()
    } catch (err) {
        onThrow(err)
        ack(internalErrorReply())
        return null
    }
    // 실패: 내부 전용 코드는 숨기고 나머지는 코드 그대로 답
    if (!result.ok) {
        if (internalCodes.has(result.code)) {
            onInternal(result.code)
            ack(internalErrorReply())
            return null
        }
        ack(publicReply(result.code))
        return null
    }
    return result
}

// 단순 요청 로그 모양: 던지면 원본 에러, 내부 전용 코드면 { code, uuid, gameId }
function registryLogs(throwLabel, mismatchLabel, uuid, gameId) {
    return {
        internalCodes: INTERNAL_ONLY_CODES,
        onThrow: (err) => console.error(throwLabel, err),
        onInternal: (code) => console.error(mismatchLabel, { code, uuid, gameId }),
    }
}

// prepare 단계 로그 모양: 판 id는 아직 못 믿으니 undefined로 찍음 (원본 에러는 안 찍음)
function prepareLogs(label, uuid, internalCodes) {
    return {
        internalCodes,
        onThrow: () => console.error(label, { code: 'PREPARE_UNEXPECTED_ERROR', uuid, gameId: undefined }),
        onInternal: (code) => console.error(label, { code, uuid, gameId: undefined }),
    }
}

// commit 단계 로그 모양: 판 id는 prepare가 돌려준 진짜 id (내부 전용 코드 없으면 던질 때만 찍음)
function commitLogs(label, uuid, gameId, internalCodes = NO_INTERNAL_ONLY_CODES) {
    return {
        internalCodes,
        onThrow: () => console.error(label, { code: 'COMMIT_ERROR', uuid, gameId }),
        onInternal: (code) => console.error(label, { code, uuid, gameId }),
    }
}

// 확정 전 내부 실패 답 함수 만들기: 코드만 로그 남기고 INTERNAL_ERROR (내부 사정은 안 보여 줌, 지도 13-⑦)
function internalFailure(label, uuid, gameId, ack) {
    return (code) => {
        console.error(label, { code, uuid, gameId })
        ack(internalErrorReply())
    }
}

module.exports = {
    pickGameId,
    pickTrimmedGameId,
    pickOptionalGameId,
    pickGameTarget,
    pickGameText,
    pickGameItem,
    pickGameDay,
    readRequest,
    acceptRequest,
    acceptCoreResult,
    registryLogs,
    prepareLogs,
    commitLogs,
    internalFailure,
}
