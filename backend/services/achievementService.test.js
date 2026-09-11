'use strict';

// F-12 achievementService.js 단위 시험. 실제 MySQL 없이도 AC-02(임계값 판정)·
// AC-03(F-08 거래·소유권 계약을 통한 원자적 지급)·AC-04(동시 달성·중복 요청·재시도에서
// 중복 지급 없음)·AC-05(재실행 가능한 소급 지급)를 검증하기 위해, economy.service.test.js가
// 이미 쓰는 방식(Sequelize 모델 계약만 흉내 내는 인메모리 fake db 주입)을 그대로 따른다.
// fake AchievementGrant.findOrCreate는 "같은 키를 쥔 트랜잭션이 끝날 때까지(커밋/롤백)
// 다음 요청이 기다린다"는 InnoDB 유일 인덱스 잠금의 핵심 성질만 흉내 낸다 — 그래야 진짜
// 동시 요청(Promise.all)에서도 한쪽만 성공하는지를 이 fake로 확인할 수 있다.
//
// 실제 MySQL 유일 제약·트랜잭션 격리 자체를 검증하는 통합 시험은 F01_TEST_DATABASE_URL이
// 있을 때만 도는 backend/tests/db/f12-achievements.integration.test.js에 있다(없으면
// 미검증으로 skip — f01~f11과 같은 관례).

const test = require('node:test');
const assert = require('node:assert/strict');

const achievementService = require('./achievementService');
const { ACHIEVEMENT_DEFINITIONS, getAchievementDefinition } = require('./achievementDefinitions');

const { __internal } = achievementService;

// ---- fake db: achievement_grants만 흉내 낸다 -------------------------------------------

const createFakeDb = () => {
    const achievementGrants = [];
    let nextId = 1;
    const pendingByKey = new Map();

    const keyOf = (where) => `${where.user_id}\u0000${where.achievement_id}`;
    const findExisting = (where) => achievementGrants.find(
        (g) => g.user_id === where.user_id && g.achievement_id === where.achievement_id,
    );

    const AchievementGrant = {
        async findOrCreate({ where, defaults, transaction }) {
            const key = keyOf(where);

            // 같은 트랜잭션이 이 키를 이미 쥐고 있으면(재조회) 바로 통과한다.
            if (transaction._heldKeys?.has(key)) {
                return [findExisting(where), false];
            }

            // 다른 트랜잭션이 이 키를 쥐고 있으면, 그 트랜잭션이 커밋/롤백될 때까지 기다린다.
            while (pendingByKey.has(key)) {
                await pendingByKey.get(key);
            }

            const existing = findExisting(where);
            if (existing) return [existing, false];

            let releaseKey;
            const held = new Promise((resolve) => { releaseKey = resolve; });
            pendingByKey.set(key, held);
            transaction._heldKeys = transaction._heldKeys ?? new Set();
            transaction._heldKeys.add(key);
            transaction._releaseKeys = transaction._releaseKeys ?? [];
            transaction._releaseKeys.push(() => { pendingByKey.delete(key); releaseKey(); });

            const record = { id: nextId++, ...defaults };
            achievementGrants.push(record);
            transaction._undo.push(() => {
                const idx = achievementGrants.indexOf(record);
                if (idx !== -1) achievementGrants.splice(idx, 1);
            });
            return [record, true];
        },
        // getStatusForUser(AC-06)가 영속 지급 이력(achievement_id, granted_at)을 읽을 때 쓴다.
        async findAll({ where }) {
            return achievementGrants.filter((g) => g.user_id === where.user_id);
        },
    };

    const sequelize = {
        async transaction(fn) {
            const transaction = { _undo: [], _releaseKeys: [] };
            try {
                return await fn(transaction);
            } catch (error) {
                for (const undo of [...transaction._undo].reverse()) undo();
                throw error;
            } finally {
                for (const release of transaction._releaseKeys) release();
            }
        },
    };

    return { db: { sequelize, AchievementGrant }, achievementGrants };
};

// ---- fake economyService: 호출만 기록한다(F-08 자체 계약은 economy.service.test.js가 이미 검증) ----

