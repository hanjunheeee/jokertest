// 직업별 집계 파일, 전적 행을 사람·직업별 판 수·승수·생존으로 묶음 + 직업 이름 찾기
// queries.js가 집계, 직업 통계 입구(index.js) 거쳐 컨트롤러·services/user.js가 이름 찾기
const { ROLE_CODES, ROLE_KOREAN_NAMES } = require('./constants')

// 모르는 직업 코드면 이름 대신 null
function getRoleKoreanName(role) {
    return ROLE_CODES.includes(role) ? ROLE_KOREAN_NAMES[role] : null
}

// 승패 모르는 행·모르는 직업은 빼고 집계, 승률까지 붙임
function aggregateRoleStatistics(rows) {
    const grouped = new Map()

    for (const row of rows ?? []) {
        // 승패 모르는 행은 승률 분모 틀리게 하므로 빼기
        if (row.won !== true && row.won !== false) continue
        // 계정 id 없거나 모르는 직업이면 빼기
        if (typeof row.user_id !== 'string' || !ROLE_CODES.includes(row.role)) continue

        // 사람·직업 묶음 키 (\u0000은 id·직업 코드에 안 나오는 글자)
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
