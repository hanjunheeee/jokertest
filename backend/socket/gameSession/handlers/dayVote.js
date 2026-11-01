// 낮 투표 핸들러 파일
// 낮 투표 제출(1라운드 참여 기록 저장) · 낮 투표 집계 버튼, register가 등록·시험은 gameSession.js로 바로 부름
const gameSessionCore = require('../../../game-core/gameSession')
const gameAchievementService = require('../../../services/game/achievementHooks')
const { isolate, tryOr } = require('../../common/isolate')
const { respond, labeledResponder } = require('../../common/replies')
const { RESOLVE_INTERNAL_CODES } = require('../core/constants')
const {
    pickGameTarget,
    pickGameDay,
    acceptRequest,
    acceptCoreResult,
    registryLogs,
    prepareLogs,
    commitLogs,
} = require('../core/requests')
const {
    resolveSessionSockets,
    resolveOrEmpty,
    emitToEachEligible,
} = require('../delivery/broadcast')
const { emitProgressAfterSubmit } = require('../delivery/progress')
const { syncSessionPhaseTimers } = require('../phase/day')
const { resolveAfterDeparture } = require('../departure/autoResolve')

// 낮 투표 제출 효과음 (기록 없거나 읽다 던지면 null, 효과음 없이 답함)
function buildDayVoteSfx(uuid, gameId) {
    const record = tryOr(null, () => gameSessionCore.readDayVoteSfx(uuid, gameId))
    if (record === null) return null
    return {
        kind: 'day-vote-submitted',
        eventId: record.eventId,
        accountId: uuid,
        gameId,
        dayIndex: record.dayIndex,
        round: record.round,
        origin: 'live',
    }
}

// 낮 투표 제출: 표 기록, 1라운드 진짜 표면 참여 기록 저장 뒤 ack (지도 04-③)
async function handleSubmitDayVote(io, socket, uuid, payload, callback) {
    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: callback이 던져도 밖으로 안 샘
    const ack = (body) => respond(callback, body)
    // 지금 소켓·요청 모양 (지도 04-①⑨)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameTarget)
    if (!fields) return
    const { gameId, targetId } = fields

    // 여기부터 진짜 바뀜: 표 기록 (뒤 저장이 실패해도 표는 남음)
    const result = acceptCoreResult(ack, () => gameSessionCore.submitDayVote(uuid, gameId, targetId),
        registryLogs('[낮 투표 제출 처리 에러]', '[낮 투표 제출 registry 불일치]', uuid, gameId))
    if (!result) return

    // 효과음은 표 기록 뒤에 읽음
    const sfxEvent = buildDayVoteSfx(uuid, gameId)

    // 내 진행 상태 → ack → 이탈로 남은 사람 다 냈으면 바로 판정 (순서 고정)
    const ackThenResolve = (ackPayload) => {
        emitProgressAfterSubmit(io, uuid, gameId, 'SELF_PROGRESS_AFTER_SUBMIT')
        ack(ackPayload)
        isolate('[이탈 후 낮 투표 판정 실패]', { code: 'SUBMIT_RESOLVE_ERROR', gameId },
            () => resolveAfterDeparture(io, uuid, gameId))
    }

    // 기권이거나 재투표 라운드면 참여 기록 없이 바로 답
    if (targetId === null || gameSessionCore.getSessionVoteRound(gameId) !== 1) {
        ackThenResolve({ ok: true, sfxEvent })
        return
    }

    // 1라운드 진짜 표: 참여 기록 저장이 끝나야 성공으로 답함, 실패면 다시 내라고 답함 (지도 04-③)
    const dayIndex = gameSessionCore.getSessionDayIndex(gameId)
    try {
        await gameAchievementService.recordParticipation({ gameId, dayIndex, userId: uuid })
    } catch {
        console.error('[투표 참여 사건 저장 실패]', { code: 'VOTE_PERSIST_ERROR', uuid, gameId })
        ackThenResolve({
            ok: false,
            code: 'VOTE_PERSIST_FAILED',
            message: '투표 저장에 실패했습니다. 다시 시도해 주세요.',
        })
        return
    }

    // 답 먼저, 업적 평가는 기다리지 않음
    ackThenResolve({ ok: true, sfxEvent })
    gameAchievementService.evaluateForUsers([uuid], gameId)
}

