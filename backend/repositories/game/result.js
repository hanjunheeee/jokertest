const db = require("../../models");
const gameSessionCore = require("../../game-core/gameSession");
const roleStatisticsPolicy = require("../../services/game/roleStatistics");
const economyService = require("../../services/economy");

let economyServiceRef = economyService;
function __setEconomyServiceForTests(fakeEconomyService) {
    economyServiceRef = fakeEconomyService ?? economyService;
}

exports.persistGameResult = async (session, { completed, disconnectedUuid } = {}) => {
    return exports.persistGameResultRecord(
        gameSessionCore.buildGameResultRecord(session, { completed, disconnectedUuid }),
    );
};

exports.persistGameResultRecord = async (record) => {
    const { result, players = [], stats = [] } = record;

    try {
        return await db.sequelize.transaction(async (transaction) => {
            const [, created] = await db.GameResult.findOrCreate({
                where: { id: result.id },
                defaults: result,
                transaction,
            });

            if (!created) return { persisted: false, gameId: result.id };

            if (players.length > 0) {
                await db.GameResultPlayer.bulkCreate(players, { transaction });
            }

            for (const delta of stats) {
                await db.UserStats.increment(
                    {
                        total_games: delta.total_games,
                        survival_count: delta.survival_count,
                        execution_count: delta.execution_count,
                    },
                    { where: { user_id: delta.user_id }, transaction },
                );

                const roleRows = await db.GameResultPlayer.findAll({
                    attributes: ["role"],
                    where: { user_id: delta.user_id, won: { [db.Sequelize.Op.ne]: null } },
                    raw: true,
                    transaction,
                });
                const roleCounts = new Map();
                for (const row of roleRows) {
                    if (typeof row.role !== "string") continue;
                    roleCounts.set(row.role, (roleCounts.get(row.role) ?? 0) + 1);
                }
                const mostPlayedRole = [...roleCounts]
                    .sort(([roleA, countA], [roleB, countB]) => countB - countA || roleA.localeCompare(roleB))[0]?.[0] ?? null;
                await db.UserStats.update(
                    { most_played_role: mostPlayedRole },
                    { where: { user_id: delta.user_id }, transaction },
                );
            }

            return { persisted: true, gameId: result.id };
        });
    } catch (error) {
        const constraint = error?.parent?.constraint ?? error?.original?.constraint;
        const duplicateGameId = error instanceof db.Sequelize.UniqueConstraintError && (
            constraint === "game_results_pkey" ||
            error?.fields?.id !== undefined || (
                error?.fields?.PRIMARY === result.id &&
                /^INSERT INTO [`"]?game_results[`"]?\s/i.test(error?.sql ?? "")
            )
        );
        if (duplicateGameId) return { persisted: false, gameId: result.id };
        throw error;
    }
};

const toPlain = (row) => (row && typeof row.get === "function" ? row.get({ plain: true }) : row);

exports.findGameResultById = async (gameId) => {
    const row = await db.GameResult.findOne({
        where: { id: gameId },
        include: [{ model: db.GameResultPlayer }],
    });
    if (!row) return null;

    const plain = toPlain(row);
    const rawPlayers = plain.GameResultPlayers ?? plain.GameResultPlayer ?? [];

    return {
        id: plain.id,
        room_id: plain.room_id ?? null,
        winner: plain.winner,
        win_reason: plain.win_reason ?? null,
        started_at: plain.started_at,
        ended_at: plain.ended_at,
        day_index: plain.day_index,
        player_count: plain.player_count,
        settings: plain.settings ?? null,
        completed: plain.completed,
        players: (Array.isArray(rawPlayers) ? rawPlayers : [rawPlayers]).map((player) => {
            const p = toPlain(player);
            return {
                user_id: p.user_id,
                nickname_snapshot: p.nickname_snapshot,
                role: p.role,
                team: p.team,
                won: p.won ?? null,
                is_alive: p.is_alive,
                death_reason: p.death_reason ?? null,
            };
        }),
    };
};

const EXCLUDED_GAME_SOURCES = new Set(['development', 'test']);
const isRoleStatsEligible = (settings) => !EXCLUDED_GAME_SOURCES.has(settings?.gameSource?.value);

const toRoleStatisticsRow = (playerRow) => ({
    user_id: playerRow.user_id,
    role: playerRow.role,
    won: playerRow.won === true || playerRow.won === 1 ? true : playerRow.won === false || playerRow.won === 0 ? false : null,
    is_alive: playerRow.is_alive === true || playerRow.is_alive === 1,
});

const findRoleStatisticsRows = async (where) => {
    const rows = await db.GameResultPlayer.findAll({
        attributes: ["user_id", "role", "won", "is_alive"],
        where: { ...where, won: { [db.Sequelize.Op.ne]: null } },
        include: [{ model: db.GameResult, attributes: ["settings"], required: true }],
        raw: true,
        nest: true,
    });
    return rows
        .filter((row) => isRoleStatsEligible(row.GameResult?.settings))
        .map(toRoleStatisticsRow);
};

exports.getMyRoleStatistics = async (userId) => {
    const rows = await findRoleStatisticsRows({ user_id: userId });
    const statsByRole = new Map(
        roleStatisticsPolicy.aggregateRoleStatistics(rows).map((entry) => [entry.role, entry]),
    );
    return roleStatisticsPolicy.ROLE_CODES.map((role) => statsByRole.get(role) ?? {
        user_id: userId,
        role,
        games: 0,
        wins: 0,
        survivalCount: 0,
        winRate: 0,
    });
};

exports.getAccountRecordSummaries = async (userIds) => {
    const summaries = new Map((userIds ?? []).map((userId) => [userId, { totalGames: 0, winRate: 0 }]));
    if (summaries.size === 0) return summaries;

    const rows = await findRoleStatisticsRows({ user_id: { [db.Sequelize.Op.in]: [...summaries.keys()] } });

    const totalsByUser = new Map();
    for (const entry of roleStatisticsPolicy.aggregateRoleStatistics(rows)) {
        const total = totalsByUser.get(entry.user_id) ?? { games: 0, wins: 0 };
        total.games += entry.games;
        total.wins += entry.wins;
        totalsByUser.set(entry.user_id, total);
    }

    for (const [userId, { games, wins }] of totalsByUser) {
        if (!summaries.has(userId)) continue;
        summaries.set(userId, {
            totalGames: games,
            winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
        });
    }

    return summaries;
};

exports.getRoleRanking = async (role) => {
    const rows = await findRoleStatisticsRows({ role });
    const ranked = roleStatisticsPolicy.buildRoleRanking(roleStatisticsPolicy.aggregateRoleStatistics(rows));
    if (ranked.length === 0) return [];

    const users = await db.User.findAll({
        where: { uuid: ranked.map((entry) => entry.user_id) },
        attributes: ["uuid", "nickname", "profile_image_url"],
        raw: true,
    });
    const userByUuid = new Map(users.map((user) => [user.uuid, user]));
    const loadoutsByUuid = await economyServiceRef.getPublicProfileLoadouts(ranked.map((entry) => entry.user_id));

    return ranked.map((entry, index) => {
        const loadout = loadoutsByUuid[entry.user_id] ?? { profilePhotoId: null, profileBorderId: null };
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
        };
    });
};

