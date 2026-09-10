const db = require("../models");

// F-11 투표 참여 영속 집계. 쓰기(recordValidDayVoteParticipation)와 F-12용 조회
// (countEligibleDayVoteParticipations)를 한 곳에 모은다 — gameResult.repositories.js가
// game_results/game_result_players/user_stats에 대해 갖는 것과 같은 역할이다.

/**
 * 서버 검증을 통과한 일반 낮 비기권 투표 하나를 영속 사건으로 기록합니다. 집계 키는
 * (game_id, day_index, user_id) 세 값입니다(A-02) — 재투표 차수는 키에 없으므로, 같은
 * day_index 안에서 재투표가 열려도 이미 기록된 사건은 다시 만들어지지 않습니다.
 *
 * 동일 집계 키의 재시도·네트워크 재전송·동시 요청은 DB 유일 제약(vote_participations_
 * game_day_user_unique)이 판정합니다 — findOrCreate가 먼저 시도하고, 경합으로 유일
 * 제약을 직접 건드리는 경우(findOrCreate가 SELECT에서는 못 보고 INSERT에서 충돌하는
 * 경우)는 catch에서 같은 결과로 정규화합니다(AC-02, gameResult.repositories.js의
 * persistGameResult와 같은 관례).
 *
 * 저장 실패(중복이 아닌 나머지 모든 에러)는 그대로 throw합니다 — 호출부(소켓 계층)가
 * 재시도 가능한 실패로 다룰 수 있어야 하고(A-03), 이 함수 자신이 실패를 삼켜 "저장된
 * 것처럼" 보이면 안 됩니다.
 *
 * @param {object} params
 * @param {string} params.gameId
 * @param {number} params.dayIndex
 * @param {string} params.userId
 * @returns {Promise<{ recorded: boolean }>} recorded=false는 "이미 기록돼 있어 아무 것도
 *          쓰지 않았다"는 뜻입니다(실패가 아닙니다).
 */
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

// 아직 game_results 행이 없는(경기 진행 중) 사건과, completed=false(중단 경기)이거나
// gameSource가 "development"인 경기에 속한 사건은 업적 집계에서 제외한다(A-04). 조회는
// game_results와의 INNER JOIN으로 앞부분("아직 결과 없음")을 자동으로 걸러내고,
// completed/gameSource 조건은 여기서 명시적으로 확인한다 — gameResult.repositories.js의
// isRoleStatisticsEligibleGame과 같은 판정 기준(F-10)을 그대로 따른다.
//
// F-11 CODEX-1 재검토(AC-05): completed는 raw MySQL 조회(findAll의 include+raw:true)에서
// JS boolean이 아니라 TINYINT(1) 그대로인 1/0으로 돌아온다 — gameResult.repositories.js의
// toRoleStatisticsRow가 won에 대해 이미 쓰는 것과 같은 정규화가 필요하다. `=== true`만
// 비교하면 정상 완료된 운영 경기도 completed:1로 저장돼 있어 매번 제외되어 버린다.
const isCompletedGameResult = (gameResult) => gameResult?.completed === true || gameResult?.completed === 1;

const isEligibleGameResult = (gameResult) =>
    isCompletedGameResult(gameResult) && gameResult?.settings?.gameSource?.value !== "development";

/**
 * F-11 AC-05: F-12가 업적 진행을 판정할 때 쓰는 조회 연결점. 한 계정이 갖고 있는 저장된
 * 투표 참여 사건 중, 정상 확정되고 운영 경기로 판정된 결과에 연결되는 것만 센다. 사건이
 * 하나도 없는 계정은 0을 돌려준다 — 과거 무기록을 임의로 만들어내지 않는다(A-05).
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
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
