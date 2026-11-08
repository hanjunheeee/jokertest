'use strict';

// 업적 시험: 정의와 상품 목록 맞물림 · 진행 값 · 진짜 경제 서비스까지 이어 지급(가짜 DB) · 중복 지급 판정
const test = require('node:test');
const assert = require('node:assert/strict');

const achievement = require('../../services/achievement');
const definitions = require('../../services/achievement/definitions');
const { notifyGranted } = require('../../services/achievement/grant');
const grantRepository = require('../../repositories/achievement');
const economy = require('../../services/economy');
const catalog = require('../../services/economy/catalog');
const { MAX_BALANCE } = require('../../services/economy/constants');
const { createFakeEconomyDb, seedWallet } = require('./fakeEconomyDb');

const { __internal } = achievement;

test.afterEach(() => { __internal.__setDepsForTests(null); });

const emptyProgress = { completedGames: 0, survivals: 0, wins: 0, roleWins: {}, voteParticipations: 0 };

// 진짜 경제 서비스 + 가짜 DB로 업적 주입 묶음 만들기
const wire = ({ progress = {}, failNotification = false } = {}) => {
    const db = createFakeEconomyDb();
    const emitted = [];
    const notifications = [];
    const p = { ...emptyProgress, ...progress };
    __internal.__setDepsForTests({
        db,
        economyService: economy,
        gameResultRepository: {
            async getAchievementProgressStats() {
                return { completedGames: p.completedGames, survivals: p.survivals, wins: p.wins, roleWinsByRole: new Map(Object.entries(p.roleWins)) };
            },
        },
        voteParticipationRepository: { async countEligibleDayVoteParticipations() { return p.voteParticipations; } },
        emitToUser: (userId, event, payload) => emitted.push({ userId, event, payload }),
        notificationService: {
            async createForAchievement({ userId, achievementId }, { transaction }) {
                if (failNotification) throw new Error('알림 저장 실패');
                const notification = { userId, achievementId };
                notifications.push(notification);
                transaction._undo.push(() => notifications.splice(notifications.indexOf(notification), 1));
                return { notification };
            },
            emitNotificationCreated() {},
        },
    });
    return { db, emitted, notifications };
};

// 실패 기록(console.error) 안 보이게 감싸 부름
const quietly = async (fn) => {
    const originalError = console.error;
    console.error = () => {};
    try { return await fn(); } finally { console.error = originalError; }
};

const wallet = (db, userId) => db._inspect.wallets.get(userId) ?? { balance_gold: 0, balance_diamond: 0 };

// 정의와 상품 목록
test('업적 정의: 아이템 보상은 모두 상품 목록에 있고 종류가 같으며 상점에서 안 판다', () => {
    const itemRewards = definitions.ACHIEVEMENT_DEFINITIONS.flatMap((d) => d.rewards).filter((r) => r.type === 'ITEM');
    assert.ok(itemRewards.length > 0);
    for (const reward of itemRewards) {
        const item = catalog.getCatalogItem(reward.itemId);
        assert.ok(item, reward.itemId);
        assert.equal(item.type, reward.itemType);
        assert.equal(item.purchasable, false, reward.itemId);
    }
});

test('업적 정의: 통화 보상은 GOLD·DIAMOND이고 1 이상 정수', () => {
    for (const reward of definitions.ACHIEVEMENT_DEFINITIONS.flatMap((d) => d.rewards).filter((r) => r.type === 'CURRENCY')) {
        assert.ok(['GOLD', 'DIAMOND'].includes(reward.currency));
        assert.ok(Number.isInteger(reward.amount) && reward.amount > 0);
    }
});

test('업적 정의: 기준값은 모두 1 이상 정수, 직업 업적은 정해진 직업 코드만', () => {
    const roles = new Set(Object.values(definitions.JOB_ROLES).map((r) => r.role));
    for (const def of definitions.ACHIEVEMENT_DEFINITIONS) {
        assert.ok(Number.isInteger(def.threshold) && def.threshold > 0, def.id);
        if (def.metric === definitions.METRICS.ROLE_WINS) assert.ok(roles.has(def.role), def.id);
    }
});

