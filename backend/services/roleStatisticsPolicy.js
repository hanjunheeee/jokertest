const ROLE_CODES = Object.freeze(['CITIZEN', 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])

const ROLE_KOREAN_NAMES = Object.freeze({
    CITIZEN: '귀족',
    JOKER: '광대',
    DOCTOR: '주치의',
    GUARD: '경비원',
    WITCH_HUNTER: '마녀사냥꾼',
})

const RANKING_MIN_GAMES = 10
const MASK_OF_FATE_MIN_GAMES = 1

function getRoleKoreanName(role) {
    return ROLE_CODES.includes(role) ? ROLE_KOREAN_NAMES[role] : null
}

function aggregateRoleStatistics(rows) {
    const grouped = new Map()

    for (const row of rows ?? []) {
        if (row.won !== true && row.won !== false) continue
        if (typeof row.user_id !== 'string' || !ROLE_CODES.includes(row.role)) continue

        const key = `${row.user_id}\u0000${row.role}`
        const entry = grouped.get(key) ?? {
            user_id: row.user_id,
            role: row.role,
            games: 0,
            wins: 0,
            survivalCount: 0,
        }
        entry.games += 1
        if (row.won === true) entry.wins += 1
        if (row.is_alive === true) entry.survivalCount += 1
        grouped.set(key, entry)
    }

    return [...grouped.values()].map((entry) => ({
        ...entry,
        winRate: entry.games > 0 ? entry.wins / entry.games : 0,
    }))
}

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

function selectMaskOfFateRole(statsByRoleForUser, { minGames = MASK_OF_FATE_MIN_GAMES, roleOrder = ROLE_CODES } = {}) {
    const eligible = (statsByRoleForUser ?? []).filter((entry) => ROLE_CODES.includes(entry.role) && entry.games >= minGames)
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

const EXCLUDED_GAME_SOURCES = new Set(['development', 'test'])
function isAchievementRewardEligibleGame({ completed, gameSourceValue }) {
    return completed === true && !EXCLUDED_GAME_SOURCES.has(gameSourceValue)
}

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
