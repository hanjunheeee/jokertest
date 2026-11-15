'use strict';

// 쿠폰 코드 모양 시험: 진짜 경로(POST /economy/coupons/redeem)에 코드 보내고 거절·찾음·손질(대문자·빈칸)을 사용 기록·지갑으로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-232~239 (돌리기: node --env-file=.env.test --test tests/flow/a12-coupon-request.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');

const w = require('./a12-request-world');

// 시험 쿠폰 (골드 100)
const CODE4 = 'A12C';
const CODE40 = `A12-${'C'.repeat(36)}`;
const COUPONS = [CODE4, CODE40, 'A12-WELCOME'].map((code) => ({ code, reward_type: 'GOLD', reward_amount: 100 }));

// 서버 + 쿠폰 표 + 사람 하나 (한 사람 1분 10번 제한이라 시험마다 새 사람)
const setup = async (t) => {
    const base = await w.startApp(t);
    const { db, couponTables } = w.economyDb(t, { coupons: COUPONS });
    const me = w.uid('a12-coupon');
    const cookie = w.login(me);
    const redeem = (code) => w.call(base, 'POST', '/economy/coupons/redeem', { cookie, body: { code } });
    const gold = () => db._inspect.wallets.get(me)?.balance_gold ?? 0;
    return { db, couponTables, me, redeem, gold };
};

// 거절: 400 INVALID_COUPON_CODE, 사용 기록·지갑 그대로
const assertInvalid = async (c, code) => {
    const res = await c.redeem(code);
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.code, 'INVALID_COUPON_CODE');
    assert.equal(c.couponTables.redemptions.length, 0);
    assert.equal(c.gold(), 0);
};

// 찾아서 됨: 201, 그 쿠폰 사용 1번, 골드 +100
const assertRedeemed = async (c, sent, stored) => {
    const res = await c.redeem(sent);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.ok, true);
    const coupon = c.couponTables.couponRows.find((row) => row.code === stored);
    assert.equal(c.couponTables.redemptions.filter((row) => row.coupon_id === coupon.id && row.user_id === c.me).length, 1);
    assert.equal(c.gold(), 100);
};

// ── A12-B-232~235: 코드 길이 ──

test('A12-B-232 쿠폰 코드 3자 → 400 INVALID_COUPON_CODE', async (t) => {
    await assertInvalid(await setup(t), 'A12');
});

test('A12-B-233 쿠폰 코드 4자 → 찾음 (사용됨)', async (t) => {
    await assertRedeemed(await setup(t), CODE4, CODE4);
});

test('A12-B-234 쿠폰 코드 40자 → 찾음 (사용됨)', async (t) => {
    assert.equal(CODE40.length, 40);
    await assertRedeemed(await setup(t), CODE40, CODE40);
});

test('A12-B-235 쿠폰 코드 41자 → 400 INVALID_COUPON_CODE', async (t) => {
    await assertInvalid(await setup(t), `${CODE40}C`);
});

// ── A12-B-236~237: 코드 손질 ──

test('A12-B-236 소문자로 넣음 → 대문자로 찾아 됨', async (t) => {
    await assertRedeemed(await setup(t), 'a12-welcome', 'A12-WELCOME');
});

test('A12-B-237 앞뒤 빈칸 → 지우고 됨', async (t) => {
    await assertRedeemed(await setup(t), '  A12-WELCOME  ', 'A12-WELCOME');
});

// ── A12-B-238~239: 이상한 글자 ──

test('A12-B-238 쿠폰 코드 한글 → 400 INVALID_COUPON_CODE', async (t) => {
    await assertInvalid(await setup(t), '쿠폰코드');
});

test('A12-B-239 쿠폰 코드 배열 → 400 INVALID_COUPON_CODE', async (t) => {
    await assertInvalid(await setup(t), ['A12-WELCOME']);
});