test('업적 정의: 한 업적 안에서 보상 참조 id(통화·ITEM)가 겹치지 않는다', () => {
    for (const def of definitions.ACHIEVEMENT_DEFINITIONS) {
        const keys = def.rewards.map((r) => (r.type === 'CURRENCY' ? r.currency : 'ITEM'));
        assert.equal(new Set(keys).size, keys.length, def.id);
    }
});

test('업적 정의: 목록은 바꿀 수 없다 (얼린 배열)', () => {
    assert.equal(Object.isFrozen(definitions.ACHIEVEMENT_DEFINITIONS), true);
});

// 진행 값
test('진행 값: 모르는 지표는 0', () => {
    assert.equal(__internal.currentValueOf({ metric: 'UNKNOWN' }, { completedGames: 99 }), 0);
});

test('진행 값: 그 직업으로 이긴 기록이 없으면 0이고 달성 아님', () => {
    const def = definitions.getAchievementDefinition('guard-win-10');
    const progress = { roleWinsByRole: new Map() };
    assert.equal(__internal.currentValueOf(def, progress), 0);
    assert.equal(__internal.meetsThreshold(def, progress), false);
});

test('진행 값 읽기: 전적 통계와 투표 참여 수를 한 객체로 합친다', async () => {
    wire({ progress: { completedGames: 4, voteParticipations: 11 } });
    const progress = await achievement.loadProgress('u');
    assert.equal(progress.completedGames, 4);
    assert.equal(progress.voteParticipations, 11);
});

// 진짜 경제 서비스까지 이어 지급
test('지급: 3판 끝내면 첫 기록 업적이 골드 50·다이아 50을 실제 지갑에 넣는다', async () => {
    const { db } = wire({ progress: { completedGames: 3 } });
    const results = await achievement.evaluateAndGrantForUser('u');
    assert.equal(results.find((r) => r.id === 'record-1-masquerade').granted, true);
    assert.equal(wallet(db, 'u').balance_gold, 50);
    assert.equal(wallet(db, 'u').balance_diamond, 50);
});

test('지급: 다시 평가해도 지갑에 두 번 안 들어간다', async () => {
    const { db } = wire({ progress: { completedGames: 3 } });
    await achievement.evaluateAndGrantForUser('u');
    const again = await achievement.evaluateAndGrantForUser('u');
    assert.equal(again.find((r) => r.id === 'record-1-masquerade').granted, false);
    assert.equal(wallet(db, 'u').balance_gold, 50);
});

test('지급: 같은 계정을 동시에 두 번 평가해도 보상은 한 번만', async () => {
    const { db } = wire({ progress: { completedGames: 3 } });
    await Promise.all([achievement.evaluateAndGrantForUser('u'), achievement.evaluateAndGrantForUser('u')]);
    assert.equal(wallet(db, 'u').balance_gold, 50);
    assert.equal(db._inspect.achievementGrants.filter((g) => g.achievement_id === 'record-1-masquerade').length, 1);
});

test('지급: 15판이면 3판·15판 두 업적이 같이 들어가 골드 100', async () => {
    const { db } = wire({ progress: { completedGames: 15 } });
    await achievement.evaluateAndGrantForUser('u');
    assert.equal(wallet(db, 'u').balance_gold, 100);
});

