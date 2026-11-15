'use strict';

// 쿠폰 DB 시험: 쓰면 지급·한 사람 한 번·동시에·쓸 수 있는 횟수 경계·기간 경계(가짜 시계)·사용 중지·없는 코드·잘못 넣은 쿠폰·다이아 쿠폰을 시험 DB로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-348~363 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
process.env.DATABASE_URL = process.env.F01_TEST_DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const h = require('./a12-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const couponService = require('../../services/ops/coupon');
const { applyLedgerTransaction } = require('../../services/economy/ledger');

test.before(h.prepareDb);
test.after(h.closeDb);

// 쿠폰 요청은 ip마다 10분 30번 제한이 있어 요청마다 다른 주소로 보냄 (제한 자체는 A15 몫)
let ipSerial = 0;
const nextIp = () => `10.13.${Math.floor(ipSerial / 250)}.${(ipSerial++ % 250) + 1}`;
const redeem = (base, uuid, code) => h.call(base, uuid, 'POST', '/economy/coupons/redeem', { code }, { ip: nextIp() });

const couponRows = async (uuid) => (await h.ledgerOf(uuid)).filter((row) => row.reason === 'COUPON_REWARD');
const redemptionsOf = (couponId) => h.db.CouponRedemption.count({ where: { coupon_id: couponId } });
const usedCountOf = async (couponId) => (await h.db.Coupon.findByPk(couponId, { raw: true })).used_count;

test('A12-B-348 맞는 골드 쿠폰 → 장부 COUPON_REWARD 1줄·지갑 +·사용 기록 1줄·used_count +1', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('cp');
    const coupon = await h.createCoupon({ reward_amount: 150 });

    const res = await redeem(base, user, coupon.code);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const rows = await couponRows(user);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].amount), 150);
    assert.equal(rows[0].currency, 'GOLD');
    assert.equal((await h.walletOf(user)).gold, 150);
    assert.equal(await redemptionsOf(coupon.id), 1);
    assert.equal(await usedCountOf(coupon.id), 1);
});

test('A12-B-349 같은 사람 두 번 → 409 COUPON_ALREADY_REDEEMED·장부 1줄', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('cp');
    const coupon = await h.createCoupon();
    assert.equal((await redeem(base, user, coupon.code)).status, 201);

    const res = await redeem(base, user, coupon.code);
    h.assertCode(res, 409, 'COUPON_ALREADY_REDEEMED');
    assert.equal((await couponRows(user)).length, 1);
});

test('A12-B-350 같은 사람 동시에 두 번 → 1번만·장부 1줄', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('cp');
    const coupon = await h.createCoupon();

    const answers = await Promise.all([1, 2].map(() => redeem(base, user, coupon.code)));
    assert.deepEqual(answers.map((res) => res.status).sort(), [201, 409]);
    assert.equal((await couponRows(user)).length, 1);
    assert.equal(await usedCountOf(coupon.id), 1);
});

// ── A12-B-351~353 쓸 수 있는 횟수 경계 ──
const USES_CASES = [
    { no: 'A12-B-351', label: 'used_count = 최대−1', max: 5, used: 4, ok: true },
    { no: 'A12-B-352', label: 'used_count = 최대', max: 5, used: 5, ok: false },
    { no: 'A12-B-353', label: '최대 없음(null)', max: null, used: 1000, ok: true },
];

for (const c of USES_CASES) {
    test(`${c.no} ${c.label} → ${c.ok ? '됨' : '409 COUPON_EXHAUSTED'}`, async (t) => {
        if (h.noDb(t)) return;
        const base = await h.startServer(t);
        const user = await h.createUser('cp');
        const coupon = await h.createCoupon({ max_uses: c.max, used_count: c.used });

        const res = await redeem(base, user, coupon.code);
        if (c.ok) {
            assert.equal(res.status, 201, JSON.stringify(res.body));
            assert.equal(await usedCountOf(coupon.id), c.used + 1);
        } else {
            h.assertCode(res, 409, 'COUPON_EXHAUSTED');
            assert.equal(await usedCountOf(coupon.id), c.used);
            assert.equal((await couponRows(user)).length, 0);
        }
    });
}

