'use strict';

// F-12 명시적 백필·복구(A-07) — 실제 격리 MySQL DB에서 achievementRecoveryService.
// evaluateAllUsers(backfill-achievements.js가 호출하는 것과 같은 함수)가 새 게임/투표/
// 페이지 방문 없이 과거 지급 누락을 재처리하고, 재실행해도 중복 지급하지 않는지 검증한다.
// achievementService.test.js/achievementRecoveryService.test.js는 fake db로 로직만
// 검증하므로, 이 파일이 실제 achievement_grants 유일 제약 위에서의 동작 근거를 보완한다.
//
// backend/tests/helpers/isolatedTestDb.js의 관리 목록·대상 DB 확인 원칙을 따른다.
// F01_TEST_DATABASE_URL이 없으면 각 테스트는 실패로 표시하지 않고 명시적으로 skip한다.

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const addVoteParticipations = require('../../db/migrations/0008-add-vote-participations');
const addAchievementGrants = require('../../db/migrations/0009-add-achievement-grants');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests,
    addVoteParticipations, addAchievementGrants, migrationRunner,
});

let sequelize;
let connectionError = null;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    try {
        await sequelize.authenticate();
    } catch (error) {
        connectionError = error;
    }
});

test.after(async () => {
    if (sequelize) await sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    if (connectionError) throw connectionError;
    return false;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

const db = require('../../models');
const gameResultRepository = require('../../repositories/gameResult.repositories');
const achievementRecoveryService = require('../../services/achievementRecoveryService');
const { hashPassword } = require('../../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const setUp = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, 8 - label.length)}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await hashPassword('correct-horse-battery-1'),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    await db.UserStats.create({ user_id: uuid });
    return uuid;
};

const makePlayer = (uuid, role, alive) => [uuid, {
    uuid, nickname: `nick-${uuid.slice(0, 6)}`, role, team: role === 'JOKER' ? 'JOKER' : 'CITIZEN',
    alive, deathReason: null,
}];

const makeEndedSession = (id, playersMap, { winner = 'CITIZEN' } = {}) => ({
    id,
    roomId: crypto.randomUUID(),
    phase: 'ENDED',
    dayIndex: 2,
    jokerCount: 1,
    roleComposition: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: Math.max(playersMap.size - 1, 0) },
    timerSettings: { dayDiscussionTime: 90, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
    startedAt: Date.now() - 60_000,
    endedAt: Date.now(),
    winResult: { winner },
    gameSource: 'production',
    players: playersMap,
});

const persistWins = async (userId, role, count) => {
    for (let i = 0; i < count; i += 1) {
        const gameId = crypto.randomUUID();
        const session = makeEndedSession(gameId, new Map([makePlayer(userId, role, true)]), { winner: role === 'JOKER' ? 'JOKER' : 'CITIZEN' });
        const result = await gameResultRepository.persistGameResult(session, { completed: true });
        assert.equal(result.persisted, true);
    }
};

const getWalletRow = (userId) => db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId }, raw: true });

test('A-07: 새 게임/페이지 방문 없이도 백필이 과거에 쌓인 확정 경기를 소급 지급한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('backfill1');
    // achievementService를 한 번도 거치지 않고(트리거 없이) 과거 경기 3판만 저장한다 —
    // "배포 전부터 이미 쌓여 있던 기록"을 흉내낸다.
    await persistWins(userId, 'CITIZEN', 3);

    const before = await db.AchievementGrant.count({ where: { user_id: userId } });
    assert.equal(before, 0, '백필 전에는 어떤 업적도 지급돼 있지 않아야 한다');

    const summary = await achievementRecoveryService.evaluateAllUsers();

    const grantedForUser = summary.grants.find((g) => g.userId === userId);
    assert.ok(grantedForUser?.achievementIds.includes('record-1-masquerade'), '게임 3회 완료 기록이 백필로 지급돼야 한다');

    const wallet = await getWalletRow(userId);
    assert.equal(wallet.balance_gold, 50);
    assert.equal(wallet.balance_diamond, 50);
});

test('A-07: 백필을 여러 번 재실행해도 이미 지급된 업적은 다시 지급되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('backfill2');
    await persistWins(userId, 'CITIZEN', 3);

    await achievementRecoveryService.evaluateAllUsers();
    const afterFirst = await db.AchievementGrant.count({ where: { user_id: userId, achievement_id: 'record-1-masquerade' } });
    assert.equal(afterFirst, 1);

    await achievementRecoveryService.evaluateAllUsers();
    await achievementRecoveryService.evaluateAllUsers();

    const afterRepeat = await db.AchievementGrant.count({ where: { user_id: userId, achievement_id: 'record-1-masquerade' } });
    assert.equal(afterRepeat, 1, '재실행이 같은 업적을 중복 지급하면 안 된다');

    const wallet = await getWalletRow(userId);
    assert.equal(wallet.balance_gold, 50, '재실행이 재화를 중복 지급하면 안 된다');
});

test('A-07: 여러 계정을 한 번에 백필해도 각 계정은 자신의 진행률만큼만 지급받는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const veteran = await createLocalUser('veteran');
    const rookie = await createLocalUser('rookie');
    await persistWins(veteran, 'CITIZEN', 30);
    await persistWins(rookie, 'CITIZEN', 1);

    const summary = await achievementRecoveryService.evaluateAllUsers();

    const veteranGrants = summary.grants.find((g) => g.userId === veteran)?.achievementIds ?? [];
    assert.ok(veteranGrants.includes('noble-win-30'), '30승 계정은 noble-win-30까지 지급받아야 한다');
    assert.ok(veteranGrants.includes('record-7-erased-night'), '30승 계정은 기록 7도 함께 지급받아야 한다');

    const rookieGrantCount = await db.AchievementGrant.count({ where: { user_id: rookie } });
    assert.equal(rookieGrantCount, 0, '1승뿐인 계정은 아무 업적도 지급받으면 안 된다');
});