test('지급: 귀족 30승이면 귀족 테두리를 받고 프로필 테두리로 장착할 수 있다', async () => {
    const { db } = wire({ progress: { roleWins: { CITIZEN: 30 } } });
    await achievement.evaluateAndGrantForUser('u');
    const owned = db._inspect.entitlements.find((e) => e.user_id === 'u' && e.item_id === 'profile-border-귀족');
    assert.equal(owned?.source, 'ACHIEVEMENT_GRANT');
    const { loadout } = await economy.getWalletSummary('u', db);
    await economy.equipProfileAppearance({ userId: 'u', borderItemId: 'profile-border-귀족', expectedRevision: loadout.revision }, db);
    assert.equal(db._inspect.loadouts.get('u').selected_profile_border_id, 'profile-border-귀족');
});

test('지급: 귀족 30승은 10·20승 보상까지 합쳐 골드 30·다이아 40', async () => {
    const { db } = wire({ progress: { roleWins: { CITIZEN: 30 } } });
    await achievement.evaluateAndGrantForUser('u');
    assert.equal(wallet(db, 'u').balance_gold, 30);
    assert.equal(wallet(db, 'u').balance_diamond, 40);
});

test('지급: 보상 테두리를 이미 가졌어도 업적 지급은 성공으로 남는다', async () => {
    const { db } = wire({ progress: { roleWins: { JOKER: 30 } } });
    await economy.grantAchievementItem({ userId: 'u', itemId: 'profile-border-광대', itemType: 'PROFILE_BORDER', referenceEventId: 'old' }, db);
    const results = await achievement.evaluateAndGrantForUser('u');
    assert.equal(results.find((r) => r.id === 'clown-win-30').granted, true);
});

test('지급: 골드가 최대 잔액이라 보상이 넘치면 그 업적은 안 받은 걸로 남고 업적 행·다이아 보상까지 되돌린다', async () => {
    const { db } = wire({ progress: { completedGames: 3 } });
    seedWallet(db, 'u', { gold: MAX_BALANCE, diamond: 0 });
    const results = await quietly(() => achievement.evaluateAndGrantForUser('u'));
    assert.equal(results.find((r) => r.id === 'record-1-masquerade').granted, false);
    assert.equal(db._inspect.achievementGrants.length, 0);
    assert.equal(wallet(db, 'u').balance_diamond, 0);
    assert.equal(wallet(db, 'u').balance_gold, MAX_BALANCE);
});

test('지급: 알림 저장이 실패하면 그 업적은 안 받은 걸로 남고 이미 넣은 골드·다이아도 되돌린다', async () => {
    const { db } = wire({ progress: { completedGames: 3 }, failNotification: true });
    const results = await quietly(() => achievement.evaluateAndGrantForUser('u'));
    assert.equal(results.find((r) => r.id === 'record-1-masquerade').granted, false);
    assert.equal(db._inspect.achievementGrants.length, 0);
    assert.equal(wallet(db, 'u').balance_gold, 0);
    assert.equal(wallet(db, 'u').balance_diamond, 0);
    assert.equal(db._inspect.ledgerEntries.length, 0);
});

test('지급 통지: 새로 받은 업적마다 achievement_granted를 보내고 효과음 id는 업적별로 다르다', async () => {
    const { emitted } = wire({ progress: { completedGames: 15 } });
    await achievement.evaluateAndGrantForUser('u');
    const granted = emitted.filter((e) => e.event === 'achievement_granted');
    assert.deepEqual(granted.map((e) => e.payload.achievementId).sort(), ['record-1-masquerade', 'record-4-testimonies']);
    assert.equal(new Set(granted.map((e) => e.payload.sfxEvent.eventId)).size, 2);
});

test('지급 통지: 다시 평가할 때는 통지를 또 보내지 않는다', async () => {
    const { emitted } = wire({ progress: { completedGames: 3 } });
    await achievement.evaluateAndGrantForUser('u');
    const before = emitted.length;
    await achievement.evaluateAndGrantForUser('u');
    assert.equal(emitted.length, before);
});

test('지급 통지: 보내기가 예외를 던져도 밖으로 안 던진다', () => {
    __internal.__setDepsForTests({ emitToUser: () => { throw new Error('socket down'); } });
    const originalError = console.error;
    console.error = () => {};
    try {
        assert.doesNotThrow(() => notifyGranted('u', { id: 'record-1-masquerade' }));
    } finally {
        console.error = originalError;
    }
});

