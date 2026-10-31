'use strict';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
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
const achievementService = require('../../services/achievementService');
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

const makeEndedSession = (id, playersMap, { winner = 'CITIZEN', gameSource = 'production' } = {}) => ({
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
    gameSource,
    players: playersMap,
});

const winnerForRole = (role) => (role === 'JOKER' ? 'JOKER' : 'CITIZEN');

const persistWins = async (userId, role, count) => {
    for (let i = 0; i < count; i += 1) {
        const gameId = crypto.randomUUID();
        const session = makeEndedSession(gameId, new Map([makePlayer(userId, role, true)]), { winner: winnerForRole(role) });
        const result = await gameResultRepository.persistGameResult(session, { completed: true });
        assert.equal(result.persisted, true);
    }
};

const getWalletRow = async (userId) => db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId }, raw: true });
const getEntitlement = async (userId, itemId) => db.sequelize.models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: itemId }, raw: true });
const getLedgerEntry = async (userId, referenceEventId) =>
    db.EconomyLedgerEntry.findOne({ where: { user_id: userId, reference_event_id: referenceEventId }, raw: true });
const countLedgerEntries = async (userId, referenceEventId) =>
    db.EconomyLedgerEntry.count({ where: { user_id: userId, reference_event_id: referenceEventId } });

test('AC-02/AC-03: 귀족으로 10승하면 noble-win-10이 지급되고 그 업적 몫의 원장(골드10·다이아10)이 정확히 기록된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('noble10');
    await persistWins(userId, 'CITIZEN', 10);

    const results = await achievementService.evaluateAndGrantForUser(userId);
    const noble10 = results.find((r) => r.id === 'noble-win-10');
    assert.equal(noble10.achieved, true);
    assert.equal(noble10.granted, true);

    const grantRow = await db.AchievementGrant.findOne({ where: { user_id: userId, achievement_id: 'noble-win-10' }, raw: true });
    assert.ok(grantRow, 'achievement_grants 행이 실제로 커밋돼야 한다');

    const goldEntry = await getLedgerEntry(userId, 'achievement:noble-win-10:GOLD');
    const diamondEntry = await getLedgerEntry(userId, 'achievement:noble-win-10:DIAMOND');
    assert.ok(goldEntry, 'noble-win-10 골드 지급 원장 항목이 있어야 한다');
    assert.ok(diamondEntry, 'noble-win-10 다이아 지급 원장 항목이 있어야 한다');
    assert.equal(goldEntry.amount, 10);
    assert.equal(diamondEntry.amount, 10);
});

test('AC-03: 직업 30승은 테두리 소유권을 카탈로그 계약대로 지급한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('noble30');
    await persistWins(userId, 'CITIZEN', 30);

    const results = await achievementService.evaluateAndGrantForUser(userId);
    const noble30 = results.find((r) => r.id === 'noble-win-30');
    assert.equal(noble30.granted, true);

    const entitlement = await getEntitlement(userId, 'profile-border-귀족');
    assert.ok(entitlement, '직업 테두리 소유권이 economy_entitlements에 실제로 생겨야 한다');
    assert.equal(entitlement.item_type, 'PROFILE_BORDER');
    assert.equal(entitlement.source, 'ACHIEVEMENT_GRANT');
});

test('AC-04: 실제 DB 경합(동시 평가 요청)에서도 같은 업적은 정확히 한 번만 지급된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('race12');
    await persistWins(userId, 'CITIZEN', 10);

    await Promise.all([
        achievementService.evaluateAndGrantForUser(userId),
        achievementService.evaluateAndGrantForUser(userId),
    ]);

    const grantCount = await db.AchievementGrant.count({ where: { user_id: userId, achievement_id: 'noble-win-10' } });
    assert.equal(grantCount, 1, '동시 요청이어도 achievement_grants 유일 제약으로 한 번만 남아야 한다');

    assert.equal(await countLedgerEntries(userId, 'achievement:noble-win-10:GOLD'), 1, '동시 요청이 noble-win-10 골드를 두 번 지급하면 안 된다');
    assert.equal(await countLedgerEntries(userId, 'achievement:noble-win-10:DIAMOND'), 1, '동시 요청이 noble-win-10 다이아를 두 번 지급하면 안 된다');
    const goldEntry = await getLedgerEntry(userId, 'achievement:noble-win-10:GOLD');
    assert.equal(goldEntry.amount, 10);
});

