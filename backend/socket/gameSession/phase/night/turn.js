// 밤 턴 순서 파일
// 역할 턴 열기·마감·닫기 + 밤 턴 순서 시작·멈춤, 낮 타이머·밤 마무리·이탈·핸들러가 씀
// 다 돌면 밤 마무리는 phaseHooks로 부름 (finalize가 이 파일을 require해서 고리 막기)
const gameSessionCore = require('../../../../game-core/gameSession')
const { isolate, isolateOr, tryOr } = require('../../../common/isolate')
const { NIGHT_TURN_STAGES } = require('../../core/constants')
const { nightTurnRuns, disconnectGraceRuns, phaseHooks } = require('../../core/state')
const {
    pickTimerFns,
    clearRunTimer,
    deactivateWaitToken,
    resolveNightWaitMs,
    computeEmptyTurnDelayMs,
    resolveNightTurnDurationMs,
    fillAbstentions,
} = require('../../core/timers')
const { expireGracesAtBoundary, expireDisconnectGrace } = require('../../connection/grace')
const { emitToGameChannel } = require('../../delivery/broadcast')
const { isCurrentNightRun, isSubmittingNightTurn } = require('./checks')
const { buildNightPresentationContract } = require('./contract')
const { ensureNightReceipts } = require('./receipts')
const { emitNightSuccessEvents } = require('./notify')
const { beginNightWait, activateNightWait } = require('./wait')

// 밤 턴 방송, 던져도 턴 진행은 계속
function emitNightTurnEvent(run, event, payload) {
    isolate('[밤 턴 방송 실패]', { code: 'DELIVERY_ERROR', event, gameId: run.session.id },
        () => emitToGameChannel(run.io, run.session, event, payload))
}

// 역할 결과 확정, 던지면 실패 결과로 바꿈 (턴 진행이 예외로 끊기지 않게)
function completeNightRoleSafely(session, role) {
    return tryOr({ ok: false, code: 'ROLE_COMPLETE_UNEXPECTED_ERROR' }, () => gameSessionCore.completeNightRole(session, role))
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
            return
        }
        run.index += 1
    }
    // 다 돌았으면 run 멈추고 밤 마무리
    if (run.index >= gameSessionCore.NIGHT_TURN_ORDER.length) {
        stopNightTurnSequence(session.id)
        // 밤 마무리는 night/finalize 것을 주입받아 부름 (require 고리 막기)
        phaseHooks.finalizeNightForSession(run.io, session)
        return
    }

    // 여기부터 진짜 바뀜: 이 역할 턴 열고 마감 시각 방송
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

    // 마감 타이머 걸고, 벌써 다 낸 상태면 바로 닫음
    run.timerId = run.setTimeoutFn(() => expireNightTurn(run, role), durationMs)
    maybeEndNightTurn(session.id)
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

// 역할 턴 닫기: 결과 확정 → 성공 사건 개별 전달 → 턴 끝 방송 → 연출 대기 (지도 05-⑧⑩)
function endNightTurn(run, role) {
    const { session } = run
    if (!isSubmittingNightTurn(run, role)) return

    // 확정 실패면 턴 안 닫고 로그만
    const completed = completeNightRoleSafely(session, role)
    if (!completed.ok) {
        console.error('[밤 역할 확정 실패]', { code: completed.code, role, gameId: session.id })
        return
    }

    // 계약 만들기가 던져도 턴은 닫음 (사건 전달만 빠짐)
    const contract = isolateOr(null, '[밤 연출 계약 오류]', { code: 'CONTRACT_BUILD_ERROR', role, gameId: session.id },
        () => buildNightPresentationContract(run, completed))

    // 여기부터 진짜 바뀜: 마감 타이머 끄고 연출 대기로
    clearRunTimer(run)
    run.deadline = null

    // 대기 단계부터 들어감 (턴 닫힘 표시), 사건·턴 끝 방송 뒤 대기 켬
    const wait = beginNightWait(run, completed, contract)
    if (contract) {
        isolate('[밤 성공 사건 전달 오류]', { code: 'SUCCESS_EVENT_ERROR', role, gameId: session.id },
            () => emitNightSuccessEvents(run, contract))
    }
    emitNightTurnEvent(run, 'night_turn_ended', gameSessionCore.buildNightTurnEndedPayload(session, role))
    activateNightWait(run, wait)
}

// 지금 역할 산 행동자가 다 냈으면 마감 안 기다리고 턴 닫음 (빈 턴은 타이머에 맡김)
function maybeEndNightTurn(gameId) {
    const run = nightTurnRuns.get(gameId)
    if (!run) return
    const role = gameSessionCore.getCurrentNightTurnRole(run.session)
    if (role === null) return
    if (gameSessionCore.getAliveActorUuidsForRole(run.session, role).length === 0) return
    if (!gameSessionCore.isRoleTurnComplete(run.session, role)) return
    endNightTurn(run, role)
}

// 밤 턴 순서 시작: 밤마다 run 하나, 이미 있으면 그대로 (시계·타이머는 시험이 넣을 수 있음)
function startNightTurnSequence(io, session, deps = {}) {
    if (!session || session.phase !== 'NIGHT') return null
    // 단계 경계라 끊김 유예부터 끝냄, 이탈로 판이 끝났을 수 있어 밤인지 다시 봄
    expireGracesAtBoundary(session)
    if (session.phase !== 'NIGHT') return null
    const existing = nightTurnRuns.get(session.id)
    if (existing) return existing

    // 사건 보내기 전에 이 밤 수신 기록 칸 열기
    ensureNightReceipts(session)

    const run = {
        io,
        session,
        index: -1,
        timerId: null,
        deadline: null,
        nightDayIndex: session.dayIndex,
        stage: NIGHT_TURN_STAGES.IDLE,
        wait: null,
        waitSeq: 0,
        contracts: new Map(),
        randomFn: deps.randomFn ?? Math.random,
        ...pickTimerFns(deps),
        durationMs: deps.turnDurationMs ?? null,
        presentationWaitTimeoutMs: resolveNightWaitMs(deps),
    }
    // 여기부터 진짜 바뀜: run 등록, 차례 진행 표시 (밤 판정이 차례 기록을 쓰게)
    nightTurnRuns.set(session.id, run)
    gameSessionCore.markNightSequenced(session)
    advanceNightTurn(run)
    return run
}

// 밤 턴 순서 멈춤: 밤 끝·판 끝·낮 전환·시험 초기화 때 타이머·대기 끄고 run 지움
function stopNightTurnSequence(gameId) {
    const run = nightTurnRuns.get(gameId)
    if (!run) return
    clearRunTimer(run)
    run.deadline = null
    if (run.wait) deactivateWaitToken(run, run.wait)
    run.wait = null
    run.stage = NIGHT_TURN_STAGES.STOPPED
    nightTurnRuns.delete(gameId)
    // 지금 역할 표시·마감 시각도 지움 (다음 밤은 새 run이 다시 정함)
    delete run.session.nightTurnRole
    delete run.session.nightTurnDeadline
}

module.exports = {
    advanceNightTurn,
    endNightTurn,
    maybeEndNightTurn,
    startNightTurnSequence,
    stopNightTurnSequence,
}