// 낮 투표 판정 ack
const respondResolveDayVote = labeledResponder('[낮 투표 판정 오류]')

// 낮 투표 집계 버튼: 표 세서 확정하고 판 전체에 결과 방송 (지도 04-⑥⑦)
function handleResolveDayVote(io, socket, uuid, payload, callback, deps = {}) {
    // 시험이 prepare·commit·받는 소켓 함수를 바꿔 끼움
    const prepare = deps.prepare ?? gameSessionCore.prepareDayVoteResolution
    const commit = deps.commit ?? gameSessionCore.commitDayVoteResolution
    const resolveParticipantSockets = deps.resolveParticipantSockets ?? resolveSessionSockets

    // callback 없으면 처리 안 함 (답할 곳 없음)
    if (typeof callback !== 'function') return
    // ack: 판 id는 prepare 뒤에만 로그에 찍음 (요청 값은 못 믿음)
    const ack = (body, gameId) => respondResolveDayVote(uuid, gameId, callback, body)
    // 지금 소켓·요청 모양 (지도 04-①)
    const fields = acceptRequest(ack, uuid, socket, payload, pickGameDay)
    if (!fields) return
    const { gameId, dayIndex } = fields
    const label = '[낮 투표 판정 오류]'

    // prepare: 표 세서 결과만 정함, 아직 확정 안 함
    const prepared = acceptCoreResult(ack, () => prepare(uuid, gameId, dayIndex),
        prepareLogs(label, uuid, RESOLVE_INTERNAL_CODES))
    if (!prepared) return

    // 여기부터 ack 실패 로그엔 prepare가 찾은 진짜 판 id
    const ackInSession = (body) => ack(body, prepared.session.id)
    // 판정 요약 답 (이미 판정됐을 때도 같은 모양)
    const resolutionReply = () => ({
        ok: true,
        gameId: prepared.resolution.gameId,
        dayIndex: prepared.resolution.dayIndex,
        outcome: prepared.resolution.outcome,
        tribunalTargetUuid: prepared.resolution.tribunalTargetUuid,
    })

    // 마감 타이머나 다른 버튼이 먼저 판정했으면 결과만 답함 (지도 04-⑥)
    if (prepared.alreadyResolved) {
        ackInSession(resolutionReply())
        return
    }

    // 여기부터 진짜 바뀜: 판정 확정, 뒤 방송·타이머 실패는 로그만
    const committed = acceptCoreResult(ackInSession, () => commit(prepared.session, prepared.resolution),
        commitLogs(label, uuid, prepared.session.id))
    if (!committed) return

    // 누른 사람한테 답 먼저, 그다음 판 전체 방송
    ackInSession(resolutionReply())

    // 받는 사람 먼저 모으고 결과 방송, 그다음 단계 타이머
    const fieldsInSession = { uuid, gameId: prepared.session.id }
    const recipients = resolveOrEmpty(io, prepared.session, label, fieldsInSession, resolveParticipantSockets)
    const dayVoteResolvedPayload = gameSessionCore.buildDayVoteResolvedPayload(prepared.session, prepared.resolution)
    emitToEachEligible(prepared.session, recipients, label, fieldsInSession,
        (recipientSocket) => recipientSocket.emit('day_vote_resolved', dayVoteResolvedPayload))

    isolate(label, { code: 'TIMER_SYNC_ERROR', ...fieldsInSession }, () => syncSessionPhaseTimers(io, prepared.session))
}

module.exports = {
    handleSubmitDayVote,
    handleResolveDayVote,
}
