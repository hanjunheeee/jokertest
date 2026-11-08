// 재판 마감 타이머 파일
// 재판 마감 걸기·끄기 + 마감 때 안 낸 사람 기권 채우고 판정 (BE-003), 판 단계 타이머 맞추기·판 끝 정리가 씀
// 판정·방송은 departure/autoResolve 것을 phaseHooks로 부름 (그 파일이 낮 타이머 파일을 require해서 고리 막기)
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate } = require('../../common/isolate')
const { PHASE_RETRY_DELAY_MS, PHASE_RETRY_MAX } = require('../core/constants')
const { tribunalRuns, phaseHooks } = require('../core/state')
const { pickTimerFns, setRunTimer, clearRunTimer, fillAbstentions } = require('../core/timers')

// 지금 판이 그 재판 그대로인지 (같은 날·같은 피고·아직 안 끝남)
function matchesTribunal(run) {
    const { session } = run
    if (session.phase !== 'TRIBUNAL') return false
    const tribunal = session.tribunal
    if (!tribunal || tribunal.resolved === true) return false
    return session.dayIndex === run.dayIndex && tribunal.defendantUuid === run.defendantUuid
}

// 재판 길이: 시험 주입 → 방 설정 낮 투표 시간 → 기본 낮 투표 시간 (재판도 표 한 번 내는 단계라 같은 길이)
function resolveTribunalDurationMs(session, deps) {
    if (Number.isInteger(deps.durationMs) && deps.durationMs > 0) return deps.durationMs
    const seconds = session.timerSettings?.dayVoteTime
    if (Number.isInteger(seconds) && seconds > 0) return seconds * 1000
    return gameSessionCore.DAY_VOTE_DURATION_MS
}

// 재판 마감 걸기: 재판마다 하나, 같은 재판이면 그대로 (마감 유지)
function startTribunalTimer(io, session, deps = {}) {
    if (!session) return null
    if (session.phase !== 'TRIBUNAL' || !session.tribunal || session.tribunal.resolved === true) {
        stopTribunalTimer(session.id)
        return null
    }
    const existing = tribunalRuns.get(session.id)
    if (existing && existing.session === session && matchesTribunal(existing)) return existing
    if (existing) stopTribunalTimer(session.id)

    const durationMs = resolveTribunalDurationMs(session, deps)
    const run = {
        io,
        session,
        timerId: null,
        deadline: null,
        retries: 0,
        dayIndex: session.dayIndex,
        defendantUuid: session.tribunal.defendantUuid,
        ...pickTimerFns(deps),
    }
    run.deadline = run.nowFn() + durationMs
    // 판에도 마감 시각 적어 둠 (스냅샷이 화면 타이머용으로 실음)
    session.tribunalDeadline = run.deadline
    tribunalRuns.set(session.id, run)
    setRunTimer(run, () => expireTribunal(run), durationMs)
    return run
}

// 재판 마감 끄기: 재판 끝·판 끝·시험 초기화
function stopTribunalTimer(gameId) {
    const run = tribunalRuns.get(gameId)
    if (!run) return
    clearRunTimer(run)
    if (run.session) run.session.tribunalDeadline = null
    tribunalRuns.delete(gameId)
}

// 재판 마감: 안 낸 산 사람은 기권으로 채우고 판정, 판정이 안 되면 잠깐 뒤 다시 (최대 PHASE_RETRY_MAX번)
function expireTribunal(run) {
    const { session } = run
    // 옛 run이거나 그사이 재판이 끝났으면 무시
    if (tribunalRuns.get(session.id) !== run) return
    run.timerId = null
    if (!matchesTribunal(run)) {
        stopTribunalTimer(session.id)
        return
    }

    fillAbstentions(
        gameSessionCore.getTribunalVoterUuids(session, run.defendantUuid),
        (voterUuid) => session.tribunal.votes.has(voterUuid),
        (voterUuid) => gameSessionCore.submitTribunalAbstention(voterUuid, session.id, session.dayIndex),
        '[재판 만료 기권 기록 실패]',
        session.id,
    )

    // 판정·방송·다음 단계 타이머는 이탈 뒤 바로 판정과 같은 길 (확정되면 그쪽이 이 타이머를 끔)
    isolate('[재판 만료 판정 실패]', { code: 'RESOLVE_ERROR', gameId: session.id },
        () => phaseHooks.resolveTribunalNow(run.io, session))

    // 아직 같은 재판이면 판정 실패: 잠깐 뒤 다시
    if (tribunalRuns.get(session.id) !== run || !matchesTribunal(run)) return
    if (run.retries >= PHASE_RETRY_MAX) {
        console.error('[재판 만료 판정 실패]', { code: 'RETRY_EXHAUSTED', gameId: session.id })
        return
    }
    run.retries += 1
    setRunTimer(run, () => expireTribunal(run), PHASE_RETRY_DELAY_MS)
}

module.exports = {
    startTribunalTimer,
    stopTribunalTimer,
}
