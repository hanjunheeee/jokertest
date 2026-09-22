const test = require('node:test')
const assert = require('node:assert/strict')

const {
    ROLE_CODES,
    getRoleKoreanName,
    aggregateRoleStatistics,
    buildRoleRanking,
    selectMaskOfFateRole,
    isAchievementRewardEligibleGame,
} = require('./roleStatisticsPolicy')

// ── AC-02: 고정 한국어 매핑 ───────────────────────────────────────────────────

test('getRoleKoreanName: 5개 직업 코드가 고정 한국어 이름으로 매핑된다', () => {
    assert.equal(getRoleKoreanName('CITIZEN'), '귀족')
    assert.equal(getRoleKoreanName('JOKER'), '광대')
    assert.equal(getRoleKoreanName('DOCTOR'), '주치의')
    assert.equal(getRoleKoreanName('GUARD'), '경비원')
    assert.equal(getRoleKoreanName('WITCH_HUNTER'), '마녀사냥꾼')
})

test('getRoleKoreanName: 알 수 없는 코드는 null이다', () => {
    assert.equal(getRoleKoreanName('UNKNOWN'), null)
    assert.equal(getRoleKoreanName(undefined), null)
})

test('ROLE_CODES: 운명의 가면 동률 순서로 쓰이는 고정 배열이다(A-03)', () => {
    assert.deepEqual(ROLE_CODES, ['CITIZEN', 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'])
})

// ── AC-01/AC-05: 집계 ────────────────────────────────────────────────────────

test('aggregateRoleStatistics: 행이 없으면 빈 배열이다(0판)', () => {
    assert.deepEqual(aggregateRoleStatistics([]), [])
    assert.deepEqual(aggregateRoleStatistics(undefined), [])
})

test('aggregateRoleStatistics: won=null(중단 경기 잔류자)은 판수에 들어가지 않는다', () => {
    const result = aggregateRoleStatistics([
        { user_id: 'u1', role: 'CITIZEN', won: true, is_alive: true },
        { user_id: 'u1', role: 'CITIZEN', won: null, is_alive: true },
        { user_id: 'u1', role: 'CITIZEN', won: undefined, is_alive: true },
    ])
    assert.equal(result.length, 1)
    assert.equal(result[0].games, 1)
    assert.equal(result[0].wins, 1)
})

test('aggregateRoleStatistics: 계정·직업 조합별로 나뉘고 승률은 반올림 없는 원시 비율이다', () => {
    const rows = [
        { user_id: 'u1', role: 'CITIZEN', won: true, is_alive: true },
        { user_id: 'u1', role: 'CITIZEN', won: false, is_alive: false },
        { user_id: 'u1', role: 'CITIZEN', won: false, is_alive: true },
        { user_id: 'u1', role: 'JOKER', won: true, is_alive: true },
        { user_id: 'u2', role: 'CITIZEN', won: true, is_alive: true },
    ]
    const result = aggregateRoleStatistics(rows)
    const u1Citizen = result.find((r) => r.user_id === 'u1' && r.role === 'CITIZEN')
    const u1Joker = result.find((r) => r.user_id === 'u1' && r.role === 'JOKER')
    const u2Citizen = result.find((r) => r.user_id === 'u2' && r.role === 'CITIZEN')

    assert.equal(u1Citizen.games, 3)
    assert.equal(u1Citizen.wins, 1)
    assert.equal(u1Citizen.survivalCount, 2)
    assert.equal(u1Citizen.winRate, 1 / 3) // 0.333...으로 반올림되지 않음

    assert.equal(u1Joker.games, 1)
    assert.equal(u1Joker.winRate, 1)

    assert.equal(u2Citizen.games, 1)
    assert.equal(result.length, 3)
})

// ── AC-03/A-04: 랭킹 ─────────────────────────────────────────────────────────

function statEntry(user_id, games, wins) {
    return { user_id, games, wins, winRate: games > 0 ? wins / games : 0 }
}

test('buildRoleRanking: 10판 미만은 랭킹에서 제외된다(경계값)', () => {
    const nine = statEntry('u-nine', 9, 9)
    const ten = statEntry('u-ten', 10, 5)
    const result = buildRoleRanking([nine, ten])
    assert.deepEqual(result.map((r) => r.user_id), ['u-ten'])
})

test('buildRoleRanking: 승률 내림차순 → 판수 내림차순 → UUID 오름차순', () => {
    const higherWinRate = statEntry('b-user', 10, 8) // 0.8
    const moreGamesSameRate = statEntry('a-user', 20, 10) // 0.5
    const fewerGamesSameRate = statEntry('c-user', 10, 5) // 0.5
    const result = buildRoleRanking([fewerGamesSameRate, higherWinRate, moreGamesSameRate])
    assert.deepEqual(result.map((r) => r.user_id), ['b-user', 'a-user', 'c-user'])
})

test('buildRoleRanking: 승률·판수까지 같으면 UUID 오름차순으로 확정된다', () => {
    const zUser = statEntry('z-user', 10, 5)
    const aUser = statEntry('a-user', 10, 5)
    const result = buildRoleRanking([zUser, aUser])
    assert.deepEqual(result.map((r) => r.user_id), ['a-user', 'z-user'])
})

test('buildRoleRanking: 입력 배열을 변형하지 않는다', () => {
    const input = [statEntry('u2', 10, 1), statEntry('u1', 10, 9)]
    const originalOrder = input.map((r) => r.user_id)
    buildRoleRanking(input)
    assert.deepEqual(input.map((r) => r.user_id), originalOrder)
})

test('buildRoleRanking: 0승(0판이 아닌 0승)끼리도 승률 동률로 취급해 판수 내림차순으로 가린다', () => {
    // 둘 다 승률 0이지만 판수가 다르다 — "0승이니 후순위"가 아니라 여전히 판수↓ 규칙을 따른다.
    const fewerGames = statEntry('u-few', 10, 0)
    const moreGames = statEntry('u-more', 15, 0)
    const result = buildRoleRanking([fewerGames, moreGames])
    assert.deepEqual(result.map((r) => r.user_id), ['u-more', 'u-few'])
})

test('buildRoleRanking: 반올림하면 같아 보이는 승률도 원시 값으로 정확히 정렬된다', () => {
    // 60.05%와 59.95%는 정수 %로 반올림하면 둘 다 60%지만, 정렬은 반올림 전 원시 winRate를
    // 써야 한다(A-04) — 표시 단계에서만 반올림한다.
    const higher = { user_id: 'u-higher', games: 2000, wins: 1201, winRate: 1201 / 2000 } // 0.6005
    const lower = { user_id: 'u-lower', games: 2000, wins: 1199, winRate: 1199 / 2000 }   // 0.5995
    const result = buildRoleRanking([lower, higher])
    assert.deepEqual(result.map((r) => r.user_id), ['u-higher', 'u-lower'])
})

// ── AC-04/A-05: 운명의 가면 ───────────────────────────────────────────────────

function roleStat(role, games, wins) {
    return { role, games, wins, winRate: games > 0 ? wins / games : 0 }
}

test('selectMaskOfFateRole: 대상 직업이 없으면 명시적으로 null이다', () => {
    assert.equal(selectMaskOfFateRole([]), null)
    assert.equal(selectMaskOfFateRole([roleStat('CITIZEN', 0, 0)]), null)
})

test('selectMaskOfFateRole: 최다 플레이가 아니라 최고 승률 직업을 고른다', () => {
    // CITIZEN: 최다 플레이(20판)이지만 승률 낮음. JOKER: 5판뿐이지만 승률 1위.
    const stats = [roleStat('CITIZEN', 20, 8), roleStat('JOKER', 5, 5)]
    const result = selectMaskOfFateRole(stats)
    assert.equal(result.role, 'JOKER')
})

test('selectMaskOfFateRole: 승률 동률이면 승수 → 판수 → 고정 직업 순으로 가린다', () => {
    // 승률 동률(0.5)이고 승수도 동률(5승)이면 판수가 더 많은 쪽(GUARD, 10전)이 이긴다.
    const byGames = selectMaskOfFateRole([roleStat('DOCTOR', 10, 5), roleStat('GUARD', 10, 5), roleStat('WITCH_HUNTER', 20, 10)])
    assert.equal(byGames.role, 'WITCH_HUNTER')

    // 승률·판수까지 전부 동률이면 고정 직업 순(CITIZEN·JOKER·DOCTOR·GUARD·WITCH_HUNTER)에서
    // 앞선 직업이 이긴다 — GUARD보다 DOCTOR가 먼저다.
    const byFixedOrder = selectMaskOfFateRole([roleStat('GUARD', 10, 5), roleStat('DOCTOR', 10, 5)])
    assert.equal(byFixedOrder.role, 'DOCTOR')
})

test('selectMaskOfFateRole: 최소 1판 미만(0판) 직업은 후보에서 제외된다', () => {
    const result = selectMaskOfFateRole([roleStat('CITIZEN', 0, 0), roleStat('JOKER', 1, 0)])
    assert.equal(result.role, 'JOKER')
})

test('selectMaskOfFateRole: 고정 5개 밖의 직업은 동률 여부와 관계없이 후보에서 제외된다', () => {
    // 고정 5개 밖의 값은 후보에서 제외하여 정상 직업의 운명의 가면을 가리지 않는다.
    const result = selectMaskOfFateRole([roleStat('UNKNOWN_ROLE', 10, 5), roleStat('GUARD', 10, 5)])
    assert.equal(result.role, 'GUARD')
})

test('selectMaskOfFateRole: both zero wins and zero win rate use game count before fixed role order', () => {
    const selected = selectMaskOfFateRole([roleStat('CITIZEN', 1, 0), roleStat('GUARD', 7, 0)])
    assert.equal(selected.role, 'GUARD')
    assert.equal(selected.games, 7)
})

// ── AC-05/A-13: 업적/보상 자격 — 전적 자격과는 분리된 질문 ──────────────────────

test('isAchievementRewardEligibleGame: 정상 확정된 운영 경기만 보상 자격이 있다', () => {
    assert.equal(isAchievementRewardEligibleGame({ completed: true, gameSourceValue: 'production' }), true)
})

test('isAchievementRewardEligibleGame: 중단 경기는 이탈자 패배 전적이 유지되더라도 보상 자격이 없다', () => {
    // 전적 자격(AC-05: 이탈자 won=false 확정)과 보상 자격은 별개 질문이다 — completed가
    // false이면 gameSourceValue가 production이어도 보상 대상이 아니다.
    assert.equal(isAchievementRewardEligibleGame({ completed: false, gameSourceValue: 'production' }), false)
})

test('isAchievementRewardEligibleGame: 개발 경기는 정상 확정이어도 보상 자격이 없다', () => {
    assert.equal(isAchievementRewardEligibleGame({ completed: true, gameSourceValue: 'development' }), false)
})

test('isAchievementRewardEligibleGame: 중단+개발이 겹쳐도(둘 다 실격 사유) false다', () => {
    assert.equal(isAchievementRewardEligibleGame({ completed: false, gameSourceValue: 'development' }), false)
})

test('isAchievementRewardEligibleGame: gameSourceValue가 없는(이 필드 이전) 정상 확정 과거 경기는 소급으로 자격이 있다(D-11)', () => {
    assert.equal(isAchievementRewardEligibleGame({ completed: true, gameSourceValue: undefined }), true)
    assert.equal(isAchievementRewardEligibleGame({ completed: true, gameSourceValue: null }), true)
})

test('unregistered roles cannot displace a valid lower-win-rate fate mask or produce statistics', () => {
    const stats = aggregateRoleStatistics([
        {user_id:'u1',role:'UNKNOWN_ROLE',won:true,is_alive:true},
        {user_id:'u1',role:'GUARD',won:false,is_alive:false},
    ])
    assert.deepEqual(stats.map(s => s.role), ['GUARD'])
    assert.equal(selectMaskOfFateRole(stats).role, 'GUARD')
    assert.equal(selectMaskOfFateRole([roleStat('UNKNOWN_ROLE',10,10),roleStat('GUARD',1,0)]).role,'GUARD')
})

test('only unregistered roles give no mask, no role stats and no Korean role name', () => {
    for (const role of ['UNKNOWN_ROLE','', 'constructor', '__proto__']) {
        assert.equal(selectMaskOfFateRole([roleStat(role,10,10)]),null)
        assert.deepEqual(aggregateRoleStatistics([{user_id:'u1',role,won:true}]),[])
        assert.equal(getRoleKoreanName(role),null)
    }
})

// 2026-09-22: 자동 시험 출처(test)도 development와 같이 보상 대상에서 빠진다.
test('isAchievementRewardEligibleGame: gameSourceValue가 test면 정상 확정이어도 보상 대상이 아니다', () => {
    assert.equal(isAchievementRewardEligibleGame({ completed: true, gameSourceValue: 'test' }), false)
})
