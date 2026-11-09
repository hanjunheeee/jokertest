// 본보기(auth): 로그인 성공·실패 — 로그인 화면을 거쳐서
const { test, expect, ui } = require('../../helpers/fixtures');

test.describe('로그인', () => {
    test('맞는 이메일·비번으로 로그인하면 → 로비로 가고 내 닉네임이 보임', async ({ page, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaUi(page, account);
        await ui.skipIntro(page);
        await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
        await expect(page.getByRole('button', { name: '마이페이지' })).toContainText(account.nickname);
    });

    test('비번을 틀리면 → 알림이 뜨고 로그인 화면에 그대로 있음', async ({ page, accounts }) => {
        const account = await accounts.create();
        await page.goto('/login');
        await page.getByPlaceholder('이메일을 입력하세요').fill(account.email);
        await page.getByPlaceholder('비밀번호를 입력하세요').fill('틀린비번입니다123');
        const message = await ui.captureAlert(page, () => page.getByRole('button', { name: '로그인', exact: true }).click());
        expect(message).toMatch(/이메일|비밀번호/);
        await expect(page).toHaveURL(/\/login$/);
    });
});
