// 직업 전적·랭킹·운명의 가면(F-10)의 계산 규칙을 소유하는 순수 함수 모듈이다.
// DB·HTTP를 전혀 모른다 — 호출부(gameResult.repositories.js)가 이미 won=null 잔류자와
// 개발 경기(settings.gameSource.value === 'development')를 걸러낸 GameResultPlayer 행을
// 넘겨준다는 계약 위에서만 동작한다. 정상 확정된 과거 경기는 걸러내지 않는다(D-09) —
// 새 필드가 없던 시절에 저장된 판은 개발 여부를 식별할 근거가 없으므로 운영 기록으로 보고
// 소급 집계 대상에 포함하는 것이 호출부의 책임이다(A-06/A-07).

const ROLE_CODES = Object.freeze(['CITIZEN', 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])

// AC-02 고정 매핑. A-03에 따라 운명의 가면 동률 순서(ROLE_CODES 배열 순서 자체)도 이 목록을
// 그대로 쓴다 — 매핑과 고정 순서를 두 곳에 따로 적으면 하나만 바뀌었을 때 조용히 어긋난다.
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

/**
 * won이 확정된 GameResultPlayer 행들을 계정·직업별로 누적한다.
 *
 * won=null(중단 경기 잔류자) 행은 여기서도 한 번 더 걸러낸다 — 호출부가 이미 걸렀더라도,
 * 이 함수 자체가 "null은 승패로 세지 않는다"는 계약을 스스로 지키게 해서 호출부의 실수로
 * 임의 승/패 변환이 새어 들어오는 경로를 막는다(AC-05).
 *
 * @param {{ user_id: string, role: string, won: boolean|null, is_alive?: boolean }[]} rows
 * @returns {{ user_id: string, role: string, games: number, wins: number, survivalCount: number, winRate: number }[]}
 *          winRate은 반올림하지 않은 원시 비율이다 — 반올림은 표시 단계에서만 한다(A-04).
 */
function aggregateRoleStatistics(rows) {
    const grouped = new Map()

    for (const row of rows ?? []) {
        if (row.won !== true && row.won !== false) continue // null/undefined 제외(AC-05)
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

/**
 * 한 직업에 대해 최소 판수 이상인 계정을 승률 내림차순→판수 내림차순→UUID 오름차순으로
 * 정렬한다(AC-03, A-04). 입력 배열은 변형하지 않는다.
 *
 * @param {{ user_id: string, games: number, wins: number, winRate: number }[]} statsForRole
 * @param {{ minGames?: number }} [options]
 */
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

/**
 * 한 계정의 직업별 전적에서 "운명의 가면"에 표시할 직업을 고른다(AC-04).
 * 최다 플레이 직업이 아니라 최소 판수 이상인 직업 중 승률이 가장 높은 직업이며, 동률이면
 * 승수→판수→고정 직업 순으로 가린다. 대상이 없으면 명시적으로 null을 돌려준다(A-05).
 *
 * @param {{ role: string, games: number, wins: number, winRate: number }[]} statsByRoleForUser
 * @param {{ minGames?: number, roleOrder?: string[] }} [options]
 * @returns {{ role: string, games: number, wins: number, winRate: number }|null}
 */
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

/**
 * AC-05/A-13: 이 판이 업적/보상 지급 대상인지 판정한다 — "이 판을 전적에 넣는가"
 * (aggregateRoleStatistics/호출부의 개발 경기 제외)와는 다른 질문이다. 실제 지급 원장·
 * 1회성 보장(멱등)은 F-12가 구현하고, 이 함수는 "지급해도 되는 판인가"라는 자격 판정만
 * 순수하게 담당한다.
 *
 * 규칙:
 *   - 정상 확정(completed=true)이면서 운영 경기(gameSourceValue !== 'development')만 자격이
 *     있다.
 *   - 중단 경기(completed=false)는 이탈자의 패배 전적이 유지되더라도(AC-05) 보상 대상이
 *     아니다 — 전적 자격과 보상 자격은 분리된 질문이다.
 *   - 개발 경기는 completed 여부와 무관하게 자격이 없다.
 *   - gameSourceValue가 없는(이 필드가 생기기 전) 과거 경기는 개발 여부를 식별할 근거가
 *     없으므로 운영 기록으로 보아 자격이 있다고 판정한다 — 소급 업적 1회 지급(D-11) 대상에서
 *     "소급"이라는 이유만으로 제외하지 않는다(A-06/A-07과 동일한 원칙).
 *
 * @param {{ completed: boolean, gameSourceValue?: string|null }} game
 * @returns {boolean}
 */
function isAchievementRewardEligibleGame({ completed, gameSourceValue }) {
    return completed === true && gameSourceValue !== 'development'
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
