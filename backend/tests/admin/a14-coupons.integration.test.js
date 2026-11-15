'use strict';

// 관리자 쿠폰 시험: 만들기(대문자 코드)·코드 모양 경계·같은 코드·쓰기 횟수·기한·겹쳐 쓰기·끄기 (관리자 경로 + 플레이어 쿠폰 쓰기 서비스, 시험 DB)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-251~261 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a14-ops-helpers');
const money = require('./helpers/money');
const { redeemCoupon } = require('../../services/ops/coupon');

const { db } = H;
const ctx = H.useAdminFile();
const MINUTE = 60_000;

const create = (body) => ctx.app.agent.post('/admin-api/coupons', body);
// 시험마다 안 겹치는 코드 (대문자·숫자, 길이 맞춤)
const codeOf = (length) => `Q${H.tag().toUpperCase()}${'7'.repeat(40)}`.slice(0, length);
const gold = (overrides = {}) => ({ code: codeOf(12), rewardType: 'GOLD', rewardAmount: 500, maxUses: null, ...overrides });

// 플레이어가 쿠폰 씀 → { ok:true } / { ok:false, code }
async function redeem(uuid, code) {
    try {
        await redeemCoupon({ userId: uuid, code });
        return { ok: true };
    } catch (error) {
        return { ok: false, code: error?.code };
    }
}

test('A14-B-251 { code:"welcome-1", GOLD 500, maxUses null } → 201, 코드 WELCOME-1(대문자), 기록 COUPON_CREATE', async (t) => {
    if (H.noDb(t)) return;
    const res = await create({ code: 'welcome-1', rewardType: 'GOLD', rewardAmount: 500, maxUses: null });
    assert.equal(res.status, 201);
    assert.equal(res.body.coupon.code, 'WELCOME-1');
    const row = await db.Coupon.findOne({ where: { code: 'WELCOME-1' }, raw: true });
    assert.ok(row, '표 줄');
    const audits = await H.myAudits(ctx.app.admin, { action: 'COUPON_CREATE', targetId: row.id });
    assert.equal(audits.length, 1);
});

// A14-B-252~254 코드 길이 경계 (값 3)
const CODE_EDGES = [
    ['252', 3, 400],
    ['253', 4, 201],
    ['254', 41, 400],
];
for (const [no, length, status] of CODE_EDGES) {
    test(`A14-B-${no} 코드 ${length}자 → ${status === 400 ? '400 field code' : '201'}`, async (t) => {
        if (H.noDb(t)) return;
        const code = codeOf(length);
        assert.equal(code.length, length);
        const res = await create(gold({ code }));
        assert.equal(res.status, status, `상태 ${res.status} ${res.body?.code}`);
        if (status === 400) {
            assert.equal(res.body.field, 'code');
            assert.equal(await db.Coupon.count({ where: { code } }), 0);
        } else {
            assert.equal(await db.Coupon.count({ where: { code } }), 1);
        }
    });
}

test('A14-B-255 이미 있는 코드를 소문자로 보냄 → 409 COUPON_CODE_EXISTS, 줄 1개 그대로', async (t) => {
    if (H.noDb(t)) return;
    const code = codeOf(10);
    assert.equal((await create(gold({ code }))).status, 201);
    const res = await create(gold({ code: code.toLowerCase() }));
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'COUPON_CODE_EXISTS');
    assert.equal(await db.Coupon.count({ where: { code } }), 1);
});

