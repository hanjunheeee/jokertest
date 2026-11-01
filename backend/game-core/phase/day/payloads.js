// 낮 방송 내용 파일
// 낮 단계 바뀜 + 낮 투표 결과 방송 내용, 상태는 안 바꿈 (판정 commit은 resolve.js)
// socket 쪽 방송이랑 스냅샷이 사용
const { getDayPhase, getDayVoteRound, getResolutionRound } = require('./state')

// 낮 단계 바뀜 방송 내용
function buildDayPhaseChangedPayload(session) {
    return {
        gameId: session.id,
        dayIndex: session.dayIndex,
        dayPhase: getDayPhase(session),
        round: getDayVoteRound(session),
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
    buildDayPhaseChangedPayload,
    buildDayVoteResolvedPayload,
}
