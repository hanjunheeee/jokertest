// 셀 판 판정 파일, 업적 보상 대상 판 + 직업 통계 대상 판
// queries.js가 부름, index.js는 보상 판정만 내보냄 (시험용)
const { EXCLUDED_GAME_SOURCES } = require('./constants')

// 업적 보상은 끝까지 간 판만 (중간에 끝난 판으로 못 쌓게), 개발·시험 판 뺌
function isAchievementRewardEligibleGame({ completed, gameSourceValue }) {
    return completed === true && !EXCLUDED_GAME_SOURCES.has(gameSourceValue)
}

// 직업 통계에 셀 판인지 (개발·시험 판 뺌, 출처 없는 옛 판은 셈)
function isRoleStatisticsEligibleSettings(settings) {
    return !EXCLUDED_GAME_SOURCES.has(settings?.gameSource?.value)
}

module.exports = {
    isAchievementRewardEligibleGame,
    isRoleStatisticsEligibleSettings,
}
