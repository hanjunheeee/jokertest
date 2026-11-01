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
    // 커밋이 던지면 뒤 방송·판정 안 하고 INTERNAL_ERROR
    let applied
    try {
        applied = gameSessionCore.commitParticipantDeparture(session, uuid, { reason })
    } catch {
        console.error(label, { code: 'COMMIT_ERROR', uuid, gameId: session?.id })
        return { ok: false, code: 'INTERNAL_ERROR' }
    }
    // core 거절(이미 나감·끝난 판 등)은 그대로 돌려줌
    if (!applied.ok) return applied

    // 여기부터 진짜 바뀜 (이미 커밋됨): 뒤 단계 실패는 로그만
    const step = (code, run) => isolate(label, { code, uuid, gameId: session.id }, run)

    // 부른 쪽 커밋 직후 처리 (추방이면 영수증·채널 떼기)
    if (typeof onCommitted === 'function') step('COMMIT_HOOK_ERROR', () => onCommitted(applied))

    // 승부 안 났으면 판정 자리 표식 (남은 사람이 다 내면 바로 판정)
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

    // 참여 변경 방송 (빠진 사람·방장·참여 번호), 만들다 던지면 안 보냄
    const participationPayload = isolateOr(null, label, { code: 'PARTICIPATION_PAYLOAD_BUILD_ERROR', uuid, gameId: session.id },
        () => gameSessionCore.buildParticipationChangedPayload(session, applied.victimUuid))
    if (participationPayload) {
        step('PARTICIPATION_DELIVERY_ERROR',
            () => emitToGameChannel(io, session, 'session_participation_changed', participationPayload))
    }

    // 기권 처리된 표는 각자에게만 (누가 누굴 찍었는지 안 새게)
    emitSelfProgress(io, session)

    // 피고가 나가 재판 취소됐으면 취소 결과 방송
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
    // 단계마다 격리, 실패는 로그만
    const step = (code, run) => isolate(label, { code, gameId: session.id }, run)

    // 재판 취소면 core가 이미 밤으로 넘김, 타이머만 맞춤
    if (applied.tribunalCancelled) {
        step('TIMER_SYNC_ERROR', () => syncSessionPhaseTimers(io, session))
        return
    }

    // 남은 사람이 다 확인·준비했으면 core가 다음 단계로 넘김
    const advanced = isolateOr({ transitioned: null }, label, { code: 'ADVANCE_ERROR', gameId: session.id },
        () => gameSessionCore.advanceStalledPhase(session))

    // 역할 확인 끝나 첫 낮으로: 단계 방송 + 낮 타이머
    if (advanced.transitioned === 'DAY') {
        step('PHASE_DELIVERY_ERROR',
            () => emitToGameChannel(io, session, 'game_phase_changed', gameSessionCore.buildPhaseChangedPayload(session)))
        step('TIMER_START_ERROR', () => startDayPhaseTimer(io, session))
        return
    }

    // 토론 끝나 투표로: 낮 단계 방송 + 투표 타이머
    if (advanced.transitioned === 'DAY_VOTE') {
        step('DAY_PHASE_DELIVERY_ERROR',
            () => emitToGameChannel(io, session, 'day_phase_changed', gameSessionCore.buildDayPhaseChangedPayload(session)))
        step('TIMER_START_ERROR', () => startDayPhaseTimer(io, session))
        return
    }

    // 낮 투표·재판 중이면 남은 사람이 다 냈는지 보고 바로 판정
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
