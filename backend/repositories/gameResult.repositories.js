const db = require("../models");
const gameSessionCore = require("../game-core/gameSession");
const roleStatisticsPolicy = require("../services/roleStatisticsPolicy");
const economyService = require("../service/economy.service");

// backend/socket/matchmaking.js의 __setEconomyServiceForTests와 같은 이유(같은 패턴) —
// economyService.getPublicProfileLoadouts는 실제 backend/models(Economy* 테이블)에 접근하는데,
// 이 파일의 기존 통합 테스트(roleStatistics.integration.test.js)는 GameResultPlayer/GameResult/
// User만 in-place로 가짜로 바꿔두고 Economy* 모델은 그대로 실제 Sequelize 모델이다 — 테스트
// 전용으로 이 참조만 교체할 수 있게 해, 실제 DB 연결 없이도 getRoleRanking을 단위 테스트할
// 수 있게 한다.
let economyServiceRef = economyService;
function __setEconomyServiceForTests(fakeEconomyService) {
    economyServiceRef = fakeEconomyService ?? economyService;
}

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
    // F-21(A-09): 조립과 저장을 나눈다. 여기서 record를 만드는 것은 **이 호출이 처음이자
    // 마지막인 경우**뿐이고, 재시도가 필요한 소켓 계층은 record를 한 번만 만들어 두고
    // persistGameResultRecord를 직접 부른다 — 재시도마다 다시 조립하면 ended_at·roster·
    // 통계 delta가 시도마다 달라져 "같은 판을 다시 저장한다"는 말 자체가 성립하지 않는다.
    return exports.persistGameResultRecord(
        gameSessionCore.buildGameResultRecord(session, { completed, disconnectedUuid }),
    );
};

/**
 * F-21(A-09): **이미 조립된 불변 레코드**를 저장합니다. 위 persistGameResult와 같은 트랜잭션·
 * 같은 멱등 규칙을 쓰며, 차이는 단 하나 — 입력이 살아 있는 session이 아니라 값이라는 점입니다.
 *
 * 그래서 재시도가 안전합니다. 저장을 기다리는 동안 그 세션이 정리되거나 같은 방에서 새 판이
 * 시작돼도 이 레코드의 ended_at·참가자 행·통계 증분은 바뀌지 않습니다.
 *
 * @param {{result:object, players?:object[], stats?:object[]}} record - buildGameResultRecord의 반환값
 * @returns {Promise<{ persisted: boolean, gameId: string }>} persisted=false는 "이미 저장돼 있어
 *          아무 것도 쓰지 않았다"는 뜻입니다(실패가 아닙니다).
 */
