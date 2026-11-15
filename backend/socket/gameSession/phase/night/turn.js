// 밤 턴 순서 파일
// 역할 턴 열기·마감·닫기(다 고르면 5초 뒤) + 밤 턴 순서 시작·멈춤, 낮 타이머·밤 마무리·이탈·핸들러가 씀
// 다 돌면 밤 마무리는 phaseHooks로 부름 (finalize가 이 파일을 require해서 고리 막기)
const gameSessionCore = require('../../../../game-core/gameSession')
const { isolate, isolateOr, tryOr } = require('../../../common/isolate')
const { NIGHT_TURN_STAGES, PHASE_RETRY_DELAY_MS, PHASE_RETRY_MAX } = require('../../core/constants')
const { nightTurnRuns, disconnectGraceRuns, phaseHooks } = require('../../core/state')
const {
    pickTimerFns,
    clearRunTimer,
    computeEmptyTurnDelayMs,
    resolveNightTurnDurationMs,
    fillAbstentions,
} = require('../../core/timers')
const { expireGracesAtBoundary, expireDisconnectGrace } = require('../../connection/grace')
const { emitToGameChannel } = require('../../delivery/broadcast')
const { isCurrentNightRun, isSubmittingNightTurn } = require('./checks')
const { pullRunDeadline, announceSettleStarted } = require('../settle')

// 밤 턴 방송, 던져도 턴 진행은 계속
function emitNightTurnEvent(run, event, payload) {
    isolate('[밤 턴 방송 실패]', { code: 'DELIVERY_ERROR', event, gameId: run.session.id },
        () => emitToGameChannel(run.io, run.session, event, payload))
}

// 역할 결과 확정, 던지면 실패 결과로 바꿈 (턴 진행이 예외로 끊기지 않게)
function completeNightRoleSafely(session, role) {
    return tryOr({ ok: false, code: 'ROLE_COMPLETE_UNEXPECTED_ERROR' }, () => gameSessionCore.completeNightRole(session, role))
}

// 타이머 쪽 확정 실패 때 잠깐 뒤 다시 (최대 PHASE_RETRY_MAX번, 밤이 타이머 없이 멈추지 않게), 걸었으면 true
function retryNightStepLater(run, label, fields, retry) {
    if ((run.retries ?? 0) >= PHASE_RETRY_MAX) {
        console.error(label, { code: 'RETRY_EXHAUSTED', ...fields })
        return false
    }
    run.retries = (run.retries ?? 0) + 1
    clearRunTimer(run)
    run.timerId = run.setTimeoutFn(retry, PHASE_RETRY_DELAY_MS)
    return true
}

// 밤 마무리 부르기: 실패면 잠깐 뒤 다시 (run은 이미 지워져 있어 같은 시계로 따로 셈, BE-023)
// 겹친 마무리가 도는 중이면 그쪽에 맡김, 그사이 밤이 끝났거나 새 밤 run이 생겼으면 그만
function finalizeNightWithRetry(run, attempt = 0) {
    const { session } = run
    if (session.phase !== 'NIGHT' || session.dayIndex !== run.nightDayIndex) return
    if (nightTurnRuns.has(session.id)) return
    const result = isolateOr(null, '[밤 자동 마무리 실패]', { code: 'FINALIZE_ERROR', gameId: session.id },
        () => phaseHooks.finalizeNightForSession(run.io, session))
    if (result?.ok || result?.code === 'NIGHT_FINALIZE_IN_PROGRESS') return
    if (session.phase !== 'NIGHT' || session.nightResolution !== null) return
    if (attempt >= PHASE_RETRY_MAX) {
        console.error('[밤 자동 마무리 실패]', { code: 'RETRY_EXHAUSTED', gameId: session.id, lastCode: result?.code })
        return
    }
    run.setTimeoutFn(() => finalizeNightWithRetry(run, attempt + 1), PHASE_RETRY_DELAY_MS)
}

