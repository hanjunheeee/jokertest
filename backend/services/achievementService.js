'use strict';

const achievementDefinitions = require('./achievementDefinitions');

// 실제 의존성(운영 경로에서 쓰는 기본값) 접근자. 테스트는 __internal.__setDepsForTests로
// overrides를 넘겨 일부만 갈아끼운다(economy.service.test.js의 fake db 주입 패턴과 같은
// 이유 — 이 파일도 db.sequelize.transaction/db.AchievementGrant만 계약으로 삼는다).
//
// 각 필드를 getter로 두어 실제로 "읽는 순간"에만 require('../models') 등을 부른다 — '../models'는
// require 시점에 DATABASE_URL로 Sequelize 인스턴스를 만들므로(연결을 실제로 시도하지는
// 않지만 URL 파싱은 즉시 하고 실패하면 던진다), overrides.db가 있을 때는 `??`의 단락
// 평가로 require가 아예 실행되지 않아야 한다 — 객체를 스프레드({...})하면 모든 getter가
// 즉시 평가돼 이 효과가 사라지므로 스프레드하지 않는다.
const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../models'); },
    get gameResultRepository() { return overrides.gameResultRepository ?? require('../repositories/gameResult.repositories'); },
    get voteParticipationRepository() { return overrides.voteParticipationRepository ?? require('../repositories/voteParticipation.repositories'); },
    get economyService() { return overrides.economyService ?? require('../service/economy.service'); },
});

let deps = buildDeps();

// F-12 업적 평가·지급. 게임 완료(gameSession.js의 persistTerminalSession)와 낮 투표 제출
// (handleSubmitDayVote) 직후 이벤트 트리거로 호출된다. "페이지 방문 여부에 의존하지 않는
// 재실행 가능한 처리 경로"(계획 메모 A-05)를 만들기 위해, 이 모듈은 델타가 아니라 매번
// 계정의 전체 이력을 다시 계산한다 — 그래서 이 기능이 배포되기 전에 이미 쌓여 있던 과거
// 확정 경기·투표도, 그 계정이 다음 게임/투표 이벤트를 처음 트리거하는 순간 한 번에 소급
// 반영된다(AC-05). 멱등성의 근거는 achievement_grants의 (user_id, achievement_id) 유일
// 제약이다 — gameResult.repositories.js가 이미 쓰는 관례("멱등성의 근거를 프로세스 안의
// 플래그가 아니라 DB 제약에 둔다")를 그대로 따른다(AC-04).

const METRICS = achievementDefinitions.METRICS;

const currentValueOf = (definition, progress) => {
    switch (definition.metric) {
        case METRICS.COMPLETED_GAMES: return progress.completedGames;
        case METRICS.VOTE_PARTICIPATIONS: return progress.voteParticipations;
        case METRICS.SURVIVALS: return progress.survivals;
        case METRICS.WINS: return progress.wins;
        case METRICS.ROLE_WINS: return progress.roleWinsByRole.get(definition.role) ?? 0;
        default: return 0;
    }
};

const meetsThreshold = (definition, progress) => currentValueOf(definition, progress) >= definition.threshold;

/**
 * userId의 업적 진행률 원천 데이터를 모은다. 두 저장소가 이미 AC-05 게이트(중단 경기·
 * 개발 경기 제외, 라운드당 1회 유효 투표)를 적용한 값을 돌려주므로, 여기서는 합치기만
 * 한다.
 */
const loadProgress = async (userId) => {
    const [gameStats, voteParticipations] = await Promise.all([
        deps.gameResultRepository.getAchievementProgressStats(userId),
        deps.voteParticipationRepository.countEligibleDayVoteParticipations(userId),
    ]);
    return { ...gameStats, voteParticipations };
};

/**
 * 업적 하나를 지급한다. achievement_grants 행 삽입이 성공(created=true)한 호출만 실제
 * 보상을 준다 — 이미 지급된 업적이면 아무 것도 하지 않고 즉시 반환한다(AC-04). 보상 지급
 * 도중 하나라도 실패하면 achievement_grants 삽입을 포함해 트랜잭션 전체가 롤백된다(A-03)
 * — 다음 평가 호출이 처음부터 다시 시도할 수 있다(재시도 안전).
 */
const grantAchievement = async (userId, definition) => {
    const { db, economyService } = deps;
    return db.sequelize.transaction(async (transaction) => {
        let created;
        try {
            const result = await db.AchievementGrant.findOrCreate({
                where: { user_id: userId, achievement_id: definition.id },
                defaults: { user_id: userId, achievement_id: definition.id, granted_at: new Date() },
                transaction,
            });
            created = result[1];
        } catch (error) {
            // CODEX-2 재검토(AC-04): findOrCreate에 외부 트랜잭션(transaction)을 넘기면
            // Sequelize는 자신의 내부 유일 제약 충돌 자동 재시도(관리하는 트랜잭션일 때만
            // 동작)를 건너뛴다 — 그래서 같은 계정·같은 업적을 겹쳐 평가하는 진짜 동시 요청은
            // 둘 다 SELECT에서 상대를 보지 못하고 INSERT 단계에서
            // achievement_grants_user_achievement_unique 유일 제약과 실제로 충돌할 수 있다
            // (실제 MySQL 실행에서 재현됨). gameResult.repositories.js의 persistGameResult·
            // voteParticipation.repositories.js의 recordValidDayVoteParticipation과 같은
            // 관례로, 이 충돌은 "다른 요청이 이미 지급했다"는 뜻이므로 재지급하지 않고
            // 조용히 넘어간다 — MySQL은 한 statement의 유일 제약 위반으로 트랜잭션 전체를
            // 자동으로 중단시키지 않으므로, 이 catch 뒤에도 트랜잭션은 정상적으로 계속된다.
            const constraint = error?.parent?.constraint ?? error?.original?.constraint;
            const isDuplicateGrant = error instanceof db.Sequelize.UniqueConstraintError && (
                constraint === 'achievement_grants_user_achievement_unique' ||
                Object.prototype.hasOwnProperty.call(error?.fields ?? {}, 'achievement_grants_user_achievement_unique') ||
                (error?.fields?.user_id === userId && error?.fields?.achievement_id === definition.id)
            );
            if (!isDuplicateGrant) throw error;
            created = false;
        }

        // 이미 지급된 업적이다. 재지급하지 않는다.
        if (!created) return { granted: false };

        for (const reward of definition.rewards) {
            if (reward.type === 'CURRENCY') {
                await economyService.grantAchievementCurrency({
                    userId,
                    currency: reward.currency,
                    amount: reward.amount,
                    referenceEventId: `achievement:${definition.id}:${reward.currency}`,
                }, db, { transaction });
            } else if (reward.type === 'ITEM') {
                await economyService.grantAchievementItem({
                    userId,
                    itemId: reward.itemId,
                    itemType: reward.itemType,
                    referenceEventId: `achievement:${definition.id}:ITEM`,
                }, db, { transaction });
            }
        }

        return { granted: true };
    });
};

