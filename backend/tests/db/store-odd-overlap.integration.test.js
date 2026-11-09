'use strict';

// 재화 겹침 이상한 순서·동시 시험 파일, 진짜 시험 DB에서 쿠폰·판 끝 업적 보상·관리자 주고 뺏기·환불·다이아 충전이 구매와 같은 순간에 겹칠 때
// 보는 것: 정해진 수만 처리, 음수 없음, 지갑 = 장부 합, 겹쳤다고 500(데드락)으로 안 떨어짐, 긴 흐름 끝 잔액·내역
// npm run test:with-db -- tests/db/store-odd-overlap.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀, 결제는 가짜 결제사만)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp } = require('../admin/helpers/adminTestApp');
const money = require('../admin/helpers/money');
const { createFakeTossAdapter } = require('../helpers/fakeTossAdapter');

let dbHandle = null;

const PRODUCTS = Object.freeze([
    {
        product_id: 'odd-gold-1', kind: 'GOLD_PURCHASE', display_name: '시험용 골드 상품(odd)',
        pay_currency: 'DIAMOND', pay_amount: 30, grant_currency: 'GOLD', grant_amount: 100, bonus_amount: 10,
        status: 'ON_SALE', sort_order: 0, version: 1,
    },
    {
        product_id: 'odd-topup-1', kind: 'DIAMOND_TOPUP', display_name: '시험용 다이아 상품(odd)',
        pay_currency: 'KRW', pay_amount: 1000, grant_currency: 'DIAMOND', grant_amount: 100, bonus_amount: 10,
        status: 'ON_SALE', sort_order: 0, version: 1,
    },
]);

// 시험 DB 처음 모양 + 시험 상품 두 줄 (파일 하나에 한 번, 사람·쿠폰은 시험마다 새로)
test.before(async () => {
    dbHandle = await prepareAdminDb();
    if (!dbHandle) return;
    for (const row of PRODUCTS) {
        await dbHandle.sequelize.query(
            `INSERT INTO economy_currency_products
               (product_id, kind, display_name, pay_currency, pay_amount, grant_currency, grant_amount, bonus_amount, status, sort_order, version, created_at, updated_at)
             VALUES (:product_id, :kind, :display_name, :pay_currency, :pay_amount, :grant_currency, :grant_amount, :bonus_amount, :status, :sort_order, :version, NOW(), NOW())`,
            { replacements: row },
        );
    }
});
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const economy = require('../../services/economy');
const { redeemCoupon } = require('../../services/ops/coupon');
const achievementService = require('../../services/achievement');
const { MAX_BALANCE } = require('../../services/economy/constants');

const BARON = 'profile-border-남작'; // 200
const MASK = 'player-card-가면'; // 500
const GOLD_PRODUCT_ID = 'odd-gold-1';
const TOPUP_PRODUCT_ID = 'odd-topup-1';

const ref = (label) => `${label}-${crypto.randomBytes(6).toString('hex')}`;
const fulfilled = (results) => results.filter((r) => r.status === 'fulfilled');
const rejected = (results) => results.filter((r) => r.status === 'rejected');
const codeOf = (reason) => reason?.code ?? `(코드 없음: ${reason?.message})`;
const codesOf = (results) => rejected(results).map((r) => codeOf(r.reason));

