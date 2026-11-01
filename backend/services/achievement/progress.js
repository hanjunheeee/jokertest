'use strict';

// 업적 진행 파일, 지표별 지금 값 · 기준 넘었나 · 진행 읽기
// 평가·상태 조회가 같이 씀
const achievementDefinitions = require('./definitions');
const METRICS = achievementDefinitions.METRICS;
const { getDeps } = require('./deps');

// 업적 지표에 맞는 지금 값 (모르는 지표면 0)
const currentValueOf = (definition, progress) => {
    switch (definition.metric) {
        case METRICS.COMPLETED_GAMES: return progress.completedGames;
        case METRICS.VOTE_PARTICIPATIONS: return progress.voteParticipations;
        case METRICS.SURVIVALS: return progress.survivals;
        case METRICS.WINS: return progress.wins;
        case METRICS.ROLE_WINS: return progress.roleWinsByRole.get(definition.role) ?? 0;
        default: return 0;
    }
};

// 지금 값이 기준 이상인지
const meetsThreshold = (definition, progress) => currentValueOf(definition, progress) >= definition.threshold;

// 전적 통계 + 투표 참여 수를 같이 읽음
const loadProgress = async (userId) => {
    const [gameStats, voteParticipations] = await Promise.all([
        getDeps().gameResultRepository.getAchievementProgressStats(userId),
        getDeps().voteParticipationRepository.countEligibleDayVoteParticipations(userId),
    ]);
    return { ...gameStats, voteParticipations };
};

module.exports = {
    currentValueOf,
    meetsThreshold,
    loadProgress,
};
