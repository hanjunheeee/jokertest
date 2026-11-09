// 본보기(auth·메일): 비번 재설정 요청 → 메일 속 링크(파일 발송기) 열기 → 재설정 화면
const { test, expect, mail } = require('../../helpers/fixtures');

test('비번 재설정 링크를 요청하면 → 메일이 오고 링크를 열면 새 비번 입력 화면이 보임', async ({ page, accounts }) => {
    const account = await accounts.create();
    const since = Date.now();
    await page.goto('/password-reset/request');
    await page.getByRole('textbox', { name: '가입할 때 등록한 이메일을 입력하세요' }).fill(account.email);
    await page.getByRole('button', { name: '재설정 링크 보내기' }).click();

    const resetUrl = await mail.waitForResetUrl(account.email, { since });
    expect(resetUrl).toContain('/password-reset');
    await page.goto(resetUrl);
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
});
