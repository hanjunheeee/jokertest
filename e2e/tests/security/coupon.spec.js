// 보안(쿠폰): 한 계정 한 번만, 틀린 코드 맞히기 제한(한 사람 1분 10번), 금액은 서버 쿠폰 값으로만, 기간·중지 쿠폰 거절
// 근거: docs/보안_점검_2026-11-09.md '인증 무차별 대입 제한'(쿠폰), 결정 '보안 쿠폰'
const { test, expect } = require('../../helpers/fixtures');
const { api, login, rand, db } = require('./_sec');

// 시험용 쿠폰 하나 만들기 (코드는 시험마다 다르게 → 서로 안 섞임)
async function makeCoupon({ code, rewardType = 'GOLD', amount = 100, active = true, startsAt = null, endsAt = null } = {}) {
    await db.query(
        'INSERT INTO coupons (code, reward_type, reward_amount, max_uses, used_count, is_active, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, 100000, 0, ?, ?, ?, NOW(), NOW())',
        [code, rewardType, amount, active ? 1 : 0, startsAt, endsAt],
    );
    return code;
}
const couponCode = () => `SEC-${rand().toUpperCase()}`;

test.afterAll(async () => { await db.query("DELETE FROM coupons WHERE code LIKE 'SEC-%'").catch(() => {}); });

test.describe('쿠폰 한 번만·금액 고정', () => {
    test('쿠폰을 쓰면 → 서버 쿠폰 값만큼 지급되고, 같은 계정이 또 쓰면 409', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const code = await makeCoupon({ code: couponCode(), amount: 100 });
        const first = await api('POST', '/economy/coupons/redeem', { cookie, body: { code } });
        expect(first.status).toBeLessThan(400);
        const wallet = await api('GET', `/economy/accounts/${account.uuid}/wallet`, { cookie });
        expect(wallet.json.balanceGold).toBe(100);
        const second = await api('POST', '/economy/coupons/redeem', { cookie, body: { code } });
        expect(second.status).toBe(409);
        // 두 번째로 더 안 받음
        const after = await api('GET', `/economy/accounts/${account.uuid}/wallet`, { cookie });
        expect(after.json.balanceGold).toBe(100);
    });

    test('본문에 지급량(reward_amount)을 끼워 넣어도 → 서버 쿠폰 값만 지급 (본문 무시)', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const code = await makeCoupon({ code: couponCode(), amount: 50 });
        const r = await api('POST', '/economy/coupons/redeem', { cookie, body: { code, reward_amount: 999999, amount: 999999 } });
        // 모르는 칸이면 400, 받아들이면 서버 값(50)만 — 둘 중 하나, 큰 값 지급은 아님
        if (r.status < 400) {
            const wallet = await api('GET', `/economy/accounts/${account.uuid}/wallet`, { cookie });
            expect(wallet.json.balanceGold).toBe(50);
        } else {
            const wallet = await api('GET', `/economy/accounts/${account.uuid}/wallet`, { cookie });
            expect(wallet.json.balanceGold).toBe(0);
        }
    });

    test('다이아 쿠폰을 쓰면 → 다이아만 늘고 골드는 그대로', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const code = await makeCoupon({ code: couponCode(), rewardType: 'DIAMOND', amount: 7 });
        await api('POST', '/economy/coupons/redeem', { cookie, body: { code } });
        const wallet = await api('GET', `/economy/accounts/${account.uuid}/wallet`, { cookie });
        expect(wallet.json.balanceDiamond).toBe(7);
        expect(wallet.json.balanceGold).toBe(0);
    });
});

test.describe('쿠폰 거절', () => {
    test('없는 코드 → 404 COUPON_NOT_FOUND, 지급 없음', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('POST', '/economy/coupons/redeem', { cookie, body: { code: couponCode() } });
        expect(r.status).toBe(404);
        const wallet = await api('GET', `/economy/accounts/${account.uuid}/wallet`, { cookie });
        expect(wallet.json.balanceGold).toBe(0);
    });

    test('중지된 쿠폰 → 409 COUPON_INACTIVE', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const code = await makeCoupon({ code: couponCode(), active: false });
        const r = await api('POST', '/economy/coupons/redeem', { cookie, body: { code } });
        expect(r.status).toBe(409);
        expect(r.json?.code).toBe('COUPON_INACTIVE');
    });

    test('아직 시작 안 한 쿠폰 → 409 COUPON_NOT_STARTED', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const code = couponCode();
        await db.query(
            'INSERT INTO coupons (code, reward_type, reward_amount, max_uses, used_count, is_active, starts_at, ends_at, created_at, updated_at) VALUES (?, "GOLD", 100, 100000, 0, 1, NOW() + INTERVAL 1 DAY, NULL, NOW(), NOW())',
            [code],
        );
        const r = await api('POST', '/economy/coupons/redeem', { cookie, body: { code } });
        expect(r.status).toBe(409);
        expect(r.json?.code).toBe('COUPON_NOT_STARTED');
    });

    test('기간이 끝난 쿠폰 → 409 COUPON_EXPIRED', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const code = couponCode();
        await db.query(
            'INSERT INTO coupons (code, reward_type, reward_amount, max_uses, used_count, is_active, starts_at, ends_at, created_at, updated_at) VALUES (?, "GOLD", 100, 100000, 0, 1, NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 1 DAY, NOW(), NOW())',
            [code],
        );
        const r = await api('POST', '/economy/coupons/redeem', { cookie, body: { code } });
        expect(r.status).toBe(409);
        expect(r.json?.code).toBe('COUPON_EXPIRED');
    });

    test('코드에 SQL·꺾쇠·아주 긴 글자 → 400·404 (500 없음)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        for (const code of ["' OR 1=1--", '<script>', 'A'.repeat(50)]) {
            const r = await api('POST', '/economy/coupons/redeem', { cookie, body: { code } });
            expect(r.status, code).toBeGreaterThanOrEqual(400);
            expect(r.status).toBeLessThan(500);
        }
    });
});

test.describe('쿠폰 맞히기 제한 (한 사람 1분 10번)', () => {
    test('없는 코드를 한 계정으로 10번 넘게 넣으면 → 11번째는 429', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        let limited = false;
        for (let i = 0; i < 13; i += 1) {
            const r = await api('POST', '/economy/coupons/redeem', { cookie, body: { code: couponCode() } });
            if (r.status === 429) { limited = true; expect(r.json?.code).toBe('RATE_LIMITED'); break; }
        }
        expect(limited).toBe(true);
    });
});
