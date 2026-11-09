// 본보기(mypage): 로비에서 마이페이지 열기
const { test, expect } = require('../../helpers/fixtures');

test('로비에서 마이페이지를 누르면 → 마이페이지로 가고 내 닉네임이 보임', async ({ user }) => {
    const { page, account } = user;
    await page.getByRole('button', { name: '마이페이지' }).click();
    await expect(page).toHaveURL(/\/mypage/);
    await expect(page.getByText(account.nickname).first()).toBeVisible();
});
