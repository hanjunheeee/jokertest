// 낮 타이머 파일
// 낮 토론·투표 마감 타이머(마감 시각 방송에 붙이기·판정 결과 방송 순서 포함) + 판 단계에 맞게 밤·낮·재판 타이머 맞추기, 핸들러·이탈·밤 마무리가 씀
const gameSessionCore = require('../../../game-core/gameSession')
const { isolate, isolateWithError } = require('../../common/isolate')
const { PHASE_RETRY_DELAY_MS, PHASE_RETRY_MAX } = require('../core/constants')
const { dayPhaseRuns } = require('../core/state')
const { pickRequesterUuid } = require('../core/requester')
const { pickTimerFns, clearRunTimer, fillAbstentions } = require('../core/timers')
const { expireGracesAtBoundary } = require('../connection/grace')
const { emitToGameChannel, deliverToParticipants } = require('../delivery/broadcast')
const { startNightTurnSequence, stopNightTurnSequence } = require('./night/turn')
const { startTribunalTimer, stopTribunalTimer } = require('./tribunal')

// 낮 단계 방송, 던져도 타이머 진행은 계속
function emitDayPhaseEvent(run, event, payload) {
    isolate('[낮 페이즈 방송 실패]', { code: 'DELIVERY_ERROR', event, gameId: run.session.id },
        () => emitToGameChannel(run.io, run.session, event, payload))
}

// 지금 판이 낮이고 타이머 걸 때 적어 둔 날짜·낮 단계·투표 라운드 그대로인지
function matchesDayState(run) {
    const { session } = run
    if (!run.scheduledFor) return false
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

// 지금 낮 단계(토론·투표)에 맞는 마감 타이머 다시 걸기 (토론→투표 때마다)
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
    run.retries = 0
    run.scheduleSeq = (run.scheduleSeq ?? 0) + 1
    run.deadline = run.nowFn() + durationMs
    // 판에도 마감 시각 적어 둠 (방송·스냅샷이 화면 타이머용으로 실음)
    session.dayPhaseDeadline = run.deadline
    run.timerId = run.setTimeoutFn(
        isVote ? () => expireDayVote(run) : () => expireDayDiscussion(run),
        durationMs,
    )
}

// 토론 마감: 투표 단계로 넘기고 투표 타이머 걸기, 그다음 방송 (새 마감 시각 실으려고)
function expireDayDiscussion(run) {
    const { session } = run
    // 늦게 온 옛 타이머면 무시
    if (!isLiveDayRun(run)) return

    // 투표 단계로 넘기기, 던지면 방송·타이머 안 함
    const entered = isolate('[낮 토론 만료 처리 실패]', { code: 'TRANSITION_ERROR', gameId: session.id },
        () => gameSessionCore.enterDayVotePhase(session))
    if (!entered) return

    scheduleDayPhaseTimer(run)
    emitDayPhaseEvent(run, 'day_phase_changed', gameSessionCore.buildDayPhaseChangedPayload(session))
}

// 투표 마감 판정이 안 됐을 때: 같은 단계 그대로면 잠깐 뒤 다시 (최대 PHASE_RETRY_MAX번, 단계가 멈추지 않게)
function retryDayVoteLater(run, label) {
    if (!isLiveDayRun(run)) return
    if ((run.retries ?? 0) >= PHASE_RETRY_MAX) {
        console.error(label, { code: 'RETRY_EXHAUSTED', gameId: run.session.id })
        return
    }
    run.retries = (run.retries ?? 0) + 1
    clearRunTimer(run)
    run.timerId = run.setTimeoutFn(() => expireDayVote(run), PHASE_RETRY_DELAY_MS)
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

    // 판정 준비: 누른 사람이 없어 아직 참여 중인 사람 이름으로 부름 (나간 사람 이름이면 실패함, known 1-1)
    const label = '[낮 투표 만료 판정 실패]'
    const requesterUuid = pickRequesterUuid(session)
    if (!requesterUuid) return
    const prepared = callCoreOrLog(label, session.id, 'PREPARE_UNEXPECTED_ERROR',
        () => gameSessionCore.prepareDayVoteResolution(requesterUuid, session.id, session.dayIndex))
    if (!prepared) {
        retryDayVoteLater(run, label)
        return
    }
    // 버튼이 먼저 판정했으면 타이머만 다시 걸기
    if (prepared.alreadyResolved) {
        scheduleDayPhaseTimer(run)
        return
    }

    // 확정 실패면 잠깐 뒤 다시 (그사이 표가 바뀐 경쟁이면 다음 판정이 맞춤)
    const committed = callCoreOrLog(label, session.id, 'COMMIT_ERROR',
        () => gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution))
    if (!committed) {
        retryDayVoteLater(run, label)
        return
    }

    announceDayVoteResolved(run.io, session, prepared.resolution, label, { gameId: session.id },
        (payload) => deliverToParticipants(run.io, session, 'day_vote_resolved', payload, label, { gameId: session.id }))
}

