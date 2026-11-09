'use strict';

// 상점 구매 이상한 순서·동시 시험 파일, 진짜 시험 DB에서 창 여러 개·같은 요청 다시 보내기·중간 실패 뒤 다시 보내기
// 보는 것: 돈은 한 번만 빠지고 0 밑으로 안 감, 지갑 = 장부 합, 진 요청은 아무것도 안 남김
// npm run test:with-db -- tests/db/store-odd-purchase.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb } = require('../admin/helpers/adminTestApp');
const money = require('../admin/helpers/money');

let dbHandle = null;

const GOLD_PRODUCT = Object.freeze({
    product_id: 'odd-gold-1', kind: 'GOLD_PURCHASE', display_name: '시험용 골드 상품(odd)',
    pay_currency: 'DIAMOND', pay_amount: 30, grant_currency: 'GOLD', grant_amount: 100, bonus_amount: 10,
    status: 'ON_SALE', sort_order: 0, version: 1,
});

// 시험 DB 처음 모양 + 골드 상품 한 줄 (파일 하나에 한 번, 사람은 시험마다 새로 만들어 서로 안 섞임)
test.before(async () => {
    dbHandle = await prepareAdminDb();
    if (!dbHandle) return;
    await dbHandle.sequelize.query(
        `INSERT INTO economy_currency_products
           (product_id, kind, display_name, pay_currency, pay_amount, grant_currency, grant_amount, bonus_amount, status, sort_order, version, created_at, updated_at)
         VALUES (:product_id, :kind, :display_name, :pay_currency, :pay_amount, :grant_currency, :grant_amount, :bonus_amount, :status, :sort_order, :version, NOW(), NOW())`,
        { replacements: GOLD_PRODUCT },
    );
});
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const economy = require('../../services/economy');

const BARON = 'profile-border-남작'; // 200
const MASK = 'player-card-가면'; // 500
const CHAIN = 'player-card-사슬'; // 500

// 500골드짜리 서로 다른 상품 10개 (스킨 5 + 카드 5)
const FIVE_HUNDRED_ITEMS = [
    'player-skin-경비원1-바이올렛', 'player-skin-경비원2-푸른서리', 'player-skin-광대1-불멸', 'player-skin-광대2-카오스', 'player-skin-귀족1-블러드',
    'player-card-가고일', 'player-card-가면', 'player-card-그레이', 'player-card-모래시계', 'player-card-보석',
];

const ref = (label) => `${label}-${crypto.randomBytes(6).toString('hex')}`;
const ownedIds = async (userId) => (await db().sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId }, raw: true }))
    .map((row) => row.item_id).sort();
const requestCount = (userId) => db().sequelize.models.EconomyPurchaseRequest.count({ where: { user_id: userId } });
const fulfilled = (results) => results.filter((r) => r.status === 'fulfilled');
const rejected = (results) => results.filter((r) => r.status === 'rejected');
const codesOf = (results) => rejected(results).map((r) => r.reason?.code ?? `(코드 없음: ${r.reason?.message})`);

// 장부 잔액이 한 번도 0 밑으로 안 갔는지
const assertNeverNegative = (entries) => {
    for (const entry of entries) assert.ok(Number(entry.balance_after) >= 0, `장부 ${entry.id} 잔액 ${entry.balance_after}`);
};

// 상태가 될 때까지 짧게 거듭 확인 (시간으로 기다리지 않음), 끝까지 안 되면 false
const waitUntil = async (check, timeoutMs = 15_000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        if (await check()) return true;
        await new Promise((resolve) => { setImmediate(resolve); });
    }
    return false;
};

