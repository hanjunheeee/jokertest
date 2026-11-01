// 직업 통계 입구, 직업 코드·이름·최소 판 수 + 집계·랭킹·보상 판정 모아 내보냄
// controllers/game/roleStatistics.js·services/user.js·시험이 부름 (DB 읽기는 queries.js 바로)
const { ROLE_CODES, ROLE_KOREAN_NAMES, RANKING_MIN_GAMES, MASK_OF_FATE_MIN_GAMES } = require('./constants')
const { getRoleKoreanName, aggregateRoleStatistics } = require('./aggregate')
const { buildRoleRanking, selectMaskOfFateRole } = require('./ranking')
const { isAchievementRewardEligibleGame } = require('./eligibility')

module.exports = {
    ROLE_CODES,
    ROLE_KOREAN_NAMES,
    RANKING_MIN_GAMES,
    MASK_OF_FATE_MIN_GAMES,
    getRoleKoreanName,
    aggregateRoleStatistics,
    buildRoleRanking,
    selectMaskOfFateRole,
    isAchievementRewardEligibleGame,
}