const createFakeEconomyService = ({ failReferenceEventId } = {}) => {
    const calls = [];
    const guard = (referenceEventId) => {
        if (failReferenceEventId && referenceEventId === failReferenceEventId) {
            throw new Error(`simulated failure at ${referenceEventId}`);
        }
    };
    return {
        calls,
        async grantAchievementCurrency({ userId, currency, amount, referenceEventId }) {
            guard(referenceEventId);
            calls.push({ type: 'CURRENCY', userId, currency, amount, referenceEventId });
        },
        async grantAchievementItem({ userId, itemId, itemType, referenceEventId }) {
            guard(referenceEventId);
            calls.push({ type: 'ITEM', userId, itemId, itemType, referenceEventId });
        },
    };
};

// ---- fake 진행률 저장소 -----------------------------------------------------------------

const createFakeProgressRepos = (progressByUser) => ({
    gameResultRepository: {
        async getAchievementProgressStats(userId) {
            const p = progressByUser[userId] ?? {};
            return {
                completedGames: p.completedGames ?? 0,
                survivals: p.survivals ?? 0,
                wins: p.wins ?? 0,
                roleWinsByRole: new Map(Object.entries(p.roleWins ?? {})),
            };
        },
    },
    voteParticipationRepository: {
        async countEligibleDayVoteParticipations(userId) {
            return progressByUser[userId]?.voteParticipations ?? 0;
        },
    },
});

test.afterEach(() => {
    __internal.__setDepsForTests(null);
});

// ---- meetsThreshold/currentValueOf: 순수 판정 로직(AC-02) ------------------------------

test('AC-02: COMPLETED_GAMES/VOTE_PARTICIPATIONS/SURVIVALS/WINS/ROLE_WINS 각각 임계값 직전/도달을 정확히 가른다', () => {
    const def = (overrides) => ({ metric: 'COMPLETED_GAMES', threshold: 3, ...overrides });

    assert.equal(__internal.meetsThreshold(def({ metric: 'COMPLETED_GAMES', threshold: 3 }), { completedGames: 2 }), false);
    assert.equal(__internal.meetsThreshold(def({ metric: 'COMPLETED_GAMES', threshold: 3 }), { completedGames: 3 }), true);

    assert.equal(__internal.meetsThreshold(def({ metric: 'VOTE_PARTICIPATIONS', threshold: 10 }), { voteParticipations: 9 }), false);
    assert.equal(__internal.meetsThreshold(def({ metric: 'VOTE_PARTICIPATIONS', threshold: 10 }), { voteParticipations: 10 }), true);

    assert.equal(__internal.meetsThreshold(def({ metric: 'SURVIVALS', threshold: 20 }), { survivals: 19 }), false);
    assert.equal(__internal.meetsThreshold(def({ metric: 'SURVIVALS', threshold: 20 }), { survivals: 20 }), true);

    assert.equal(__internal.meetsThreshold(def({ metric: 'WINS', threshold: 30 }), { wins: 29 }), false);
    assert.equal(__internal.meetsThreshold(def({ metric: 'WINS', threshold: 30 }), { wins: 30 }), true);

    const roleWinsByRole = new Map([['CITIZEN', 9]]);
    assert.equal(__internal.meetsThreshold(def({ metric: 'ROLE_WINS', role: 'CITIZEN', threshold: 10 }), { roleWinsByRole }), false);
    roleWinsByRole.set('CITIZEN', 10);
    assert.equal(__internal.meetsThreshold(def({ metric: 'ROLE_WINS', role: 'CITIZEN', threshold: 10 }), { roleWinsByRole }), true);
});

test('AC-02: ROLE_WINS는 다른 role의 승수를 섞지 않는다(예: CITIZEN 승수가 JOKER 조건에 영향 없음)', () => {
    const jokerWin10 = { metric: 'ROLE_WINS', role: 'JOKER', threshold: 10 };
    const progress = { roleWinsByRole: new Map([['CITIZEN', 30], ['JOKER', 0]]) };
    assert.equal(__internal.meetsThreshold(jokerWin10, progress), false);
});

// ---- grantAchievement/evaluateAndGrantForUser: DB 계약 위의 오케스트레이션(AC-03/04/05) ----

