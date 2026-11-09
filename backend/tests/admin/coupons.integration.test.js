'use strict';

// 쿠폰 통합 시험 (AD-210~213), 진짜 시험 DB + 관리자 라우터 + 플레이어 쿠폰 입력(services/ops/coupon.js)
// npm run test:with-db -- tests/admin/coupons.integration.test.js (F01_TEST_DATABASE_URL 없으면 건너뜀)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');
const money = require('./helpers/money');

let dbHandle = null;
test.before(async () => { dbHandle = await prepareAdminDb(); });
test.after(async () => { if (dbHandle) await dbHandle.close(); });

const skipWithoutDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 진짜 MySQL 없이는 확인 못 함');
    return true;
};

const db = () => require('../../models');
const { redeemCoupon } = require('../../services/ops/coupon');
const newCode = () => `adm-${crypto.randomBytes(3).toString('hex')}`;

test('AD-210: 만들기 → 코드 대문자·기록, 같은 코드 409 COUPON_CODE_EXISTS, 규칙 어김 400 INVALID_COUPON { field }', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent, admin } = await adminTestApp({ t });
    const code = newCode();

    const res = await agent.post('/admin-api/coupons', { code, rewardType: 'GOLD', rewardAmount: 500, maxUses: 10, startsAt: null, endsAt: null });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.coupon.code, code.toUpperCase());
    assert.equal(res.body.coupon.isActive, true);
    assert.equal(res.body.coupon.usedCount, 0);
    const row = await db().Coupon.findByPk(res.body.coupon.id, { raw: true });
    assert.equal(row.created_by_admin_id, admin.id);
    const logs = await money.auditLogsOf('COUPON_CREATE', row.id);
    assert.equal(logs.length, 1);

    const dup = await agent.post('/admin-api/coupons', { code: code.toUpperCase(), rewardType: 'DIAMOND', rewardAmount: 1 });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.code, 'COUPON_CODE_EXISTS');

    const startsAt = new Date(Date.now() + 86_400_000).toISOString();
    for (const [patch, field] of [
        [{ code: 'ab' }, 'code'], [{ code: '한글코드' }, 'code'], [{ rewardType: 'RUBY' }, 'rewardType'],
        [{ rewardAmount: 0 }, 'rewardAmount'], [{ rewardAmount: 1_000_000_001 }, 'rewardAmount'], [{ maxUses: 0 }, 'maxUses'],
        [{ startsAt: '내일' }, 'startsAt'], [{ startsAt, endsAt: new Date().toISOString() }, 'endsAt'],
    ]) {
        const bad = await agent.post('/admin-api/coupons', { code: newCode(), rewardType: 'GOLD', rewardAmount: 10, ...patch });
        assert.equal(bad.status, 400, field);
        assert.equal(bad.body.code, 'INVALID_COUPON');
        assert.equal(bad.body.field, field);
    }
    const unknown = await agent.post('/admin-api/coupons', { code: newCode(), rewardType: 'GOLD', rewardAmount: 10, usedCount: 5 });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.field, 'usedCount');
});

test('AD-211: 만든 쿠폰을 플레이어가 씀 → 보상·장부 COUPON_REWARD·쓴 사람 1, 지갑 = 장부 합', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('cr');
    const made = await agent.post('/admin-api/coupons', { code: newCode(), rewardType: 'DIAMOND', rewardAmount: 30, maxUses: 5 });

    const used = await redeemCoupon({ userId: member.uuid, code: made.body.coupon.code.toLowerCase() });

    assert.deepEqual(used.reward, { currency: 'DIAMOND', amount: 30 });
    const { wallet, entries } = await money.assertWalletMatchesLedger(member.uuid);
    assert.equal(wallet.diamond, 30);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].reason, 'COUPON_REWARD');
    const list = await agent.get('/admin-api/coupons');
    assert.equal(list.body.items.find((item) => item.id === made.body.coupon.id).usedCount, 1);
});

test('AD-212: 끄기 → 플레이어 409 COUPON_INACTIVE·장부 없음, 다시 켜면 됨, 없는 쿠폰 404, 기록 둘', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const member = await money.createMember('ci');
    const made = await agent.post('/admin-api/coupons', { code: newCode(), rewardType: 'GOLD', rewardAmount: 100 });
    const { id, code } = made.body.coupon;

    const off = await agent.request('PATCH', `/admin-api/coupons/${id}`, { body: { isActive: false } });
    assert.equal(off.status, 200);
    assert.equal(off.body.coupon.isActive, false);
    await assert.rejects(redeemCoupon({ userId: member.uuid, code }), (error) => error.code === 'COUPON_INACTIVE');
    assert.equal((await money.ledgerOf(member.uuid)).length, 0);

    const on = await agent.request('PATCH', `/admin-api/coupons/${id}`, { body: { isActive: true } });
    assert.equal(on.body.coupon.isActive, true);
    await redeemCoupon({ userId: member.uuid, code });
    await money.assertWalletMatchesLedger(member.uuid);
    assert.equal((await money.auditLogsOf('COUPON_TOGGLE', id)).length, 2);

    const missing = await agent.request('PATCH', '/admin-api/coupons/99999999', { body: { isActive: false } });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'COUPON_NOT_FOUND');
    const badBody = await agent.request('PATCH', `/admin-api/coupons/${id}`, { body: { isActive: 'no' } });
    assert.equal(badBody.status, 400);
});

test('AD-213: 쓴 사람 목록 — 닉네임·시각, 커서로 이어 봄, 없는 쿠폰 404', async (t) => {
    if (skipWithoutDb(t)) return;
    const { agent } = await adminTestApp({ t });
    const made = await agent.post('/admin-api/coupons', { code: newCode(), rewardType: 'GOLD', rewardAmount: 1 });
    const { id, code } = made.body.coupon;
    const members = [await money.createMember('ca'), await money.createMember('cb'), await money.createMember('cc')];
    for (const member of members) await redeemCoupon({ userId: member.uuid, code });

    const all = await agent.get(`/admin-api/coupons/${id}/redemptions`);
    assert.equal(all.status, 200);
    assert.equal(all.body.items.length, 3);
    assert.deepEqual(all.body.items.map((item) => item.nickname).sort(), members.map((member) => member.nickname).sort());
    assert.ok(all.body.items.every((item) => item.redeemedAt && item.userUuid));

    const page1 = await agent.get(`/admin-api/coupons/${id}/redemptions?limit=2`);
    assert.equal(page1.body.items.length, 2);
    const page2 = await agent.get(`/admin-api/coupons/${id}/redemptions?limit=2&before=${page1.body.nextBefore}`);
    assert.equal(page2.body.items.length, 1);
    assert.equal(page2.body.nextBefore, null);
    const seen = new Set([...page1.body.items, ...page2.body.items].map((item) => item.userUuid));
    assert.equal(seen.size, 3);

    const missing = await agent.get('/admin-api/coupons/99999999/redemptions');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'COUPON_NOT_FOUND');
});