test('AC-04: 페이지 재진입(재평가) 재시도는 이미 지급된 업적을 다시 지급하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('retry1');
    await persistWins(userId, 'CITIZEN', 10);

    await achievementService.evaluateAndGrantForUser(userId);
    await achievementService.evaluateAndGrantForUser(userId);
    await achievementService.evaluateAndGrantForUser(userId);

    assert.equal(await countLedgerEntries(userId, 'achievement:noble-win-10:GOLD'), 1, '재시도가 noble-win-10 골드를 중복 지급하면 안 된다');
    assert.equal(await countLedgerEntries(userId, 'achievement:noble-win-10:DIAMOND'), 1, '재시도가 noble-win-10 다이아를 중복 지급하면 안 된다');
    const goldEntry = await getLedgerEntry(userId, 'achievement:noble-win-10:GOLD');
    const diamondEntry = await getLedgerEntry(userId, 'achievement:noble-win-10:DIAMOND');
    assert.equal(goldEntry.amount, 10);
    assert.equal(diamondEntry.amount, 10);
});

test('AC-05: 중단 경기 참가자는 진행률에 반영되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('aborted1');
    const gameId = crypto.randomUUID();
    const session = makeEndedSession(gameId, new Map([makePlayer(userId, 'CITIZEN', false)]), { winner: 'CITIZEN' });
    await gameResultRepository.persistGameResult(session, { completed: false, disconnectedUuid: userId });

    const stats = await gameResultRepository.getAchievementProgressStats(userId);
    assert.equal(stats.completedGames, 0, '중단 경기는 정상 확정 경기 수에 포함되면 안 된다');

    const results = await achievementService.evaluateAndGrantForUser(userId);
    assert.equal(results.every((r) => !r.achieved), true);
});

test('AC-05: 개발 경기는 진행률에 반영되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('devgame1');
    const gameId = crypto.randomUUID();
    const session = makeEndedSession(gameId, new Map([makePlayer(userId, 'CITIZEN', true)]), { winner: 'CITIZEN', gameSource: 'development' });
    await gameResultRepository.persistGameResult(session, { completed: true });

    const stats = await gameResultRepository.getAchievementProgressStats(userId);
    assert.equal(stats.completedGames, 0, '개발 경기는 진행률에 포함되면 안 된다');
});

test('AC-03/AC-04: 30승으로 9개 업적이 동시에 걸려도(동시 평가 포함) 지갑 총액·지급 개수·테두리 소유권이 정확히 일치한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('multi30');
    await persistWins(userId, 'CITIZEN', 30);

    await Promise.all([
        achievementService.evaluateAndGrantForUser(userId),
        achievementService.evaluateAndGrantForUser(userId),
    ]);

    const grantRows = await db.AchievementGrant.findAll({ where: { user_id: userId }, attributes: ['achievement_id'], raw: true });
    const grantIds = grantRows.map((g) => g.achievement_id);
    assert.equal(new Set(grantIds).size, grantIds.length, '동시 평가로 같은 업적이 중복 지급되면 안 된다');
    assert.deepEqual(
        [...grantIds].sort(),
        ['noble-win-10', 'noble-win-20', 'noble-win-30', 'record-1-masquerade', 'record-3-first-morning', 'record-4-testimonies', 'record-5-clown-story', 'record-6-dead-mans-leaving', 'record-7-erased-night'].sort(),
        '30승 계정은 정확히 이 9개 업적만 달성해야 한다(record-2는 투표 참여, 다른 직업 업적은 역할이 달라 제외)',
    );

    const wallet = await getWalletRow(userId);
    assert.equal(wallet.balance_gold, 330, '지갑 총 골드가 9개 업적 보상의 합과 정확히 일치해야 한다');
    assert.equal(wallet.balance_diamond, 340, '지갑 총 다이아가 9개 업적 보상의 합과 정확히 일치해야 한다');

    const entitlement = await getEntitlement(userId, 'profile-border-귀족');
    assert.ok(entitlement, 'noble-win-30 테두리 소유권도 함께 지급되어야 한다');

    await achievementService.evaluateAndGrantForUser(userId);
    const walletAfterRetry = await getWalletRow(userId);
    assert.equal(walletAfterRetry.balance_gold, 330);
    assert.equal(walletAfterRetry.balance_diamond, 340);
});

test('AC-05: 이 기능이 생기기 전부터 이미 쌓여 있던 과거 확정 경기도 다음 평가 호출에서 한 번에 소급 지급된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('retro1');
    await persistWins(userId, 'CITIZEN', 3);

    const before = await db.AchievementGrant.count({ where: { user_id: userId } });
    assert.equal(before, 0, '트리거 전에는 어떤 업적도 지급돼 있지 않아야 한다');

    const results = await achievementService.evaluateAndGrantForUser(userId);
    const record1 = results.find((r) => r.id === 'record-1-masquerade');
    assert.equal(record1.granted, true, '게임 3회 완료 기록이 소급으로 한 번에 지급돼야 한다');

    const wallet = await getWalletRow(userId);
    assert.equal(wallet.balance_gold, 50);
    assert.equal(wallet.balance_diamond, 50);
});
