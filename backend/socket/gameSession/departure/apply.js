// 참가자 이탈 반영 파일
// 이탈 커밋 뒤 방송·유예·전적 + 막혀 있던 단계 풀기, 나가기·추방·끊김 유예 만료가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const { persistTerminalSession } = require('../../../services/game/record')
const { isolate, isolateOr } = require('../../common/isolate')
const { NIGHT_TURN_STAGES } = require('../core/constants')
const { nightTurnRuns } = require('../core/state')
const { cancelDisconnectGrace } = require('../connection/grace')
const { emitToGameChannel } = require('../delivery/broadcast')
const { emitSelfProgress } = require('../delivery/progress')
const { reevaluateNightWait } = require('../phase/night/wait')
const { maybeEndNightTurn } = require('../phase/night/turn')
const { startDayPhaseTimer, syncSessionPhaseTimers } = require('../phase/day')
const { markDeparturePending, clearDepartureMark } = require('./marks')
const { maybeResolveDayVote, maybeResolveTribunal } = require('./autoResolve')

// 참가자 이탈 반영: core 커밋 뒤 단계는 하나씩 격리, 커밋은 되돌리지 않음 (지도 12-⑦⑧⑨⑩)
function applyParticipantDeparture(io, session, uuid, { reason = 'PARTICIPANT_LEFT', onCommitted = null } = {}) {
    const label = '[참가자 이탈 처리 실패]'
    // 커밋 자체가 던지면 아무것도 안 바뀐 것이라 INTERNAL_ERROR
    let applied
    try {
        applied = gameSessionCore.commitParticipantDeparture(session, uuid, { reason })
    } catch {
        console.error(label, { code: 'COMMIT_ERROR', uuid, gameId: session?.id })
        return { ok: false, code: 'INTERNAL_ERROR' }
    }
    if (!applied.ok) return applied

    // 여기부터 진짜 바뀜 (이미 커밋됨): 뒤 단계 실패는 로그만
    const step = (code, run) => isolate(label, { code, uuid, gameId: session.id }, run)

    if (typeof onCommitted === 'function') step('COMMIT_HOOK_ERROR', () => onCommitted(applied))

    if (!applied.terminal) markDeparturePending(session)

    // 끊김 유예 중이었으면 같이 끝냄 (유예 타이머가 두 번째 사망 시도 못 하게, 지도 12-⑦)
    step('GRACE_CANCEL_ERROR', () => cancelDisconnectGrace(session.id, uuid))

    // 사망 방송: 승부 났으면 종료 필드 실음 (만들다 던지면 거기까지 만든 내용으로 보냄)
    if (applied.eliminated) {
        let payload = null
        step('PAYLOAD_BUILD_ERROR', () => {
            payload = gameSessionCore.buildDisconnectPayload(session, applied.victimUuid)
            if (applied.terminal) {
                payload = { ...payload, ...gameSessionCore.buildTerminalFields(session) }
            }
            payload = {
                ...payload,
                sfxEvent: {
                    eventId: `game:${session.id}:day:${session.dayIndex}:victim:${applied.victimUuid}:eliminated`,
                    gameId: session.id,
                    origin: 'live',
                },
            }
        })
        if (payload) step('DELIVERY_ERROR', () => emitToGameChannel(io, session, 'player_eliminated', payload))
    }

    const participationPayload = isolateOr(null, label, { code: 'PARTICIPATION_PAYLOAD_BUILD_ERROR', uuid, gameId: session.id },
        () => gameSessionCore.buildParticipationChangedPayload(session, applied.victimUuid))
    if (participationPayload) {
        step('PARTICIPATION_DELIVERY_ERROR',
            () => emitToGameChannel(io, session, 'session_participation_changed', participationPayload))
    }

    // 기권 처리된 표는 각자에게만 (누가 누굴 찍었는지 안 새게)
    emitSelfProgress(io, session)

    if (applied.tribunalCancelled) {
        step('TRIBUNAL_CANCEL_ERROR',
            () => emitToGameChannel(io, session, 'tribunal_vote_resolved', gameSessionCore.buildTribunalVoteResolvedPayload(session)))
    }

    // 승부 났으면 전적 저장은 시작만 하고 타이머 정리 (지도 12-⑩)
    if (applied.terminal) {
        clearDepartureMark(session.id)
        persistTerminalSession(session, { completed: true })
        step('TIMER_SYNC_ERROR', () => syncSessionPhaseTimers(io, session))
        return applied
    }

    advanceAfterDeparture(io, session, applied)
    return applied
}

// 이탈로 막혀 있던 단계 풀기: 다 확인·준비됐으면 다음 단계로, 남은 사람 다 냈으면 바로 판정
function advanceAfterDeparture(io, session, applied) {
    const label = '[이탈 후 단계 진행 실패]'
    const step = (code, run) => isolate(label, { code, gameId: session.id }, run)

    if (applied.tribunalCancelled) {
        step('TIMER_SYNC_ERROR', () => syncSessionPhaseTimers(io, session))
        return
    }

    const advanced = isolateOr({ transitioned: null }, label, { code: 'ADVANCE_ERROR', gameId: session.id },
        () => gameSessionCore.advanceStalledPhase(session))

    if (advanced.transitioned === 'DAY') {
        step('PHASE_DELIVERY_ERROR',
            () => emitToGameChannel(io, session, 'game_phase_changed', gameSessionCore.buildPhaseChangedPayload(session)))
        step('TIMER_START_ERROR', () => startDayPhaseTimer(io, session))
        return
    }

    if (advanced.transitioned === 'DAY_VOTE') {
        step('DAY_PHASE_DELIVERY_ERROR',
            () => emitToGameChannel(io, session, 'day_phase_changed', gameSessionCore.buildDayPhaseChangedPayload(session)))
        step('TIMER_START_ERROR', () => startDayPhaseTimer(io, session))
        return
    }

    if (session.phase === 'DAY' && gameSessionCore.getDayPhase(session) === gameSessionCore.DAY_PHASES.VOTE) {
        step('DAY_VOTE_RESOLVE_ERROR', () => maybeResolveDayVote(io, session))
        return
    }

    if (session.phase === 'TRIBUNAL') {
        step('TRIBUNAL_RESOLVE_ERROR', () => maybeResolveTribunal(io, session))
        return
    }

    // 밤: 연출 대기 중이면 기다릴 사람 다시 보고, 아니면 그 역할 다 냈는지
    if (session.phase === 'NIGHT') {
        const run = nightTurnRuns.get(session.id)
        if (run && run.stage === NIGHT_TURN_STAGES.PRESENTATION_WAIT && run.wait) {
            step('WAIT_REEVALUATE_ERROR', () => reevaluateNightWait(run, run.wait))
            return
        }
        step('TURN_COMPLETION_ERROR', () => maybeEndNightTurn(session.id))
    }
}

module.exports = {
    applyParticipantDeparture,
}