test('A12-B-354 남은 1번을 두 사람이 동시에 → 한 사람만·used_count = 최대', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const alice = await h.createUser('cpa');
    const bob = await h.createUser('cpb');
    const coupon = await h.createCoupon({ max_uses: 3, used_count: 2 });

    const answers = await Promise.all([alice, bob].map((user) => redeem(base, user, coupon.code)));
    assert.deepEqual(answers.map((res) => res.status).sort(), [201, 409]);
    assert.equal(answers.find((res) => res.status === 409).body.code, 'COUPON_EXHAUSTED');
    assert.equal(await usedCountOf(coupon.id), 3);
    assert.equal((await couponRows(alice)).length + (await couponRows(bob)).length, 1);
});

// ── A12-B-355~358 기간 경계 (가짜 시계: 서비스에 지금 시각을 넣어 부름) ──
const START = new Date('2026-12-01T00:00:00Z');
const END = new Date('2026-12-31T00:00:00Z');
const PERIOD_CASES = [
    { no: 'A12-B-355', label: '시작 1초 전', now: new Date(START.getTime() - 1000), code: 'COUPON_NOT_STARTED' },
    { no: 'A12-B-356', label: '시작 순간', now: START, code: null },
    { no: 'A12-B-357', label: '끝 1초 전', now: new Date(END.getTime() - 1000), code: null },
    { no: 'A12-B-358', label: '끝 순간', now: END, code: 'COUPON_EXPIRED' },
];

for (const c of PERIOD_CASES) {
    test(`${c.no} 기간 ${c.label} → ${c.code ? `409 ${c.code}` : '됨'}`, async (t) => {
        if (h.noDb(t)) return;
        const user = await h.createUser('cp');
        const coupon = await h.createCoupon({ starts_at: START, ends_at: END });
        const deps = {
            db: h.db,
            applyLedgerTransaction,
            newId: () => crypto.randomUUID(),
            now: () => new Date(c.now.getTime()),
        };

        const attempt = couponService.redeemCoupon({ userId: user, code: coupon.code }, deps);
        if (c.code) {
            await assert.rejects(attempt, { status: 409, code: c.code });
            assert.equal(await redemptionsOf(coupon.id), 0);
        } else {
            const result = await attempt;
            assert.equal(result.reward.amount, 100);
            assert.equal((await couponRows(user)).length, 1);
        }
    });
}

test('A12-B-359 사용 중지 쿠폰 → 409 COUPON_INACTIVE', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('cp');
    const coupon = await h.createCoupon({ is_active: false });

    h.assertCode(await redeem(base, user, coupon.code), 409, 'COUPON_INACTIVE');
    assert.equal((await couponRows(user)).length, 0);
});

test('A12-B-360 없는 코드 → 404 COUPON_NOT_FOUND', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('cp');

    h.assertCode(await redeem(base, user, `A12D-NONE-${h.hex(3).toUpperCase()}`), 404, 'COUPON_NOT_FOUND');
});

// ── A12-B-361~362 관리자가 잘못 넣은 쿠폰 ──
const MISCONFIGURED = [
    { no: 'A12-B-361', label: '보상 종류 KRW', overrides: { reward_type: 'KRW', reward_amount: 100 } },
    { no: 'A12-B-362', label: '보상 0', overrides: { reward_type: 'GOLD', reward_amount: 0 } },
];

for (const c of MISCONFIGURED) {
    test(`${c.no} ${c.label} → 409 COUPON_MISCONFIGURED·사용 기록 0`, async (t) => {
        if (h.noDb(t)) return;
        const base = await h.startServer(t);
        const user = await h.createUser('cp');
        const coupon = await h.createCoupon(c.overrides);

        h.assertCode(await redeem(base, user, coupon.code), 409, 'COUPON_MISCONFIGURED');
        assert.equal(await redemptionsOf(coupon.id), 0);
        assert.equal((await h.ledgerOf(user)).length, 0);
    });
}

test('A12-B-363 다이아 쿠폰 → 다이아 장부 줄·골드 그대로', async (t) => {
    if (h.noDb(t)) return;
    const base = await h.startServer(t);
    const user = await h.createUser('cp');
    await h.fund(user, 'GOLD', 40);
    const coupon = await h.createCoupon({ reward_type: 'DIAMOND', reward_amount: 12 });

    assert.equal((await redeem(base, user, coupon.code)).status, 201);
    const rows = await couponRows(user);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].currency, 'DIAMOND');
    assert.equal(Number(rows[0].amount), 12);
    assert.deepEqual(await h.walletOf(user), { gold: 40, diamond: 12 });
});
