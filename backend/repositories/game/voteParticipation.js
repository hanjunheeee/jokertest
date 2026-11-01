const db = require("../../models");

exports.recordValidDayVoteParticipation = async ({ gameId, dayIndex, userId }) => {
    try {
        const [, created] = await db.VoteParticipation.findOrCreate({
            where: { game_id: gameId, day_index: dayIndex, user_id: userId },
            defaults: { game_id: gameId, day_index: dayIndex, user_id: userId, accepted_at: new Date() },
        });
        return { recorded: created };
    } catch (error) {
        const constraint = error?.parent?.constraint ?? error?.original?.constraint;
        const isDuplicateParticipation = error instanceof db.Sequelize.UniqueConstraintError && (
            constraint === "vote_participations_game_day_user_unique" ||
            error?.fields?.game_id !== undefined
        );
        if (isDuplicateParticipation) return { recorded: false };
        throw error;
    }
};

const isCompletedGameResult = (gameResult) => gameResult?.completed === true || gameResult?.completed === 1;

const isEligibleGameResult = (gameResult) =>
    isCompletedGameResult(gameResult) && !["development", "test"].includes(gameResult?.settings?.gameSource?.value);

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

exports.__internal = { isEligibleGameResult };
