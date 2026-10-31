'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const achievementService = require('../../services/achievementService');
const notificationService = require('../../service/notification.service');
const { ACHIEVEMENT_DEFINITIONS, getAchievementDefinition } = require('../../services/achievementDefinitions');

const { __internal } = achievementService;

const createFakeDb = ({ failNotificationFor = null } = {}) => {
    const achievementGrants = [];
    const notifications = [];
    let nextId = 1;
    const pendingByKey = new Map();

    const keyOf = (where) => `${where.user_id}\u0000${where.achievement_id}`;
    const findExisting = (where) => achievementGrants.find(
        (g) => g.user_id === where.user_id && g.achievement_id === where.achievement_id,
    );

    const AchievementGrant = {
        async findOrCreate({ where, defaults, transaction }) {
            const key = keyOf(where);

            if (transaction._heldKeys?.has(key)) {
                return [findExisting(where), false];
            }

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
        async findAll({ where }) {
            return achievementGrants.filter((g) => g.user_id === where.user_id);
        },
    };

    const Notification = {
        async findOrCreate({ where, defaults, transaction }) {
            if (failNotificationFor !== null && where.source_key === failNotificationFor) {
                throw new Error(`simulated notification failure at ${where.source_key}`);
            }
            const existing = notifications.find(
                (n) => n.user_id === where.user_id && n.source_key === where.source_key,
            );
            if (existing) return [existing, false];

            const record = { ...defaults, get: undefined };
            delete record.get;
            notifications.push(record);
            transaction._undo.push(() => {
                const idx = notifications.indexOf(record);
                if (idx !== -1) notifications.splice(idx, 1);
            });
            return [record, true];
        },
        async findOne({ where }) {
            return notifications.find(
                (n) => n.user_id === where.user_id && n.source_key === where.source_key,
            ) ?? null;
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

    return { db: { sequelize, AchievementGrant, Notification }, achievementGrants, notifications };
};

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
    assert.equal(economyService.calls.length, 2);
});

const createRacyFakeDb = () => {
    const { UniqueConstraintError } = require('sequelize');
    const achievementGrants = [];
    let insertHappened = false;

    const AchievementGrant = {
        async findOrCreate({ where, defaults, transaction }) {
            if (insertHappened) {
                const error = new UniqueConstraintError({ errors: [], fields: { achievement_grants_user_achievement_unique: `${where.user_id}-${where.achievement_id}` } });
                throw error;
            }
            insertHappened = true;
            const record = { id: 1, ...defaults };
            achievementGrants.push(record);
            return [record, true];
        },
    };

    const notifications = [];
    const Notification = {
        async findOrCreate({ where, defaults }) {
            const existing = notifications.find(
                (n) => n.user_id === where.user_id && n.source_key === where.source_key,
            );
            if (existing) return [existing, false];
            const record = { ...defaults };
            notifications.push(record);
            return [record, true];
        },
        async findOne({ where }) {
            return notifications.find(
                (n) => n.user_id === where.user_id && n.source_key === where.source_key,
            ) ?? null;
        },
    };

    const sequelize = {
        async transaction(fn) {
            return fn({});
        },
    };

    return {
        db: { sequelize, AchievementGrant, Notification, Sequelize: { UniqueConstraintError } },
        achievementGrants,
        notifications,
    };
};

test('AC-04 CODEX-2 재검토: findOrCreate가 실제 유일 제약 충돌(db.Sequelize.UniqueConstraintError)을 던져도 예외 없이 granted:false로 처리한다', async () => {
    const { db, achievementGrants } = createRacyFakeDb();
    const economyService = createFakeEconomyService();
    __internal.__setDepsForTests({ db, economyService });

    const noble10 = getAchievementDefinition('noble-win-10');

    const first = await __internal.grantAchievement('user-a', noble10);
    assert.equal(first.granted, true);

    const second = await __internal.grantAchievement('user-a', noble10);
    assert.equal(second.granted, false, '유일 제약 충돌은 예외로 새면 안 되고 granted:false로 흡수돼야 한다');

    assert.equal(achievementGrants.length, 1, 'achievement_grants에는 최초 삽입 한 행만 남아야 한다');
    assert.equal(economyService.calls.length, 2);
});

test('A-03: 보상 지급 도중 실패하면 업적 달성 행도 함께 롤백된다(부분 지급이 남지 않는다)', async () => {
    const { db, achievementGrants } = createFakeDb();
    const economyService = createFakeEconomyService({ failReferenceEventId: 'achievement:noble-win-10:DIAMOND' });
    __internal.__setDepsForTests({ db, economyService });

    const noble10 = getAchievementDefinition('noble-win-10');
    await assert.rejects(() => __internal.grantAchievement('user-a', noble10), /simulated failure/);

    assert.equal(achievementGrants.length, 0);

    const retryEconomyService = createFakeEconomyService();
    __internal.__setDepsForTests({ db, economyService: retryEconomyService });
    const retry = await __internal.grantAchievement('user-a', noble10);
    assert.equal(retry.granted, true);
    assert.equal(retryEconomyService.calls.length, 2);
});

test('F-17 A-02: 알림 저장이 실패하면 업적 지급 행과 보상이 함께 롤백된다(알림만 없는 지급이 남지 않는다)', async () => {
    const { db, achievementGrants, notifications } = createFakeDb({
        failNotificationFor: 'achievement:noble-win-10:granted',
    });
    const economyService = createFakeEconomyService();
    __internal.__setDepsForTests({ db, economyService });

    const noble10 = getAchievementDefinition('noble-win-10');
    await assert.rejects(
        () => __internal.grantAchievement('user-a', noble10),
        /simulated notification failure/,
    );

    assert.equal(achievementGrants.length, 0, '알림 저장 실패 후 achievement_grants가 남으면 안 된다');
    assert.equal(notifications.length, 0);

    const { db: healthyDb, achievementGrants: healthyGrants, notifications: healthyNotifications } = createFakeDb();
    const retryEconomyService = createFakeEconomyService();
    __internal.__setDepsForTests({ db: healthyDb, economyService: retryEconomyService });

    const retry = await __internal.grantAchievement('user-a', noble10);
    assert.equal(retry.granted, true);
    assert.equal(healthyGrants.length, 1);
    assert.equal(healthyNotifications.length, 1);
    assert.equal(healthyNotifications[0].source_key, 'achievement:noble-win-10:granted');
    assert.equal(healthyNotifications[0].user_id, 'user-a');
    assert.equal(healthyNotifications[0].read_at, null);
});

test('F-17 AC-03: 이미 지급된 업적을 재평가해도 알림 행이 늘지 않고 notification_created도 다시 나가지 않는다', async (t) => {
    const { db, notifications } = createFakeDb();
    const economyService = createFakeEconomyService();
    const emitted = [];
    const emitToUser = (userId, event, payload) => emitted.push({ userId, event, payload });
    __internal.__setDepsForTests({
        db,
        economyService,
        emitToUser,
        ...createFakeProgressRepos({ 'user-a': { roleWins: { CITIZEN: 10 } } }),
    });
    notificationService.__internal.__setDepsForTests({ db, emitToUser });
    t.after(() => notificationService.__internal.__setDepsForTests(null));

    await achievementService.evaluateAndGrantForUser('user-a');
    const afterFirst = notifications.length;
    const firstEmits = emitted.filter((e) => e.event === 'notification_created').length;

    await achievementService.evaluateAndGrantForUser('user-a');

    assert.equal(notifications.length, afterFirst, '같은 사건에 알림 행이 두 번 쌓이면 안 된다');
    assert.equal(
        emitted.filter((e) => e.event === 'notification_created').length,
        firstEmits,
        '재평가는 이미 지급된 업적의 notification_created를 다시 보내지 않는다',
    );
    assert.equal(afterFirst, 1, 'noble-win-10 지급 하나에 알림 하나다');

    const notificationEmit = emitted.find((e) => e.event === 'notification_created');
    assert.equal(notificationEmit.payload.sfxEvent, undefined);
    assert.equal(notificationEmit.payload.notification.type, 'achievement');
    assert.deepEqual(notificationEmit.payload.notification.target, {
        kind: 'achievement', achievementId: 'noble-win-10',
    });
    assert.ok(emitted.some((e) => e.event === 'achievement_granted'), '기존 F-16 통지는 그대로 유지된다');
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
    assert.deepEqual(economyService.calls.map((c) => c.referenceEventId), [
        'achievement:record-1-masquerade:GOLD',
        'achievement:record-1-masquerade:DIAMOND',
    ]);
});

test('AC-05: 이 기능이 생기기 전부터 이미 임계값을 넘어 있던 계정은 다음 평가에서 소급 지급된다', async () => {
    const { db } = createFakeDb();
    const economyService = createFakeEconomyService();
    const { gameResultRepository, voteParticipationRepository } = createFakeProgressRepos({
        'user-veteran': { completedGames: 30, survivals: 30, wins: 30, voteParticipations: 10, roleWins: { CITIZEN: 30 } },
    });
    __internal.__setDepsForTests({ db, economyService, gameResultRepository, voteParticipationRepository });

    const results = await achievementService.evaluateAndGrantForUser('user-veteran');
    const grantedIds = results.filter((r) => r.granted).map((r) => r.id);

    assert.ok(grantedIds.includes('noble-win-10'));
    assert.ok(grantedIds.includes('noble-win-20'));
    assert.ok(grantedIds.includes('noble-win-30'));
    assert.ok(grantedIds.includes('record-7-erased-night'));

    const callsAfterFirst = economyService.calls.length;
    await achievementService.evaluateAndGrantForUser('user-veteran');
    assert.equal(economyService.calls.length, callsAfterFirst);
});

test('AC-05: 중단 경기·개발 경기는 진행률 저장소가 이미 걸러낸 값을 그대로 신뢰한다(0이면 미달성)', async () => {
    const { db } = createFakeDb();
    const economyService = createFakeEconomyService();
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
    assert.deepEqual(record1, { id: 'record-1-masquerade', achieved: true, current: 3, threshold: 3, granted: false, grantedAt: null });
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

    await achievementService.evaluateAndGrantForUser('user-a');
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
