'use strict';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { fork } = require('node:child_process');

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
const achievementRecoveryService = require('../../services/achievement/recovery');
const economyService = require('../../services/economy');
const achievementDefinitions = require('../../services/achievement/definitions');
const { hashPassword } = require('../../utils/auth/credentials');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const setUp = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label.slice(0, 2)}${uuid.replace(/-/g, "").slice(0, 6)}`;
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

const getLedgerEntry = async (userId, referenceEventId) =>
    db.EconomyLedgerEntry.findOne({ where: { user_id: userId, reference_event_id: referenceEventId }, raw: true });

test('AC-03/AC-05: 이미 성공한 재화 지급(GOLD) 이후 실패(DIAMOND)해도 achievement_grants·이미 쓰인 원장·잔액이 함께 롤백되고, 원인이 사라진 뒤 재실행하면 정상 복구된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('interrupt2');
    await persistWins(userId, 'CITIZEN', 3);

    const originalGrantAchievementCurrency = economyService.grantAchievementCurrency;
    let goldCallCount = 0;
    economyService.grantAchievementCurrency = async (params, ...rest) => {
        if (params.currency === 'DIAMOND') {
            throw new Error('simulated interruption during grant (after GOLD already written)');
        }
        goldCallCount += 1;
        return originalGrantAchievementCurrency(params, ...rest);
    };

    let interrupted;
    try {
        interrupted = await achievementRecoveryService.evaluateAllUsers();
    } finally {
        economyService.grantAchievementCurrency = originalGrantAchievementCurrency;
    }

    assert.equal(goldCallCount, 1, 'GOLD 호출 자체는 실제로 한 번 일어나야 한다(그래야 롤백 대상이 실제로 생긴다)');
    assert.equal(interrupted.errors.length, 1, '지급 실패는 evaluateAllUsers 요약의 errors로 드러나야 한다');
    assert.equal(interrupted.errors[0].userId, userId);

    const grantCountAfterFailure = await db.AchievementGrant.count({ where: { user_id: userId } });
    assert.equal(grantCountAfterFailure, 0, '보상 지급이 실패하면 achievement_grants도 함께 롤백되어야 한다(부분 지급 금지)');

    const goldLedgerAfterFailure = await getLedgerEntry(userId, 'achievement:record-1-masquerade:GOLD');
    assert.equal(goldLedgerAfterFailure, null, '실패 전에 실제로 쓰인 GOLD 원장 항목도 함께 롤백되어야 한다(부분 지급 흔적 금지)');
    const walletAfterFailure = await getWalletRow(userId);
    assert.equal(walletAfterFailure?.balance_gold ?? 0, 0, '이미 적용됐던 GOLD 잔액 변경도 롤백되어 0으로 남아야 한다');
    assert.equal(walletAfterFailure?.balance_diamond ?? 0, 0);

    const recovered = await achievementRecoveryService.evaluateAllUsers();
    assert.deepEqual(recovered.errors, []);
    const grantedForUser = recovered.grants.find((g) => g.userId === userId)?.achievementIds ?? [];
    assert.ok(grantedForUser.includes('record-1-masquerade'), '복구 실행에서 정상 지급되어야 한다');

    const grantCountAfterRecovery = await db.AchievementGrant.count({ where: { user_id: userId, achievement_id: 'record-1-masquerade' } });
    assert.equal(grantCountAfterRecovery, 1, '실패했던 시도의 흔적이 남아 중복 지급되면 안 된다');

    const walletAfterRecovery = await getWalletRow(userId);
    assert.equal(walletAfterRecovery.balance_gold, 50);
    assert.equal(walletAfterRecovery.balance_diamond, 50);
});

const getEntitlement = async (userId, itemId) =>
    db.sequelize.models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: itemId }, raw: true });

const BACKFILL_SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'backfill-achievements.js');

const observeBackfillProcess = ({ userId = null, pollIntervalMs = 5, maxWaitMs = 20000 } = {}) => new Promise((resolve, reject) => {
    const child = fork(BACKFILL_SCRIPT_PATH, [], {
        env: { ...process.env, DATABASE_URL: TEST_DB_URL },
        stdio: 'ignore',
    });
    let settled = false;
    let stopping = false;
    let failure = null;
    let pollTimer;
    let cleanupTimer;
    const cleanup = () => {
        clearTimeout(deadline);
        clearTimeout(pollTimer);
        clearTimeout(cleanupTimer);
    };
    const finish = (error, result) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(result);
    };
    const stop = (error = null) => {
        if (settled || stopping) return;
        stopping = true;
        failure = error;
        clearTimeout(pollTimer);
        cleanupTimer = setTimeout(() => {
            child.kill('SIGKILL');
            child.unref();
            finish(failure ?? new Error('Backfill child did not exit after SIGKILL'));
        }, 5000);
        child.kill('SIGKILL');
    };
    const deadline = setTimeout(() => stop(new Error('Backfill process exceeded its independent deadline')), maxWaitMs);
    child.once('error', (error) => {
        failure = error;
        stop(error);
    });
    child.once('close', (exitCode, signal) => finish(failure, { exitCode, signal }));
    const poll = async () => {
        if (settled || stopping) return;
        try {
            const count = await db.AchievementGrant.count({ where: { user_id: userId } });
            if (settled || stopping) return;
            if (count >= 1) stop();
            else pollTimer = setTimeout(poll, pollIntervalMs);
        } catch (error) {
            stop(error);
        }
    };
    if (userId) pollTimer = setTimeout(poll, pollIntervalMs);
});

const runBackfillProcess = () => observeBackfillProcess({ maxWaitMs: 60000 });
const runBackfillProcessKillOnFirstGrant = (userId, options = {}) => observeBackfillProcess({ ...options, userId });

const findPartiallyGrantedAchievements = async (userId) => {
    const grants = await db.AchievementGrant.findAll({ where: { user_id: userId }, attributes: ['achievement_id'], raw: true });
    const partial = [];
    for (const { achievement_id: achievementId } of grants) {
        const definition = achievementDefinitions.getAchievementDefinition(achievementId);
        for (const reward of definition.rewards) {
            if (reward.type === 'CURRENCY') {
                // eslint-disable-next-line no-await-in-loop
                const entry = await getLedgerEntry(userId, `achievement:${achievementId}:${reward.currency}`);
                if (!entry || entry.amount !== reward.amount) partial.push(achievementId);
            } else if (reward.type === 'ITEM') {
                // eslint-disable-next-line no-await-in-loop
                const entitlement = await getEntitlement(userId, reward.itemId);
                if (!entitlement) partial.push(achievementId);
            }
        }
    }
    return [...new Set(partial)];
};

test('AC-05: 실제 CLI(backfill-achievements.js) 프로세스를 지급 도중 SIGKILL로 강제 종료해도 부분 지급된 업적이 남지 않고, 다시 실행하면 완전히 복구된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const fillerCount = 120;
    for (let i = 0; i < fillerCount; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await createLocalUser(`filler${i}`);
    }
    const heavyUserId = await createLocalUser('heavy1');
    await persistWins(heavyUserId, 'CITIZEN', 30);

    const { signal } = await runBackfillProcessKillOnFirstGrant(heavyUserId);
    assert.equal(signal, 'SIGKILL', '실제 CLI 자식 프로세스의 강제 종료 신호를 확인해야 한다');

    const grantCountAfterKill = await db.AchievementGrant.count({ where: { user_id: heavyUserId } });
    assert.ok(
        grantCountAfterKill >= 1 && grantCountAfterKill < 9,
        `SIGKILL이 실제로 지급 도중에 도달해야 한다 — 관찰된 grants=${grantCountAfterKill}(기대 범위 1~8)`,
    );

    const partialAfterKill = await findPartiallyGrantedAchievements(heavyUserId);
    assert.deepEqual(partialAfterKill, [], '중단 시점과 무관하게 부분 지급된 업적이 있으면 안 된다');

    const recovery = await runBackfillProcess();
    assert.equal(recovery.signal, null, '복구 실행은 중단 없이 정상 종료되어야 한다');
    assert.equal(recovery.exitCode, 0, '복구 CLI가 오류 없이 성공 종료되어야 한다');

    const grantRows = await db.AchievementGrant.findAll({ where: { user_id: heavyUserId }, attributes: ['achievement_id'], raw: true });
    const grantIds = grantRows.map((g) => g.achievement_id);
    assert.equal(new Set(grantIds).size, grantIds.length, '중복 지급된 업적이 없어야 한다');
    assert.deepEqual(
        [...grantIds].sort(),
        ['noble-win-10', 'noble-win-20', 'noble-win-30', 'record-1-masquerade', 'record-3-first-morning', 'record-4-testimonies', 'record-5-clown-story', 'record-6-dead-mans-leaving', 'record-7-erased-night'].sort(),
        '중단·복구를 거쳐도 30승 계정이 받아야 할 9개 업적이 정확히 전부 지급되어야 한다',
    );

    const wallet = await getWalletRow(heavyUserId);
    assert.equal(wallet.balance_gold, 330, '기록 6개(50G×6=300)+noble-10(10)+noble-20(20)=330');
    assert.equal(wallet.balance_diamond, 340, '기록 6개(50D×6=300)+noble-10(10)+noble-20(30)=340');

    const borderEntitlement = await getEntitlement(heavyUserId, 'profile-border-귀족');
    assert.ok(borderEntitlement, '30승 테두리 소유권이 복구 후 실제로 있어야 한다');

    const partialAfterRecovery = await findPartiallyGrantedAchievements(heavyUserId);
    assert.deepEqual(partialAfterRecovery, [], '복구 후에도 부분 지급된 업적이 없어야 한다');
});
