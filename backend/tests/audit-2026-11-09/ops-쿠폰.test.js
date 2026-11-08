'use strict';

// 운영 받침 시험: 쿠폰 사용 (기간 전/후·횟수 다 씀·한 사람 두 번·없는 코드·장부 한 번만·동시 요청·되돌리기·요청 수 제한)
// 가짜 경제 db 위에 쿠폰 표 붙이고 진짜 장부 함수로 지급 (진짜 DB 안 씀)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

const { createFakeEconomyDb, seedWallet } = require('./fakeEconomyDb');
const { attachCouponTables } = require('./opsFakes');
const couponService = require('../../services/ops/coupon');
const { applyLedgerTransaction } = require('../../services/economy/ledger');
const { createRateLimiter } = require('../../middlewares/rateLimit.middleware');
const { listenOnFetchableUrl } = require('../helpers/fetchablePort');

const USER_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const USER_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const NOW = new Date('2026-11-09T12:00:00Z');

// 쿠폰 하나 든 db + 서비스 의존
const setup = (coupon = {}, { ids } = {}) => {
    const db = createFakeEconomyDb();
    seedWallet(db, USER_A, { gold: 100 });
    seedWallet(db, USER_B, { gold: 0 });
    const tables = attachCouponTables(db, [{ code: 'WELCOME-2026', reward_type: 'GOLD', reward_amount: 500, ...coupon }]);
    let n = 0;
    const deps = {
        db,
        applyLedgerTransaction,
        newId: () => (ids ? ids[n++] : `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`),
        now: () => NOW,
    };
    return { db, tables, deps };
};

const rejectsWith = (promise, code) => assert.rejects(promise, (error) => { assert.equal(error.code, code); return true; });

test('쿠폰: 처음 쓰면 골드 지급, 장부 참조 id = coupon:<사용 id>, 쓴 횟수 1', async () => {
    const { db, tables, deps } = setup();
    const result = await couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps);
    assert.deepEqual(result.reward, { currency: 'GOLD', amount: 500 });
    assert.equal(result.balanceAfter, 600);
    const entry = db._inspect.ledgerEntries.at(-1);
    assert.equal(entry.reference_event_id, `coupon:${result.redemptionId}`);
    assert.equal(entry.reason, 'COUPON_REWARD');
    assert.equal(tables.couponRows[0].used_count, 1);
    assert.equal(tables.redemptions.length, 1);
});

test('쿠폰: 소문자·앞뒤 공백으로 넣어도 같은 코드로 봄', async () => {
    const { deps } = setup();
    const result = await couponService.redeemCoupon({ userId: USER_A, code: '  welcome-2026 ' }, deps);
    assert.equal(result.code, 'WELCOME-2026');
});

test('쿠폰: 다이아 보상도 장부로', async () => {
    const { db, deps } = setup({ reward_type: 'DIAMOND', reward_amount: 30 });
    const result = await couponService.redeemCoupon({ userId: USER_B, code: 'WELCOME-2026' }, deps);
    assert.equal(result.balanceAfter, 30);
    assert.equal(db._inspect.ledgerEntries.at(-1).currency, 'DIAMOND');
});

test('쿠폰: 한 사람이 두 번 쓰면 409 COUPON_ALREADY_REDEEMED, 장부 한 줄', async () => {
    const { db, deps } = setup();
    await couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps);
    await rejectsWith(couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps), 'COUPON_ALREADY_REDEEMED');
    assert.equal(db._inspect.ledgerEntries.filter((e) => e.user_id === USER_A).length, 1);
});

test('쿠폰: 없는 코드 404 COUPON_NOT_FOUND', async () => {
    const { deps } = setup();
    await rejectsWith(couponService.redeemCoupon({ userId: USER_A, code: 'NOPE-0000' }, deps), 'COUPON_NOT_FOUND');
});

test('쿠폰: 코드 모양 틀리면 400 (DB 안 감)', async () => {
    const { deps } = setup();
    for (const bad of ['', 'ab', '한글쿠폰코드', 'A'.repeat(41), null, 1234, 'WEL COME']) {
        await rejectsWith(couponService.redeemCoupon({ userId: USER_A, code: bad }, deps), 'INVALID_COUPON_CODE');
    }
});

test('쿠폰: 시작 전이면 COUPON_NOT_STARTED', async () => {
    const { deps } = setup({ starts_at: new Date('2026-11-10T00:00:00Z') });
    await rejectsWith(couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps), 'COUPON_NOT_STARTED');
});

test('쿠폰: 끝난 뒤면 COUPON_EXPIRED (끝 시각 딱 그때도 끝)', async () => {
    const { deps } = setup({ ends_at: NOW });
    await rejectsWith(couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps), 'COUPON_EXPIRED');
});

test('쿠폰: 기간 안이면 사용됨 (시작 지남·끝 전)', async () => {
    const { deps } = setup({ starts_at: new Date('2026-11-01T00:00:00Z'), ends_at: new Date('2026-11-30T00:00:00Z') });
    const result = await couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps);
    assert.equal(result.reward.amount, 500);
});

