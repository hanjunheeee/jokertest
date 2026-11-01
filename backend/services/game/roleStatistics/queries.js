// 전적 통계 읽기 파일, 직업 통계(내 것·계정 요약·순위·최고 승률) + 업적 진행 셈
// 컨트롤러·프로필·업적·matchmaking이 부름, 저장소는 행만 주고 판정·집계는 여기서 함
const gameResultRepository = require('../../../repositories/game/result')
const userLookup = require('../../../repositories/user/lookup')
const db = require('../../../repositories/common/db')
const economyService = require('../../economy')
const { ROLE_CODES } = require('./constants')
const { aggregateRoleStatistics } = require('./aggregate')
const { buildRoleRanking, selectMaskOfFateRole } = require('./ranking')
const { isAchievementRewardEligibleGame, isRoleStatisticsEligibleSettings } = require('./eligibility')

// 순위 장식(공개 프로필 꾸미기) 읽는 곳, 시험이 가짜로 바꿀 수 있게 따로 둠
let economyServiceRef = economyService
function __setEconomyServiceForTests(fakeEconomyService) {
    economyServiceRef = fakeEconomyService ?? economyService
}

// DB마다 참/거짓이 1/0으로 올 수 있어 맞춤, 승패 모르면 null
const toRoleStatisticsRow = (playerRow) => ({
    user_id: playerRow.user_id,
    role: playerRow.role,
    won: playerRow.won === true || playerRow.won === 1 ? true : playerRow.won === false || playerRow.won === 0 ? false : null,
    is_alive: playerRow.is_alive === true || playerRow.is_alive === 1,
})

// 개발·시험 판 거른 뒤 통계 행 모양으로 바꿈
const toEligibleRoleStatisticsRows = (rows) => rows
    .filter((row) => isRoleStatisticsEligibleSettings(row.GameResult?.settings))
    .map(toRoleStatisticsRow)

// 직업 5개 전부 채워 돌려줌, 안 해 본 직업은 0으로
async function getMyRoleStatistics(userId) {
    const rows = toEligibleRoleStatisticsRows(await gameResultRepository.findUserStatRows(userId))
    const statsByRole = new Map(
        aggregateRoleStatistics(rows).map((entry) => [entry.role, entry]),
    )
    return ROLE_CODES.map((role) => statsByRole.get(role) ?? {
        user_id: userId,
        role,
        games: 0,
        wins: 0,
        survivalCount: 0,
        winRate: 0,
    })
}

// 사람별 총 판 수·승률(백분율 반올림) Map, 빈 목록이면 쿼리 없이 바로 돌려줌
async function getAccountRecordSummaries(userIds) {
    const summaries = new Map((userIds ?? []).map((userId) => [userId, { totalGames: 0, winRate: 0 }]))
    if (summaries.size === 0) return summaries

    const rows = toEligibleRoleStatisticsRows(await gameResultRepository.findUsersStatRows([...summaries.keys()]))

    const totalsByUser = new Map()
    for (const entry of aggregateRoleStatistics(rows)) {
        const total = totalsByUser.get(entry.user_id) ?? { games: 0, wins: 0 }
        total.games += entry.games
        total.wins += entry.wins
        totalsByUser.set(entry.user_id, total)
    }

    for (const [userId, { games, wins }] of totalsByUser) {
        if (!summaries.has(userId)) continue
        summaries.set(userId, {
            totalGames: games,
            winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
        })
    }

    return summaries
}

// 직업 하나 순위 표, 순서: 행 → 집계·줄 세우기 → 닉네임·사진 → 프로필 꾸미기
async function getRoleRanking(role) {
    const rows = toEligibleRoleStatisticsRows(await gameResultRepository.findRoleStatRows(role))
    const ranked = buildRoleRanking(aggregateRoleStatistics(rows))
    if (ranked.length === 0) return []

    const users = await userLookup.findRankingProfiles(db, ranked.map((entry) => entry.user_id))
    const userByUuid = new Map(users.map((user) => [user.uuid, user]))
    const loadoutsByUuid = await economyServiceRef.getPublicProfileLoadouts(ranked.map((entry) => entry.user_id))

    return ranked.map((entry, index) => {
        const loadout = loadoutsByUuid[entry.user_id] ?? { profilePhotoId: null, profileBorderId: null }
        return {
            rank: index + 1,
            uuid: entry.user_id,
            nickname: userByUuid.get(entry.user_id)?.nickname ?? null,
            profile_image_url: userByUuid.get(entry.user_id)?.profile_image_url ?? null,
            accountProfilePhotoId: loadout.profilePhotoId,
            accountProfileBorderId: loadout.profileBorderId,
            games: entry.games,
            wins: entry.wins,
            winRate: entry.winRate,
        }
    })
}

// 한 사람의 승률 가장 높은 직업 (운명의 가면), 없으면 null
async function getHighestWinRateRole(userId) {
    const rows = toEligibleRoleStatisticsRows(await gameResultRepository.findUserStatRows(userId))
    return selectMaskOfFateRole(aggregateRoleStatistics(rows))
}

// 업적 진행용 행 모양, 승리·생존을 참/거짓으로 맞춤
const toProgressRow = (playerRow) => ({
    role: playerRow.role,
    won: playerRow.won === true || playerRow.won === 1,
    is_alive: playerRow.is_alive === true || playerRow.is_alive === 1,
})

// 업적 보상 대상 판만 세어 판 수·생존·승리·직업별 승리 돌려줌
async function getAchievementProgressStats(userId) {
    const rows = await gameResultRepository.findProgressRows(userId)

    const eligibleRows = rows
        .filter((row) => isAchievementRewardEligibleGame({
            completed: row.GameResult?.completed === true || row.GameResult?.completed === 1,
            gameSourceValue: row.GameResult?.settings?.gameSource?.value,
        }))
        .map(toProgressRow)

    const roleWinsByRole = new Map()
    let survivals = 0
    let wins = 0
    for (const row of eligibleRows) {
        if (row.is_alive) survivals += 1
        if (row.won) {
            wins += 1
            if (typeof row.role === 'string') {
                roleWinsByRole.set(row.role, (roleWinsByRole.get(row.role) ?? 0) + 1)
            }
        }
    }

    return {
        completedGames: eligibleRows.length,
        survivals,
        wins,
        roleWinsByRole,
    }
}

module.exports = {
    getMyRoleStatistics,
    getAccountRecordSummaries,
    getRoleRanking,
    getHighestWinRateRole,
    getAchievementProgressStats,
    __setEconomyServiceForTests,
}