test('AC-03: 업적 하나가 여러 보상(재화 2종)을 요구하면 각각 다른 referenceEventId로 지급된다', async () => {
    const { db } = createFakeDb();
    const economyService = createFakeEconomyService();
    __internal.__setDepsForTests({ db, economyService });

    const noble10 = getAchievementDefinition('noble-win-10');
    const { granted } = await __internal.grantAchievement('user-a', noble10);

    assert.equal(granted, true);
    assert.deepEqual(economyService.calls.map((c) => c.referenceEventId), [
        'achievement:noble-win-10:GOLD',
        'achievement:noble-win-10:DIAMOND',
    ]);
});

test('AC-04: 이미 지급된 업적은 재평가해도 다시 지급되지 않는다(재시도/페이지 재진입 안전)', async () => {
    const { db } = createFakeDb();
    const economyService = createFakeEconomyService();
    __internal.__setDepsForTests({ db, economyService });

    const noble10 = getAchievementDefinition('noble-win-10');
    const first = await __internal.grantAchievement('user-a', noble10);
    const second = await __internal.grantAchievement('user-a', noble10);

    assert.equal(first.granted, true);
    assert.equal(second.granted, false);
    // 두 번째 호출은 재화를 다시 지급하지 않았다.
    assert.equal(economyService.calls.length, 2);
});

test('AC-04: 동시에 같은 업적을 두 번 평가해도 재화는 한 번만 지급된다(진짜 동시 요청)', async () => {
    const { db } = createFakeDb();
    const economyService = createFakeEconomyService();
    __internal.__setDepsForTests({ db, economyService });

    const noble10 = getAchievementDefinition('noble-win-10');
    const [a, b] = await Promise.all([
        __internal.grantAchievement('user-a', noble10),
        __internal.grantAchievement('user-a', noble10),
    ]);

    const grantedCount = [a.granted, b.granted].filter(Boolean).length;
    assert.equal(grantedCount, 1);
    assert.equal(economyService.calls.length, 2); // GOLD + DIAMOND, 딱 한 번만.
});

// CODEX-2 재검토(AC-04): 위 createFakeDb()의 findOrCreate는 같은 키를 쥔 트랜잭션이 끝날
// 때까지 다음 요청을 "대기"시키는 협조적 락으로 동시성을 흉내낸다 — 실제 MySQL에서
// findOrCreate에 외부 트랜잭션을 넘기면 이 자동 재시도가 동작하지 않아, 두 트랜잭션이
// SELECT에서 서로를 보지 못하고 INSERT에서 achievement_grants_user_achievement_unique와
// 실제로 충돌해 db.Sequelize.UniqueConstraintError를 던질 수 있다(실제 백엔드 실행에서
// 재현됨). 이 fake는 그 "진짜 충돌"을 그대로 재현해 grantAchievement가 예외를 삼키고
// granted:false로 정상 반환하는지 검증한다 — 이전 fake는 이 경로를 절대 통과하지 않았다.
const createRacyFakeDb = () => {
    const { UniqueConstraintError } = require('sequelize');
    const achievementGrants = [];
    let insertHappened = false;

    const AchievementGrant = {
        async findOrCreate({ where, defaults, transaction }) {
            if (insertHappened) {
                // 다른(이미 커밋된) 트랜잭션이 먼저 삽입했다 — 이 호출의 SELECT는 그 커밋
                // 이전에 실행돼 못 봤지만, INSERT 시점에는 실제 유일 제약과 충돌한다.
                const error = new UniqueConstraintError({ errors: [], fields: { achievement_grants_user_achievement_unique: `${where.user_id}-${where.achievement_id}` } });
                throw error;
            }
            insertHappened = true;
            const record = { id: 1, ...defaults };
            achievementGrants.push(record);
            return [record, true];
        },
    };

    const sequelize = {
        async transaction(fn) {
            return fn({});
        },
    };

    return { db: { sequelize, AchievementGrant, Sequelize: { UniqueConstraintError } }, achievementGrants };
};

