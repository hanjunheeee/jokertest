// 전적 저장소 파일, 한 판 전적 쓰기(트랜잭션) + 전적 행 읽기(판 하나·직업 통계·업적 진행용)
// 판 기록·직업 통계 서비스(services/game)가 부름, 판정·집계는 서비스 몫
const db = require("../../models");

// 계정마다 많이 한 직업 (계정 id → 직업), 같은 수면 직업 이름 순
// 직업별 판 수를 GROUP BY 한 번으로 읽음, 예: [u1 DOCTOR 2, u1 CITIZEN 1] → u1: DOCTOR
const findMostPlayedRoles = async (userIds, transaction) => {
    const best = new Map();
    if (userIds.length === 0) return best;
    const rows = await db.GameResultPlayer.findAll({
        attributes: ["user_id", "role", [db.sequelize.fn("COUNT", db.sequelize.col("role")), "count"]],
        where: { user_id: { [db.Sequelize.Op.in]: userIds }, won: { [db.Sequelize.Op.ne]: null } },
        group: ["user_id", "role"],
        raw: true,
        transaction,
    });
    for (const row of rows) {
        if (typeof row.role !== "string") continue;
        // MySQL COUNT는 글자로 올 수 있어 숫자로 바꿈
        const count = Number(row.count);
        const current = best.get(row.user_id);
        if (!current || count > current.count || (count === current.count && row.role.localeCompare(current.role) < 0)) {
            best.set(row.user_id, { role: row.role, count });
        }
    }
    return new Map([...best].map(([userId, { role }]) => [userId, role]));
};

// 계정 통계 한 문장으로 더하기: 사람마다 판 수·생존·처형 더하기 + 많이 한 직업 바꾸기 (전엔 사람마다 2문장)
// 예: a +1/+1/+0 DOCTOR, b +1/+0/+1 JOKER → UPDATE user_stats SET total_games = total_games + CASE user_id WHEN a THEN 1 WHEN b THEN 1 ELSE 0 END, … WHERE user_id IN (a, b)
const addStatDeltas = (stats, mostPlayedRoles, transaction) => {
    const replacements = { userIds: stats.map((delta) => delta.user_id) };
    const whenLines = { total_games: [], survival_count: [], execution_count: [], most_played_role: [] };
    stats.forEach((delta, index) => {
        replacements[`u${index}`] = delta.user_id;
        replacements[`t${index}`] = delta.total_games;
        replacements[`s${index}`] = delta.survival_count;
        replacements[`e${index}`] = delta.execution_count;
        replacements[`r${index}`] = mostPlayedRoles.get(delta.user_id) ?? null;
        whenLines.total_games.push(`WHEN :u${index} THEN :t${index}`);
        whenLines.survival_count.push(`WHEN :u${index} THEN :s${index}`);
        whenLines.execution_count.push(`WHEN :u${index} THEN :e${index}`);
        whenLines.most_played_role.push(`WHEN :u${index} THEN :r${index}`);
    });
    const added = (column) => `${column} = ${column} + CASE user_id ${whenLines[column].join(" ")} ELSE 0 END`;
    return db.sequelize.query(
        `UPDATE user_stats SET ${added("total_games")}, ${added("survival_count")}, ${added("execution_count")}, `
        + `most_played_role = CASE user_id ${whenLines.most_played_role.join(" ")} ELSE most_played_role END `
        + "WHERE user_id IN (:userIds)",
        { replacements, transaction },
    );
};

// 한 판 전적 쓰기, 판·참가자·계정 통계를 한 트랜잭션으로 (중간 실패면 셋 다 되돌림)
// 같은 판 id 다시 저장(동시 경합 포함)은 실패 아니고 persisted:false로 넘김
// 거래 안 문장: 판 넣기 → 참가자 넣기 → 많이 한 직업 읽기 → 통계 한 문장 (전엔 사람 수 × 2 + 4)
exports.persistGameResultRecord = async (record) => {
    const { result, players = [], stats = [] } = record;

    try {
        return await db.sequelize.transaction(async (transaction) => {
            // 판 줄 넣기, 이미 있으면 판 키(PRIMARY)에 걸려 아래 catch가 persisted:false로 (같은 판 통계 두 번 더하기 막기)
            // 먼저 읽고 넣던 findOrCreate(저장점·읽기·넣기 3문장) 대신 넣기 한 번, 판 키가 같은 판 두 번 저장을 막음
            await db.GameResult.create(result, { transaction });

            if (players.length > 0) {
                await db.GameResultPlayer.bulkCreate(players, { transaction });
            }
            if (stats.length === 0) return { persisted: true, gameId: result.id };

            // 많이 한 직업: 이 판 사람들 직업별 판 수를 한 번에 묶어 셈 (BE-065, 사람마다 전체 기록 다시 읽지 않기)
            // 승패 정해진 판만, 방금 넣은 이 판 줄도 포함
            const mostPlayedRoles = await findMostPlayedRoles(stats.map((delta) => delta.user_id), transaction);
            await addStatDeltas(stats, mostPlayedRoles, transaction);

            return { persisted: true, gameId: result.id };
        });
    } catch (error) {
        // 동시에 같은 판을 넣다 판 키에 걸린 거면 이미 저장된 걸로 침 (방언마다 오류 모양이 달라 셋 다 봄)
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

// 판 하나 결과·참가자 (없으면 null), 화면에 줄 칸만 골라 담음
exports.findGameResultById = async (gameId) => {
    const row = await db.GameResult.findOne({
        where: { id: gameId },
        include: [{ model: db.GameResultPlayer }],
    });
    if (!row) return null;

    // 관계 이름이 복수·단수 어느 쪽으로 붙어도 받음
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

// 직업 통계용 판 기록 행 (승패 정해진 것만, 판 설정 붙임), 개발·시험 판 거르기는 서비스
const findStatRowsWhere = (where) => db.GameResultPlayer.findAll({
    attributes: ["user_id", "role", "won", "is_alive"],
    where: { ...where, won: { [db.Sequelize.Op.ne]: null } },
    include: [{ model: db.GameResult, attributes: ["settings"], required: true }],
    raw: true,
    nest: true,
});
// 한 사람 · 여러 사람 · 한 직업 기준
exports.findUserStatRows = (userId) => findStatRowsWhere({ user_id: userId });
exports.findUsersStatRows = (userIds) => findStatRowsWhere({ user_id: { [db.Sequelize.Op.in]: userIds } });
exports.findRoleStatRows = (role) => findStatRowsWhere({ role });

// 업적 진행용 판 기록 행 (깨진 판도 포함, 끝까지 갔는지·판 설정 붙임)
exports.findProgressRows = (userId) => db.GameResultPlayer.findAll({
    attributes: ["role", "won", "is_alive"],
    where: { user_id: userId },
    include: [{ model: db.GameResult, attributes: ["completed", "settings"], required: true }],
    raw: true,
    nest: true,
});
// 여러 사람 한 번에 (판 끝 업적 평가, 누구 행인지 user_id 붙임)
exports.findProgressRowsForUsers = (userIds) => db.GameResultPlayer.findAll({
    attributes: ["user_id", "role", "won", "is_alive"],
    where: { user_id: { [db.Sequelize.Op.in]: userIds } },
    include: [{ model: db.GameResult, attributes: ["completed", "settings"], required: true }],
    raw: true,
    nest: true,
});
