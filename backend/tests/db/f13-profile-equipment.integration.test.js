'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f13-profile-equipment-integration-test-secret';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const addEconomyLoadoutRevision = require('../../db/migrations/0010-add-economy-loadout-revision');
const {
    buildManagedSchema, resetManagedSchema, resetManagedData, findNonEmptyManagedTables,
} = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests, migrationRunner,
});

let sequelize;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    await sequelize.authenticate();
});

test.after(async () => {
    if (sequelize) await sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    return false;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

const DATA_TABLES = DROP_ORDER.filter((table) => table !== migrationRunner.META_TABLE);

const db = require('../../models');
const economyService = require('../../service/economy.service');
const { hashPassword } = require('../../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

let schemaState = 'unknown';

const fixtureCost = { rebuilds: 0, cleans: 0, schemaMs: 0, dataMs: 0 };

const REAL_LOADOUT_UPDATE = db.sequelize.models.EconomyLoadout.prototype.update;

const resetRuntimeFixtures = () => {
    db.sequelize.models.EconomyLoadout.prototype.update = REAL_LOADOUT_UPDATE;
};

const rebuildSchema = async () => {
    const startedAt = performance.now();
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    fixtureCost.rebuilds += 1;
    fixtureCost.schemaMs += performance.now() - startedAt;
    schemaState = 'migrated';
};

const beginCase = (t, mode, setupMs) => {
    const startedAt = performance.now();
    t.after(() => {
        t.diagnostic(
            `[f13-fixture] mode=${mode} setup=${setupMs.toFixed(1)}ms body=${(performance.now() - startedAt).toFixed(1)}ms`,
        );
    });
};

const setUp = async (t) => {
    const startedAt = performance.now();
    let mode = 'clean-data';

    if (schemaState !== 'migrated') {
        await rebuildSchema();
        mode = 'rebuilt';
    } else {
        const cleanStartedAt = performance.now();
        const result = await resetManagedData(sequelize, TEST_DB_URL, {
            managedTables: MANAGED_TABLES,
            dropOrder: DROP_ORDER,
            keepTables: [migrationRunner.META_TABLE],
        });
        if (!result.cleaned) {
            await rebuildSchema();
            mode = `rebuilt-missing:${result.missingTables.join(',')}`;
        } else {
            fixtureCost.cleans += 1;
            fixtureCost.dataMs += performance.now() - cleanStartedAt;
        }
    }

    assert.deepEqual(
        await findNonEmptyManagedTables(sequelize, DATA_TABLES), [],
        '앞 케이스의 행이 남아 있으면 이 케이스의 단정은 의미가 없다',
    );

    await addEconomyLoadoutRevision.verify(sequelize.getQueryInterface());

    resetRuntimeFixtures();
    beginCase(t, mode, performance.now() - startedAt);
};

test.after(() => {
    if (!TEST_DB_URL) return;
    console.log(
        `# [f13-fixture] 전체 재구축 ${fixtureCost.rebuilds}회 ${fixtureCost.schemaMs.toFixed(0)}ms · `
        + `데이터 격리 ${fixtureCost.cleans}회 ${fixtureCost.dataMs.toFixed(0)}ms`,
    );
});

test.afterEach(() => {
    resetRuntimeFixtures();
});

let sharedPasswordHash = null;
const testPasswordHash = async () => {
    if (sharedPasswordHash === null) sharedPasswordHash = await hashPassword('correct-horse-battery-1');
    return sharedPasswordHash;
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, 8 - label.length)}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await testPasswordHash(),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    return uuid;
};

const countRows = async (model, where = {}) => await model.count({ where });

test('격리: 데이터 정리는 프로필·경제 행을 실제로 비우고 스키마·외래 키·이관 이력은 남긴다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13iso');
    await db.UserStats.create({ user_id: userId });
    await db.UserSession.create({ id: `session-${userId}`, user_id: userId, is_online: true });
    await economyService.grantReward({ userId, amount: 100, reason: 'F13_ISOLATION_SEED', referenceEventId: `f13-iso:${userId}` });
    const revision = (await economyService.getWalletSummary(userId)).loadout.revision;
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-귀족', itemType: 'PROFILE_BORDER', referenceEventId: `f13-iso-ach:${userId}` });
    await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-귀족', expectedRevision: revision });

    const populated = [
        [db.User, 'users'], [db.UserStats, 'user_stats'], [db.UserSession, 'user_sessions'],
        [db.sequelize.models.EconomyWallet, 'economy_wallets'],
        [db.sequelize.models.EconomyLedgerEntry, 'economy_ledger_entries'],
        [db.sequelize.models.EconomyEntitlement, 'economy_entitlements'],
        [db.sequelize.models.EconomyLoadout, 'economy_loadouts'],
    ];
    for (const [model, table] of populated) {
        assert.ok(
            await countRows(model) > 0,
            `${table}에 행이 없으면 이 시험은 정리를 검증하는 것이 아니라 빈 DB를 확인하는 것이 된다`,
        );
    }

    const result = await resetManagedData(sequelize, TEST_DB_URL, {
        managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER,
        keepTables: [migrationRunner.META_TABLE],
    });
    assert.equal(result.cleaned, true);
    assert.deepEqual(
        result.deleted, DATA_TABLES,
        '관리 테이블 하나라도 빼놓으면 다음 케이스가 남은 행을 물려받는다',
    );

    assert.deepEqual(await findNonEmptyManagedTables(sequelize, DATA_TABLES), []);

    const [history] = await sequelize.query(
        `SELECT COUNT(*) AS applied_count FROM ${migrationRunner.META_TABLE} WHERE status = 'applied'`,
    );
    assert.equal(
        Number(history[0].applied_count), MIGRATIONS.length,
        '데이터 정리가 이관 이력을 지우면 다음 실행이 이미 있는 스키마에 다시 이관을 시도한다',
    );
    await assert.doesNotReject(() => addEconomyLoadoutRevision.verify(sequelize.getQueryInterface()));

    await assert.rejects(
        () => db.sequelize.models.EconomyEntitlement.create({
            user_id: crypto.randomUUID(), item_id: 'player-profile-기사', item_type: 'PROFILE_PHOTO', source: 'TEST',
        }),
        (error) => error.name === 'SequelizeForeignKeyConstraintError',
        '정리 뒤에도 없는 계정의 보유 항목은 외래 키가 막아야 한다',
    );

    const nextUser = await createLocalUser('f13iso2');
    const summary = await economyService.getWalletSummary(nextUser);
    assert.equal(summary.loadout.selectedProfileBorderId, 'profile-border-평민');
    assert.equal(
        await countRows(db.sequelize.models.EconomyEntitlement, { user_id: nextUser, item_type: 'PROFILE_PHOTO' }), 16,
        '앞 계정의 흔적 없이 기본 16종이 이 계정에 새로 지급되어야 한다',
    );
});