test('AC-04 CODEX-2 재검토: findOrCreate가 실제 유일 제약 충돌(db.Sequelize.UniqueConstraintError)을 던져도 예외 없이 granted:false로 처리한다', async () => {
    const { db, achievementGrants } = createRacyFakeDb();
    const economyService = createFakeEconomyService();
    __internal.__setDepsForTests({ db, economyService });

    const noble10 = getAchievementDefinition('noble-win-10');

    const first = await __internal.grantAchievement('user-a', noble10);
    assert.equal(first.granted, true);

    // 두 번째 호출은 findOrCreate의 SELECT가 첫 번째 삽입을 보지 못한 채(예: 이미 커밋된
    // 것을 나중에 보게 되는 것이 아니라, 애초에 findOrCreate가 아직 존재를 모른 채 INSERT를
    // 시도하는) 실제 유일 제약과 충돌하는 상황을 흉내낸다 — 이 fake는 이미 insertHappened를
    // true로 만들어 두 번째 findOrCreate 호출이 항상 그 충돌 분기를 타게 한다.
    const second = await __internal.grantAchievement('user-a', noble10);
    assert.equal(second.granted, false, '유일 제약 충돌은 예외로 새면 안 되고 granted:false로 흡수돼야 한다');

    assert.equal(achievementGrants.length, 1, 'achievement_grants에는 최초 삽입 한 행만 남아야 한다');
    // 두 번째 호출은 재화를 다시 지급하지 않았다(GOLD+DIAMOND 두 번만, 첫 호출분).
    assert.equal(economyService.calls.length, 2);
});

test('A-03: 보상 지급 도중 실패하면 업적 달성 행도 함께 롤백된다(부분 지급이 남지 않는다)', async () => {
    const { db, achievementGrants } = createFakeDb();
    const economyService = createFakeEconomyService({ failReferenceEventId: 'achievement:noble-win-10:DIAMOND' });
    __internal.__setDepsForTests({ db, economyService });

    const noble10 = getAchievementDefinition('noble-win-10');
    await assert.rejects(() => __internal.grantAchievement('user-a', noble10), /simulated failure/);

    // GOLD는 실패 전에 지급 호출이 있었지만, achievement_grants 행은 롤백되어 남아있지 않다.
    assert.equal(achievementGrants.length, 0);

    // 이후(실패 원인이 사라진 뒤) 재시도하면 처음부터 다시 시도해 정상 지급된다.
    const retryEconomyService = createFakeEconomyService();
    __internal.__setDepsForTests({ db, economyService: retryEconomyService });
    const retry = await __internal.grantAchievement('user-a', noble10);
    assert.equal(retry.granted, true);
    assert.equal(retryEconomyService.calls.length, 2);
});

test('AC-02/AC-03: evaluateAndGrantForUser는 22개 전부를 평가하고 조건을 만족한 것만 지급한다', async () => {
    const { db } = createFakeDb();
    const economyService = createFakeEconomyService();
    const { gameResultRepository, voteParticipationRepository } = createFakeProgressRepos({
        'user-a': { completedGames: 3, survivals: 0, wins: 0, voteParticipations: 0, roleWins: {} },
    });
    __internal.__setDepsForTests({ db, economyService, gameResultRepository, voteParticipationRepository });

    const results = await achievementService.evaluateAndGrantForUser('user-a');

    assert.equal(results.length, 22);
    const achieved = results.filter((r) => r.achieved);
    assert.deepEqual(achieved.map((r) => r.id), ['record-1-masquerade']);
    assert.equal(achieved[0].granted, true);
    // 기록 1: 골드 50 + 다이아 50.
    assert.deepEqual(economyService.calls.map((c) => c.referenceEventId), [
        'achievement:record-1-masquerade:GOLD',
        'achievement:record-1-masquerade:DIAMOND',
    ]);
});