test('동시: 창 둘에서 묶음 구매가 아이템 하나(가면) 겹치면 → 한쪽만 통째로 되고 다른 쪽은 하나도 안 남음', async (t) => {
    if (skipWithoutDb(t)) return;
    const member = await money.createMember('a1');
    await money.fund(member.uuid, 'GOLD', 5000);

    const results = await Promise.allSettled([
        economy.purchaseItems({ userId: member.uuid, items: [{ itemId: BARON }, { itemId: MASK }], referenceEventId: ref('w1') }),
        economy.purchaseItems({ userId: member.uuid, items: [{ itemId: MASK }, { itemId: CHAIN }], referenceEventId: ref('w2') }),
    ]);

    assert.equal(fulfilled(results).length, 1, `결과: ${JSON.stringify(codesOf(results))}`);
    assert.deepEqual(codesOf(results), ['ITEM_ALREADY_OWNED']);
    const firstWon = results[0].status === 'fulfilled';
    const expectedItems = (firstWon ? [BARON, MASK] : [MASK, CHAIN]).sort();
    assert.deepEqual(await ownedIds(member.uuid), expectedItems, '진 쪽 아이템은 하나도 안 생김');
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 5000 - (firstWon ? 700 : 1000));
    assert.equal(entries.filter((e) => e.reason === 'PURCHASE').length, 2);
    assert.equal(await requestCount(member.uuid), 1);
});

test('동시·끝값: 3개 살 골드(1500)로 서로 다른 500골드 상품 10개를 창 10개에서 동시에 → 딱 3개만, 잔액 0, 음수 없음', async (t) => {
    if (skipWithoutDb(t)) return;
    const member = await money.createMember('a2');
    await money.fund(member.uuid, 'GOLD', 1500);

    const results = await Promise.allSettled(FIVE_HUNDRED_ITEMS.map((itemId, i) => economy.purchaseItem({
        userId: member.uuid, itemId, referenceEventId: ref(`win${i}`),
    })));

    assert.equal(fulfilled(results).length, 3, `결과: ${JSON.stringify(codesOf(results))}`);
    assert.deepEqual([...new Set(codesOf(results))], ['INSUFFICIENT_BALANCE']);
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 0);
    assertNeverNegative(entries);
    assert.equal((await ownedIds(member.uuid)).length, 3);
    assert.equal(await requestCount(member.uuid), 3);
});

test('이상한 순서: 골드 모자라 실패 → 골드 받음 → 같은 참조 id로 다시 → 이번엔 사지고, 또 보내면 처음 성공 결과 그대로', async (t) => {
    if (skipWithoutDb(t)) return;
    const member = await money.createMember('a3');
    await money.fund(member.uuid, 'GOLD', 100);
    const referenceEventId = ref('retry');

    await assert.rejects(
        economy.purchaseItem({ userId: member.uuid, itemId: BARON, referenceEventId }),
        (error) => error.code === 'INSUFFICIENT_BALANCE',
    );
    assert.equal(await economy.getPurchaseResult(member.uuid, referenceEventId), null, '실패한 요청은 결과로 안 남음');

    await money.fund(member.uuid, 'GOLD', 150);
    const second = await economy.purchaseItem({ userId: member.uuid, itemId: BARON, referenceEventId });
    const third = await economy.purchaseItem({ userId: member.uuid, itemId: BARON, referenceEventId });

    assert.equal(second.idempotent, false);
    assert.equal(third.idempotent, true);
    assert.equal(String(third.ledgerEntry.id), String(second.ledgerEntry.id));
    const { wallet } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 50);
    assert.deepEqual(await ownedIds(member.uuid), [BARON]);
});

test('동시: 같은 참조 id로 서로 다른 아이템을 두 창에서 같이 사면 → 한쪽만 빠지고 다른 쪽은 409 REFERENCE_EVENT_CONFLICT', async (t) => {
    if (skipWithoutDb(t)) return;
    const member = await money.createMember('a4');
    await money.fund(member.uuid, 'GOLD', 2000);
    const referenceEventId = ref('same');

    const results = await Promise.allSettled([
        economy.purchaseItem({ userId: member.uuid, itemId: BARON, referenceEventId }),
        economy.purchaseItem({ userId: member.uuid, itemId: MASK, referenceEventId }),
    ]);

    assert.equal(fulfilled(results).length, 1, `결과: ${JSON.stringify(codesOf(results))}`);
    assert.deepEqual(codesOf(results), ['REFERENCE_EVENT_CONFLICT']);
    const winner = results[0].status === 'fulfilled' ? BARON : MASK;
    assert.deepEqual(await ownedIds(member.uuid), [winner]);
    const { wallet } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 2000 - (winner === BARON ? 200 : 500));
    const stored = await economy.getPurchaseResult(member.uuid, referenceEventId);
    assert.equal(stored.results[0].item_id, winner, '결과 묻기는 이긴 쪽 결과');
});

