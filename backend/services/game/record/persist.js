// 전적 저장 파일, 저장 시작 · 시도 · 재시도 · 끝내기
// 저장은 시작만 하고 기다리지 않음 (판정 방송이 DB를 안 기다리게)
const gameSessionCore = require('../../../game-core/gameSession')
const gameResultRepository = require('../../../repositories/gameResult.repositories')
const gameAchievementService = require('../achievementHooks')
const { terminalPersistRuns, getBySession, terminalPersistConfirmed } = require('./state')
const { TERMINAL_PERSIST_RETRY_DELAYS_MS, TERMINAL_PERSIST_MAX_DELAY_MS, TERMINAL_PERSIST_CONFIRMED_MAX } = require('./constants')
const { deps } = require('./deps')
const { invalidateAccountCaches } = require('./notify')

// 판 끝 전적 저장 시작: 같은 판은 한 번만 (진행 중·이 세션 표식·저장 확인 중 하나라도 있으면 그만, 지도 07-③)
function persistTerminalSession(session, { completed, disconnectedUuid } = {}) {
    const gameId = session?.id
    if (typeof gameId !== 'string' || !gameId) return
    if (terminalPersistRuns.has(gameId)) return
    if (getBySession().get(session)) return
    if (terminalPersistConfirmed.has(gameId)) return

    // 레코드·원 참가자 명단은 처음 한 번만 만들어 고정 (재시도마다 달라지지 않게)
    let record
    let participantUuids
    try {
        record = gameSessionCore.buildGameResultRecord(session, { completed, disconnectedUuid })
        participantUuids = session?.players instanceof Map
            ? [...session.players.values()].map((p) => p.uuid)
            : []
    } catch {
        console.error('[전적 저장 실패]', { code: 'RECORD_BUILD_ERROR', gameId })
        return
    }

    const run = { gameId, record: deepFreezeRecord(record), participantUuids, attempt: 0, timerId: null }
    terminalPersistRuns.set(gameId, run)
    getBySession().set(session, run)
    attemptTerminalPersist(run)
}

// 레코드 통째로 얼리기 (재시도 사이에 바뀌지 않게)
function deepFreezeRecord(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreezeRecord(nested)
    return value
}

// 저장 한 번 시도: 동기로 던져도 실패 Promise로 바꿔 재시도 길로
function attemptTerminalPersist(run) {
    run.attempt += 1
    let pending
    try {
        pending = Promise.resolve(gameResultRepository.persistGameResultRecord(run.record))
    } catch (err) {
        pending = Promise.reject(err)
    }
    pending
        .then(() => finishTerminalPersist(run))
        .catch(() => {
            console.error('[전적 저장 실패]', { code: 'PERSIST_ERROR', gameId: run.gameId, attempt: run.attempt })
            scheduleTerminalPersistRetry(run)
        })
}

// 재시도 예약: 아직 이 run이 그 판 작업일 때만 (프로세스 종료는 안 막음)
function scheduleTerminalPersistRetry(run) {
    if (terminalPersistRuns.get(run.gameId) !== run) return
    const delay = TERMINAL_PERSIST_RETRY_DELAYS_MS[run.attempt - 1] ?? TERMINAL_PERSIST_MAX_DELAY_MS
    const setTimeoutFn = deps.setTimeoutFn
    run.timerId = setTimeoutFn(() => {
        run.timerId = null
        if (terminalPersistRuns.get(run.gameId) !== run) return
        attemptTerminalPersist(run)
    }, delay)
    if (typeof run.timerId?.unref === 'function') run.timerId.unref()
}

// 재시도 타이머 끄고 비움
function clearPersistTimer(run) {
    if (run.timerId !== null) {
        const clearTimeoutFn = deps.clearTimeoutFn
        clearTimeoutFn(run.timerId)
    }
    run.timerId = null
}

// 저장 확인: 작업 지우고 확인 표시, 그다음 프로필 → (업적 평가 뒤) 경제·업적 캐시 무효화 신호
function finishTerminalPersist(run) {
    if (terminalPersistRuns.get(run.gameId) === run) terminalPersistRuns.delete(run.gameId)
    terminalPersistConfirmed.add(run.gameId)
    if (terminalPersistConfirmed.size > TERMINAL_PERSIST_CONFIRMED_MAX) {
        terminalPersistConfirmed.delete(terminalPersistConfirmed.values().next().value)
    }
    clearPersistTimer(run)

    invalidateAccountCaches(run.participantUuids, run.gameId, ['profile'])
    Promise.resolve(gameAchievementService.evaluateAchievementsForUsers(run.participantUuids, run.gameId))
        .then(() => invalidateAccountCaches(run.participantUuids, run.gameId, ['economy', 'achievements']))
        .catch(() => {
            console.error('[업적 평가 실패]', { code: 'ACHIEVEMENT_EVAL_ERROR', gameId: run.gameId })
        })
}

module.exports = {
    persistTerminalSession,
    clearPersistTimer,
}
