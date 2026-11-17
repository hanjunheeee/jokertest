// 낮 투표 참여 저장소 파일, 유효한 낮 투표 참여 한 번만 기록 · 업적에 셀 참여 수(한 명·여러 명)
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

// 산 채로 판을 떠난 줄의 죽은 이유 (services/game/roleStatistics/queries.js 판 수 빼기와 같은 글자)
const DESERTED_DEATH_REASON = "DISCONNECT";

// 표 낸 사람이 그 판에서 탈주했나 (판 수에서 빼는 것과 같은 기준으로 표 수에서도 뺌)
const isDesertedVote = (row) => row.GameResult?.GameResultPlayers?.death_reason === DESERTED_DEATH_REASON;

// 판 결과에 붙여 읽을 것: 끝까지 갔나·판 설정 + 표 낸 사람 본인 판 줄의 죽은 이유 (질의는 그대로 한 번)
const eligibilityInclude = () => [{
    model: db.GameResult,
    attributes: ["completed", "settings"],
    required: true,
    include: [{
        model: db.GameResultPlayer,
        attributes: ["death_reason"],
        required: false,
        // Op.eq 없이 col만 주면 "= " 비교가 빠진 글이 나와 꼭 붙임
        where: { user_id: { [db.Sequelize.Op.eq]: db.Sequelize.col("VoteParticipation.user_id") } },
    }],
}];

// 업적에 셀 표: 셀 판이고 그 판에서 탈주 안 함
const isCountedVote = (row) => isEligibleGameResult(row.GameResult) && !isDesertedVote(row);

// 그 사람 참여 중 업적에 셀 판의 것만 셈 (판 결과가 아직 없는 참여는 조인에서 빠짐, 탈주한 판 표도 뺌)
exports.countEligibleDayVoteParticipations = async (userId) => {
    const rows = await db.VoteParticipation.findAll({
        attributes: ["game_id", "day_index"],
        where: { user_id: userId },
        include: eligibilityInclude(),
        raw: true,
        nest: true,
    });
    return rows.filter(isCountedVote).length;
};

// 여러 사람 한 번에 셈 → Map(사람 → 수), 참여 없는 사람은 0 (판 끝 업적 평가가 사람마다 읽던 것 묶기)
exports.countEligibleDayVoteParticipationsForUsers = async (userIds) => {
    const counts = new Map(userIds.map((userId) => [userId, 0]));
    const rows = await db.VoteParticipation.findAll({
        attributes: ["user_id", "game_id", "day_index"],
        where: { user_id: { [db.Sequelize.Op.in]: userIds } },
        include: eligibilityInclude(),
        raw: true,
        nest: true,
    });
    for (const row of rows) {
        if (counts.has(row.user_id) && isCountedVote(row)) counts.set(row.user_id, counts.get(row.user_id) + 1);
    }
    return counts;
};

// 시험이 판 판정만 따로 확인하려고 꺼내 둠
exports.__internal = { isEligibleGameResult };
