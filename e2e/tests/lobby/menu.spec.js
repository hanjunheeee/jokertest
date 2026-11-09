// 본보기(lobby): 데스크톱 로비 메뉴와 알림 버튼
const { test, expect } = require('../../helpers/fixtures');

test('로그인 뒤 로비에 오면 → 메뉴 다섯 개와 알림·친구 버튼이 보임', async ({ user }) => {
    const { page } = user;
    const menu = page.getByRole('navigation', { name: '로비 메뉴' });
    for (const name of ['게임플레이', '설정', '상점', '기억의 서고', '종료']) {
        await expect(menu.getByRole('button', { name })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /^알림/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '친구 목록' })).toBeVisible();
});