test('동시: 같은 참조 id 묶음 구매를 아이템 순서만 바꿔 창 5개에서 같이 → 한 번만 빠지고 다섯 다 같은 장부 결과', async (t) => {
    if (skipWithoutDb(t)) return;
    const member = await money.createMember('a5');
    await money.fund(member.uuid, 'GOLD', 3000);
    const referenceEventId = ref('bulk');
    const orders = [[BARON, MASK], [MASK, BARON], [BARON, MASK], [MASK, BARON], [BARON, MASK]];

    const results = await Promise.allSettled(orders.map((ids) => economy.purchaseItems({
        userId: member.uuid, items: ids.map((itemId) => ({ itemId })), referenceEventId,
    })));

    assert.equal(fulfilled(results).length, 5, `결과: ${JSON.stringify(codesOf(results))}`);
    const values = fulfilled(results).map((r) => r.value);
    assert.equal(values.filter((v) => v.idempotent === false).length, 1);
    const idSets = values.map((v) => v.results.map((e) => String(e.id)).sort().join(','));
    assert.equal(new Set(idSets).size, 1, '다섯 다 같은 장부 줄');
    const { wallet } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 2300);
    assert.equal(await requestCount(member.uuid), 1);
});

test('동시: 한 창은 테두리(골드)를, 다른 창은 금화(다이아→골드)를 같이 사면 → 골드 구매는 늘 되고, 테두리는 순서 따라 되거나 잔액 부족, 지갑 = 장부', async (t) => {
    if (skipWithoutDb(t)) return;
    // 순서가 둘 다 나오게 몇 번 돌림 (어느 순서여도 맞아야 함)
    for (let round = 0; round < 4; round += 1) {
        const member = await money.createMember('a6');
        await money.fund(member.uuid, 'GOLD', 150);
        await money.fund(member.uuid, 'DIAMOND', 30);

        const [item, gold] = await Promise.allSettled([
            economy.purchaseItem({ userId: member.uuid, itemId: BARON, referenceEventId: ref('item') }),
            economy.purchaseGold({ userId: member.uuid, productId: GOLD_PRODUCT.product_id, version: 1, referenceEventId: ref('gold') }),
        ]);

        assert.equal(gold.status, 'fulfilled', `골드 구매 실패: ${gold.reason?.code} ${gold.reason?.message}`);
        if (item.status === 'rejected') assert.equal(item.reason.code, 'INSUFFICIENT_BALANCE', item.reason.message);
        const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
        assertNeverNegative(entries);
        assert.equal(wallet.diamond, 0);
        assert.equal(wallet.gold, item.status === 'fulfilled' ? 60 : 260);
        assert.deepEqual(await ownedIds(member.uuid), item.status === 'fulfilled' ? [BARON] : []);
    }
});

