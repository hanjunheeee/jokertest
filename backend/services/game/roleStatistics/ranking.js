// 랭킹 파일, 직업 랭킹 줄 세우기 + 운명의 가면(최고 승률 직업) 고르기
// queries.js(순위 표·최고 승률 직업)가 쓰고 index.js가 시험에 내보냄
const { RANKING_MIN_GAMES, MASK_OF_FATE_MIN_GAMES, ROLE_CODES } = require('./constants')

// 최소 판 수 이상인 사람만, 승률 → 판 수 → uuid 순 (끝까지 같아도 순서 늘 같게)
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
    // 모르는 직업·최소 판 수 못 채운 직업은 후보에서 빼기
    const eligible = (statsForUser ?? []).filter((entry) => ROLE_CODES.includes(entry.role) && entry.games >= minGames)
    if (eligible.length === 0) return null

    // 직업 순서표 자리, 표에 없는 직업은 맨 뒤
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