exports.getHighestWinRateRole = async (userId) => {
    const rows = await findRoleStatisticsRows({ user_id: userId });
    return roleStatisticsPolicy.selectMaskOfFateRole(roleStatisticsPolicy.aggregateRoleStatistics(rows));
};

const toProgressRow = (playerRow) => ({
    role: playerRow.role,
    won: playerRow.won === true || playerRow.won === 1,
    is_alive: playerRow.is_alive === true || playerRow.is_alive === 1,
});

exports.getAchievementProgressStats = async (userId) => {
    const rows = await db.GameResultPlayer.findAll({
        attributes: ["role", "won", "is_alive"],
        where: { user_id: userId },
        include: [{ model: db.GameResult, attributes: ["completed", "settings"], required: true }],
        raw: true,
        nest: true,
    });

    const eligibleRows = rows
        .filter((row) => roleStatisticsPolicy.isAchievementRewardEligibleGame({
            completed: row.GameResult?.completed === true || row.GameResult?.completed === 1,
            gameSourceValue: row.GameResult?.settings?.gameSource?.value,
        }))
        .map(toProgressRow);

    const roleWinsByRole = new Map();
    let survivals = 0;
    let wins = 0;
    for (const row of eligibleRows) {
        if (row.is_alive) survivals += 1;
        if (row.won) {
            wins += 1;
            if (typeof row.role === "string") {
                roleWinsByRole.set(row.role, (roleWinsByRole.get(row.role) ?? 0) + 1);
            }
        }
    }

    return {
        completedGames: eligibleRows.length,
        survivals,
        wins,
        roleWinsByRole,
    };
};

exports.__setEconomyServiceForTests = __setEconomyServiceForTests;
