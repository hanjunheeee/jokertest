// run 타이머 도구 파일
// run 시계·타이머 함수 고르기·끄기·밤 턴·연출 대기 시간 정하기 + 마감 때 기권 채우기, 밤 턴·낮·끊김 유예 run이 같이 씀
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate } = require('../../common/isolate')
const {
    NIGHT_WAIT_DEFAULT_MS,
    NIGHT_WAIT_MAX_MS,
} = require('./constants')

// run에 넣을 시계·타이머 함수: 시험이 넣은 것 먼저, 없으면 진짜 것 (부를 때마다 전역 값을 읽음)
function pickTimerFns(deps, nowFallback = Date.now) {
    return {
        nowFn: deps.nowFn ?? nowFallback,
        setTimeoutFn: deps.setTimeoutFn ?? setTimeout,
        clearTimeoutFn: deps.clearTimeoutFn ?? clearTimeout,
    }
}

// run 타이머 끄고 비움 (늦게 온 옛 타이머가 턴·단계를 또 닫지 못하게, 지도 05-⑩)
function clearRunTimer(run) {
    if (run.timerId !== null) {
        run.clearTimeoutFn(run.timerId)
        run.timerId = null
    }
}

// 연출 대기 표의 상한 타이머 끄고 대기도 끔 (run의 clear 함수로)
function deactivateWaitToken(run, token) {
    if (token.timerId !== null && token.timerId !== undefined) {
        run.clearTimeoutFn(token.timerId)
    }
    token.timerId = null
    token.active = false
}

// 연출 대기 상한: 시험 주입 → 환경 변수 → 기본값 순서, 범위 밖 값은 버림 (지도 05-⑨)
function resolveNightWaitMs(deps) {
    // 1 이상 setTimeout 최대값 이하 정수만 (넘으면 Node가 1ms로 바꿔 바로 풀림)
    const isValidTimeout = (value) =>
        Number.isInteger(value) && value > 0 && value <= NIGHT_WAIT_MAX_MS

    const injected = deps?.presentationWaitTimeoutMs
    if (isValidTimeout(injected)) return injected

    const fromEnv = Number(process.env.NIGHT_PRESENTATION_WAIT_TIMEOUT_MS)
    if (isValidTimeout(fromEnv)) return fromEnv

    return NIGHT_WAIT_DEFAULT_MS
}

// 산 행동자 없는 턴도 바로 안 끝내고 턴 길이의 20~60% 무작위 뒤 끝냄 (역할 전멸이 새지 않게)
function computeEmptyTurnDelayMs(durationMs, randomFn = Math.random) {
    const raw = Number(randomFn())
    const bounded = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1) : 0
    return Math.floor(durationMs * (0.2 + bounded * 0.4))
}

// 역할 턴 길이: 시험 주입 → 방 설정 역할별 → 방 설정 밤 공통 → 기본값 순서
function resolveNightTurnDurationMs(run, role) {
    if (run.durationMs !== null) return run.durationMs

    const timerSettings = run.session.timerSettings
    const roleSeconds = timerSettings?.roleNightActionTimes?.[role]
    if (Number.isInteger(roleSeconds) && roleSeconds > 0) return roleSeconds * 1000

    const fallbackSeconds = timerSettings?.nightActionTime
    if (Number.isInteger(fallbackSeconds) && fallbackSeconds > 0) return fallbackSeconds * 1000

    return gameSessionCore.NIGHT_TURN_DURATION_MS
}

// 마감까지 안 낸 사람은 기권으로 채움, 한 명 실패해도 나머지는 계속 (밤 턴·낮 투표 마감이 같이 씀)
function fillAbstentions(voterUuids, hasSubmitted, submitAbstain, label, gameId) {
    for (const voterUuid of voterUuids) {
        if (hasSubmitted(voterUuid)) continue
        isolate(label, { code: 'ABSTAIN_ERROR', uuid: voterUuid, gameId }, () => submitAbstain(voterUuid))
    }
}

module.exports = {
    pickTimerFns,
    clearRunTimer,
    deactivateWaitToken,
    resolveNightWaitMs,
    computeEmptyTurnDelayMs,
    resolveNightTurnDurationMs,
    fillAbstentions,
}
