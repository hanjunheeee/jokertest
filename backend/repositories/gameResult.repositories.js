const db = require("../models");
const gameSessionCore = require("../game-core/gameSession");

// 한 판의 전적은 세 테이블(game_results · game_result_players · user_stats)에 걸쳐 있고,
// 셋 중 하나만 남는 상태는 어떤 화면에서도 의미가 없다("경기는 있는데 참가자가 없다",
// "통계는 올랐는데 경기 기록이 없다"). 그래서 쓰기는 전부 이 파일 한 곳에서, 하나의
// 트랜잭션으로만 일어난다 — 소켓 계층은 SQL도 트랜잭션 경계도 알지 않는다.

/**
 * 종료된 한 판을 저장합니다. 같은 game_id로 몇 번을 불러도 행이 늘지 않고 통계도 두 번
 * 더해지지 않습니다 — game_results의 PK 삽입이 성공한 호출만 "이 판을 처음 저장한 호출"이고,
 * 나머지 작업은 전부 그 성공을 게이트로 삼기 때문입니다(멱등성의 근거를 프로세스 안의
 * 플래그가 아니라 DB 제약에 둡니다 — 서버가 여러 대여도 그대로 성립합니다).
 *
 * @param {object} session - 종료 시점의 세션 스냅샷
 * @param {object} options
 * @param {boolean} options.completed - 정상 승패 확정 여부
 * @param {string} [options.disconnectedUuid] - 중단시킨 이탈자 uuid
 * @returns {Promise<{ persisted: boolean, gameId: string }>} persisted=false는 "이미 저장돼 있어
 *          아무 것도 쓰지 않았다"는 뜻입니다(실패가 아닙니다).
 */
exports.persistGameResult = async (session, { completed, disconnectedUuid } = {}) => {
    const record = gameSessionCore.buildGameResultRecord(session, { completed, disconnectedUuid });
    const { result, players = [], stats = [] } = record;

    try {
        return await db.sequelize.transaction(async (transaction) => {
            const [, created] = await db.GameResult.findOrCreate({
                where: { id: result.id },
                defaults: result,
                transaction,
            });

            // 이미 저장된 판이다. 참가자 재삽입도 통계 재증분도 하지 않는다.
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

                // 현재 판의 참가자 행까지 포함된 역할 이력에서 최빈 역할을 계산한다.
                const roleRows = await db.GameResultPlayer.findAll({
                    attributes: ["role"],
                    // won=null인 중단 경기 잔류자는 user_stats 집계 대상이 아니다.
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
            error?.fields?.id !== undefined
        );
        if (duplicateGameId) return { persisted: false, gameId: result.id };
        throw error;
    }
};

const toPlain = (row) => (row && typeof row.get === "function" ? row.get({ plain: true }) : row);

/**
 * 게임 id 단건 조회. 없으면 null입니다(404 판정은 호출부의 몫입니다).
 * 참가자 목록은 게임 헤더와 같은 왕복에서 join으로 함께 읽습니다.
 */
exports.findGameResultById = async (gameId) => {
    const row = await db.GameResult.findOne({
        where: { id: gameId },
        include: [{ model: db.GameResultPlayer }],
    });
    if (!row) return null;

    const plain = toPlain(row);
    // hasMany의 기본 접근자는 복수형 'GameResultPlayers'입니다. 별칭이 바뀌어도 참가자 목록이
    // 조용히 빈 배열로 깨지지 않도록 단수형도 함께 확인합니다(user.repositories의 관례와 동일).
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