test('쿠폰: 사용 중지면 COUPON_INACTIVE', async () => {
    const { deps } = setup({ is_active: false });
    await rejectsWith(couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps), 'COUPON_INACTIVE');
});

test('쿠폰: 횟수 다 쓰면 다음 사람 COUPON_EXHAUSTED', async () => {
    const { deps } = setup({ max_uses: 1 });
    await couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps);
    await rejectsWith(couponService.redeemCoupon({ userId: USER_B, code: 'WELCOME-2026' }, deps), 'COUPON_EXHAUSTED');
});

test('쿠폰: 보상 설정이 틀린 쿠폰은 지급 안 함 (COUPON_MISCONFIGURED)', async () => {
    const { db, deps } = setup({ reward_type: 'RUBY', reward_amount: 10 });
    await rejectsWith(couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps), 'COUPON_MISCONFIGURED');
    assert.equal(db._inspect.ledgerEntries.length, 0);
});

test('쿠폰 동시 요청: 한 장 남은 쿠폰을 두 사람이 같이 쓰면 하나만 성공', async () => {
    const { tables, deps } = setup({ max_uses: 1 });
    const results = await Promise.allSettled([
        couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps),
        couponService.redeemCoupon({ userId: USER_B, code: 'WELCOME-2026' }, deps),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'COUPON_EXHAUSTED');
    assert.equal(tables.couponRows[0].used_count, 1);
});

test('쿠폰 동시 요청: 같은 사람이 두 번 같이 보내면 하나만 지급', async () => {
    const { db, deps } = setup();
    const results = await Promise.allSettled([
        couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps),
        couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'COUPON_ALREADY_REDEEMED');
    assert.equal(db._inspect.ledgerEntries.filter((e) => e.user_id === USER_A).length, 1);
});

test('쿠폰: 앞 검사를 지나쳐도 유일 제약에 걸리면 COUPON_ALREADY_REDEEMED', async () => {
    const { tables, deps } = setup();
    // 다른 요청이 막 사용 기록을 넣은 상황 흉내
    tables.hooks.beforeRedemptionCreate = async (values) => {
        tables.hooks.beforeRedemptionCreate = null;
        tables.redemptions.push({ ...values, id: 'other' });
    };
    await rejectsWith(couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps), 'COUPON_ALREADY_REDEEMED');
});

test('쿠폰: 장부 지급이 실패하면 사용 기록·쓴 횟수도 되돌림 (다시 쓸 수 있음)', async () => {
    const { db, tables, deps } = setup();
    const failing = { ...deps, applyLedgerTransaction: async () => { throw new Error('장부 실패'); } };
    await assert.rejects(couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, failing));
    assert.equal(tables.redemptions.length, 0);
    assert.equal(tables.couponRows[0].used_count, 0);
    const result = await couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps);
    assert.equal(result.balanceAfter, 600);
    assert.equal(db._inspect.ledgerEntries.length, 1);
});

test('쿠폰: 잔액 한도 넘으면 지급 실패 + 사용 기록 안 남음', async () => {
    const { db, tables, deps } = setup({ reward_amount: 2_000_000_000 });
    seedWallet(db, USER_A, { gold: 2_000_000_000 });
    await assert.rejects(couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps));
    assert.equal(tables.redemptions.length, 0);
});

test('쿠폰: 참조 id는 사용마다 달라 장부 중복 방지 키가 사람·사용마다 하나', async () => {
    const { db, deps } = setup();
    const a = await couponService.redeemCoupon({ userId: USER_A, code: 'WELCOME-2026' }, deps);
    const b = await couponService.redeemCoupon({ userId: USER_B, code: 'WELCOME-2026' }, deps);
    assert.notEqual(a.redemptionId, b.redemptionId);
    const refs = db._inspect.ledgerEntries.map((e) => e.reference_event_id);
    assert.equal(new Set(refs).size, refs.length);
    assert.equal(couponService.couponReferenceEventId('x'), 'coupon:x');
});

test('쿠폰 경로: 한 사람 1분 10번 넘으면 429 (경로 줄 세우기와 같은 제한기)', async (t) => {
    const app = express();
    app.use((req, res, next) => { req.user = { uuid: USER_A }; next(); });
    app.post('/redeem', createRateLimiter({ windowMs: 60_000, max: 10, keyOf: (req) => `coupon:${req.user.uuid}` }), (req, res) => res.json({ ok: true }));
    const server = http.createServer(app);
    const url = await listenOnFetchableUrl(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const statuses = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await fetch(`${url}/redeem`, { method: 'POST' })).status);
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
    assert.equal(statuses[10], 429);
});

test('쿠폰 경로: economy 라우터에 /coupons/redeem POST가 로그인·제한 뒤에 붙어 있음', () => {
    const router = require('../../routes/economy.routes');
    const layer = router.stack.find((l) => l.route?.path === '/coupons/redeem');
    assert.ok(layer, '경로 없음');
    assert.equal(layer.route.methods.post, true);
    assert.equal(layer.route.stack.length, 3);
});
