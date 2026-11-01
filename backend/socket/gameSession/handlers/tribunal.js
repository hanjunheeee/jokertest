// 재판 핸들러 파일
// 재판 표 제출 · 재판 판정 버튼 (승부 나면 종료 필드 실어 방송), register가 등록함
const gameSessionCore = require('../../../game-core/gameSession')
const { isPlainObject } = require('../../common/shape')
const { isolate, isolateOr, tryOr } = require('../../common/isolate')
const {
    staleSocketReply,
    invalidPayloadReply,
    internalErrorReply,
    labeledResponder,
} = require('../../common/replies')
const {
    CAST_INTERNAL_CODES,
    TRIBUNAL_INTERNAL_CODES,
} = require('../core/constants')
const { pickGameDay, acceptRequest, acceptCoreResult, prepareLogs, commitLogs } = require('../core/requests')
const { isCurrentSocketForUuid } = require('../connection/ownership')
const {
    resolveSessionSockets,
    resolveOrEmpty,
    emitToEachEligible,
} = require('../delivery/broadcast')
const { emitProgressAfterSubmit } = require('../delivery/progress')
const { syncSessionPhaseTimers } = require('../phase/day')
const { withTerminalFields } = require('../departure/end')
const { resolveAfterDeparture } = require('../departure/autoResolve')

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

// 재판 표 제출: 유죄·무죄 기록, 이탈로 남은 사람 다 냈으면 바로 판정
function handleCastTribunalVote(io, socket, uuid, payload, callback) {
    if (typeof callback !== 'function') return
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
    const ackInGame = (body) => ack(body, gameId, dayIndex)

    const result = acceptCoreResult(ackInGame, () => gameSessionCore.submitTribunalVote(uuid, gameId, dayIndex, vote), {
        internalCodes: CAST_INTERNAL_CODES,
        onThrow: () => console.error('[재판 투표 제출 오류]', logFields('UNEXPECTED_ERROR')),
        onInternal: (code) => console.error('[재판 투표 제출 오류]', logFields(code)),
    })
    if (!result) return

    ackInGame({
        ok: true,
        gameId: result.gameId,
        dayIndex: result.dayIndex,
        vote: result.vote,
        sfxEvent: buildTribunalVoteSfx(uuid, gameId),
    })

    emitProgressAfterSubmit(io, uuid, gameId, 'SELF_PROGRESS_AFTER_TRIBUNAL_VOTE')

    isolate('[이탈 후 재판 판정 실패]', logFields('SUBMIT_RESOLVE_ERROR'), () => resolveAfterDeparture(io, uuid, gameId))
}

// 재판 판정 ack
const respondResolveVote = labeledResponder('[재판 판정 오류]')

// 재판 판정 버튼: 표 세서 확정, 승부 났으면 종료 필드 실어 판 전체에 방송
function handleResolveTribunalVote(io, socket, uuid, payload, callback, deps = {}) {
    const prepare = deps.prepare ?? gameSessionCore.prepareTribunalVoteResolution
    const commit = deps.commit ?? gameSessionCore.commitTribunalVoteResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionSockets

    if (typeof callback !== 'function') return
    const ack = (body, gameId) => respondResolveVote(uuid, gameId, callback, body)
    // 지금 소켓·요청 모양 (지도 04-①)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameDay)
    if (!fields) return
    const { gameId, dayIndex } = fields

    const label = '[재판 판정 오류]'
    const prepared = acceptCoreResult(ack, () => prepare(uuid, gameId, dayIndex),
        prepareLogs(label, uuid, TRIBUNAL_INTERNAL_CODES))
    if (!prepared) return

    const ackInSession = (body) => ack(body, prepared.session.id)
    const committed = acceptCoreResult(ackInSession, () => commit(prepared.session, prepared.resolution),
        commitLogs(label, uuid, prepared.session.id))
    if (!committed) return

    // 여기부터 진짜 바뀜 (확정됨): 결과 내용 만들고, 승부 났으면 종료 필드 + 전적 저장 시작
    const fieldsInSession = { uuid, gameId: prepared.session.id }
    const resolvedPayload = isolateOr(null, label, { code: 'PAYLOAD_BUILD_ERROR', ...fieldsInSession },
        () => gameSessionCore.buildTribunalVoteResolvedPayload(prepared.session))
    const broadcastPayload = withTerminalFields(prepared.session, committed.terminal, resolvedPayload, label, fieldsInSession)

    // 결과 내용 못 만들었으면 확정은 됐어도 INTERNAL_ERROR로 답함
    if (!resolvedPayload) {
        ackInSession(internalErrorReply())
    } else {
        ackInSession({
            ok: true,
            gameId: resolvedPayload.gameId,
            dayIndex: resolvedPayload.dayIndex,
            outcome: resolvedPayload.outcome,
            counts: resolvedPayload.counts,
            executedUuid: resolvedPayload.executedUuid,
        })
    }

    const recipients = resolveOrEmpty(io, prepared.session, label, fieldsInSession, resolveParticipantSockets)
    if (broadcastPayload) {
        emitToEachEligible(prepared.session, recipients, label, fieldsInSession,
            (recipientSocket) => recipientSocket.emit('tribunal_vote_resolved', broadcastPayload))
    }

    isolate(label, { code: 'TIMER_SYNC_ERROR', ...fieldsInSession }, () => syncSessionPhaseTimers(io, prepared.session))
}

module.exports = {
    handleCastTribunalVote,
    handleResolveTribunalVote,
}
