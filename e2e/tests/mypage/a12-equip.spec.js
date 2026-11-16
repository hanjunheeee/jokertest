'use strict';

// 마이페이지 스킨&카드 착용 브라우저 시험 (PC): 안 산 스킨은 못 고름·두 탭에서 착용하면 늦은 쪽에 충돌 안내
// 목록 A12 브라우저 간단 A12-E-066~067 ([지금 동작], 쓰는 동안 안 돌림: npx playwright test --list tests/mypage/a12-equip.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const st = require('../store/store-tools');

/** 마이페이지 → 스킨&카드 착용 창 (처음 탭은 귀족) */
async function openWear(page) {
    await page.goto('/mypage');
    await page.getByRole('button', { name: '스킨&카드 착용', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '스킨&카드 착용' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '귀족1, 착용 중', exact: true })).toBeVisible();
    return dialog;
}

test('A12-E-066 [지금 동작] 스킨&카드 착용 → 안 산 스킨(귀족-블러드)은 미보유로 고를 수 없음, 적용해도 장착 그대로 @smoke', async ({ user }) => {
    const { page, account } = user;
    const dialog = await openWear(page);
    const locked = dialog.getByRole('button', { name: '귀족-블러드, 미보유', exact: true });
    await expect(locked).toBeDisabled();
    await locked.click({ force: true });
    await expect(locked).toHaveAttribute('aria-pressed', 'false');
    await dialog.getByRole('button', { name: '적용' }).click();
    await expect.poll(async () => (await st.loadout(account.uuid))?.selected_skin_noble ?? '').not.toContain('블러드');
    expect(await st.owned(account.uuid)).not.toContain('player-skin-귀족1-블러드');
});

test('A12-E-067 [지금 동작] 두 탭에서 착용 창 → 탭 2에서 바꿔 적용 → 탭 1에서 적용 → 충돌 안내(다시 불러오기)가 읽힘', async ({ user }) => {
    const { page, account, context } = user;
    const other = await context.newPage();
    const first = await openWear(page);
    const second = await openWear(other);

    await second.getByRole('button', { name: '귀족2', exact: true }).click();
    await second.getByRole('button', { name: '적용' }).click();
    await expect(second).toBeHidden();
    await expect.poll(async () => (await st.loadout(account.uuid))?.selected_skin_noble ?? '').toContain('귀족2');

    await first.getByRole('button', { name: '귀족3', exact: true }).click();
    await first.getByRole('button', { name: '적용' }).click();
    const alert = page.getByRole('alert').filter({ hasText: /다시 불러/ });
    await expectReadable(alert);
    // 늦은 쪽은 안 들어감
    expect((await st.loadout(account.uuid))?.selected_skin_noble ?? '').toContain('귀족2');
});
