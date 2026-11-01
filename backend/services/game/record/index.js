// 판 끝 전적 저장 파일
// 전적 레코드 1번 만들고 저장·재시도 + 저장 뒤 캐시 무효화 신호·업적 평가, socket gameSession이 부름
// 저장은 시작만 하고 기다리지 않음 (판정 방송·ack가 DB를 안 기다리게, 지도 07-①)
const gameSessionCore = require('../../../game-core/gameSession')
const gameResultRepository = require('../../../repositories/gameResult.repositories')
const gameAchievementService = require('../achievementHooks')

// 바깥 함수 참조 묶음: 재시도 타이머(시험이 교체) + 사용자 전송(socket.js가 넣어 줌)
const deps = {
    setTimeoutFn: setTimeout,
    clearTimeoutFn: clearTimeout,
    emitToUser: null,
}

// 아직 DB 커밋 확인 못 한 저장 작업 (gameId → run)
const terminalPersistRuns = new Map()

// 이 프로세스에서 저장 확인된 판 (오래된 것부터 버림)
const terminalPersistConfirmed = new Set()
const TERMINAL_PERSIST_CONFIRMED_MAX = 4096

// session을 붙잡은 늦은 훅도 저장 다시 못 하게 (Set에서 밀려난 판 보완)
let terminalPersistBySession = new WeakMap()

// 실패하면 1초 → 5초 → 30초, 그 뒤로는 60초마다 (지도 07-②)
const TERMINAL_PERSIST_RETRY_DELAYS_MS = [1_000, 5_000, 30_000]
const TERMINAL_PERSIST_MAX_DELAY_MS = 60_000

// socket.js 사용자 전송 함수 넣기 (함수 아니면 비움)
function setEmitToUser(emit) {
    deps.emitToUser = typeof emit === 'function' ? emit : null
}

// 시험용: 재시도 타이머 함수 갈아끼우기 (없으면 진짜 타이머)
function __setTerminalPersistTimersForTests({ setTimeoutFn, clearTimeoutFn } = {}) {
    deps.setTimeoutFn = setTimeoutFn ?? setTimeout
    deps.clearTimeoutFn = clearTimeoutFn ?? clearTimeout
}

// 판 끝 전적 저장 시작: 같은 판은 한 번만 (진행 중·이 세션 표식·저장 확인 중 하나라도 있으면 그만, 지도 07-③)
function persistTerminalSession(session, { completed, disconnectedUuid } = {}) {
    const gameId = session?.id
    if (typeof gameId !== 'string' || !gameId) return
    if (terminalPersistRuns.has(gameId)) return
    if (terminalPersistBySession.get(session)) return
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
    terminalPersistBySession.set(session, run)
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

// 원 참가자 각자에게 캐시 무효화 신호 (채널에 없어도, 내용은 판 id·범위만, 지도 07-⑦)
function invalidateAccountCaches(uuids, gameId, scopes) {
    const emit = deps.emitToUser
    if (typeof emit !== 'function') return
    for (const uuid of uuids) {
        if (typeof uuid !== 'string' || !uuid) continue
        try {
            emit(uuid, 'account_cache_invalidated', { gameId, scopes: [...scopes] })
        } catch {
            console.error('[캐시 무효화 전달 실패]', { code: 'INVALIDATION_DELIVERY_ERROR', gameId })
        }
    }
}

// 시험용: 진행 중 저장 작업 목록
function __getTerminalPersistRunsForTests() {
    return [...terminalPersistRuns.values()]
}

// 시험용 초기화: 재시도 타이머 끄고(지금 넣어 둔 clear 함수로) 보관함 비우고 타이머 원래대로
function __resetTerminalPersistForTests() {
    for (const run of [...terminalPersistRuns.values()]) clearPersistTimer(run)
    terminalPersistRuns.clear()
    terminalPersistConfirmed.clear()
    terminalPersistBySession = new WeakMap()
    __setTerminalPersistTimersForTests()
}

module.exports = {
    persistTerminalSession,
    setEmitToUser,
    __setTerminalPersistTimersForTests,
    __getTerminalPersistRunsForTests,
    __resetTerminalPersistForTests,
}
