// 재판 핸들러 파일
// 재판 표 제출 (투표할 사람 표가 다 차면 5초 뒤 판정), register가 등록·시험은 gameSession.js로 바로 부름
const gameSessionCore = require('../../../game-core/gameSession')
const { isPlainObject } = require('../../common/shape')
const { isolate, tryOr } = require('../../common/isolate')
const { staleSocketReply, invalidPayloadReply } = require('../../common/replies')
const { CAST_INTERNAL_CODES } = require('../core/constants')
const { acceptCoreResult } = require('../core/requests')
const { isCurrentSocketForUuid } = require('../connection/ownership')
const { emitProgressAfterSubmit } = require('../delivery/progress')
const { settleTribunalIfComplete } = require('../phase/tribunal')

// 재판 표 제출 효과음 (기록 없거나 읽다 던지면 null)
function buildTribunalVoteSfx(uuid, gameId) {
    const record = tryOr(null, () => gameSessionCore.readTribunalVoteSfx(uuid, gameId))
    if (record === null) return null
    return {
        kind: 'tribunal-vote-submitted',
        eventId: record.eventId,
        accountId: uuid,
        gameId,
        dayIndex: record.dayIndex,
        origin: 'live',
    }
}

// 재판 표 제출 ack: 로그엔 판 id·날짜·요청자·내부 코드 4칸만
function respondCastTribunalVote(gameId, dayIndex, requesterUuid, callback, payload) {
    try {
        callback(payload)
    } catch {
        console.error('[재판 투표 제출 오류]', { gameId, dayIndex, requesterUuid, internalCode: 'CALLBACK_ERROR' })
    }
}

// 재판 표 제출: 유죄·무죄 기록, 투표할 사람 다 냈으면 재판 마감 5초로 당김
function handleCastTribunalVote(io, socket, uuid, payload, callback) {
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: 로그에 남길 판 id·날짜는 부를 때 넘김
    const ack = (body, loggedGameId, loggedDayIndex) =>
        respondCastTribunalVote(loggedGameId, loggedDayIndex, uuid, callback, body)
    // 지금 소켓·요청 모양, ack 실패 로그엔 그때까지 읽은 칸만 남김 (지도 04-①⑨)
    if (!isCurrentSocketForUuid(uuid, socket)) {
        ack(staleSocketReply())
        return
    }
    if (!isPlainObject(payload)) {
        ack(invalidPayloadReply())
        return
    }
    // 판 id·날짜 모양만 봄, 표 값은 core가 봄
    const { gameId, dayIndex, vote } = payload
    if (typeof gameId !== 'string') {
        ack(invalidPayloadReply(), undefined, dayIndex)
        return
    }
    if (!Number.isInteger(dayIndex)) {
        ack(invalidPayloadReply(), gameId)
        return
    }

    // 여기부터 로그는 판 id·날짜·요청자·내부 코드 4칸
    const logFields = (internalCode) => ({ gameId, dayIndex, requesterUuid: uuid, internalCode })
    // 판 id·날짜 다 읽은 뒤의 ack
    const ackInGame = (body) => ack(body, gameId, dayIndex)

    // 여기부터 진짜 바뀜: 표 기록 (내부 사정 코드는 INTERNAL_ERROR로 숨김)
    const result = acceptCoreResult(ackInGame, () => gameSessionCore.submitTribunalVote(uuid, gameId, dayIndex, vote), {
        internalCodes: CAST_INTERNAL_CODES,
        onThrow: () => console.error('[재판 투표 제출 오류]', logFields('UNEXPECTED_ERROR')),
        onInternal: (code) => console.error('[재판 투표 제출 오류]', logFields(code)),
    })
    if (!result) return

    // 답 → 내 진행 상태 → 투표할 사람 다 냈으면 재판 마감 5초로 당김 (재판 표는 원래 못 바꿈)
    ackInGame({
        ok: true,
        gameId: result.gameId,
        dayIndex: result.dayIndex,
        vote: result.vote,
        sfxEvent: buildTribunalVoteSfx(uuid, gameId),
    })

    emitProgressAfterSubmit(io, uuid, gameId, 'SELF_PROGRESS_AFTER_TRIBUNAL_VOTE')

    isolate('[재판 마감 당기기 실패]', logFields('SUBMIT_SETTLE_ERROR'), () => settleTribunalIfComplete(result.gameId))
}

module.exports = {
    handleCastTribunalVote,
}
