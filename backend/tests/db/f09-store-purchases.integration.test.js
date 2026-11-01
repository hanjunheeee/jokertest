'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f09-store-purchases-integration-test-secret';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests, migrationRunner,
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
const economyService = require('../../services/economy');
const { CURRENCIES } = economyService;
const catalog = require('../../services/economy/catalog');
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
    const nickname = `${label}${uuid.slice(0, 8 - label.length)}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await hashPassword('correct-horse-battery-1'),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    return uuid;
};

const getWallet = async (userId) => db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
const countEntitlements = async (userId) => db.sequelize.models.EconomyEntitlement.count({ where: { user_id: userId } });
const countLedgerEntries = async (userId) => db.EconomyLedgerEntry.count({ where: { user_id: userId } });
const countPurchaseRequests = async (userId) => db.sequelize.models.EconomyPurchaseRequest.count({ where: { user_id: userId } });

const seedGold = async (userId, amount) => {
    await economyService.grantReward({ userId, amount, reason: 'TEST_SEED', referenceEventId: `seed-gold-${userId}-${crypto.randomUUID()}` });
};
const seedDiamond = async (userId, amount) => {
    await economyService.grantReward({ userId, amount, currency: CURRENCIES.DIAMOND, referenceEventId: `seed-diamond-${userId}-${crypto.randomUUID()}` });
};

test('AC-01: 잔액 부족이면 개별 구매가 실패하고 차감·소유권·거래 기록이 0이다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac1ins');
    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: `p-${userId}` }),
        (error) => error.code === 'INSUFFICIENT_BALANCE',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet ? wallet.balance_gold : 0, 0);
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), 0);
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-01: 미판매(purchasable:false) 상품 구매는 거부되고 부작용이 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac1sale');
    await seedGold(userId, 10000);
    const ledgerBeforeAttempt = await countLedgerEntries(userId);

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: catalog.DEFAULT_PROFILE_PHOTO_ID, referenceEventId: `p-${userId}` }),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000, '거부된 구매는 잔액을 건드리면 안 된다');
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), ledgerBeforeAttempt, '거부된 구매가 원장을 추가하면 안 된다');
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-01: 잘못된(존재하지 않는) 상품 구매는 거부되고 부작용이 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac1bad');
    await seedGold(userId, 10000);
    const ledgerBeforeAttempt = await countLedgerEntries(userId);

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: 'no-such-item-id', referenceEventId: `p-${userId}` }),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000);
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), ledgerBeforeAttempt, '거부된 구매가 원장을 추가하면 안 된다');
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-01: 검증 실패(참조 사건 ID 누락)는 거부되고 부작용이 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac1val');
    await seedGold(userId, 10000);
    const ledgerBeforeAttempt = await countLedgerEntries(userId);

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: '' }),
        (error) => error.code === 'MISSING_REFERENCE_EVENT_ID',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000);
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), ledgerBeforeAttempt, '거부된 구매가 원장을 추가하면 안 된다');
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-01: 기보유 상품 재구매는 거부되고 그 실패 거래 자체는 추가 부작용이 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac1own');
    await seedGold(userId, 10000);

    const first = await economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: `first-${userId}` });
    assert.equal(first.idempotent, false);

    const walletAfterFirst = await getWallet(userId);
    const entitlementsAfterFirst = await countEntitlements(userId);
    const ledgerAfterFirst = await countLedgerEntries(userId);
    const purchaseRequestsAfterFirst = await countPurchaseRequests(userId);

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: `second-${userId}` }),
        (error) => error.code === 'ITEM_ALREADY_OWNED',
    );

    const walletAfterSecond = await getWallet(userId);
    assert.equal(walletAfterSecond.balance_gold, walletAfterFirst.balance_gold, '거부된 재구매가 추가로 차감하면 안 된다');
    assert.equal(await countEntitlements(userId), entitlementsAfterFirst, '거부된 재구매가 소유권을 추가하면 안 된다');
    assert.equal(await countLedgerEntries(userId), ledgerAfterFirst, '거부된 재구매가 원장을 추가하면 안 된다');
    assert.equal(await countPurchaseRequests(userId), purchaseRequestsAfterFirst, '거부된 재구매가 구매 요청 기록을 추가하면 안 된다');
});

test('AC-01: 커밋 전 DB 오류(EconomyPurchaseRequest 기록 실패)는 실제 트랜잭션 전체를 롤백한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac1ddl');
    await seedGold(userId, 10000);
    const ledgerBeforeAttempt = await countLedgerEntries(userId);

    const models = db.sequelize.models;
    const original = models.EconomyPurchaseRequest.create;
    let calls = 0;
    models.EconomyPurchaseRequest.create = function patched(...args) {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error('시뮬레이션된 구매 요청 기록 실패'));
        return original.apply(this, args);
    };
    t.after(() => { models.EconomyPurchaseRequest.create = original; });

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: `ddl-${userId}` }),
        /시뮬레이션된 구매 요청 기록 실패/,
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000, '실제 DB 트랜잭션이 롤백되어 지갑 잔액이 원래대로 남아야 한다');
    assert.equal(await countEntitlements(userId), 0, '롤백된 트랜잭션은 소유권도 남기면 안 된다');
    assert.equal(await countLedgerEntries(userId), ledgerBeforeAttempt, '롤백된 트랜잭션은 원장도 추가하면 안 된다(seedGold의 원장은 그대로 남아 있어야 한다)');
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-02: 모든 품목이 유효하면 일괄 구매가 한 트랜잭션으로 전부 성공한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac2ok');
    await seedGold(userId, 10000);
    const ledgerBeforePurchase = await countLedgerEntries(userId);

    const result = await economyService.purchaseItems({
        userId,
        items: [{ itemId: 'profile-border-남작' }, { itemId: 'player-card-가면' }],
        referenceEventId: `bulk-${userId}`,
    });

    assert.equal(result.idempotent, false);
    assert.equal(result.kind, 'BULK');
    assert.equal(result.results.length, 2);

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000 - 200 - 500);
    assert.equal(await countEntitlements(userId), 2);
    assert.equal(await countLedgerEntries(userId), ledgerBeforePurchase + 2, 'seedGold의 원장 1건 + 품목 2건이어야 한다');
    assert.equal(await countPurchaseRequests(userId), 1);
});

test('AC-02: 한 품목이 구매 불가능하면 일괄 구매 전체가 실패하고 무차감·무지급이다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac2one');
    await seedGold(userId, 10000);
    const ledgerBeforeAttempt = await countLedgerEntries(userId);

    await assert.rejects(
        () => economyService.purchaseItems({
            userId,
            items: [{ itemId: 'profile-border-남작' }, { itemId: 'no-such-item-id' }],
            referenceEventId: `bulk-${userId}`,
        }),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000, '한 품목이라도 실패하면 유효했던 다른 품목도 차감되면 안 된다');
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), ledgerBeforeAttempt, '거부된 묶음이 원장을 추가하면 안 된다');
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-02: 총액이 잔액을 초과하면 일괄 구매 전체가 실패하고 무차감·무지급이다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac2sum');
    await seedGold(userId, 600);
    const ledgerBeforeAttempt = await countLedgerEntries(userId);

    await assert.rejects(
        () => economyService.purchaseItems({
            userId,
            items: [{ itemId: 'profile-border-남작' }, { itemId: 'player-card-가면' }],
            referenceEventId: `bulk-${userId}`,
        }),
        (error) => error.code === 'INSUFFICIENT_BALANCE',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 600, '총액 부족으로 실패한 묶음은 어느 품목도 차감하면 안 된다');
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), ledgerBeforeAttempt, '거부된 묶음이 원장을 추가하면 안 된다');
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-02: 이미 보유한 품목이 섞인 일괄 구매는 다른 유효 품목도 함께 무효화된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac2own');
    await seedGold(userId, 10000);
    await economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: `pre-${userId}` });

    const walletBefore = await getWallet(userId);
    const entitlementsBefore = await countEntitlements(userId);
    const ledgerBefore = await countLedgerEntries(userId);
    const purchaseRequestsBefore = await countPurchaseRequests(userId);

    await assert.rejects(
        () => economyService.purchaseItems({
            userId,
            items: [{ itemId: 'player-card-가면' }, { itemId: 'profile-border-남작' }],
            referenceEventId: `bulk-${userId}`,
        }),
        (error) => error.code === 'ITEM_ALREADY_OWNED',
    );

    const walletAfter = await getWallet(userId);
    assert.equal(walletAfter.balance_gold, walletBefore.balance_gold, '이미 보유한 품목 때문에 실패한 묶음은 다른 유효 품목도 차감하면 안 된다');
    assert.equal(await countEntitlements(userId), entitlementsBefore, '가면도 함께 지급되면 안 된다');
    assert.equal(await countLedgerEntries(userId), ledgerBefore, '거부된 묶음이 원장을 추가하면 안 된다(가면 품목도 롤백되어야 한다)');
    assert.equal(await countPurchaseRequests(userId), purchaseRequestsBefore, '거부된 묶음이 구매 요청 기록을 남기면 안 된다');
});

test('AC-02: 두 번째 품목 지급 단계에서 DB 쓰기가 실패하면 첫 번째 품목의 이미 적용된 차감·원장도 함께 롤백된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac2mid');
    await seedGold(userId, 10000);
    const ledgerBeforeAttempt = await countLedgerEntries(userId);

    const models = db.sequelize.models;
    const original = models.EconomyEntitlement.create;
    let calls = 0;
    models.EconomyEntitlement.create = function patched(...args) {
        calls += 1;
        if (calls === 2) return Promise.reject(new Error('시뮬레이션된 두 번째 품목 지급 실패'));
        return original.apply(this, args);
    };
    t.after(() => { models.EconomyEntitlement.create = original; });

    await assert.rejects(
        () => economyService.purchaseItems({
            userId,
            items: [{ itemId: 'profile-border-남작' }, { itemId: 'player-card-가면' }],
            referenceEventId: `bulk-${userId}`,
        }),
        /시뮬레이션된 두 번째 품목 지급 실패/,
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000, '두 번째 품목 실패가 첫 번째 품목의 이미 적용된 차감도 함께 롤백해야 한다');
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), ledgerBeforeAttempt, '첫 번째 품목의 원장도 함께 롤백되어야 한다(seedGold의 원장만 남아야 한다)');
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-03: 격리 fixture로 GOLD·DIAMOND 혼합 일괄 구매를 검증하고 운영 카탈로그는 변경하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const FIXTURE_GOLD_ITEM_ID = `f09-fixture-gold-${crypto.randomUUID()}`;
    const FIXTURE_DIAMOND_ITEM_ID = `f09-fixture-diamond-${crypto.randomUUID()}`;
    const fixtureItems = {
        [FIXTURE_GOLD_ITEM_ID]: {
            id: FIXTURE_GOLD_ITEM_ID, type: catalog.ITEM_TYPES.SKIN, currency: CURRENCIES.GOLD,
            priceGold: 300, defaultGrant: false, purchasable: true,
        },
        [FIXTURE_DIAMOND_ITEM_ID]: {
            id: FIXTURE_DIAMOND_ITEM_ID, type: catalog.ITEM_TYPES.SKIN, currency: CURRENCIES.DIAMOND,
            priceGold: 50, defaultGrant: false, purchasable: true,
        },
    };
    const originalGetCatalogItem = catalog.getCatalogItem;
    const realBorderItemBefore = originalGetCatalogItem('profile-border-남작');
    const realItemCountBefore = catalog.ALL_ITEMS.length;

    catalog.getCatalogItem = (itemId) => fixtureItems[itemId] ?? originalGetCatalogItem(itemId);
    t.after(() => { catalog.getCatalogItem = originalGetCatalogItem; });

    const userOk = await createLocalUser('ac3ok');
    await seedGold(userOk, 1000);
    await seedDiamond(userOk, 1000);

    const result = await economyService.purchaseItems({
        userId: userOk,
        items: [{ itemId: FIXTURE_GOLD_ITEM_ID }, { itemId: FIXTURE_DIAMOND_ITEM_ID }],
        referenceEventId: `mix-${userOk}`,
    });
    assert.equal(result.kind, 'BULK');
    const walletOk = await getWallet(userOk);
    assert.equal(walletOk.balance_gold, 700);
    assert.equal(walletOk.balance_diamond, 950);
    assert.equal(await countEntitlements(userOk), 2);

    const userGoldShort = await createLocalUser('ac3gold');
    await seedGold(userGoldShort, 100);
    await seedDiamond(userGoldShort, 1000);
    await assert.rejects(
        () => economyService.purchaseItems({
            userId: userGoldShort,
            items: [{ itemId: FIXTURE_GOLD_ITEM_ID }, { itemId: FIXTURE_DIAMOND_ITEM_ID }],
            referenceEventId: `mix-${userGoldShort}`,
        }),
        (error) => error.code === 'INSUFFICIENT_BALANCE',
    );
    const walletGoldShort = await getWallet(userGoldShort);
    assert.equal(walletGoldShort.balance_gold, 100);
    assert.equal(walletGoldShort.balance_diamond, 1000, 'GOLD 부족으로 실패한 묶음은 DIAMOND도 차감하면 안 된다');
    assert.equal(await countEntitlements(userGoldShort), 0);

    const userDiamondShort = await createLocalUser('ac3dia');
    await seedGold(userDiamondShort, 1000);
    await seedDiamond(userDiamondShort, 10);
    await assert.rejects(
        () => economyService.purchaseItems({
            userId: userDiamondShort,
            items: [{ itemId: FIXTURE_GOLD_ITEM_ID }, { itemId: FIXTURE_DIAMOND_ITEM_ID }],
            referenceEventId: `mix-${userDiamondShort}`,
        }),
        (error) => error.code === 'INSUFFICIENT_BALANCE',
    );
    const walletDiamondShort = await getWallet(userDiamondShort);
    assert.equal(walletDiamondShort.balance_gold, 1000, 'DIAMOND 부족으로 실패한 묶음은 GOLD도 차감하면 안 된다');
    assert.equal(walletDiamondShort.balance_diamond, 10);
    assert.equal(await countEntitlements(userDiamondShort), 0);

    assert.equal(catalog.ALL_ITEMS.length, realItemCountBefore);
    const realBorderItemDuring = catalog.getCatalogItem('profile-border-남작');
    assert.deepEqual(realBorderItemDuring, realBorderItemBefore);
});

test('AC-04: 개별 구매가 커밋된 뒤에는 같은 참조 사건 ID 조회·재시도로 재차감 없이 복원된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac4ind');
    await seedGold(userId, 10000);
    const ledgerBeforePurchase = await countLedgerEntries(userId);
    const referenceEventId = `commit-${userId}`;

    const first = await economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId });
    assert.equal(first.idempotent, false);

    const recovered = await economyService.getPurchaseResult(userId, referenceEventId);
    assert.ok(recovered);
    assert.equal(recovered.kind, 'SINGLE');
    assert.equal(recovered.results.length, 1);
    assert.equal(recovered.results[0].item_id, 'profile-border-남작');

    const retry = await economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId });
    assert.equal(retry.idempotent, true);

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000 - 200, '조회·재시도 모두 추가 차감을 일으키면 안 된다');
    assert.equal(await countLedgerEntries(userId), ledgerBeforePurchase + 1, 'seedGold의 원장 1건 + 구매 원장 1건이어야 하며 재시도가 추가로 늘리면 안 된다');
    assert.equal(await countPurchaseRequests(userId), 1);
});

test('AC-04: 커밋 전 오류로 끝난 요청은 조회해도 복원되지 않는다(커밋된 적 없음과 구분)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac4pre');
    const referenceEventId = `precommit-${userId}`;
    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId }),
        (error) => error.code === 'INSUFFICIENT_BALANCE',
    );

    const recovered = await economyService.getPurchaseResult(userId, referenceEventId);
    assert.equal(recovered, null, '커밋 전 오류는 조회해도 성공 결과로 복원되면 안 된다');
});

test('AC-04: 일괄 구매도 커밋 후에는 조회·재시도로 재차감 없이 복원된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac4bulk');
    await seedGold(userId, 10000);
    const referenceEventId = `bulk-commit-${userId}`;

    const first = await economyService.purchaseItems({
        userId,
        items: [{ itemId: 'profile-border-남작' }, { itemId: 'player-card-가면' }],
        referenceEventId,
    });
    assert.equal(first.idempotent, false);

    const recovered = await economyService.getPurchaseResult(userId, referenceEventId);
    assert.ok(recovered);
    assert.equal(recovered.kind, 'BULK');
    assert.equal(recovered.results.length, 2);

    const retry = await economyService.purchaseItems({
        userId,
        items: [{ itemId: 'profile-border-남작' }, { itemId: 'player-card-가면' }],
        referenceEventId,
    });
    assert.equal(retry.idempotent, true);

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000 - 200 - 500);
    assert.equal(await countPurchaseRequests(userId), 1);
});

test('AC-04: 다른 계정의 구매 결과는 조회되지 않는다(계정 범위)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const owner = await createLocalUser('ac4own');
    const stranger = await createLocalUser('ac4str');
    await seedGold(owner, 10000);
    const referenceEventId = `owner-only-${owner}`;
    await economyService.purchaseItem({ userId: owner, itemId: 'profile-border-남작', referenceEventId });

    const asOwner = await economyService.getPurchaseResult(owner, referenceEventId);
    assert.ok(asOwner);
    const asStranger = await economyService.getPurchaseResult(stranger, referenceEventId);
    assert.equal(asStranger, null, '다른 계정 범위에서는 같은 참조 사건 ID 문자열이어도 결과가 보이면 안 된다');
});

const SHOP_EMOTICON_ID = 'emoji-thorned-heart';
const BASIC_EMOTICON_ID = 'emoji-basic-reject';

test('AC-05: 상점 이모티콘 개별 구매는 골드를 차감하고 소유와 원장 1건을 만든다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac5ind');
    await seedGold(userId, 10000);
    const goldBefore = (await getWallet(userId)).balance_gold;
    const entitlementsBefore = await countEntitlements(userId);
    const ledgerBefore = await countLedgerEntries(userId);

    const item = catalog.getCatalogItem(SHOP_EMOTICON_ID);
    assert.equal(item.type, catalog.ITEM_TYPES.EMOTICON);
    assert.equal(item.purchasable, true);

    const result = await economyService.purchaseItem({ userId, itemId: SHOP_EMOTICON_ID, referenceEventId: `emo-${userId}` });
    assert.equal(result.idempotent, false);

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, goldBefore - catalog.EMOTICON_PRICE_GOLD_PLACEHOLDER);
    assert.equal(await countEntitlements(userId), entitlementsBefore + 1);
    assert.equal(await countLedgerEntries(userId), ledgerBefore + 1, '이모티콘 구매 원장이 정확히 1건이어야 한다');
    assert.equal(await countPurchaseRequests(userId), 1);
    const owned = await db.sequelize.models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: SHOP_EMOTICON_ID } });
    assert.ok(owned, '구매한 이모티콘을 소유해야 한다');
    assert.equal(owned.item_type, catalog.ITEM_TYPES.EMOTICON);
});

test('AC-05: 상점 이모티콘이 섞인 일괄 구매는 전체가 성공한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac5bulk');
    await seedGold(userId, 10000);
    const goldBefore = (await getWallet(userId)).balance_gold;
    const entitlementsBefore = await countEntitlements(userId);
    const ledgerBefore = await countLedgerEntries(userId);
    const expectedDeduction = catalog.getCatalogItem('profile-border-남작').priceGold + catalog.EMOTICON_PRICE_GOLD_PLACEHOLDER;

    const result = await economyService.purchaseItems({
        userId,
        items: [{ itemId: 'profile-border-남작' }, { itemId: SHOP_EMOTICON_ID }],
        referenceEventId: `emo-bulk-${userId}`,
    });
    assert.equal(result.kind, 'BULK');
    assert.equal(result.results.length, 2);

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, goldBefore - expectedDeduction);
    assert.equal(await countEntitlements(userId), entitlementsBefore + 2);
    assert.equal(await countLedgerEntries(userId), ledgerBefore + 2, '묶음의 품목마다 원장 1건씩이어야 한다');
    assert.equal(await countPurchaseRequests(userId), 1);
});

test('AC-05: 기본 지급 이모티콘(purchasable:false) 구매는 개별·일괄 모두 거부되고 부작용이 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac5basic');
    await seedGold(userId, 10000);
    const goldBefore = (await getWallet(userId)).balance_gold;
    const entitlementsBefore = await countEntitlements(userId);
    const ledgerBefore = await countLedgerEntries(userId);

    assert.equal(catalog.getCatalogItem(BASIC_EMOTICON_ID).purchasable, false);

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: BASIC_EMOTICON_ID, referenceEventId: `emo-basic-${userId}` }),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );
    await assert.rejects(
        () => economyService.purchaseItems({
            userId,
            items: [{ itemId: SHOP_EMOTICON_ID }, { itemId: BASIC_EMOTICON_ID }],
            referenceEventId: `emo-basic-bulk-${userId}`,
        }),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, goldBefore, '거부된 구매는 골드를 차감하면 안 된다');
    assert.equal(await countEntitlements(userId), entitlementsBefore, '함께 담긴 상점 이모티콘도 지급되면 안 된다');
    assert.equal(await countLedgerEntries(userId), ledgerBefore, '거부된 구매가 원장을 추가하면 안 된다');
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-05: 존재하지 않는 이모티콘 itemId 위조 구매는 거부되고 골드가 차감되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac5fake');
    await seedGold(userId, 10000);
    const goldBefore = (await getWallet(userId)).balance_gold;
    const entitlementsBefore = await countEntitlements(userId);
    const ledgerBefore = await countLedgerEntries(userId);

    for (const forgedId of ['emoji-no-such-emoticon', 'emoticon-웃음']) {
        assert.equal(catalog.getCatalogItem(forgedId), undefined);
        await assert.rejects(
            () => economyService.purchaseItem({ userId, itemId: forgedId, referenceEventId: `emo-fake-${forgedId}-${userId}` }),
            (error) => error.code === 'ITEM_NOT_PURCHASABLE',
        );
    }
    await assert.rejects(
        () => economyService.purchaseItems({
            userId,
            items: [{ itemId: SHOP_EMOTICON_ID }, { itemId: 'emoji-no-such-emoticon' }],
            referenceEventId: `emo-fake-bulk-${userId}`,
        }),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, goldBefore, '위조 구매는 골드를 차감하면 안 된다');
    assert.equal(await countEntitlements(userId), entitlementsBefore);
    assert.equal(await countLedgerEntries(userId), ledgerBefore, '거부된 구매가 원장을 추가하면 안 된다');
    assert.equal(await countPurchaseRequests(userId), 0);
});