// 낮 투표 판정 결과 방송 + 다음 단계 타이머, 순서는 다음 단계에 따라 (버튼·마감·이탈 뒤 판정이 같이 씀)
// 낮에 남으면 타이머 먼저 (재투표 없어져 지금은 안 생김, 사용자 결정 2026-11-09 · known 1-13)
// 재판·밤으로 가면 방송 먼저: 유예 만료 이탈·밤 턴 방송이 판정 결과보다 앞서지 않게
// 재판이면 재판 마감만 방송 전에 걸어 결과에 tribunalDeadline 실음 (안 실으면 새로고침해야 남은 시간 보였음, 2026-11-09)
// 재판 마감 걸기는 방송·유예 만료가 없어 판정 결과보다 앞서는 사건 없음, 뒤 타이머 맞추기는 같은 마감을 그대로 씀
function announceDayVoteResolved(io, session, resolution, label, fields, deliver) {
    const syncTimers = () => isolate(label, { code: 'TIMER_SYNC_ERROR', ...fields }, () => syncSessionPhaseTimers(io, session))
    const staysDay = session.phase === 'DAY'
    if (staysDay) syncTimers()
    if (session.phase === 'TRIBUNAL') {
        isolate(label, { code: 'TIMER_START_ERROR', ...fields }, () => startTribunalTimer(io, session))
    }
    const payload = attachTribunalDeadline(
        attachDayPhaseDeadline(gameSessionCore.buildDayVoteResolvedPayload(session, resolution), session), session,
    )
    deliver(payload)
    if (!staysDay) syncTimers()
}

// 재판 중이고 마감이 걸려 있으면 방송에 재판 마감 시각 붙임 (스냅샷 tribunalDeadline과 같은 값)
function attachTribunalDeadline(payload, session) {
    if (payload === null || typeof payload !== 'object') return payload
    if (session?.phase !== 'TRIBUNAL') return payload
    const deadline = session.tribunalDeadline
    if (!Number.isFinite(deadline) || deadline <= 0) return payload
    return { ...payload, tribunalDeadline: deadline }
}

// 낮 타이머 시작: 판마다 run 하나 (토론·투표 길이는 방 설정, 없으면 기본값)
function startDayPhaseTimer(io, session, deps = {}) {
    if (!session) return null
    // 단계 경계라 끊김 유예부터 끝냄 (이탈로 판이 바뀔 수 있어 낮 확인은 그 뒤)
    const runBefore = dayPhaseRuns.get(session.id)
    const seqBefore = runBefore?.scheduleSeq
    expireGracesAtBoundary(session)
    if (session.phase !== 'DAY') {
        stopDayPhaseTimer(session.id)
        return null
    }

    // 유예 만료(이탈 반영)가 안에서 이미 지금 단계 타이머를 다시 걸었으면 또 안 검 (방송된 마감 그대로, BE-024)
    let run = dayPhaseRuns.get(session.id)
    const rescheduledInside = run && (run !== runBefore || run.scheduleSeq !== seqBefore)
    if (rescheduledInside && matchesDayState(run)) return run

    // 같은 낮 안에선 run 다시 씀 (길이 설정은 처음 만들 때만 읽음)
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
    // 판에 적어 둔 마감 시각도 지움 (낮 밖 방송·스냅샷에 옛 시각 안 남게)
    if (run.session) {
        run.session.dayPhaseDeadline = null
    }
    dayPhaseRuns.delete(gameId)
}

// 낮 타이머가 판에 적어 둔 마감 시각을 공개 방송 내용에 붙임 (낮이 아니거나 시각 없으면 그대로)
function attachDayPhaseDeadline(payload, session) {
    if (payload === null || typeof payload !== 'object') return payload
    if (session?.phase !== 'DAY') return payload
    const deadline = session.dayPhaseDeadline
    if (!Number.isFinite(deadline) || deadline <= 0) return payload
    return { ...payload, dayPhaseDeadline: deadline }
}

// 낮 타이머 다시 걸기 + 낮 단계 바뀜 방송, 타이머 먼저 (방송에 새 마감 시각 실으려고)
// 한쪽이 던져도 다른 쪽은 함 (방송 실패는 원본 에러 찍음), 역할 확인·투표 준비·역할 공개 마감이 씀
function announceDayStep(io, session, emitLabel, emitStep) {
    isolate('[낮 타이머 시작 실패]', { code: 'TIMER_START_ERROR', gameId: session.id }, () => startDayPhaseTimer(io, session))
    isolateWithError(emitLabel, emitStep)
}

// 판 단계에 맞게 타이머 맞추기: 낮이면 낮 타이머만, 밤이면 밤 턴만, 재판이면 재판 마감만, 그 밖엔 다 끔
function syncSessionPhaseTimers(io, session) {
    if (!session) return null
    // 단계 경계라 끊김 유예부터 끝냄
    expireGracesAtBoundary(session)

    if (session.phase !== 'TRIBUNAL') stopTribunalTimer(session.id)

    if (session.phase === 'DAY') {
        stopNightTurnSequence(session.id)
        return startDayPhaseTimer(io, session)
    }

    stopDayPhaseTimer(session.id)
    if (session.phase === 'NIGHT') {
        return startNightTurnSequence(io, session)
    }

    stopNightTurnSequence(session.id)
    if (session.phase === 'TRIBUNAL') {
        return startTribunalTimer(io, session)
    }
    return null
}

module.exports = {
    startDayPhaseTimer,
    stopDayPhaseTimer,
    syncSessionPhaseTimers,
    attachDayPhaseDeadline,
    announceDayVoteResolved,
    announceDayStep,
}
