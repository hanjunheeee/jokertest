'use strict';

// F-09 실제 상품 구매(개별·일괄)·표시용 이모티콘 탭 — 실제 MySQL 격리 DB 검증. f01~f08과
// 완전히 같은 원칙·같은 물리 DB(F01_TEST_DATABASE_URL)를 쓴다(backend/tests/helpers/
// isolatedTestDb.js 참고).
//
// 이 파일은 economyService.purchaseItems(개별·일괄 공통 원자적 처리)와
// economyService.getPurchaseResult(커밋 후 응답 유실 복구)가 실제 MySQL 트랜잭션·행 잠금·
// 유일 인덱스 위에서 계획 메모의 구현 계약대로 동작하는지 검증한다:
//   - AC-01: 개별 구매가 잔액 부족·미판매·기보유·잘못된 상품·검증 실패·커밋 전 DB 오류
//     중 하나로 실패하면 그 거래의 차감·지급·성공 거래 기록이 모두 0이다.
//   - AC-02: 일괄 구매는 한 품목이라도 실패하거나 총액이 부족하면 묶음 전체가 실패해
//     무차감·무지급·거래 기록 0이다(품목별 독립 커밋 없음).
//   - AC-03: GOLD·DIAMOND 혼합 일괄 구매를 "격리 fixture"(catalog.getCatalogItem을
//     테스트 동안만 몽키패치)로 검증한다 — 운영 카탈로그(catalog.ALL_ITEMS)에는 아무것도
//     추가하지 않는다.
//   - AC-04: 커밋 후 응답 유실은 같은 참조 사건 ID로 조회·재시도하면 기존 성공이 복원되고
//     재차감되지 않으며, 커밋 전 오류(애초에 커밋된 적 없음)와 구분된다.
//   - AC-05: 표시용 이모티콘(purchasable:false) 구매 요청은 개별·일괄 모두 거부되고
//     부작용이 없다.

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

const MIGRATIONS = [
    baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory,
    addSocialAuth, addEconomy, addEconomyPurchaseRequests,
];
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
    if (connectionError) {
        t.skip(`격리 DB(${TEST_DB_URL.replace(/:[^:@]*@/, ':***@')})에 연결할 수 없습니다 — 미검증: ${connectionError.message}`);
        return true;
    }
    return false;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

// require 캐시 싱글턴이라, 파일 맨 위에서 맞춰둔 process.env.DATABASE_URL로 처음
// require되는 이 시점에 격리 DB에 연결된다(f08과 같은 이유).
const db = require('../../models');
const economyService = require('../../service/economy.service');
const { CURRENCIES } = economyService;
const catalog = require('../../economy/catalog');
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

// ── AC-01: 개별 구매 실패 사유별 무효과 ──────────────────────────────────────

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

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: catalog.DEFAULT_PROFILE_PHOTO_ID, referenceEventId: `p-${userId}` }),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000, '거부된 구매는 잔액을 건드리면 안 된다');
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), 0);
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-01: 잘못된(존재하지 않는) 상품 구매는 거부되고 부작용이 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac1bad');
    await seedGold(userId, 10000);

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: 'no-such-item-id', referenceEventId: `p-${userId}` }),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000);
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), 0);
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-01: 검증 실패(참조 사건 ID 누락)는 거부되고 부작용이 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac1val');
    await seedGold(userId, 10000);

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: '' }),
        (error) => error.code === 'MISSING_REFERENCE_EVENT_ID',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000);
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), 0);
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

    // F-09가 새로 도입한 경로(품목별 applyLedgerTransaction 성공 이후에도 최종
    // EconomyPurchaseRequest 기록이 실패하면 전체가 롤백되어야 한다)를 실제 DB 트랜잭션
    // 위에서 검증한다 — f08의 EconomyLedgerEntry.create 실패 시험과 같은 기법이지만,
    // 대상이 이 슬라이스의 새 테이블이라는 점이 다르다.
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
    assert.equal(await countLedgerEntries(userId), 0, '롤백된 트랜잭션은 원장도 남기면 안 된다');
    assert.equal(await countPurchaseRequests(userId), 0);
});

// ── AC-02: 일괄 구매 원자성 ───────────────────────────────────────────────────

test('AC-02: 모든 품목이 유효하면 일괄 구매가 한 트랜잭션으로 전부 성공한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac2ok');
    await seedGold(userId, 10000);

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
    assert.equal(await countLedgerEntries(userId), 2);
    assert.equal(await countPurchaseRequests(userId), 1);
});

test('AC-02: 한 품목이 구매 불가능하면 일괄 구매 전체가 실패하고 무차감·무지급이다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac2one');
    await seedGold(userId, 10000);

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
    assert.equal(await countLedgerEntries(userId), 0);
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-02: 총액이 잔액을 초과하면 일괄 구매 전체가 실패하고 무차감·무지급이다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac2sum');
    // 남작(200) + 가면(500) = 700, 하지만 잔액은 600뿐이다.
    await seedGold(userId, 600);

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
    assert.equal(await countLedgerEntries(userId), 0);
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
});