test('AC-05: 이 기능이 생기기 전부터 이미 임계값을 넘어 있던 계정은 다음 평가에서 소급 지급된다', async () => {
    const { db } = createFakeDb();
    const economyService = createFakeEconomyService();
    // "과거에 이미 30승을 해둔" 계정 — 첫 평가 호출(예: 이 기능 배포 후 처음 게임/투표를
    // 트리거한 순간)에서 3단계(10/20/30) 전부가 한 번에 지급되어야 한다(재실행 가능한
    // 처리 경로 — 페이지 방문 여부와 무관).
    const { gameResultRepository, voteParticipationRepository } = createFakeProgressRepos({
        'user-veteran': { completedGames: 30, survivals: 30, wins: 30, voteParticipations: 10, roleWins: { CITIZEN: 30 } },
    });
    __internal.__setDepsForTests({ db, economyService, gameResultRepository, voteParticipationRepository });

    const results = await achievementService.evaluateAndGrantForUser('user-veteran');
    const grantedIds = results.filter((r) => r.granted).map((r) => r.id);

    assert.ok(grantedIds.includes('noble-win-10'));
    assert.ok(grantedIds.includes('noble-win-20'));
    assert.ok(grantedIds.includes('noble-win-30'));
    assert.ok(grantedIds.includes('record-7-erased-night')); // 30승

    // 두 번째 평가(예: 다음 게임)에서는 같은 업적을 다시 지급하지 않는다.
    const callsAfterFirst = economyService.calls.length;
    await achievementService.evaluateAndGrantForUser('user-veteran');
    assert.equal(economyService.calls.length, callsAfterFirst);
});

test('AC-05: 중단 경기·개발 경기는 진행률 저장소가 이미 걸러낸 값을 그대로 신뢰한다(0이면 미달성)', async () => {
    const { db } = createFakeDb();
    const economyService = createFakeEconomyService();
    // gameResultRepository가 중단/개발 경기를 제외한 뒤의 값이 0이라면, 이 계정이 실제로는
    // 중단된 경기를 여러 번 겪었더라도 achievementService 관점에서는 진행률이 0이어야 한다.
    const { gameResultRepository, voteParticipationRepository } = createFakeProgressRepos({
        'user-aborted-only': { completedGames: 0, survivals: 0, wins: 0, voteParticipations: 0, roleWins: {} },
    });
    __internal.__setDepsForTests({ db, economyService, gameResultRepository, voteParticipationRepository });

    const results = await achievementService.evaluateAndGrantForUser('user-aborted-only');
    assert.equal(results.every((r) => !r.achieved), true);
    assert.equal(economyService.calls.length, 0);
});

test('빈 userId는 아무 것도 평가하지 않는다', async () => {
    const results = await achievementService.evaluateAndGrantForUser('');
    assert.deepEqual(results, []);
});

test('sanity: ACHIEVEMENT_DEFINITIONS를 직접 import해도 achievementService와 같은 22개다', () => {
    assert.equal(ACHIEVEMENT_DEFINITIONS.length, 22);
});

// ---- getStatusForUser: 조회 전용 API가 쓰는 읽기 경로(A-09) --------------------------

test('A-09: getStatusForUser는 22개 전부의 진행률·달성 여부를 반환하지만 아무 것도 지급하지 않는다', async () => {
    const { db } = createFakeDb();
    const economyService = createFakeEconomyService();
    const { gameResultRepository, voteParticipationRepository } = createFakeProgressRepos({
        'user-a': { completedGames: 3, survivals: 0, wins: 0, voteParticipations: 0, roleWins: {} },
    });
    __internal.__setDepsForTests({ db, economyService, gameResultRepository, voteParticipationRepository });

    const status = await achievementService.getStatusForUser('user-a');

    assert.equal(status.length, 22);
    const record1 = status.find((s) => s.id === 'record-1-masquerade');
    // 진행률은 충족했지만(achieved:true) 아직 evaluateAndGrantForUser가 한 번도 실행되지
    // 않았으므로 achievement_grants 행이 없다 — granted:false·grantedAt:null이어야 한다
    // (CODEX-1 재검토 AC-06: achieved와 "실제로 지급됨"을 혼동하면 안 된다).
    assert.deepEqual(record1, { id: 'record-1-masquerade', achieved: true, current: 3, threshold: 3, granted: false, grantedAt: null });
    // 조회만으로는 재화가 지급되지 않는다 — grantAchievement를 호출하지 않는다.
    assert.equal(economyService.calls.length, 0);
});