exports.persistGameResultRecord = async (record) => {
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

// F-10: 직업 전적·랭킹·운명의 가면. roleStatisticsPolicy(순수 계산)와 DB 사이의 유일한
// 연결점이다 — won=null(중단 경기 잔류자) 제외와 개발 경기 제외는 여기서, 집계·정렬·동률
// 규칙은 정책 모듈에서 각각 담당한다(관심사를 섞지 않는다).

// settings.gameSource가 아예 없는 행은 이 필드가 생기기 전에 저장된 과거 경기다. D-09가
// 과거 기록의 개발 여부 분류 기준을 명시적으로 미확정 상태로 남겼고, 실제로 식별할 수 있는
// 근거도 없으므로 임의로 개발 경기로 재분류하지 않고 운영 기록으로 보아 소급 집계한다
// (A-06/A-07). "development"로 명시된 값만 제외한다.
const EXCLUDED_GAME_SOURCES = new Set(['development', 'test']); // 집계 제외 출처 — 자동 시험(test)과 옛 개발 판(development)
const isRoleStatisticsEligibleGame = (settings) => !EXCLUDED_GAME_SOURCES.has(settings?.gameSource?.value);

const toRoleStatisticsRow = (playerRow) => ({
    user_id: playerRow.user_id,
    role: playerRow.role,
    won: playerRow.won === true || playerRow.won === 1 ? true : playerRow.won === false || playerRow.won === 0 ? false : null,
    is_alive: playerRow.is_alive === true || playerRow.is_alive === 1,
});

/**
 * 승패가 확정된(won not null) 참가 기록을 직업 통계 집계용 행으로 읽어온다. 개발 경기는
 * 여기서 제외되므로, 이 함수가 돌려주는 행은 곧바로 roleStatisticsPolicy.aggregateRoleStatistics에
 * 넘겨도 되는 상태다.
 */
const findRoleStatisticsRows = async (where) => {
    const rows = await db.GameResultPlayer.findAll({
        attributes: ["user_id", "role", "won", "is_alive"],
        where: { ...where, won: { [db.Sequelize.Op.ne]: null } },
        include: [{ model: db.GameResult, attributes: ["settings"], required: true }],
        raw: true,
        nest: true,
    });
    return rows
        .filter((row) => isRoleStatisticsEligibleGame(row.GameResult?.settings))
        .map(toRoleStatisticsRow);
};

/**
 * AC-01: 한 계정의 직업별(5개 고정) 전적. 판을 한 번도 하지 않은 직업도 games:0인 행으로
 * 채워 돌려준다 — 다른 직업 데이터로 대체하거나 목록에서 빠지는 일이 없어야 한다.
 */
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

/**
 * AC-03: 한 직업의 전체 적격(최소 10판) 사용자 랭킹을 승률 내림차순으로 반환한다. 잘라내지
 * 않은 전체 목록이다 — 화면 페이지 이동은 호출부(컨트롤러/프런트)의 몫이다.
 */
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
    // F-13 AC-05(운영자 확장 승인): 서고 랭킹에도 실제 장착 사진·테두리를 보여주기 위해
    // economyService.getPublicProfileLoadouts로 랭킹에 오른 계정들의 appearance id만 일괄
    // 조회한다 — 지갑·소유 목록 등 비공개 경제 정보는 절대 섞이지 않는다(그 함수 자체의
    // 계약). 순위 계산·승률 등 기존 필드는 전혀 건드리지 않는다.
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

/**
 * AC-04: 마이페이지 "운명의 가면"에 표시할, 최소 1판 이상 최고 승률 직업. 대상이 없으면
 * null이다(더미 직업으로 대체하지 않는다).
 */
exports.getHighestWinRateRole = async (userId) => {
    const rows = await findRoleStatisticsRows({ user_id: userId });
    return roleStatisticsPolicy.selectMaskOfFateRole(roleStatisticsPolicy.aggregateRoleStatistics(rows));
};

// F-12: 업적(금지된 기록·직업 도전과제) 진행률. findRoleStatisticsRows와 달리 won=null
// 잔류자를 미리 걸러내지 않고 completed도 함께 읽는다 — roleStatisticsPolicy가 F-12를 위해
// 노출한 isAchievementRewardEligibleGame(completed && !development)이 F-10의
// isRoleStatisticsEligibleGame(development만 제외)보다 엄격한 게이트이기 때문이다(AC-05:
// 중단 경기는 참가자가 이탈자뿐이라도 진행률에 반영되면 안 된다).
const toAchievementProgressRow = (playerRow) => ({
    role: playerRow.role,
    won: playerRow.won === true || playerRow.won === 1,
    is_alive: playerRow.is_alive === true || playerRow.is_alive === 1,
});

/**
 * AC-02/AC-05: 한 계정의 "금지된 기록"·직업 도전과제 진행률 원천 집계.
 * - completedGames: 정상 확정(completed=true, 비개발) 경기에 참가한 횟수.
 * - survivals: 그중 생존(is_alive=true)한 횟수.
 * - wins: 그중 승리(won=true)한 횟수.
 * - roleWinsByRole: 그중 승리한 횟수를 역할(GAME_ROLES 코드)별로 집계한 Map.
 */
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
        .map(toAchievementProgressRow);

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

// 테스트 전용 — economyServiceRef 교체(getRoleRanking의 계정 프로필 조회 fake 주입).
exports.__setEconomyServiceForTests = __setEconomyServiceForTests;