test('AC-02: 두 번째 품목 지급 단계에서 DB 쓰기가 실패하면 첫 번째 품목의 이미 적용된 차감·원장도 함께 롤백된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac2mid');
    await seedGold(userId, 10000);

    // 첫 번째 품목(남작)은 applyLedgerTransaction까지 정상적으로 끝나 지갑 UPDATE·원장
    // INSERT가 "이 트랜잭션 안에서는" 이미 반영된 상태다. 두 번째 품목(가면)의 소유권
    // 부여 단계에서 실패를 주입해, 품목별 독립 커밋이 없고 전체가 하나의 트랜잭션으로
    // 묶여 있는지 확인한다 — 실패하면 첫 번째 품목의 차감·원장도 함께 롤백되어야 한다.
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
    assert.equal(await countLedgerEntries(userId), 0, '첫 번째 품목의 원장도 함께 롤백되어야 한다');
    assert.equal(await countPurchaseRequests(userId), 0);
});

// ── AC-03: GOLD·DIAMOND 혼합 일괄 구매(격리 fixture, 운영 카탈로그 불변) ──────

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

    // 성공 경로: 두 재화 모두 충분하다.
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

    // GOLD만 부족 — 묶음 전체 실패, 두 재화 모두 무차감.
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

    // DIAMOND만 부족 — 묶음 전체 실패, 두 재화 모두 무차감.
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

    // 운영 카탈로그 자체는 이 시험 동안에도 변경되지 않았어야 한다.
    assert.equal(catalog.ALL_ITEMS.length, realItemCountBefore);
    const realBorderItemDuring = catalog.getCatalogItem('profile-border-남작');
    assert.deepEqual(realBorderItemDuring, realBorderItemBefore);
});

// ── AC-04: 커밋 후 응답 유실 복구 vs 커밋 전 오류 구분 ────────────────────────

test('AC-04: 개별 구매가 커밋된 뒤에는 같은 참조 사건 ID 조회·재시도로 재차감 없이 복원된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac4ind');
    await seedGold(userId, 10000);
    const referenceEventId = `commit-${userId}`;

    const first = await economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId });
    assert.equal(first.idempotent, false);

    // "응답 유실"을 흉내낸다 — 클라이언트는 first의 응답을 못 받았다고 가정하고, 같은
    // 참조 사건 ID로 결과를 조회한다.
    const recovered = await economyService.getPurchaseResult(userId, referenceEventId);
    assert.ok(recovered);
    assert.equal(recovered.kind, 'SINGLE');
    assert.equal(recovered.results.length, 1);
    assert.equal(recovered.results[0].item_id, 'profile-border-남작');

    // 같은 참조 사건 ID로 재시도해도(재전송) 재차감되지 않는다.
    const retry = await economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId });
    assert.equal(retry.idempotent, true);

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000 - 200, '조회·재시도 모두 추가 차감을 일으키면 안 된다');
    assert.equal(await countLedgerEntries(userId), 1);
    assert.equal(await countPurchaseRequests(userId), 1);
});

test('AC-04: 커밋 전 오류로 끝난 요청은 조회해도 복원되지 않는다(커밋된 적 없음과 구분)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac4pre');
    // 잔액 없이 시도 — 커밋 전(지갑 잠금 이후 잔액 검증 단계)에 실패해 아무것도 저장되지 않는다.
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

// ── AC-05: 표시용 이모티콘 구매 거부 ──────────────────────────────────────────

test('AC-05: 표시용 이모티콘 개별 구매는 거부되고 부작용이 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac5ind');
    await seedGold(userId, 10000);

    const emoticonItem = catalog.ALL_ITEMS.find((item) => item.type === catalog.ITEM_TYPES.EMOTICON);
    assert.ok(emoticonItem, '카탈로그에 표시용 이모티콘 항목이 있어야 한다');
    assert.equal(emoticonItem.purchasable, false);

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: emoticonItem.id, referenceEventId: `emo-${userId}` }),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000);
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), 0);
    assert.equal(await countPurchaseRequests(userId), 0);
});

test('AC-05: 이모티콘이 섞인 일괄 구매는 조작된 요청이어도 전체가 거부되고, 함께 담긴 정상 상품도 지급되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac5bulk');
    await seedGold(userId, 10000);
    const emoticonItem = catalog.ALL_ITEMS.find((item) => item.type === catalog.ITEM_TYPES.EMOTICON);

    await assert.rejects(
        () => economyService.purchaseItems({
            userId,
            items: [{ itemId: 'profile-border-남작' }, { itemId: emoticonItem.id }],
            referenceEventId: `emo-bulk-${userId}`,
        }),
        (error) => error.code === 'ITEM_NOT_PURCHASABLE',
    );

    const wallet = await getWallet(userId);
    assert.equal(wallet.balance_gold, 10000, '이모티콘이 섞인 조작된 묶음은 정상 상품도 지급하면 안 된다');
    assert.equal(await countEntitlements(userId), 0);
    assert.equal(await countLedgerEntries(userId), 0);
    assert.equal(await countPurchaseRequests(userId), 0);
});
