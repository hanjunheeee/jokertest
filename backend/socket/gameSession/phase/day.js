// 낮 타이머 파일
// 낮 토론·투표 마감 타이머 + 판 단계에 맞게 밤·낮 타이머 맞추기, 핸들러·이탈·밤 마무리가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate } = require('../../common/isolate')
const { dayPhaseRuns } = require('../core/state')
const { pickTimerFns, clearRunTimer, fillAbstentions } = require('../core/timers')
const { expireGracesAtBoundary } = require('../connection/grace')
const { emitToGameChannel, deliverToParticipants } = require('../delivery/broadcast')
const { startNightTurnSequence, stopNightTurnSequence } = require('./night/turn')

// 낮 단계 방송, 던져도 타이머 진행은 계속
function emitDayPhaseEvent(run, event, payload) {
    isolate('[낮 페이즈 방송 실패]', { code: 'DELIVERY_ERROR', event, gameId: run.session.id },
        () => emitToGameChannel(run.io, run.session, event, payload))
}

// 지금 판이 낮이고 타이머 걸 때 적어 둔 날짜·낮 단계·투표 라운드 그대로인지
function matchesDayState(run) {
    const { session } = run
    if (session.phase !== 'DAY') return false
    if (session.dayIndex !== run.scheduledFor.dayIndex) return false
    if (gameSessionCore.getDayPhase(session) !== run.scheduledFor.dayPhase) return false
    return gameSessionCore.getDayVoteRound(session) === run.scheduledFor.round
}

// 이 낮 타이머가 아직 그 판의 run이고 걸어 둔 그 단계·라운드 그대로인지 (늦은 타이머 거르기, 지도 04-⑥)
function isLiveDayRun(run) {
    if (dayPhaseRuns.get(run.session.id) !== run) return false
    return matchesDayState(run)
}

// 타이머 쪽 core 호출: 던지거나 실패하면 로그만 찍고 null (답할 사람이 없음)
function callCoreOrLog(label, gameId, throwCode, call) {
    let result
    try {
        result = call()
    } catch {
        console.error(label, { code: throwCode, gameId })
        return null
    }
    if (!result.ok) {
        console.error(label, { code: result.code, gameId })
        return null
    }
    return result
}

// 지금 낮 단계(토론·투표)에 맞는 마감 타이머 다시 걸기 (토론→투표·재투표 때마다)
function scheduleDayPhaseTimer(run) {
    const { session } = run
    // 옛 타이머부터 끔, 낮이 아니면 run째 지움
    clearRunTimer(run)
    if (session.phase !== 'DAY') {
        stopDayPhaseTimer(session.id)
        return
    }

    const dayPhase = gameSessionCore.getDayPhase(session)
    const isVote = dayPhase === gameSessionCore.DAY_PHASES.VOTE
    const durationMs = isVote ? run.voteDurationMs : run.discussionDurationMs
    // 걸 때 날짜·단계·라운드 적어 둠 (만료 때 비교해서 늦은 타이머 거르기)
    run.scheduledFor = {
        dayIndex: session.dayIndex,
        dayPhase,
        round: gameSessionCore.getDayVoteRound(session),
    }
    run.deadline = run.nowFn() + durationMs
    run.timerId = run.setTimeoutFn(
        isVote ? () => expireDayVote(run) : () => expireDayDiscussion(run),
        durationMs,
    )
}

// 토론 마감: 투표 단계로 넘기고 방송, 투표 타이머 걸기
function expireDayDiscussion(run) {
    const { session } = run
    // 늦게 온 옛 타이머면 무시
    if (!isLiveDayRun(run)) return

    // 투표 단계로 넘기기, 던지면 방송·타이머 안 함
    const entered = isolate('[낮 토론 만료 처리 실패]', { code: 'TRANSITION_ERROR', gameId: session.id },
        () => gameSessionCore.enterDayVotePhase(session))
    if (!entered) return

    emitDayPhaseEvent(run, 'day_phase_changed', gameSessionCore.buildDayPhaseChangedPayload(session))
    scheduleDayPhaseTimer(run)
}