// 시험 쿠폰 한 장 → { id, code }
const makeCoupon = async ({ rewardType = 'GOLD', amount = 100, maxUses = null } = {}) => {
    const code = `ODD-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const row = await db().Coupon.create({ code, reward_type: rewardType, reward_amount: amount, max_uses: maxUses, used_count: 0, is_active: true });
    return { id: row.id, code };
};
const couponRow = (id) => db().Coupon.findOne({ where: { id }, raw: true });
const redemptionCount = (couponId) => db().CouponRedemption.count({ where: { coupon_id: couponId } });
const couponLedgerCount = (userIds) => db().EconomyLedgerEntry.count({ where: { user_id: userIds, reason: 'COUPON_REWARD' } });
const ownedIds = async (userId) => (await db().sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId }, raw: true }))
    .map((row) => row.item_id).sort();

const assertNeverNegative = (entries) => {
    for (const entry of entries) assert.ok(Number(entry.balance_after) >= 0, `장부 ${entry.id} 잔액 ${entry.balance_after}`);
};

const buyGold = (userId, referenceEventId = ref('gold')) => economy.purchaseGold({ userId, productId: GOLD_PRODUCT_ID, version: 1, referenceEventId });

// 가짜 결제사로 충전 주문 하나 만들고 결제 등록 → { orderId, paymentKey }
const makeTopupOrder = async (adapter, userId) => {
    const created = await economy.createTopupOrder({ userId, productId: TOPUP_PRODUCT_ID, version: 1 }, { adapter });
    const paymentKey = `pay_${crypto.randomBytes(8).toString('hex')}`;
    adapter.registerPayment(paymentKey, { orderId: created.orderId, amount: created.amount });
    return { orderId: created.orderId, paymentKey };
};
const confirm = (adapter, userId, { orderId, paymentKey }) => economy.confirmTopupOrder({ userId, orderId, paymentKey, amount: 1000 }, { adapter });
const orderStatus = async (orderId) => (await db().EconomyTopupOrder.findOne({ where: { order_id: orderId }, raw: true })).status;

const adjust = (agent, uuid, body) => agent.post(`/admin-api/members/${uuid}/wallet/adjust`, {
    requestId: crypto.randomUUID(), reason: '이상한 순서 시험', ...body,
});
const refund = (agent, orderId) => agent.post(`/admin-api/payments/orders/${orderId}/refund`, { reason: '이상한 순서 시험' });

// ── 쿠폰 ──

test('동시·끝값: 한 번만 쓸 수 있는 쿠폰을 10명이 같은 순간에 쓰면 → 1명만 받고 9명은 COUPON_EXHAUSTED, 쓴 횟수 1·사용 기록 1·장부 1', async (t) => {
    if (skipWithoutDb(t)) return;
    const coupon = await makeCoupon({ amount: 100, maxUses: 1 });
    const members = await Promise.all(Array.from({ length: 10 }, () => money.createMember('b1')));

    const results = await Promise.allSettled(members.map((m) => redeemCoupon({ userId: m.uuid, code: coupon.code })));

    assert.equal(fulfilled(results).length, 1, `결과: ${JSON.stringify(codesOf(results))}`);
    assert.deepEqual([...new Set(codesOf(results))], ['COUPON_EXHAUSTED']);
    assert.equal((await couponRow(coupon.id)).used_count, 1);
    assert.equal(await redemptionCount(coupon.id), 1);
    assert.equal(await couponLedgerCount(members.map((m) => m.uuid)), 1);
    for (const m of members) {
        await money.assertWalletMatchesLedger(m.uuid);
    }
});

test('동시: 세 번 쓸 수 있는 쿠폰을 10명이 같은 순간에 쓰면 → 딱 3명, 쓴 횟수 = 사용 기록 = 장부 = 3', async (t) => {
    if (skipWithoutDb(t)) return;
    const coupon = await makeCoupon({ amount: 70, maxUses: 3 });
    const members = await Promise.all(Array.from({ length: 10 }, () => money.createMember('b2')));

    const results = await Promise.allSettled(members.map((m) => redeemCoupon({ userId: m.uuid, code: coupon.code })));

    assert.equal(fulfilled(results).length, 3, `결과: ${JSON.stringify(codesOf(results))}`);
    assert.deepEqual([...new Set(codesOf(results))], ['COUPON_EXHAUSTED']);
    assert.equal((await couponRow(coupon.id)).used_count, 3);
    assert.equal(await redemptionCount(coupon.id), 3);
    assert.equal(await couponLedgerCount(members.map((m) => m.uuid)), 3);
});

test('동시: 한 사람이 창 5개에서 같은 쿠폰을 따닥 → 한 번만 받고 나머지는 COUPON_ALREADY_REDEEMED (500 아님)', async (t) => {
    if (skipWithoutDb(t)) return;
    const coupon = await makeCoupon({ amount: 100 });
    const member = await money.createMember('b3');
    await money.fund(member.uuid, 'GOLD', 10);

    const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => redeemCoupon({ userId: member.uuid, code: coupon.code.toLowerCase() })));

    assert.equal(fulfilled(results).length, 1, `결과: ${JSON.stringify(codesOf(results))}`);
    assert.deepEqual([...new Set(codesOf(results))], ['COUPON_ALREADY_REDEEMED']);
    const { wallet } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.gold, 110);
    assert.equal((await couponRow(coupon.id)).used_count, 1);
});

test('동시(겹침): 지갑 있는 한 사람이 서로 다른 쿠폰 두 장 + 테두리 구매를 같은 순간에 → 셋 다 됨, 데드락·500 없음 (5판)', async (t) => {
    if (skipWithoutDb(t)) return;
    const rounds = [];
    for (let round = 0; round < 5; round += 1) {
        const member = await money.createMember('b4');
        await money.fund(member.uuid, 'GOLD', 1000);
        const goldCoupon = await makeCoupon({ rewardType: 'GOLD', amount: 100 });
        const diamondCoupon = await makeCoupon({ rewardType: 'DIAMOND', amount: 50 });

        const results = await Promise.allSettled([
            redeemCoupon({ userId: member.uuid, code: goldCoupon.code }),
            redeemCoupon({ userId: member.uuid, code: diamondCoupon.code }),
            economy.purchaseItem({ userId: member.uuid, itemId: BARON, referenceEventId: ref('b4') }),
        ]);

        // 돈은 어떤 경우든 반만 남지 않음 (실패한 것은 통째로 없음)
        const { wallet } = await money.assertWalletMatchesLedger(member.uuid);
        const [gold, diamond, buy] = results.map((r) => r.status === 'fulfilled');
        assert.deepEqual(wallet, { gold: 1000 + (gold ? 100 : 0) - (buy ? 200 : 0), diamond: diamond ? 50 : 0 });
        rounds.push(results.map((r) => (r.status === 'fulfilled' ? 'ok' : codeOf(r.reason))));
    }
    const broken = rounds.filter((shape) => shape.some((s) => s !== 'ok'));
    assert.equal(broken.length, 0, `5판 중 ${broken.length}판 실패: ${JSON.stringify(broken)}`);
});

test('동시(겹침): 지갑 줄이 아직 없는 계정이 서로 다른 쿠폰 세 장을 같은 순간에 → 셋 다 받음, 데드락·500 없음 (5판)', async (t) => {
    if (skipWithoutDb(t)) return;
    const rounds = [];
    for (let round = 0; round < 5; round += 1) {
        const member = await money.createMember('b5');
        const amounts = [10, 20, 30];
        const coupons = await Promise.all(amounts.map((amount) => makeCoupon({ amount })));

        const results = await Promise.allSettled(coupons.map((c) => redeemCoupon({ userId: member.uuid, code: c.code })));

        // 실패한 쿠폰은 쓴 횟수·사용 기록도 안 남음 (다시 쓸 수 있음)
        const { wallet } = await money.assertWalletMatchesLedger(member.uuid);
        assert.equal(wallet.gold, amounts.filter((_, i) => results[i].status === 'fulfilled').reduce((a, b) => a + b, 0));
        for (const [i, c] of coupons.entries()) {
            assert.equal((await couponRow(c.id)).used_count, results[i].status === 'fulfilled' ? 1 : 0);
        }
        rounds.push(results.map((r) => (r.status === 'fulfilled' ? 'ok' : codeOf(r.reason))));
    }
    const broken = rounds.filter((shape) => shape.some((s) => s !== 'ok'));
    assert.equal(broken.length, 0, `5판 중 ${broken.length}판 실패: ${JSON.stringify(broken)}`);
});

test('중간 실패 + 동시: 마지막 1장 쿠폰을 잔액 한도 근처 사람(받으면 넘침)과 보통 사람이 같이 쓰면 → 한도 사람은 되돌려지거나 다 씀, 보통 사람은 꼭 받음', async (t) => {
    if (skipWithoutDb(t)) return;
    const near = await money.createMember('b6');
    await money.fund(near.uuid, 'GOLD', MAX_BALANCE - 50);

    // 혼자 먼저: 넘쳐서 실패 → 쓴 횟수·사용 기록 안 남음
    const lone = await makeCoupon({ amount: 100, maxUses: 1 });
    await assert.rejects(redeemCoupon({ userId: near.uuid, code: lone.code }), (error) => error.code === 'BALANCE_LIMIT_EXCEEDED');
    assert.equal((await couponRow(lone.id)).used_count, 0);
    assert.equal(await redemptionCount(lone.id), 0);

    // 같이: 어느 순서여도 보통 사람은 받음
    for (let round = 0; round < 3; round += 1) {
        const coupon = await makeCoupon({ amount: 100, maxUses: 1 });
        const normal = await money.createMember('b6');
        const [nearResult, normalResult] = await Promise.allSettled([
            redeemCoupon({ userId: near.uuid, code: coupon.code }),
            redeemCoupon({ userId: normal.uuid, code: coupon.code }),
        ]);

        // 한도 사람이 먼저면 넘쳐서 되돌려짐, 보통 사람이 먼저면 다 쓴 쿠폰
        assert.equal(nearResult.status, 'rejected');
        assert.ok(['BALANCE_LIMIT_EXCEEDED', 'COUPON_EXHAUSTED'].includes(codeOf(nearResult.reason)), codeOf(nearResult.reason));
        assert.equal(normalResult.status, 'fulfilled', `보통 사람 실패: ${codeOf(normalResult.reason)}`);
        assert.equal((await couponRow(coupon.id)).used_count, 1);
        assert.equal(await redemptionCount(coupon.id), 1);
    }
    const { wallet } = await money.assertWalletMatchesLedger(near.uuid);
    assert.equal(wallet.gold, MAX_BALANCE - 50, '한도 사람 잔액 그대로');
});

test('동시(관리자 겹침): 관리자가 쿠폰을 끄는 순간 5명이 쓰면 → 쓴 횟수 = 사용 기록 = 장부 수, 진 사람은 COUPON_INACTIVE, 끈 뒤엔 아무도 못 씀', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const coupon = await makeCoupon({ amount: 40 });
    const members = await Promise.all(Array.from({ length: 5 }, () => money.createMember('b7')));

    const [toggle, ...results] = await Promise.allSettled([
        agent.request('PATCH', `/admin-api/coupons/${coupon.id}`, { body: { isActive: false } }),
        ...members.map((m) => redeemCoupon({ userId: m.uuid, code: coupon.code })),
    ]);

    assert.equal(toggle.status, 'fulfilled');
    assert.equal(toggle.value.status, 200, JSON.stringify(toggle.value.body));
    for (const code of codesOf(results)) assert.equal(code, 'COUPON_INACTIVE');
    const ok = fulfilled(results).length;
    const row = await couponRow(coupon.id);
    assert.equal(Boolean(row.is_active), false);
    assert.equal(row.used_count, ok);
    assert.equal(await redemptionCount(coupon.id), ok);
    assert.equal(await couponLedgerCount(members.map((m) => m.uuid)), ok);
    const late = await money.createMember('b7');
    await assert.rejects(redeemCoupon({ userId: late.uuid, code: coupon.code }), (error) => error.code === 'COUPON_INACTIVE');
});

// ── 관리자 주고 뺏기·환불과 구매 ──

test('동시(관리자 겹침): 골드 500인데 관리자가 400 뺏는 순간 사용자가 200짜리 테두리를 사면 → 하나만 되고 음수 없음, 진 쪽은 잔액 부족 답 (5판)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    for (let round = 0; round < 5; round += 1) {
        const member = await money.createMember('b8');
        await money.fund(member.uuid, 'GOLD', 500);

        const [revoke, buy] = await Promise.allSettled([
            adjust(agent, member.uuid, { currency: 'GOLD', amount: -400 }),
            economy.purchaseItem({ userId: member.uuid, itemId: BARON, referenceEventId: ref('b8') }),
        ]);

        assert.equal(revoke.status, 'fulfilled');
        const revokeOk = revoke.value.status === 200;
        if (!revokeOk) {
            assert.equal(revoke.value.status, 409, `${round}판째 관리자 답 ${revoke.value.status} ${JSON.stringify(revoke.value.body)}`);
            assert.equal(revoke.value.body.code, 'BALANCE_SHORT');
        }
        if (buy.status === 'rejected') assert.equal(codeOf(buy.reason), 'INSUFFICIENT_BALANCE', `${round}판째 구매 오류 ${buy.reason?.message}`);
        assert.equal([revokeOk, buy.status === 'fulfilled'].filter(Boolean).length, 1, `${round}판째: 둘 중 하나만 됨`);
        const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
        assertNeverNegative(entries);
        assert.equal(wallet.gold, revokeOk ? 100 : 300);
    }
});

test('동시(관리자 겹침): 충전 다이아 110을 관리자가 환불하는 순간 사용자가 그 다이아로 금화를 사면 → 하나만 되고 음수 없음 (5판)', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    for (let round = 0; round < 5; round += 1) {
        const member = await money.createMember('b9');
        const order = await money.createGrantedOrder(member.uuid, { grantAmount: 100, bonusAmount: 10 });

        const [back, buy] = await Promise.allSettled([refund(agent, order.order_id), buyGold(member.uuid)]);

        assert.equal(back.status, 'fulfilled');
        const refunded = back.value.status === 200;
        if (!refunded) {
            assert.equal(back.value.status, 409, `${round}판째 환불 답 ${back.value.status} ${JSON.stringify(back.value.body)}`);
            assert.equal(back.value.body.code, 'REFUND_BALANCE_SHORT');
        }
        if (buy.status === 'rejected') assert.equal(codeOf(buy.reason), 'INSUFFICIENT_DIAMOND', `${round}판째 금화 오류 ${buy.reason?.message}`);
        assert.equal([refunded, buy.status === 'fulfilled'].filter(Boolean).length, 1, `${round}판째: 둘 중 하나만 됨`);
        const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
        assertNeverNegative(entries);
        assert.deepEqual(wallet, refunded ? { gold: 0, diamond: 0 } : { gold: 110, diamond: 80 });
        assert.equal(await orderStatus(order.order_id), refunded ? 'REFUNDED' : 'GRANTED');
    }
});

// ── 판 끝 보상과 구매 ──

test('동시(판 끝 겹침): 판 끝 업적 보상(골드10·다이아10) 지급이 두 번 겹치고 같은 순간 테두리·금화도 사면 → 보상 한 번, 구매 둘 다 됨, 500 없음 (3판)', async (t) => {
    if (skipWithoutDb(t)) return;
    const definition = achievementService.getAchievementDefinition('clown-win-10');
    assert.ok(definition, '업적 정의 clown-win-10');
    const { grantAchievement } = achievementService.__internal;
    for (let round = 0; round < 3; round += 1) {
        const member = await money.createMember('bA');
        await money.fund(member.uuid, 'GOLD', 200);
        await money.fund(member.uuid, 'DIAMOND', 30);

        const results = await Promise.allSettled([
            grantAchievement(member.uuid, definition),
            grantAchievement(member.uuid, definition),
            economy.purchaseItem({ userId: member.uuid, itemId: BARON, referenceEventId: ref('bA') }),
            buyGold(member.uuid),
        ]);

        assert.deepEqual(results.map((r) => (r.status === 'fulfilled' ? 'ok' : codeOf(r.reason))), ['ok', 'ok', 'ok', 'ok'], `${round}판째`);
        assert.deepEqual([results[0].value.granted, results[1].value.granted].sort(), [false, true]);
        const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
        assert.deepEqual(wallet, { gold: 200 - 200 + 10 + 110, diamond: 30 - 30 + 10 });
        assert.equal(entries.filter((e) => e.reason === 'ACHIEVEMENT_REWARD').length, 2);
    }
});

// ── 다이아 충전과 구매 (가짜 결제사만) ──

test('겹침: 충전 승인이 결제사에서 기다리는 동안 금화 사기(부족)·다이아 쿠폰·금화 사기가 막히지 않고, 승인이 풀리면 충전 한 번만', async (t) => {
    if (skipWithoutDb(t)) return;
    const adapter = createFakeTossAdapter();
    const member = await money.createMember('bB');
    const order = await makeTopupOrder(adapter, member.uuid);
    const hold = adapter.hold(order.paymentKey);

    const confirming = confirm(adapter, member.uuid, order);
    await hold.entered;

    // 결제사 기다리는 중: 다이아 0이라 금화는 부족, 쿠폰 다이아 50 받은 뒤 금화 사기는 됨 (어느 것도 승인을 안 기다림)
    await assert.rejects(buyGold(member.uuid), (error) => error.code === 'INSUFFICIENT_DIAMOND');
    const coupon = await makeCoupon({ rewardType: 'DIAMOND', amount: 50 });
    await redeemCoupon({ userId: member.uuid, code: coupon.code });
    await buyGold(member.uuid);
    assert.equal(await orderStatus(order.orderId), 'CONFIRMING');
    // 기다리는 중 같은 주문 다시 확인은 진행 중 답 (두 번 승인 안 함)
    await assert.rejects(confirm(adapter, member.uuid, order), (error) => error.code === 'PAYMENT_PROCESSING');

    hold.release();
    const done = await confirming;

    assert.equal(done.status, 'GRANTED');
    assert.equal(done.balanceDiamond, 50 - 30 + 110);
    assert.equal(adapter.callsOf('confirm').length, 1);
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.deepEqual(wallet, { gold: 110, diamond: 130 });
    assert.equal(entries.filter((e) => e.reason === 'DIAMOND_TOPUP').length, 1);
});

test('동시·끝값: 한 사람이 충전 주문 5개를 창마다 두 번씩(10개) 같은 순간 확인하면 → 응답에 지급 대기(데드락 흔적) 없이 주문마다 한 번씩 다이아 550', async (t) => {
    if (skipWithoutDb(t)) return;
    const adapter = createFakeTossAdapter();
    const member = await money.createMember('bC');
    await money.fund(member.uuid, 'GOLD', 1); // 가입한 계정처럼 지갑 줄이 있는 상태
    const orders = [];
    for (let i = 0; i < 5; i += 1) {
        orders.push(await makeTopupOrder(adapter, member.uuid));
    }

    // 지급 실패 까닭은 로그에 안 남아서(code=UNKNOWN) DB 질의 오류 중 데드락만 셈 (동작은 그대로)
    const sequelize = db().sequelize;
    const originalQuery = sequelize.query;
    let deadlocks = 0;
    sequelize.query = async function counted(...args) {
        try {
            return await originalQuery.apply(this, args);
        } catch (error) {
            if (/Deadlock found/.test(String(error?.message))) deadlocks += 1;
            throw error;
        }
    };
    t.after(() => { sequelize.query = originalQuery; });

    const results = await Promise.allSettled(orders.flatMap((order) => [confirm(adapter, member.uuid, order), confirm(adapter, member.uuid, order)]));
    sequelize.query = originalQuery;

    const shapes = results.map((r) => (r.status === 'fulfilled' ? r.value.status : codeOf(r.reason)));
    for (const shape of shapes) assert.ok(['GRANTED', 'PAYMENT_PROCESSING', 'PENDING_GRANT'].includes(shape), `응답 모양: ${JSON.stringify(shapes)}`);
    // 남은 지급 대기·확인 중은 조회가 마무리 (그 뒤엔 다 지급됨)
    for (const order of orders) {
        const view = await economy.getTopupOrder({ userId: member.uuid, orderId: order.orderId }, { adapter });
        assert.equal(view.status, 'GRANTED');
        assert.equal(adapter.callsOf('confirm').filter((c) => c.paymentKey === order.paymentKey).length, 1, '주문마다 승인 한 번');
    }
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.diamond, 550);
    assert.equal(entries.filter((e) => e.reason === 'DIAMOND_TOPUP').length, 5);
    // 돈은 결국 맞지만, 같은 사람 동시 지급끼리 막혀 지급 대기로 떨어지면 안 됨
    const pending = shapes.filter((shape) => shape === 'PENDING_GRANT').length;
    assert.equal(pending, 0, `지급 대기 응답 ${pending}개, 데드락 ${deadlocks}번: ${JSON.stringify(shapes)}`);
});

// ── 끝까지 가는 긴 흐름 ──

test('긴 흐름(따닥·재전송·관리자 섞음): 가입 기본 지급 → 충전 따닥 → 금화 같은 요청 3개 → 쿠폰 따닥 → 묶음 구매 따닥 → 판 끝 업적 → 환불 시도(부족) → 끝 잔액·장부·내역이 맞음', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const adapter = createFakeTossAdapter();
    const member = await money.createMember('bD');
    const userId = member.uuid;

    // 1. 가입 때 기본 지급 (0원, 지갑 0/0)
    await economy.ensureDefaultEntitlements(userId);
    assert.deepEqual(await money.walletOf(userId), { gold: 0, diamond: 0 });

    // 2. 충전 확인 따닥 → 110 한 번
    const order = await makeTopupOrder(adapter, userId);
    const topups = await Promise.allSettled([confirm(adapter, userId, order), confirm(adapter, userId, order)]);
    for (const r of topups) assert.ok(r.status === 'fulfilled' || codeOf(r.reason) === 'PAYMENT_PROCESSING', codeOf(r.reason));
    assert.equal((await economy.getTopupOrder({ userId, orderId: order.orderId }, { adapter })).status, 'GRANTED');
    assert.equal((await money.walletOf(userId)).diamond, 110);

    // 3. 금화 같은 요청 3개 동시 → 한 번 (다이아 80, 골드 110)
    const goldRef = ref('long-gold');
    const golds = await Promise.all([1, 2, 3].map(() => buyGold(userId, goldRef)));
    assert.equal(golds.filter((g) => g.idempotent === false).length, 1);

    // 4. 골드 600 쿠폰 따닥 → 한 번 (골드 710)
    const coupon = await makeCoupon({ amount: 600 });
    const redeems = await Promise.allSettled([redeemCoupon({ userId, code: coupon.code }), redeemCoupon({ userId, code: coupon.code })]);
    assert.equal(fulfilled(redeems).length, 1);
    assert.deepEqual(codesOf(redeems), ['COUPON_ALREADY_REDEEMED']);

    // 5. 묶음 구매(남작 200 + 가면 500) 같은 참조 id 따닥 → 한 번 (골드 10)
    const bulkRef = ref('long-bulk');
    const bulks = await Promise.all([1, 2].map(() => economy.purchaseItems({ userId, items: [{ itemId: BARON }, { itemId: MASK }], referenceEventId: bulkRef })));
    assert.deepEqual(bulks.map((b) => b.idempotent).sort(), [false, true]);

    // 6. 판 끝 업적 보상 (골드 20, 다이아 90)
    const granted = await achievementService.__internal.grantAchievement(userId, achievementService.getAchievementDefinition('clown-win-10'));
    assert.equal(granted.granted, true);

    // 7. 관리자 환불 시도: 다이아 90 < 110 → 멈춤, 아무것도 안 바뀜
    const back = await refund(agent, order.orderId);
    assert.equal(back.status, 409);
    assert.equal(back.body.code, 'REFUND_BALANCE_SHORT');
    assert.equal(await orderStatus(order.orderId), 'GRANTED');

    // 8. 끝 상태
    const { wallet, entries } = await money.assertWalletMatchesLedger(userId);
    assertNeverNegative(entries);
    assert.deepEqual(wallet, { gold: 20, diamond: 90 });
    const summary = await economy.getWalletSummary(userId);
    assert.equal(summary.balanceGold, 20);
    assert.equal(summary.balanceDiamond, 90);
    const owned = await ownedIds(userId);
    assert.equal(owned.filter((id) => id === BARON).length, 1);
    assert.equal(owned.filter((id) => id === MASK).length, 1);
    const stored = await economy.getPurchaseResult(userId, bulkRef);
    assert.equal(stored.kind, 'BULK');
    const history = await economy.listTransactions(userId);
    assert.deepEqual(
        history.map((h) => `${h.reason}:${h.currency}:${h.amount}`).reverse(),
        [
            'DIAMOND_TOPUP:DIAMOND:110',
            'GOLD_PURCHASE:DIAMOND:-30', 'GOLD_PURCHASE:GOLD:110',
            'COUPON_REWARD:GOLD:600',
            ...bulks.find((b) => b.idempotent === false).results.map((e) => `PURCHASE:GOLD:${e.amount}`),
            'ACHIEVEMENT_REWARD:GOLD:10', 'ACHIEVEMENT_REWARD:DIAMOND:10',
        ],
        '내역 순서·금액 (기본 지급 0원 줄은 안 보임)',
    );
});
