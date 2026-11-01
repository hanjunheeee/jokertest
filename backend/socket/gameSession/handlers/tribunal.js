// 재판 핸들러 파일
// 재판 표 제출 · 재판 판정 버튼 (승부 나면 종료 필드 실어 방송), register가 등록·시험은 gameSession.js로 바로 부름
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

    // 답 → 내 진행 상태 → 이탈로 남은 사람 다 냈으면 바로 판정
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
    // 시험이 prepare·commit·받는 소켓 함수를 바꿔 끼움
    const prepare = deps.prepare ?? gameSessionCore.prepareTribunalVoteResolution
    const commit = deps.commit ?? gameSessionCore.commitTribunalVoteResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionSockets

    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: 판 id는 prepare 뒤에만 로그에 찍음 (요청 값은 못 믿음)
    const ack = (body, gameId) => respondResolveVote(uuid, gameId, callback, body)
    // 지금 소켓·요청 모양 (지도 04-①)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameDay)
    if (!fields) return
    const { gameId, dayIndex } = fields

    // prepare: 표 세서 결과만 정함, 아직 확정 안 함
    const label = '[재판 판정 오류]'
    const prepared = acceptCoreResult(ack, () => prepare(uuid, gameId, dayIndex),
        prepareLogs(label, uuid, TRIBUNAL_INTERNAL_CODES))
    if (!prepared) return

    // 여기부터 ack 실패 로그엔 prepare가 찾은 진짜 판 id
    const ackInSession = (body) => ack(body, prepared.session.id)
    // 확정 (그사이 표가 바뀌었으면 거절)
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

    // 받는 사람 모으고 결과 방송 (내용 못 만들었으면 건너뜀), 그다음 단계 타이머
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
