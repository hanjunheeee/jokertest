// 직업 통계 입구, 옛 roleStatisticsPolicy와 같은 이름만 골라 내보냄
// 컨트롤러 2개·gameResult 저장소가 이 입구로 부름
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