test('A14-B-256 maxUses 2 → 플레이어 ㄱ·ㄴ 됨, ㄷ COUPON_EXHAUSTED, 쓴 사람 2명·usedCount 2', async (t) => {
    if (H.noDb(t)) return;
    const made = await create(gold({ maxUses: 2 }));
    assert.equal(made.status, 201);
    const { id, code } = made.body.coupon;
    const [a, b, c] = await Promise.all(['c256a', 'c256b', 'c256c'].map((label) => H.createPlayer(label)));
    assert.deepEqual(await redeem(a.uuid, code), { ok: true });
    assert.deepEqual(await redeem(b.uuid, code), { ok: true });
    assert.deepEqual(await redeem(c.uuid, code), { ok: false, code: 'COUPON_EXHAUSTED' });
    const used = await ctx.app.agent.get(`/admin-api/coupons/${id}/redemptions`);
    assert.equal(used.status, 200);
    assert.deepEqual(used.body.items.map((r) => r.userUuid).sort(), [a.uuid, b.uuid].sort());
    const list = await ctx.app.agent.get('/admin-api/coupons');
    assert.equal(list.body.items.find((x) => x.id === id).usedCount, 2);
});

// A14-B-257~258 기한 (값 2)
const PERIOD_CASES = [
    ['257', '시작 1분 전에 씀', () => ({ startsAt: new Date(Date.now() + MINUTE).toISOString() }), 'COUPON_NOT_STARTED'],
    ['258', '끝 1분 뒤에 씀', () => ({ startsAt: new Date(Date.now() - 60 * MINUTE).toISOString(), endsAt: new Date(Date.now() - MINUTE).toISOString() }), 'COUPON_EXPIRED'],
];
for (const [no, label, period, code] of PERIOD_CASES) {
    test(`A14-B-${no} ${label} → ${code}, 장부 없음`, async (t) => {
        if (H.noDb(t)) return;
        const made = await create(gold(period()));
        assert.equal(made.status, 201, `만들기 ${made.body?.code}`);
        const player = await H.createPlayer(`c${no}`);
        assert.deepEqual(await redeem(player.uuid, made.body.coupon.code), { ok: false, code });
        assert.equal((await money.ledgerOf(player.uuid)).filter((e) => e.reason === 'COUPON_REWARD').length, 0);
    });
}

test('A14-B-259 같은 쿠폰 두 번 → 두 번째 COUPON_ALREADY_REDEEMED, 장부 COUPON_REWARD 1줄', async (t) => {
    if (H.noDb(t)) return;
    const made = await create(gold());
    const player = await H.createPlayer('c259');
    assert.deepEqual(await redeem(player.uuid, made.body.coupon.code), { ok: true });
    assert.deepEqual(await redeem(player.uuid, made.body.coupon.code), { ok: false, code: 'COUPON_ALREADY_REDEEMED' });
    const { entries } = await money.assertWalletMatchesLedger(player.uuid);
    assert.equal(entries.filter((e) => e.reason === 'COUPON_REWARD').length, 1);
});

test('A14-B-260 다른 쿠폰 둘(골드 500·다이아 10) → 둘 다 받음, 지갑 = 장부 합', async (t) => {
    if (H.noDb(t)) return;
    const goldCoupon = await create(gold({ rewardAmount: 500 }));
    const diamondCoupon = await create(gold({ rewardType: 'DIAMOND', rewardAmount: 10 }));
    const player = await H.createPlayer('c260');
    assert.deepEqual(await redeem(player.uuid, goldCoupon.body.coupon.code), { ok: true });
    assert.deepEqual(await redeem(player.uuid, diamondCoupon.body.coupon.code), { ok: true });
    const { wallet } = await money.assertWalletMatchesLedger(player.uuid);
    assert.equal(wallet.gold, 500);
    assert.equal(wallet.diamond, 10);
});

test('A14-B-261 끈 쿠폰 → 플레이어 COUPON_INACTIVE, 기록 COUPON_TOGGLE', async (t) => {
    if (H.noDb(t)) return;
    const made = await create(gold());
    const { id, code } = made.body.coupon;
    const off = await ctx.app.agent.request('PATCH', `/admin-api/coupons/${id}`, { body: { isActive: false } });
    assert.equal(off.status, 200);
    const player = await H.createPlayer('c261');
    assert.deepEqual(await redeem(player.uuid, code), { ok: false, code: 'COUPON_INACTIVE' });
    const audits = await H.myAudits(ctx.app.admin, { action: 'COUPON_TOGGLE', targetId: id });
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0].after_value, { isActive: false });
});
