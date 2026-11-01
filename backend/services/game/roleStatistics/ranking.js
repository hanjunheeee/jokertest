// 랭킹 파일, 직업 랭킹 줄 세우기 + 운명의 가면 직업 고르기
// 직업 통계 화면·프로필이 씀
const { RANKING_MIN_GAMES, MASK_OF_FATE_MIN_GAMES, ROLE_CODES } = require('./constants')

// 최소 판 수 넘은 사람만, 승률 → 판 수 → uuid 순으로 줄 세움
function buildRoleRanking(statsForRole, { minGames = RANKING_MIN_GAMES } = {}) {
    return (statsForRole ?? [])
        .filter((entry) => entry.games >= minGames)
        .slice()
        .sort((a, b) => (
            b.winRate - a.winRate ||
            b.games - a.games ||
            (a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0)
        ))
}

// 한 사람 직업 중 승률 가장 높은 것 하나, 같으면 승수·판 수·직업 순서
function selectMaskOfFateRole(statsForUser, { minGames = MASK_OF_FATE_MIN_GAMES, roleOrder = ROLE_CODES } = {}) {
    const eligible = (statsForUser ?? []).filter((entry) => ROLE_CODES.includes(entry.role) && entry.games >= minGames)
    if (eligible.length === 0) return null

    const fixedIndex = (role) => {
        const index = roleOrder.indexOf(role)
        return index === -1 ? roleOrder.length : index
    }

    return eligible.slice().sort((a, b) => (
        b.winRate - a.winRate ||
        b.wins - a.wins ||
        b.games - a.games ||
        fixedIndex(a.role) - fixedIndex(b.role)
    ))[0]
}

module.exports = {
    buildRoleRanking,
    selectMaskOfFateRole,
}
