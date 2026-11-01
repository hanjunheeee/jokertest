// 직업별 집계 파일, 전적 행을 사람·직업별 판 수·승수·생존으로 묶음
// 직업 이름 찾기도 여기, 프로필·통계 컨트롤러가 씀
const { ROLE_CODES, ROLE_KOREAN_NAMES } = require('./constants')

// 모르는 직업 코드면 이름 대신 null
function getRoleKoreanName(role) {
    return ROLE_CODES.includes(role) ? ROLE_KOREAN_NAMES[role] : null
}

// 승패 모르는 행·모르는 직업은 빼고 집계, 승률까지 붙임
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

module.exports = {
    getRoleKoreanName,
    aggregateRoleStatistics,
}
