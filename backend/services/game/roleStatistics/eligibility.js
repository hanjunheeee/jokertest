// 셀 판 판정 파일, 업적 보상 대상 판 + 직업 통계 대상 판
// 업적 보상은 끝까지 간 판만, 둘 다 개발·시험 판은 뺌
const { EXCLUDED_GAME_SOURCES } = require('./constants')

// 완료 판 + 제외 출처 아님일 때만 참
function isAchievementRewardEligibleGame({ completed, gameSourceValue }) {
    return completed === true && !EXCLUDED_GAME_SOURCES.has(gameSourceValue)
}

// 직업 통계에 셀 판인지 (개발·시험 판 뺌)
function isRoleStatisticsEligibleSettings(settings) {
    return !EXCLUDED_GAME_SOURCES.has(settings?.gameSource?.value)
}

module.exports = {
    isAchievementRewardEligibleGame,
    isRoleStatisticsEligibleSettings,
}