test('중간 실패 + 다시: 묶음 구매 중 두 번째 보유 쓰기가 실패해 다 되돌려진 뒤, 같은 참조 id를 창 3개에서 같이 다시 → 한 번만 빠짐', async (t) => {
    if (skipWithoutDb(t)) return;
    const member = await money.createMember('a7');
    await money.fund(member.uuid, 'GOLD', 1000);
    const referenceEventId = ref('fail');
    const items = [{ itemId: BARON }, { itemId: MASK }];

    // 보유 행 두 번째 쓰기에서 DB 오류 (첫 아이템 골드는 이미 빠진 뒤)
    const model = db().sequelize.models.EconomyEntitlement;
    const original = model.create;
    let calls = 0;
    model.create = async function patched(values, options) {
        calls += 1;
        if (calls === 2) throw new Error('주입된 보유 쓰기 실패');
        return original.call(this, values, options);
    };
    t.after(() => { model.create = original; });

    await assert.rejects(economy.purchaseItems({ userId: member.uuid, items, referenceEventId }), /주입된 보유 쓰기 실패/);
    model.create = original;
    {
        const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
        assert.equal(wallet.gold, 1000, '반만 빠지지 않음');
        assert.equal(entries.length, 1);
        assert.deepEqual(await ownedIds(member.uuid), []);
        assert.equal(await economy.getPurchaseResult(member.uuid, referenceEventId), null);
    }

    const results = await Promise.allSettled([1, 2, 3].map(() => economy.purchaseItems({ userId: member.uuid, items, referenceEventId })));

    assert.equal(fulfilled(results).length, 3, `결과: ${JSON.stringify(codesOf(results))}`);
    assert.equal(fulfilled(results).filter((r) => r.value.idempotent === false).length, 1);
    const { wallet } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 300);
    assert.deepEqual(await ownedIds(member.uuid), [BARON, MASK].sort());
    assert.equal(await requestCount(member.uuid), 1);
});

test('이상한 순서: 지갑이 다른 연결에 잠긴 동안 같은 구매 둘이 기다릴 때 결과를 물으면 → 아직 없음, 풀린 뒤엔 한 번만 사지고 결과가 나옴', async (t) => {
    if (skipWithoutDb(t)) return;
    const member = await money.createMember('a8');
    await money.fund(member.uuid, 'GOLD', 1000);
    const referenceEventId = ref('locked');

    // 다른 연결이 지갑 줄을 잡고 있음 (관리자·다른 서버가 같은 지갑을 만지는 중인 모양)
    const holder = await dbHandle.sequelize.transaction();
    let released = false;
    t.after(async () => { if (!released) await holder.rollback(); });
    await dbHandle.sequelize.query('SELECT user_id FROM economy_wallets WHERE user_id = :userId FOR UPDATE', {
        replacements: { userId: member.uuid }, transaction: holder,
    });

    const first = economy.purchaseItem({ userId: member.uuid, itemId: BARON, referenceEventId });
    const second = economy.purchaseItem({ userId: member.uuid, itemId: BARON, referenceEventId });
    const settled = Promise.allSettled([first, second]);

    // 두 구매가 지갑 줄 앞(지갑 보장 넣기 또는 잠금)에서 기다리는 것까지 확인 (같은 시험 계정 연결만 보임)
    const bothWaiting = await waitUntil(async () => {
        const [[row]] = await dbHandle.sequelize.query(
            "SELECT COUNT(*) AS n FROM information_schema.PROCESSLIST WHERE INFO LIKE '%economy_wallets%' AND ID <> CONNECTION_ID()",
        );
        return Number(row.n) >= 2;
    });
    assert.ok(bothWaiting, '구매 둘이 지갑 잠금 앞에서 기다리는 상태가 안 보임');

    assert.equal(await economy.getPurchaseResult(member.uuid, referenceEventId), null, '잠긴 동안은 결과 없음');
    assert.equal((await money.walletOf(member.uuid)).gold, 1000);

    await holder.commit();
    released = true;
    const results = await settled;

    assert.equal(fulfilled(results).length, 2, `결과: ${JSON.stringify(codesOf(results))}`);
    assert.deepEqual(fulfilled(results).map((r) => r.value.idempotent).sort(), [false, true]);
    assert.equal(String(results[0].value.ledgerEntry.id), String(results[1].value.ledgerEntry.id));
    const stored = await economy.getPurchaseResult(member.uuid, referenceEventId);
    assert.equal(stored.kind, 'SINGLE');
    const { wallet } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 800);
});
