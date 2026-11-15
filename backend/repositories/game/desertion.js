// 탈주 기록 저장소 파일, 탈주 한 줄 쓰기·그날 몇 번 탈주했나 세기·아직 막힌 줄 읽기 (표 game_desertions)
// services/game/desertion.js만 부름 (탈주가 생길 때·서버 켤 때·Redis 살아날 때만, 방 입장 검사마다는 안 부름)
const db = require("../../models");

// 같은 사람 같은 판 두 번 적기를 유일 인덱스가 막은 오류인지
const isDuplicateDesertion = (error) => {
    if (!(error instanceof db.Sequelize.UniqueConstraintError)) return false;
    const constraint = error?.parent?.constraint ?? error?.original?.constraint;
    return constraint === "game_desertions_user_game_unique" || error?.fields?.game_id !== undefined;
};

// 그 사람이 since 뒤에 탈주한 판 수, 지금 적는 판은 뺌 (같은 판 다시 적기가 두 번으로 안 세지게)
exports.countDesertionsSince = async ({ userId, since, excludeGameId }) => db.GameDesertion.count({
    where: {
        user_id: userId,
        deserted_at: { [db.Sequelize.Op.gte]: since },
        game_id: { [db.Sequelize.Op.ne]: excludeGameId },
    },
});

// 탈주 한 줄 쓰기 → { created, row }, 같은 판이 이미 있으면 있던 줄 돌려줌 (created: false)
exports.insertDesertion = async ({ userId, gameId, reason, desertedAt, blockedUntil }) => {
    try {
        const row = await db.GameDesertion.create({
            user_id: userId,
            game_id: gameId,
            reason,
            deserted_at: desertedAt,
            blocked_until: blockedUntil,
        });
        return { created: true, row: row.get({ plain: true }) };
    } catch (error) {
        if (!isDuplicateDesertion(error)) throw error;
        const row = await db.GameDesertion.findOne({ where: { user_id: userId, game_id: gameId }, raw: true });
        return { created: false, row };
    }
};

// 아직 막힌 줄 + 오늘(한국 시간 0시 뒤) 탈주 줄 한 번에 읽기 (서버 켤 때 막힘 표·오늘 횟수 채우기)
exports.findDesertionsForWarmup = async ({ now, todayStart }) => db.GameDesertion.findAll({
    attributes: ["user_id", "game_id", "deserted_at", "blocked_until"],
    where: {
        [db.Sequelize.Op.or]: [
            { blocked_until: { [db.Sequelize.Op.gt]: now } },
            { deserted_at: { [db.Sequelize.Op.gte]: todayStart } },
        ],
    },
    raw: true,
});
