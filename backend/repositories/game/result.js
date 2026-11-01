// 전적 저장소 파일, 한 판 전적 쓰기(트랜잭션) + 전적 행 읽기(판 하나·직업 통계·업적 진행용)
// 판 기록 서비스·전적 통계 서비스가 부름, 판정·집계는 서비스 몫이라 행 그대로 돌려줌
const db = require("../../models");

// 한 판 전적 쓰기, 판·참가자·계정 통계를 한 트랜잭션으로 (중간 실패면 셋 다 되돌림)
// 같은 판 id 다시 저장(동시 경합 포함)은 실패 아니고 persisted:false로 넘김
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

// Sequelize 행이면 plain 객체로, 이미 plain이면 그대로
const toPlain = (row) => (row && typeof row.get === "function" ? row.get({ plain: true }) : row);

// 판 하나 결과·참가자 (없으면 null)
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

// 직업 통계용 판 기록 행 (승패 정해진 것만, 판 설정 붙임), 판정·집계는 서비스
const findStatRowsWhere = (where) => db.GameResultPlayer.findAll({
    attributes: ["user_id", "role", "won", "is_alive"],
    where: { ...where, won: { [db.Sequelize.Op.ne]: null } },
    include: [{ model: db.GameResult, attributes: ["settings"], required: true }],
    raw: true,
    nest: true,
});
exports.findUserStatRows = (userId) => findStatRowsWhere({ user_id: userId });
exports.findUsersStatRows = (userIds) => findStatRowsWhere({ user_id: { [db.Sequelize.Op.in]: userIds } });
exports.findRoleStatRows = (role) => findStatRowsWhere({ role });

// 업적 진행용 판 기록 행 (끝난 판 여부·판 설정 붙임)
exports.findProgressRows = (userId) => db.GameResultPlayer.findAll({
    attributes: ["role", "won", "is_alive"],
    where: { user_id: userId },
    include: [{ model: db.GameResult, attributes: ["completed", "settings"], required: true }],
    raw: true,
    nest: true,
});
