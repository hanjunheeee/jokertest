// 낮 방송 내용 파일
// 낮 단계 바뀜 + 투표 결과 방송 내용·낮 마감 시각 칸, 상태 안 바꿈 (확정은 resolve.js)
// socket 쪽 방송이랑 스냅샷이 사용
const { getDayPhase, getDayVoteRound, getResolutionRound } = require('./state')
const { buildPublicProgress } = require('../../snapshot/progress')

// 낮 마감 시각 칸: 낮일 때만 실음 (값은 socket 낮 타이머가 적어 둠)
function buildPublicDayPhaseDeadlineField(session) {
    if (session?.phase !== 'DAY') return {}
    const deadline = session.dayPhaseDeadline
    // 타이머 안 걸렸거나 틀린 값이면 칸째 뺌
    if (!Number.isFinite(deadline) || deadline <= 0) return {}
    return { dayPhaseDeadline: deadline }
}

// 낮 단계 바뀜 방송 내용 (부르는 세 곳 모두 투표로 넘어간 바로 뒤)
// 진행 수 칸(낸 사람 0명/산 사람 수, 숫자만): 화면이 지난 날 숫자 대신 이 값으로 "0 / N명 투표함"부터 그림 (사용자 결정 2026-11-18)
function buildDayPhaseChangedPayload(session) {
    return {
        gameId: session.id,
        dayIndex: session.dayIndex,
        dayPhase: getDayPhase(session),
        round: getDayVoteRound(session),
        ...buildPublicDayPhaseDeadlineField(session),
        progress: buildPublicProgress(session),
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
