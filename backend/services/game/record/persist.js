// 전적 저장 파일, 저장 시작 · 시도 · 재시도 · 끝내기 + 저장 뒤 캐시 무효화 신호
// 전적 입구(index.js) 거쳐 socket gameSession 종료 길이 부름, testing.js는 타이머 끄기만
// 저장은 시작만 하고 안 기다림 (판정 방송이 DB 안 기다리게), 사건 이름은 글자 그대로 (프론트 시험이 읽음)
const gameSessionCore = require('../../../game-core/gameSession')
const gameResultRepository = require('../../../repositories/game/result')
const gameAchievementService = require('../achievementHooks')
const { terminalPersistRuns, getBySession, confirmedGameIds } = require('./state')
const { RETRY_DELAYS_MS, MAX_DELAY_MS, CONFIRMED_MAX } = require('./constants')
const { deps } = require('./deps')

// 판 끝 전적 저장 시작, 같은 판은 한 번만 (지도 07-③)
function persistTerminalSession(session, { completed, disconnectedUuid } = {}) {
    // 판 id 없거나, 진행 중·이 세션 표식·저장 확인 중 하나라도 있으면 그만
    const gameId = session?.id
    if (typeof gameId !== 'string' || !gameId) return
    if (terminalPersistRuns.has(gameId)) return
    if (getBySession().get(session)) return
    if (confirmedGameIds.has(gameId)) return

    // 레코드·원 참가자 명단은 처음 한 번만 만들어 고정 (재시도마다 달라지지 않게)
    let record
    let participantUuids
    try {
        record = gameSessionCore.buildGameResultRecord(session, { completed, disconnectedUuid })
        participantUuids = session?.players instanceof Map
            ? [...session.players.values()].map((p) => p.uuid)
            : []
    } catch {
        // 레코드 못 만들면 기록만 하고 그만 (종료 처리 안 막게)
        console.error('[전적 저장 실패]', { code: 'RECORD_BUILD_ERROR', gameId })
        return
    }

    // 여기부터 진짜 바뀜: 판 id·세션 둘 다 표식 남기고 첫 시도
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
    // 성공이면 끝내기, 실패면 기록하고 재시도 예약
    pending
        .then(() => finishTerminalPersist(run))
        .catch(() => {
            console.error('[전적 저장 실패]', { code: 'PERSIST_ERROR', gameId: run.gameId, attempt: run.attempt })
            scheduleRetry(run)
        })
}

// 재시도 예약: 아직 이 run이 그 판 작업일 때만 (프로세스 종료는 안 막음)
function scheduleRetry(run) {
    if (terminalPersistRuns.get(run.gameId) !== run) return
    // 시도 횟수대로 간격 고르고, 다 쓰면 최대 간격
    const delay = RETRY_DELAYS_MS[run.attempt - 1] ?? MAX_DELAY_MS
    const setTimeoutFn = deps.setTimeoutFn
    run.timerId = setTimeoutFn(() => {
        run.timerId = null
        // 그사이 초기화로 작업이 바뀌었으면 안 함
        if (terminalPersistRuns.get(run.gameId) !== run) return
        attemptTerminalPersist(run)
    }, delay)
    // 시험 가짜 타이머는 unref 없을 수 있음
    if (typeof run.timerId?.unref === 'function') run.timerId.unref()
}

// 재시도 타이머 끄고 비움 (지금 넣어 둔 clear 함수로)
function clearPersistTimer(run) {
    if (run.timerId !== null) {
        const clearTimeoutFn = deps.clearTimeoutFn
        clearTimeoutFn(run.timerId)
    }
    run.timerId = null
}

// 저장 확인: 작업 지우고 확인 표시, 그다음 프로필 → (업적 평가 뒤) 경제·업적 캐시 무효화 신호
function finishTerminalPersist(run) {
    // 초기화로 바뀐 작업이면 남의 작업 안 지움
    if (terminalPersistRuns.get(run.gameId) === run) terminalPersistRuns.delete(run.gameId)
    // 확인 목록 넘치면 가장 오래된 판 버림 (그 판은 세션 표식이 대신 막음)
    confirmedGameIds.add(run.gameId)
    if (confirmedGameIds.size > CONFIRMED_MAX) {
        confirmedGameIds.delete(confirmedGameIds.values().next().value)
    }
    clearPersistTimer(run)

    // 프로필은 바로, 경제·업적은 보상 지급 끝난 뒤 (다시 읽을 때 보상 보이게)
    invalidateAccountCaches(run.participantUuids, run.gameId, ['profile'])
    Promise.resolve(gameAchievementService.evaluateForUsers(run.participantUuids, run.gameId))
        .then(() => invalidateAccountCaches(run.participantUuids, run.gameId, ['economy', 'achievements']))
        .catch(() => {
            console.error('[업적 평가 실패]', { code: 'ACHIEVEMENT_EVAL_ERROR', gameId: run.gameId })
        })
}

// 원 참가자 각자에게 캐시 무효화 신호 (채널에 없어도, 내용은 판 id·범위만, 지도 07-⑦)
function invalidateAccountCaches(uuids, gameId, scopes) {
    // 전송 함수 안 넣었으면(시험·소켓 켜기 전) 안 보냄
    const emit = deps.emitToUser
    if (typeof emit !== 'function') return
    for (const uuid of uuids) {
        if (typeof uuid !== 'string' || !uuid) continue
        // 사람마다 따로 잡음 (한 명 전송 실패가 나머지 안 막음)
        try {
            emit(uuid, 'account_cache_invalidated', { gameId, scopes: [...scopes] })
        } catch {
            console.error('[캐시 무효화 전달 실패]', { code: 'INVALIDATION_DELIVERY_ERROR', gameId })
        }
    }
}

module.exports = {
    persistTerminalSession,
    clearPersistTimer,
}