test('평가: 계정 id가 문자열이 아니면(숫자·null) 빈 결과', async () => {
    wire();
    assert.deepEqual(await achievement.evaluateAndGrantForUser(5), []);
    assert.deepEqual(await achievement.getStatusForUser(null), []);
});

test('상태: 받은 업적은 granted·grantedAt, 기준만 넘고 안 받은 건 granted:false', async () => {
    const { db } = wire({ progress: { completedGames: 3, survivals: 5 } });
    await __internal.grantAchievement('u', definitions.getAchievementDefinition('record-1-masquerade'));
    const status = await achievement.getStatusForUser('u');
    const first = status.find((s) => s.id === 'record-1-masquerade');
    const third = status.find((s) => s.id === 'record-3-first-morning');
    assert.equal(first.granted, true);
    assert.ok(first.grantedAt instanceof Date);
    assert.deepEqual([third.achieved, third.granted, third.grantedAt], [true, false, null]);
    assert.equal(db._inspect.achievementGrants.length, 1);
});

// 중복 지급 판정
const fakeGrantDb = () => {
    class UniqueConstraintError extends Error {}
    return { Sequelize: { UniqueConstraintError }, UniqueConstraintError };
};

test('중복 지급 판정: 업적 유일 제약 이름이면 이미 받은 것', () => {
    const db = fakeGrantDb();
    const error = Object.assign(new db.UniqueConstraintError('dup'), { parent: { constraint: 'achievement_grants_user_achievement_unique' } });
    assert.equal(grantRepository.isDuplicateGrantError(error, db, 'u', 'a'), true);
});

test('중복 지급 판정: 다른 유일 제약 오류는 이미 받은 걸로 안 본다', () => {
    const db = fakeGrantDb();
    const error = Object.assign(new db.UniqueConstraintError('dup'), { parent: { constraint: 'something_else' }, fields: { email: 'x' } });
    assert.equal(grantRepository.isDuplicateGrantError(error, db, 'u', 'a'), false);
});

test('중복 지급 판정: 유일 제약 오류가 아니면 같은 이름이 있어도 false', () => {
    const db = fakeGrantDb();
    const error = Object.assign(new Error('x'), { parent: { constraint: 'achievement_grants_user_achievement_unique' } });
    assert.equal(grantRepository.isDuplicateGrantError(error, db, 'u', 'a'), false);
});

test('중복 지급 판정: fields 두 칸이 이 사람·이 업적이면 true, 다른 사람이면 false', () => {
    const db = fakeGrantDb();
    const error = Object.assign(new db.UniqueConstraintError('dup'), { fields: { user_id: 'u', achievement_id: 'a' } });
    assert.equal(grantRepository.isDuplicateGrantError(error, db, 'u', 'a'), true);
    assert.equal(grantRepository.isDuplicateGrantError(error, db, 'other', 'a'), false);
});

test('지급: 한 업적 지급이 실패해도 뒤 업적은 계속 평가해 받는다', async () => {
    const { db } = wire({ progress: { completedGames: 3, survivals: 5 } });
    seedWallet(db, 'u', { gold: MAX_BALANCE - 60, diamond: 0 });
    const results = await quietly(() => achievement.evaluateAndGrantForUser('u'));
    // 첫 업적(골드 50)은 들어가고, 셋째 업적(골드 50 더)은 한도 넘어 실패
    assert.equal(results.find((r) => r.id === 'record-1-masquerade').granted, true);
    assert.equal(results.find((r) => r.id === 'record-3-first-morning').granted, false);
    assert.equal(wallet(db, 'u').balance_gold, MAX_BALANCE - 10);
    assert.equal(wallet(db, 'u').balance_diamond, 50);
});
