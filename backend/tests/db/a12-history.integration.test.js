'use strict';

// 거래 내역 DB 시험: 최근 것부터·50줄 경계·0골드 기본 지급 줄 숨김·판 보상·골드 구매 두 줄·쿠폰·관리자 보상 사유를 시험 DB 장부와 내역 응답으로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-387~395 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
process.env.DATABASE_URL = process.env.F01_TEST_DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const h = require('./a12-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test.before(h.prepareDb);
test.after(h.closeDb);

let ipSerial = 0;
const nextIp = () => `10.14.0.${(ipSerial++ % 250) + 1}`;
const redeem = (base, uuid, code) => h.call(base, uuid, 'POST', '/economy/coupons/redeem', { code }, { ip: nextIp() });
const history = async (base, uuid) => {
    const res = await h.call(base, uuid, 'GET', `/economy/accounts/${uuid}/transactions`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.transactions;
};
const buyGold = (base, uuid, product) => h.call(base, uuid, 'POST', '/economy/gold-purchases', {
    productId: product.product_id, version: product.version, referenceEventId: `a12d-hist-${h.hex()}`,
});

test('A12-B-387 구매 → 골드 구매 → 쿠폰 차례로 → 내역 쿠폰·골드 구매·구매 순 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('his');
    await h.fund(user, 'GOLD', 500);
    await h.fund(user, 'DIAMOND', 10);
    const product = await h.createProduct();
    const coupon = await h.createCoupon();

    assert.equal((await h.buy(base, user, 'profile-border-남작')).status, 201);
    assert.equal((await buyGold(base, user, product)).status, 200);
    assert.equal((await redeem(base, user, coupon.code)).status, 201);

    // 이 세 일의 사유만 차례로, 붙은 같은 사유는 하나로 → [쿠폰, 골드 구매, 구매]
    const reasons = (await history(base, user)).map((row) => row.reason)
        .filter((reason) => ['COUPON_REWARD', 'GOLD_PURCHASE', 'PURCHASE'].includes(reason))
        .filter((reason, i, all) => i === 0 || all[i - 1] !== reason);
    assert.deepEqual(reasons, ['COUPON_REWARD', 'GOLD_PURCHASE', 'PURCHASE']);
});

// ── A12-B-388~390 50줄 경계 [지금 동작] ──
const LIMIT_CASES = [
    { no: 'A12-B-388', rows: 49, shown: 49 },
    { no: 'A12-B-389', rows: 50, shown: 50 },
    { no: 'A12-B-390', rows: 51, shown: 50 },
];

for (const c of LIMIT_CASES) {
    test(`${c.no} 장부 ${c.rows}줄 → 내역 ${c.shown}줄${c.rows > 50 ? '(최근 50)' : ''}`, async (t) => {
        if (h.noDb(t)) return;
        const base = await h.startServer(t);
        const user = await h.createUser('lim');
        for (let i = 0; i < c.rows; i += 1) await h.fund(user, 'GOLD', i + 1);

        const rows = await history(base, user);
        assert.equal(rows.length, c.shown);
        // 최근 것부터: 맨 위가 마지막에 넣은 줄(금액 = 줄 수)
        assert.equal(rows[0].amount, c.rows);
        assert.equal(rows.at(-1).amount, c.rows - c.shown + 1);
    });
}

test('A12-B-391 새 계정 내역 → 0줄·장부엔 0골드 기본 지급 줄 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('new');
    // 지갑 처음 읽기 = 기본 지급 (가입과 같은 함수)
    assert.equal((await h.call(base, user, 'GET', `/economy/accounts/${user}/wallet`)).status, 200);

    assert.deepEqual(await history(base, user), []);
    const grants = (await h.ledgerOf(user)).filter((row) => row.reason === 'DEFAULT_GRANT');
    assert.equal(grants.length, 25);
    assert.ok(grants.every((row) => Number(row.amount) === 0));
});

test('A12-B-392 사유 DEFAULT_GRANT 금액 5 줄 → 내역에 보임 [지금 동작]', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('dg');
    await h.addLedger(user, { reason: 'DEFAULT_GRANT', amount: 5 });

    const rows = await history(base, user);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, 'DEFAULT_GRANT');
    assert.equal(rows[0].amount, 5);
});

test('A12-B-393 장부 GAME_REWARD +1 줄(번호 game-reward:<gameId>) → 내역에 사유 GAME_REWARD·금액 1', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('gr');
    const referenceEventId = `game-reward:${crypto.randomUUID()}`;
    await h.addLedger(user, { reason: 'GAME_REWARD', amount: 1, referenceEventId });

    const rows = await history(base, user);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, 'GAME_REWARD');
    assert.equal(rows[0].amount, 1);
    assert.equal(rows[0].referenceEventId, referenceEventId);
});

test('A12-B-394 골드 구매 → 내역에 다이아 − 줄과 골드 + 줄 둘 다', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('gp');
    await h.fund(user, 'DIAMOND', 10);
    const product = await h.createProduct({ pay_amount: 10, grant_amount: 1000 });
    assert.equal((await buyGold(base, user, product)).status, 200);

    const rows = (await history(base, user)).filter((row) => row.reason === 'GOLD_PURCHASE');
    assert.equal(rows.length, 2);
    assert.ok(rows.some((row) => row.currency === 'DIAMOND' && row.amount === -10));
    assert.ok(rows.some((row) => row.currency === 'GOLD' && row.amount === 1000));
});

test('A12-B-395 쿠폰·관리자 보상 → 내역 사유 COUPON_REWARD·관리자 보상 사유 이름 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('rw');
    const admin = await h.createUser('adm', { role: 'ADMIN' });
    const coupon = await h.createCoupon();
    assert.equal((await redeem(base, user, coupon.code)).status, 201);
    const granted = await h.call(base, admin, 'POST', '/economy/admin/grant', {
        userId: user, reason: 'EVENT_COMPENSATION_GOLD', referenceEventId: `a12d-hist-grant-${h.hex()}`,
    });
    assert.equal(granted.status, 201, JSON.stringify(granted.body));

    const reasons = (await history(base, user)).map((row) => row.reason);
    assert.deepEqual(reasons, ['EVENT_COMPENSATION_GOLD', 'COUPON_REWARD']);
});
