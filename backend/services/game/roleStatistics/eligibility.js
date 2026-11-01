// 업적 보상 대상 판 판정 파일
// 끝까지 간 판이고 개발·시험 판이 아니어야 보상 셈
const { EXCLUDED_GAME_SOURCES } = require('./constants')

// 완료 판 + 제외 출처 아님일 때만 참
function isAchievementRewardEligibleGame({ completed, gameSourceValue }) {
    return completed === true && !EXCLUDED_GAME_SOURCES.has(gameSourceValue)
}

module.exports = {
    isAchievementRewardEligibleGame,
}