// 다음 역할 턴 열기: 판에 없는 역할은 확정만 하고 건너뜀, 다 돌았으면 밤 마무리
function advanceNightTurn(run) {
    const { session } = run
    // 지난 run·밤 끝남·다른 밤이면 안 엶 (늦게 온 호출)
    if (!isCurrentNightRun(run)) return
    if (session.phase !== 'NIGHT') return
    if (session.dayIndex !== run.nightDayIndex) return
    run.index += 1
    // 판에 없는 역할도 확정은 함 (밤 판정이 네 역할 다 끝났는지 봄), 실패면 진행 멈춤
    const activeTurnOrder = gameSessionCore.getNightTurnOrder(session)
    while (run.index < gameSessionCore.NIGHT_TURN_ORDER.length
        && !activeTurnOrder.includes(gameSessionCore.NIGHT_TURN_ORDER[run.index])) {
        const absentRole = gameSessionCore.NIGHT_TURN_ORDER[run.index]
        const completed = completeNightRoleSafely(session, absentRole)
        if (!completed.ok) {
            console.error('[밤 부재 역할 확정 실패]', { code: completed.code, role: absentRole, gameId: session.id })
            // 이 역할부터 다시 열게 한 칸 되돌리고 잠깐 뒤 다시 (멈춘 채 두지 않음)
            run.index -= 1
            retryNightStepLater(run, '[밤 부재 역할 확정 실패]', { role: absentRole, gameId: session.id },
                () => advanceNightTurn(run))
            return
        }
        run.index += 1
    }
    // 다 돌았으면 run 멈추고 밤 마무리 (실패면 잠깐 뒤 다시)
    if (run.index >= gameSessionCore.NIGHT_TURN_ORDER.length) {
        stopNightTurnSequence(session.id)
        // 밤 마무리는 night/finalize 것을 주입받아 부름 (require 고리 막기)
        finalizeNightWithRetry(run)
        return
    }

    // 여기부터 진짜 바뀜: 이 역할 턴 열고 마감 시각 방송 (다시 해 보기 횟수는 턴마다 새로)
    run.retries = 0
    const role = gameSessionCore.NIGHT_TURN_ORDER[run.index]
    session.nightTurnRole = role
    run.stage = NIGHT_TURN_STAGES.SUBMITTING
    const durationMs = resolveNightTurnDurationMs(run, role)
    const deadline = run.nowFn() + durationMs
    run.deadline = deadline
    // 판에도 마감 시각 적어 둠 (새로고침 스냅샷이 화면 타이머용으로 실음)
    session.nightTurnDeadline = deadline
    emitNightTurnEvent(run, 'night_turn_started', gameSessionCore.buildNightTurnStartedPayload(session, role, deadline))

    // 산 행동자 없는 턴도 무작위 시간 뒤 닫음 (역할 전멸이 새지 않게)
    if (gameSessionCore.getAliveActorUuidsForRole(session, role).length === 0) {
        run.timerId = run.setTimeoutFn(() => endNightTurn(run, role), computeEmptyTurnDelayMs(durationMs, run.randomFn))
        return
    }

    // 마감 타이머 걸고, 벌써 다 낸 상태면 5초 뒤로 당김
    run.timerId = run.setTimeoutFn(() => expireNightTurn(run, role), durationMs)
    settleNightTurnIfComplete(session.id)
}

// 밤 턴 마감: 그 역할 끊김 유예를 먼저 끝내고, 안 낸 사람은 기권으로 채운 뒤 턴 닫음 (지도 08-⑥)
function expireNightTurn(run, role) {
    const { session } = run
    if (!isSubmittingNightTurn(run, role)) return

    // 그 역할 끊긴 사람 유예는 턴 마감 때 끝냄 (아직 안 붙었으면 이탈 처리)
    for (const graceRun of [...(disconnectGraceRuns.get(session.id)?.values() ?? [])]) {
        if (session.players.get(graceRun.uuid)?.role !== role) continue
        expireDisconnectGrace(graceRun)
    }
    // 유예 만료(이탈 처리)가 턴을 바꿨으면 멈춤 (단계는 안 봄, 기권은 계속 채움)
    if (!isCurrentNightRun(run) || session.nightTurnRole !== role) return

    fillAbstentions(
        gameSessionCore.getAliveActorUuidsForRole(session, role),
        (actorUuid) => session.nightActions.has(actorUuid),
        (actorUuid) => gameSessionCore.submitNightAction(actorUuid, session.id, null),
        '[밤 턴 만료 기권 기록 실패]',
        session.id,
    )

    endNightTurn(run, role)
}

