// 문의 창 브라우저 시험 (모바일 375×812, AD-275): 고객센터 → 문의 쓰기 → 내 목록 답 기다림, 가로 넘침 없음
// 서버는 2-14 문의 경로(/inquiries) 그대로
const { test, expect } = require('../../helpers/fixtures');

test('AD-275 모바일 로비 고객센터 → 문의 쓰기 → 내 문의 목록에 답 기다림으로 보임', async ({ user }) => {
    const { page } = user;
    await page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '고객센터' }).click();
    const dialog = page.getByRole('dialog', { name: '고객센터 문의' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/lobby$/);

    await dialog.getByRole('button', { name: '문의 쓰기' }).click();
    const title = `폰에서 멈춤 ${Date.now().toString(36)}`;
    await dialog.getByRole('radio', { name: '버그' }).click();
    await dialog.getByLabel('제목').fill(title);
    await dialog.getByLabel('내용').fill('밤에 화면이 멈춰요');
    await dialog.getByRole('button', { name: '문의 보내기' }).click();

    await expect(dialog.getByRole('status').filter({ hasText: '문의를 보냈어요' })).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: title })).toContainText('답 기다림');

    // 가로로 넘치지 않음
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
});
