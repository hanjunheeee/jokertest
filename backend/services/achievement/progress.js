'use strict';

// 업적 진행 파일, 지표별 지금 값 · 기준 넘었나 · 진행 읽기(한 명·여러 명)
// evaluate.js(평가·상태)가 쓰고, index.js·testing.js가 내보냄
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
        // 그 직업으로 이긴 적 없으면 0
        case METRICS.ROLE_WINS: return progress.roleWinsByRole.get(definition.role) ?? 0;
        default: return 0;
    }
};

// 기준 넘었나 (기준과 같아도 달성)
const meetsThreshold = (definition, progress) => currentValueOf(definition, progress) >= definition.threshold;

// 진행 값 읽기: 전적 통계(판 수·생존·승리)·투표 참여 수를 같이 읽어 합침
const loadProgress = async (userId) => {
    const [gameStats, voteParticipations] = await Promise.all([
        getDeps().gameResultRepository.getAchievementProgressStats(userId),
        getDeps().voteParticipationRepository.countEligibleDayVoteParticipations(userId),
    ]);
    return { ...gameStats, voteParticipations };
};

// 여러 사람 진행 값 한 번에 → Map(사람 → 진행 값), 판 끝 평가용 (사람마다 질의 2개 → 전원 2개)
const loadProgressForUsers = async (userIds) => {
    const [statsByUser, votesByUser] = await Promise.all([
        getDeps().gameResultRepository.getAchievementProgressStatsForUsers(userIds),
        getDeps().voteParticipationRepository.countEligibleDayVoteParticipationsForUsers(userIds),
    ]);
    return new Map(userIds.map((userId) => [userId, { ...statsByUser.get(userId), voteParticipations: votesByUser.get(userId) ?? 0 }]));
};

module.exports = {
    currentValueOf,
    meetsThreshold,
    loadProgress,
    loadProgressForUsers,
};