test('A-09: 반복 호출해도(페이지 재진입 재현) 보상이 지급되지 않고 achievement_grants도 늘지 않는다', async () => {
    const { db, achievementGrants } = createFakeDb();
    const economyService = createFakeEconomyService();
    const { gameResultRepository, voteParticipationRepository } = createFakeProgressRepos({
        'user-a': { completedGames: 30, survivals: 0, wins: 0, voteParticipations: 0, roleWins: {} },
    });
    __internal.__setDepsForTests({ db, economyService, gameResultRepository, voteParticipationRepository });

    await achievementService.getStatusForUser('user-a');
    await achievementService.getStatusForUser('user-a');
    await achievementService.getStatusForUser('user-a');

    assert.equal(achievementGrants.length, 0);
    assert.equal(economyService.calls.length, 0);
});

test('A-09: 이미 지급된 업적도(달성 지표가 누적값이라) 재조회에서 계속 achieved:true로 남는다', async () => {
    const { db } = createFakeDb();
    const economyService = createFakeEconomyService();
    const { gameResultRepository, voteParticipationRepository } = createFakeProgressRepos({
        'user-a': { completedGames: 0, survivals: 0, wins: 0, voteParticipations: 0, roleWins: { CITIZEN: 10 } },
    });
    __internal.__setDepsForTests({ db, economyService, gameResultRepository, voteParticipationRepository });

    // 실제 지급(예: 게임 종료 이벤트) 한 번 발생시킨다.
    await achievementService.evaluateAndGrantForUser('user-a');
    // 그 뒤 조회 API가 여러 번 불려도 이미 지급된 업적이 미지급으로 뒤집히면 안 된다.
    const status = await achievementService.getStatusForUser('user-a');

    const noble10 = status.find((s) => s.id === 'noble-win-10');
    assert.equal(noble10.achieved, true);
    assert.equal(noble10.granted, true, '실제로 지급된 업적은 granted:true여야 한다(AC-06)');
    assert.ok(noble10.grantedAt, 'grantedAt이 함께 반환되어야 한다(AC-06)');
});

test('AC-06: getStatusForUser는 조건은 채웠지만(achieved:true) 아직 지급 이력이 없는 업적을 granted:false로, 실제 지급된 업적은 granted:true로 구분한다', async () => {
    const { db } = createFakeDb();
    const economyService = createFakeEconomyService();
    const { gameResultRepository, voteParticipationRepository } = createFakeProgressRepos({
        // completedGames:15 → record-1(3)·record-4(15) 모두 achieved:true가 되지만,
        // evaluateAndGrantForUser는 record-1만 실행해 record-4는 achieved인데도 미지급 상태로 남긴다.
        'user-a': { completedGames: 15, survivals: 0, wins: 0, voteParticipations: 0, roleWins: {} },
    });
    __internal.__setDepsForTests({ db, economyService, gameResultRepository, voteParticipationRepository });

    await __internal.grantAchievement('user-a', { id: 'record-1-masquerade', rewards: [{ type: 'CURRENCY', currency: 'GOLD', amount: 50 }, { type: 'CURRENCY', currency: 'DIAMOND', amount: 50 }] });

    const status = await achievementService.getStatusForUser('user-a');
    const record1 = status.find((s) => s.id === 'record-1-masquerade');
    const record4 = status.find((s) => s.id === 'record-4-testimonies');

    assert.equal(record1.achieved, true);
    assert.equal(record1.granted, true, 'record-1은 실제로 grantAchievement를 거쳤으므로 granted:true다');
    assert.ok(record1.grantedAt);

    assert.equal(record4.achieved, true, 'record-4도 진행률 조건(15게임)은 채웠다');
    assert.equal(record4.granted, false, 'record-4는 아직 grantAchievement를 거치지 않았으므로 granted:false여야 한다(지급 실패/미실행과 achieved를 혼동하면 안 된다)');
    assert.equal(record4.grantedAt, null);
});

test('빈 userId로 getStatusForUser를 부르면 빈 배열이다', async () => {
    const status = await achievementService.getStatusForUser('');
    assert.deepEqual(status, []);
});