/**
 * userId의 22개 업적을 전부 재평가하고, 이번 호출에서 새로 조건을 만족한 것만 지급한다.
 * 이미 지급된 업적은 조건을 계속 만족해도(예: 30승 이후에도 계속 이김) 다시 지급하지
 * 않는다 — grantAchievement의 achievement_grants 게이트가 그 판단을 전담한다.
 *
 * @param {string} userId
 * @returns {Promise<Array<{ id: string, achieved: boolean, granted: boolean, current: number, threshold: number }>>}
 */
const evaluateAndGrantForUser = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) return [];

    const progress = await loadProgress(userId);
    const results = [];

    for (const definition of achievementDefinitions.ACHIEVEMENT_DEFINITIONS) {
        const current = currentValueOf(definition, progress);
        const achieved = meetsThreshold(definition, progress);
        if (!achieved) {
            results.push({ id: definition.id, achieved: false, granted: false, current, threshold: definition.threshold });
            continue;
        }
        const { granted } = await grantAchievement(userId, definition);
        results.push({ id: definition.id, achieved: true, granted, current, threshold: definition.threshold });
    }

    return results;
};

/**
 * userId의 22개 업적 진행률·달성 여부를 읽기 전용으로 반환한다(A-09) — grantAchievement를
 * 호출하지 않으므로 반복 호출(페이지 재진입 포함)해도 보상이 지급되지 않는다. achieved는
 * 진행률 지표(현재값 ≥ 임계값)만으로 판정하므로, 이미 지급된 업적도 그 지표가 누적값이라
 * 감소하지 않는 한 계속 achieved:true로 남는다 — "이미 지급된 업적이 재조회에서
 * granted:false라는 이유로 미지급으로 표시되는" 오류를 피한다.
 *
 * CODEX-1 재검토(AC-06): achieved는 진행률만으로 계산한 값이라, 게임/투표 이벤트 직후
 * fire-and-forget으로 실행되는 evaluateAndGrantForUser 호출이 (지급 도중 오류 등으로)
 * 아직 성공한 적이 없어도 achieved:true로 보일 수 있다 — "조건은 채웠지만 실제로 재화·
 * 아이템은 아직 지급되지 않은" 상태다. 이 함수는 achievement_grants(영속 지급 이력)를
 * 함께 조회해 granted·grantedAt을 덧붙인다 — 재로그인·새로고침 후 화면이 "달성 조건
 * 충족"과 "실제로 지급됨"을 구분해 보여줄 수 있어야 한다(AC-06).
 *
 * @param {string} userId
 * @returns {Promise<Array<{ id: string, achieved: boolean, current: number, threshold: number, granted: boolean, grantedAt: Date|null }>>}
 */
const getStatusForUser = async (userId) => {
    if (typeof userId !== 'string' || userId.length === 0) return [];

    const { db } = deps;
    const [progress, grants] = await Promise.all([
        loadProgress(userId),
        db.AchievementGrant.findAll({ where: { user_id: userId }, attributes: ['achievement_id', 'granted_at'], raw: true }),
    ]);
    const grantedAtById = new Map(grants.map((grant) => [grant.achievement_id, grant.granted_at]));

    return achievementDefinitions.ACHIEVEMENT_DEFINITIONS.map((definition) => {
        const grantedAt = grantedAtById.get(definition.id) ?? null;
        return {
            id: definition.id,
            achieved: meetsThreshold(definition, progress),
            current: currentValueOf(definition, progress),
            threshold: definition.threshold,
            granted: grantedAt !== null,
            grantedAt,
        };
    });
};

module.exports = {
    loadProgress,
    getStatusForUser,
    evaluateAndGrantForUser,
    // 테스트 전용 — 순수 판정 로직을 DB 없이 직접 검증하거나(meetsThreshold/currentValueOf),
    // 의존성을 fake로 갈아끼워(설정을 생략하면 실제 defaultDeps로 되돌아간다)
    // grantAchievement/evaluateAndGrantForUser의 원자성·멱등성을 검증할 때 사용한다. 런타임
    // 코드에서는 참조하지 않는다.
    __internal: {
        meetsThreshold,
        currentValueOf,
        grantAchievement,
        __setDepsForTests(overrides) {
            deps = buildDeps(overrides ?? {});
        },
    },
};
