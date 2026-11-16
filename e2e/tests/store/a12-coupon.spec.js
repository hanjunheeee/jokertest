'use strict';

// 상점 쿠폰 브라우저 시험 (PC): 맞는 쿠폰은 골드가 늘고 글, 이미 씀·기간 끝·없는 코드·다 쓰임은 글이 보이고 골드 그대로
// 목록 A12 브라우저 간단 A12-E-056~060 (쓰는 동안 안 돌림: npx playwright test --list tests/store/a12-coupon.spec.js)
const { test, expect, E2E } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const st = require('./store-tools');

const COUPON_URL = `${E2E.apiUrl}/economy/coupons/redeem`;

/** 쿠폰은 같은 ip 10분 30번 제한 → 이 화면의 쿠폰 요청만 시험마다 다른 ip로 (서버는 프록시 1단 뒤 주소를 믿음) */
async function spreadCouponIp(page) {
    const n = () => 1 + Math.floor(Math.random() * 250);
    const ip = `10.${n()}.${n()}.${n()}`;
    await page.route(COUPON_URL, (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }));
}

/** 상점 → 쿠폰 입력 창 열고 코드 넣어 사용하기 → 창 */
async function redeem(page, code) {
    await page.getByRole('button', { name: '쿠폰 입력' }).click();
    const dialog = page.getByRole('dialog', { name: '쿠폰 입력' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: '쿠폰 코드' }).fill(code);
    await dialog.getByRole('button', { name: '사용하기' }).click();
    return dialog;
}

/** 실패 글이 읽히고 골드 그대로인지 */
async function expectFail(page, uuid, dialog, text, gold) {
    await expect(dialog.getByRole('alert')).toHaveText(text);
    await expectReadable(dialog.getByRole('alert'));
    await expect(dialog.getByRole('status')).toHaveCount(0);
    expect((await st.wallet(uuid)).gold).toBe(gold);
    await expect(st.balance(page, '골드', gold)).toBeVisible();
}

test('A12-E-056 맞는 쿠폰(골드 300) → "골드 300개를 받았습니다."가 읽힘, 위 골드 300으로 늘어남 @smoke', async ({ user }) => {
    const { page, account } = user;
    await spreadCouponIp(page);
    const code = await st.createCoupon({ amount: 300 });
    await st.gotoStore(page);
    const dialog = await redeem(page, code);
    await expect(dialog.getByRole('status')).toHaveText('골드 300개를 받았습니다.');
    await expectReadable(dialog.getByRole('status'));
    await expect(st.balance(page, '골드', 300)).toBeVisible();
    expect((await st.wallet(account.uuid)).gold).toBe(300);
    expect(await st.couponUsedCount(code)).toBe(1);
});

test('A12-E-057 이미 쓴 쿠폰을 또 넣음 → "이미 사용한 쿠폰입니다."가 읽힘, 골드 그대로(300)', async ({ user }) => {
    const { page, account } = user;
    await spreadCouponIp(page);
    const code = await st.createCoupon({ amount: 300 });
    await st.gotoStore(page);
    const dialog = await redeem(page, code);
    await expect(dialog.getByRole('status')).toHaveText('골드 300개를 받았습니다.');
    await dialog.getByRole('textbox', { name: '쿠폰 코드' }).fill(code);
    await dialog.getByRole('button', { name: '사용하기' }).click();
    await expectFail(page, account.uuid, dialog, '이미 사용한 쿠폰입니다.', 300);
    expect(await st.couponUsedCount(code)).toBe(1);
});

test('A12-E-058 기간이 끝난 쿠폰 → "기간이 끝난 쿠폰입니다."가 읽힘, 골드 그대로', async ({ user }) => {
    const { page, account } = user;
    await spreadCouponIp(page);
    const code = await st.createCoupon({ amount: 300, startsAt: new Date(Date.now() - 2 * 86_400_000), endsAt: new Date(Date.now() - 86_400_000) });
    await st.gotoStore(page);
    const dialog = await redeem(page, code);
    await expectFail(page, account.uuid, dialog, '기간이 끝난 쿠폰입니다.', 0);
});

test('A12-E-059 없는 코드 → "쿠폰을 찾을 수 없습니다."가 읽힘, 골드 그대로', async ({ user }) => {
    const { page, account } = user;
    await spreadCouponIp(page);
    await st.gotoStore(page);
    const dialog = await redeem(page, `NONE-${st.rand(5)}`);
    await expectFail(page, account.uuid, dialog, '쿠폰을 찾을 수 없습니다.', 0);
});

test('A12-E-060 다 쓰인 쿠폰(최대 1번, 이미 1번 씀) → "모두 사용된 쿠폰입니다."가 읽힘, 골드 그대로', async ({ user }) => {
    const { page, account } = user;
    await spreadCouponIp(page);
    const code = await st.createCoupon({ amount: 300, maxUses: 1, usedCount: 1 });
    await st.gotoStore(page);
    const dialog = await redeem(page, code);
    await expectFail(page, account.uuid, dialog, '모두 사용된 쿠폰입니다.', 0);
    expect(await st.couponUsedCount(code)).toBe(1);
});