test('AC-03: 동시에 최초 조회해도 기본 프로필 16종·평민 테두리가 중복 없이 정확히 한 번씩 지급된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13def');
    await Promise.all([
        economyService.getWalletSummary(userId),
        economyService.getWalletSummary(userId),
        economyService.getWalletSummary(userId),
    ]);

    const entitlements = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId } });
    const photoIds = entitlements.filter((e) => e.item_type === 'PROFILE_PHOTO').map((e) => e.item_id);
    const borderIds = entitlements.filter((e) => e.item_type === 'PROFILE_BORDER').map((e) => e.item_id);
    assert.equal(new Set(photoIds).size, 16, '기본 사진 16종이 중복 없이 지급되어야 한다');
    assert.equal(photoIds.length, 16, '동시 조회로 사진이 중복 지급되면 안 된다');
    assert.deepEqual(borderIds, ['profile-border-평민']);

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-금빛가면');
    assert.equal(loadout.selected_profile_border_id, 'profile-border-평민');
});

const currentRevision = async (userId) => (await economyService.getWalletSummary(userId)).loadout.revision;

test('AC-01/AC-02: 사진·테두리를 함께 확정하면 실제 DB에 한 번의 UPDATE로 두 컬럼과 revision이 함께 반영된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13both');
    const expectedRevision = await currentRevision(userId);
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-귀족', itemType: 'PROFILE_BORDER', referenceEventId: `grant-${userId}` });

    const result = await economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', borderItemId: 'profile-border-귀족', expectedRevision });
    assert.notEqual(result.revision, expectedRevision, '성공적인 확정은 실제 DB에서도 새 revision을 받아야 한다');

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-기사');
    assert.equal(loadout.selected_profile_border_id, 'profile-border-귀족');
    assert.equal(loadout.revision, result.revision);
});

test('AC-01: 두 슬롯 중 하나가 미보유면 실제 DB에도 두 슬롯 모두 저장되지 않는다(부분 저장 없음)', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13part');
    const expectedRevision = await currentRevision(userId);

    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', borderItemId: 'profile-border-귀족', expectedRevision }),
        (error) => error.status === 403 && error.code === 'ITEM_NOT_OWNED',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-금빛가면', '거부된 요청이 사진 슬롯을 바꾸면 안 된다(기존 기본값 유지)');
    assert.equal(loadout.selected_profile_border_id, 'profile-border-평민', '거부된 요청이 테두리 슬롯을 바꾸면 안 된다(기존 기본값 유지)');
    assert.equal(loadout.revision, expectedRevision, '거부된 요청은 revision도 바꾸면 안 된다');
});

