// 낮 투표 참여 저장소 파일, 유효한 낮 투표 참여 한 번만 기록 · 업적에 셀 참여 수
// services/game/achievementHooks.js가 기록, 업적 진행이 deps.js 거쳐 셈
const db = require("../../models");

// 같은 판·같은 날·같은 사람 참여를 없을 때만 기록 → { recorded: 새로 남겼나 }
exports.recordValidDayVoteParticipation = async ({ gameId, dayIndex, userId }) => {
    try {
        const [, created] = await db.VoteParticipation.findOrCreate({
            where: { game_id: gameId, day_index: dayIndex, user_id: userId },
            defaults: { game_id: gameId, day_index: dayIndex, user_id: userId, accepted_at: new Date() },
        });
        return { recorded: created };
    } catch (error) {
        // 동시에 같은 참여를 넣다 유일 제약에 걸리면 이미 기록된 걸로 침 (다른 오류는 그대로 던짐)
        const constraint = error?.parent?.constraint ?? error?.original?.constraint;
        const isDuplicate = error instanceof db.Sequelize.UniqueConstraintError && (
            constraint === "vote_participations_game_day_user_unique" ||
            error?.fields?.game_id !== undefined
        );
        if (isDuplicate) return { recorded: false };
        throw error;
    }
};

// 끝까지 간 판인지 (DB가 true·1 어느 쪽으로 줘도)
const isCompletedGameResult = (gameResult) => gameResult?.completed === true || gameResult?.completed === 1;

// 업적에 셀 판: 끝까지 갔고 개발·시험 판이 아님
const isEligibleGameResult = (gameResult) =>
    isCompletedGameResult(gameResult) && !["development", "test"].includes(gameResult?.settings?.gameSource?.value);

// 그 사람 참여 중 업적에 셀 판의 것만 셈 (판 결과가 아직 없는 참여는 조인에서 빠짐)
exports.countEligibleDayVoteParticipations = async (userId) => {
    const rows = await db.VoteParticipation.findAll({
        attributes: ["game_id", "day_index"],
        where: { user_id: userId },
        include: [{ model: db.GameResult, attributes: ["completed", "settings"], required: true }],
        raw: true,
        nest: true,
    });
    return rows.filter((row) => isEligibleGameResult(row.GameResult)).length;
};

// 시험이 판 판정만 따로 확인하려고 꺼내 둠
exports.__internal = { isEligibleGameResult };