// 역할 턴 닫기: 결과 확정 → 턴 끝 방송 → 바로 다음 턴 (능력 결과는 밤 끝 개인 결과로만 감)
function endNightTurn(run, role) {
    const { session } = run
    if (!isSubmittingNightTurn(run, role)) return

    // 확정 실패면 턴 안 닫고 잠깐 뒤 다시 (마감 타이머가 이미 지나 아무도 안 닫는 것 막기)
    const completed = completeNightRoleSafely(session, role)
    if (!completed.ok) {
        console.error('[밤 역할 확정 실패]', { code: completed.code, role, gameId: session.id })
        retryNightStepLater(run, '[밤 역할 확정 실패]', { role, gameId: session.id }, () => endNightTurn(run, role))
        return
    }

    // 여기부터 진짜 바뀜: 마감 타이머 끄고 턴 닫힘 표시, 지금 역할·마감 시각 비움
    clearRunTimer(run)
    run.deadline = null
    run.stage = NIGHT_TURN_STAGES.IDLE
    session.nightTurnRole = null
    session.nightTurnDeadline = null

    // 턴 끝 방송 뒤 기다림 없이 다음 역할 턴 열기
    emitNightTurnEvent(run, 'night_turn_ended', gameSessionCore.buildNightTurnEndedPayload(session, role))
    advanceNightTurn(run)
}

// 지금 역할 산 행동자가 다 골랐으면 턴 마감을 지금+5초로 당기고 판 전원에 알림, 당겼으면 새 마감 시각 (아니면 null)
// 1명이어도 같음, 5초 안엔 고른 대상 바꾸기 됨 (다시 내면 덮어씀, 5초는 다시 안 셈), 빈 턴은 무작위 타이머에 맡김
// 당긴 마감엔 바로 턴 닫기: 다 냈으니 기권 채울 것 없음, 낸 뒤 끊긴 사람 유예를 앞당겨 끝내지 않게
function settleNightTurnIfComplete(gameId) {
    const run = nightTurnRuns.get(gameId)
    if (!run) return null
    const { session } = run
    const role = gameSessionCore.getCurrentNightTurnRole(session)
    if (role === null || !isSubmittingNightTurn(run, role)) return null
    if (gameSessionCore.getAliveActorUuidsForRole(session, role).length === 0) return null
    if (!gameSessionCore.isRoleTurnComplete(session, role)) return null

    const pulled = pullRunDeadline(run, `NIGHT:${run.nightDayIndex}:${role}`)
    if (!pulled) return null
    // 판에도 당긴 마감 적어 둠 (새로고침 스냅샷이 줄어든 남은 시간 보임)
    session.nightTurnDeadline = pulled.deadline
    run.retries = 0
    run.timerId = run.setTimeoutFn(() => endNightTurn(run, role), pulled.delayMs)
    announceSettleStarted(run, 'NIGHT', role)
    return pulled.deadline
}

// 밤 턴 순서 시작: 밤마다 run 하나, 이미 있으면 그대로 (시계·타이머는 시험이 넣을 수 있음)
function startNightTurnSequence(io, session, deps = {}) {
    if (!session || session.phase !== 'NIGHT') return null
    // 단계 경계라 끊김 유예부터 끝냄, 이탈로 판이 끝났을 수 있어 밤인지 다시 봄
    expireGracesAtBoundary(session)
    if (session.phase !== 'NIGHT') return null
    const existing = nightTurnRuns.get(session.id)
    if (existing) return existing

    const run = {
        io,
        session,
        index: -1,
        timerId: null,
        deadline: null,
        nightDayIndex: session.dayIndex,
        stage: NIGHT_TURN_STAGES.IDLE,
        randomFn: deps.randomFn ?? Math.random,
        ...pickTimerFns(deps),
        durationMs: deps.turnDurationMs ?? null,
        // 다 고른 뒤 턴 닫기까지 시간 (시험만 넣음, 없으면 settle 5초)
        settleDelayMs: deps.settleDelayMs ?? null,
    }
    // 여기부터 진짜 바뀜: run 등록, 차례 진행 표시 (밤 판정이 차례 기록을 쓰게)
    nightTurnRuns.set(session.id, run)
    gameSessionCore.markNightSequenced(session)
    advanceNightTurn(run)
    return run
}

// 밤 턴 순서 멈춤: 밤 끝·판 끝·낮 전환·시험 초기화 때 타이머 끄고 run 지움
function stopNightTurnSequence(gameId) {
    const run = nightTurnRuns.get(gameId)
    if (!run) return
    clearRunTimer(run)
    run.deadline = null
    run.stage = NIGHT_TURN_STAGES.STOPPED
    nightTurnRuns.delete(gameId)
    // 지금 역할 표시·마감 시각도 지움 (다음 밤은 새 run이 다시 정함)
    delete run.session.nightTurnRole
    delete run.session.nightTurnDeadline
}

module.exports = {
    advanceNightTurn,
    endNightTurn,
    settleNightTurnIfComplete,
    startNightTurnSequence,
    stopNightTurnSequence,
}
