'use strict';

// 관리자 쿠폰 브라우저 시험 (PC 크기) — 관리자가 만든 쿠폰을 플레이어가 상점에서 씀(골드 받음·쓴 사람 1), 횟수 끝·같은 사람 두 번·끈 쿠폰·기간 끝 글
// 목록 시험목록/A14-관리자.md 번호 A14-E-054~058 — 쿠폰 코드는 시험마다 무작위 / 모임만: npx playwright test --list tests/admin/a14-coupons.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const store = require('../store/store-tools');
const k = require('./_a14-kit');

const { E, U } = k;
const DAY_MS = 24 * 60 * 60 * 1000;
const newCode = () => `A14-${k.rand(4).toUpperCase()}`;

// 상점 쿠폰 입력 창에 코드 넣고 "사용하기" → 결과 글 줄
async function redeem(page, code) {
    await store.gotoStore(page);
    await page.getByRole('button', { name: '쿠폰 입력' }).click();
    const box = page.getByRole('dialog', { name: '쿠폰 입력' });
    await expect(box).toBeVisible();
    await box.getByLabel('쿠폰 코드').fill(code);
    await box.getByRole('button', { name: '사용하기' }).click();
    const msg = box.getByRole('alert').or(box.getByRole('status'));
    await expect(msg).toBeVisible();
    return msg;
}

// 관리자 쿠폰 목록에서 그 코드 줄
const couponRow = (page, code) => k.listRows(page, '쿠폰 목록').filter({ hasText: code });

test(`${E(54)} 관리자 화면으로 쿠폰 만들기 → 플레이어 코드 입력 → 골드 받음 → 관리자 쓴 사람 1 @smoke`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const code = newCode();
    const w = await k.openAdmin(browser);
    try {
        await k.goMenu(w.page, '쿠폰');
        await w.page.getByRole('button', { name: '새 쿠폰' }).click();
        const form = w.page.getByRole('form', { name: '새 쿠폰' });
        await form.getByLabel('쿠폰 코드').fill(code);
        await form.getByLabel('보상', { exact: true }).selectOption('GOLD');
        await form.getByLabel('보상 양').fill('500');
        await form.getByRole('button', { name: '만들기' }).click();
        await expect(w.page.getByRole('status').filter({ hasText: `${code} 쿠폰을 만들었어요.` })).toBeVisible();

        const before = (await store.wallet(U(player))).gold;
        const msg = await redeem(player.page, code);
        await expect(msg).toHaveText('골드 500개를 받았습니다.');
        await expectReadable(msg);
        await expect(store.balance(player.page, '골드', before + 500)).toBeVisible();

        await w.page.reload();
        await expect(couponRow(w.page, code)).toContainText('1 / 제한 없음');
        await couponRow(w.page, code).getByRole('button', { name: `${code} 쓴 사람` }).click();
        const used = k.listRows(w.page, '쓴 사람 목록');
        await expect(used).toHaveCount(1);
        await expect(used).toContainText(player.account.nickname);
        await expectReadable(w.page.getByRole('heading', { name: `${code} 쓴 사람 (1명)` }));
    } finally {
        await w.close();
    }
});

test(`${E(55)} 횟수 1 쿠폰 → 첫 사람 됨, 둘째 사람 "모두 사용된 쿠폰" 글`, async ({ browser, players }) => {
    const [first, second] = [await k.openPlayer(players), await k.openPlayer(players)];
    const code = newCode();
    const w = await k.openAdmin(browser);
    try {
        await k.adminApi(w.page, 'POST', '/coupons', { code, rewardType: 'GOLD', rewardAmount: 100, maxUses: 1, startsAt: null, endsAt: null });
    } finally {
        await w.close();
    }
    await expect(await redeem(first.page, code)).toHaveText('골드 100개를 받았습니다.');
    const msg = await redeem(second.page, code);
    await expect(msg).toHaveText('모두 사용된 쿠폰입니다.');
    await expectReadable(msg);
});

test(`${E(56)} 같은 사람이 같은 코드 두 번 → "이미 사용한 쿠폰" 글, 골드는 한 번만`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const code = newCode();
    const w = await k.openAdmin(browser);
    try {
        await k.adminApi(w.page, 'POST', '/coupons', { code, rewardType: 'GOLD', rewardAmount: 300, maxUses: null, startsAt: null, endsAt: null });
    } finally {
        await w.close();
    }
    const before = (await store.wallet(U(player))).gold;
    await expect(await redeem(player.page, code)).toHaveText('골드 300개를 받았습니다.');
    const msg = await redeem(player.page, code);
    await expect(msg).toHaveText('이미 사용한 쿠폰입니다.');
    await expectReadable(msg);
    expect((await store.wallet(U(player))).gold).toBe(before + 300);
});

test(`${E(57)} 관리자가 쿠폰 끄기 → 플레이어 입력 → "사용이 중지된 쿠폰" 글`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const code = newCode();
    const w = await k.openAdmin(browser);
    try {
        await k.adminApi(w.page, 'POST', '/coupons', { code, rewardType: 'GOLD', rewardAmount: 100, maxUses: null, startsAt: null, endsAt: null });
        await k.goMenu(w.page, '쿠폰');
        await couponRow(w.page, code).getByRole('button', { name: `${code} 끄기` }).click();
        await expect(w.page.getByRole('status').filter({ hasText: `${code} 쿠폰을 껐어요.` })).toBeVisible();
        await expect(couponRow(w.page, code)).toContainText('꺼짐');
    } finally {
        await w.close();
    }
    const msg = await redeem(player.page, code);
    await expect(msg).toHaveText('사용이 중지된 쿠폰입니다.');
    await expectReadable(msg);
});

test(`${E(58)} 끝 시각이 지난 쿠폰 → "기간이 끝난 쿠폰" 글`, async ({ players }) => {
    const player = await k.openPlayer(players);
    // 끝 시각이 어제인 쿠폰 (관리자 화면은 지난 끝 시각을 못 넣게 할 수 있어 표에 바로)
    const code = await store.createCoupon({ amount: 100, startsAt: new Date(Date.now() - 2 * DAY_MS), endsAt: new Date(Date.now() - DAY_MS) });
    const msg = await redeem(player.page, code);
    await expect(msg).toHaveText('기간이 끝난 쿠폰입니다.');
    await expectReadable(msg);
});
