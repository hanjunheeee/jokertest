// 본보기(mobile): 세로 375×812 로비 — 메뉴 다섯 개와 광고 자리
const { test, expect } = require('../../helpers/fixtures');

test('모바일에서 로그인 뒤 로비에 오면 → 로비 메뉴와 광고 자리가 보임', async ({ user }) => {
    const { page } = user;
    const menu = page.getByRole('navigation', { name: '로비 메뉴' });
    for (const name of ['게임플레이', '설정', '상점', '기억의 서고', '종료']) {
        await expect(menu.getByRole('button', { name })).toBeVisible();
    }
    await expect(page.getByRole('complementary', { name: '광고' })).toBeVisible();
    // 가로로 넘치지 않음
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
});