// 투표 마감: 안 낸 사람 기권으로 채우고 판정·방송, 다음 단계 타이머로 (지도 04-⑥)
function expireDayVote(run) {
    const { session } = run
    // 늦게 온 옛 타이머면 무시
    if (!isLiveDayRun(run)) return

    // 안 낸 산 사람은 기권으로 (마감 뒤엔 전원 낸 걸로 판정)
    fillAbstentions(
        gameSessionCore.getDayVoterUuids(session),
        (voterUuid) => session.dayVotes.has(voterUuid),
        (voterUuid) => gameSessionCore.submitDayVote(voterUuid, session.id, null),
        '[낮 투표 만료 기권 기록 실패]',
        session.id,
    )

    // 판정 준비: 누른 사람이 없어 판 첫 사람 이름으로 부름
    const label = '[낮 투표 만료 판정 실패]'
    const requesterUuid = session.players.keys().next().value
    const prepared = callCoreOrLog(label, session.id, 'PREPARE_UNEXPECTED_ERROR',
        () => gameSessionCore.prepareDayVoteResolution(requesterUuid, session.id, session.dayIndex))
    if (!prepared) return
    // 버튼이 먼저 판정했으면 타이머만 다시 걸기
    if (prepared.alreadyResolved) {
        scheduleDayPhaseTimer(run)
        return
    }

    // 확정 실패면 로그만, 방송·타이머 없음
    const committed = callCoreOrLog(label, session.id, 'COMMIT_ERROR',
        () => gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution))
    if (!committed) return

    const resolvedPayload = gameSessionCore.buildDayVoteResolvedPayload(session, prepared.resolution)
    deliverToParticipants(run.io, session, 'day_vote_resolved', resolvedPayload, label, { gameId: session.id })

    // 재판·재투표·밤 중 바뀐 단계에 맞게 타이머 다시 맞춤
    syncSessionPhaseTimers(run.io, session)
}

// 낮 타이머 시작: 판마다 run 하나 (토론·투표 길이는 방 설정, 없으면 기본값)
function startDayPhaseTimer(io, session, deps = {}) {
    if (!session) return null
    // 단계 경계라 끊김 유예부터 끝냄 (이탈로 판이 바뀔 수 있어 낮 확인은 그 뒤)
    expireGracesAtBoundary(session)
    if (session.phase !== 'DAY') {
        stopDayPhaseTimer(session.id)
        return null
    }

    // 같은 낮 안에선 run 다시 씀 (길이 설정은 처음 만들 때만 읽음)
    let run = dayPhaseRuns.get(session.id)
    if (!run) {
        const timerSettings = session.timerSettings
        // 방 설정 초 → ms, 없거나 이상한 값이면 기본값
        const secondsToMs = (seconds, fallbackMs) =>
            Number.isInteger(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs
        run = {
            io,
            session,
            timerId: null,
            deadline: null,
            scheduledFor: null,
            ...pickTimerFns(deps),
            discussionDurationMs:
                deps.discussionDurationMs ??
                secondsToMs(timerSettings?.dayDiscussionTime, gameSessionCore.DAY_DISCUSSION_DURATION_MS),
            voteDurationMs:
                deps.voteDurationMs ?? secondsToMs(timerSettings?.dayVoteTime, gameSessionCore.DAY_VOTE_DURATION_MS),
        }
        dayPhaseRuns.set(session.id, run)
    }

    scheduleDayPhaseTimer(run)
    return dayPhaseRuns.get(session.id) ?? null
}

// 낮 타이머 멈춤: 낮 벗어날 때·판 끝·시험 초기화 때 run째 지움
function stopDayPhaseTimer(gameId) {
    const run = dayPhaseRuns.get(gameId)
    if (!run) return
    clearRunTimer(run)
    dayPhaseRuns.delete(gameId)
}

// 판 단계에 맞게 타이머 맞추기: 낮이면 낮 타이머만, 밤이면 밤 턴만, 그 밖엔 둘 다 끔
function syncSessionPhaseTimers(io, session) {
    if (!session) return null
    // 단계 경계라 끊김 유예부터 끝냄
    expireGracesAtBoundary(session)

    if (session.phase === 'DAY') {
        stopNightTurnSequence(session.id)
        return startDayPhaseTimer(io, session)
    }

    stopDayPhaseTimer(session.id)
    if (session.phase === 'NIGHT') {
        return startNightTurnSequence(io, session)
    }

    stopNightTurnSequence(session.id)
    return null
}

module.exports = {
    startDayPhaseTimer,
    stopDayPhaseTimer,
    syncSessionPhaseTimers,
}
