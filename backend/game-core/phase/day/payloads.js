// 낮 방송 내용 파일
// 낮 단계 바뀜 + 투표 결과 방송 내용·낮 마감 시각 칸, 상태 안 바꿈 (확정은 resolve.js)
// socket 쪽 방송이랑 스냅샷이 사용
const { getDayPhase, getDayVoteRound, getResolutionRound } = require('./state')

// 낮 마감 시각 칸: 낮일 때만 실음 (값은 socket 낮 타이머가 적어 둠)
function buildPublicDayPhaseDeadlineField(session) {
    if (session?.phase !== 'DAY') return {}
    const deadline = session.dayPhaseDeadline
    // 타이머 안 걸렸거나 틀린 값이면 칸째 뺌
    if (!Number.isFinite(deadline) || deadline <= 0) return {}
    return { dayPhaseDeadline: deadline }
}

// 낮 단계 바뀜 방송 내용
function buildDayPhaseChangedPayload(session) {
    return {
        gameId: session.id,
        dayIndex: session.dayIndex,
        dayPhase: getDayPhase(session),
        round: getDayVoteRound(session),
        ...buildPublicDayPhaseDeadlineField(session),
    }
}

// 낮 투표 결과 방송 내용
function buildDayVoteResolvedPayload(session, resolution) {
    // 누가 누굴 찍었는지는 빼고 수·결과만 (지도 04-⑧)
    return {
        gameId: session.id,
        dayIndex: resolution.dayIndex,
        phase: session.phase,
        round: getResolutionRound(resolution),
        outcome: resolution.outcome,
        tribunalTargetUuid: resolution.tribunalTargetUuid,
        publicVoteCount: resolution.publicVoteCount,
        publicAbstainCount: resolution.publicAbstainCount,
        revoteExcludedUuids: [...(resolution.revoteExcludedUuids ?? [])],
    }
}

module.exports = {
    buildPublicDayPhaseDeadlineField,
    buildDayPhaseChangedPayload,
    buildDayVoteResolvedPayload,
}