test('AC-01: 상품 종류가 슬롯과 맞지 않으면(테두리를 사진 슬롯에) 실제 DB에서도 거부되고 아무것도 저장되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13type');
    const expectedRevision = await currentRevision(userId);

    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId, photoItemId: 'profile-border-평민', expectedRevision }),
        (error) => error.status === 400 && error.code === 'ITEM_TYPE_MISMATCH',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-금빛가면');
});

test('AC-01: 동시에 서로 다른 값으로 확정 요청이 들어와도 실제 행 잠금 아래에서 마지막으로 커밋된 값만 남는다(중간값 없음)', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13race');
    await economyService.getWalletSummary(userId);
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-귀족', itemType: 'PROFILE_BORDER', referenceEventId: `grant-${userId}` });

    const photoRevision = await currentRevision(userId);
    await economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision: photoRevision });
    const borderRevision = await currentRevision(userId);
    await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-귀족', expectedRevision: borderRevision });

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-기사');
    assert.equal(loadout.selected_profile_border_id, 'profile-border-귀족');
});

test('AC-02(A-01): 같은 오래된 revision을 들고 실제 DB 위에서 동시에 경쟁하는 두 확정 중 정확히 하나만 성공하고 나머지는 409로 거부된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13casrace');
    await economyService.getWalletSummary(userId);
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-귀족', itemType: 'PROFILE_BORDER', referenceEventId: `grant-${userId}` });
    const revision = await currentRevision(userId);

    const results = await Promise.allSettled([
        economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision: revision }),
        economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-귀족', expectedRevision: revision }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, '실제 행 잠금 아래에서도 같은 오래된 revision으로 경쟁하는 두 확정 중 정확히 하나만 성공해야 한다');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'PROFILE_REVISION_CONFLICT');
});

test('AC-02(설계 감사, 2026-09-11): clientIntentAt은 더 이상 순서 판정에 쓰이지 않는다 — 실제 DB에서도 겹치지 않는 순차 확정은 나중 호출이 이전 값을 정상 대체한다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13intent');
    await economyService.getWalletSummary(userId);
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-귀족', itemType: 'PROFILE_BORDER', referenceEventId: `grant-${userId}` });

    const revision1 = await currentRevision(userId);
    const afterFirst = await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-평민', expectedRevision: revision1, clientIntentAt: 9999 });
    const result = await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-귀족', expectedRevision: afterFirst.revision, clientIntentAt: 1 });

    assert.equal(result.selected_profile_border_id, 'profile-border-귀족', 'clientIntentAt 값과 무관하게 나중에 호출된(올바른 revision을 제공한) 확정이 이전 값을 정상적으로 대체해야 한다');
    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_border_id, 'profile-border-귀족', '실제 DB에 영속된 최종 상태도 마지막 호출의 값이어야 한다');
});

test('AC-03: 업적으로 테두리를 지급받은 직후 getPublicProfileLoadouts 대상에는 포함되지 않지만(장착 전) equipProfileAppearance로 즉시 장착할 수 있다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13ach');
    const expectedRevision = await currentRevision(userId);
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-광대', itemType: 'PROFILE_BORDER', referenceEventId: `ach-${userId}` });

    const loadout = await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-광대', expectedRevision });
    assert.equal(loadout.selected_profile_border_id, 'profile-border-광대');
});

test('AC-04: 서로 다른 두 계정의 공개 loadout은 독립적으로 복원되고 서로 섞이지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userA = await createLocalUser('f13usra');
    const userB = await createLocalUser('f13usrb');
    const revisionA = await currentRevision(userA);
    const revisionB = await currentRevision(userB);
    await economyService.equipProfileAppearance({ userId: userA, photoItemId: 'player-profile-기사', expectedRevision: revisionA });
    await economyService.equipProfileAppearance({ userId: userB, photoItemId: 'player-profile-드워프', expectedRevision: revisionB });

    const result = await economyService.getPublicProfileLoadouts([userA, userB]);
    assert.equal(result[userA].profilePhotoId, 'player-profile-기사');
    assert.equal(result[userB].profilePhotoId, 'player-profile-드워프');
    assert.equal(result[userA].profileBorderId, 'profile-border-평민');
    assert.equal(result[userB].profileBorderId, 'profile-border-평민');
});
