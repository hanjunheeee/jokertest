// 관리자 휴대폰 크기 로그인 브라우저 시험 (AD-056): 375×812에서 로그인 → 운영 현황, 메뉴 서랍 열고 닫기
// 프로젝트 admin-phone (터치), 시험마다 새 관리자·가짜 IP
const { test, expect } = require('../../../helpers/fixtures');
const { allowAccess } = require('../../../helpers/adminAccess');
const { createAdmin, fillLogin } = require('../../../helpers/adminAccounts');

test.describe('관리자 로그인 (휴대폰)', () => {
    test('AD-056: 휴대폰 크기 로그인 → 운영 현황, 메뉴 서랍 열고 다른 영역 고르면 닫힘', async ({ page }) => {
        const admin = await createAdmin();
        await allowAccess(page.context(), admin.email);
        await page.goto('/');
        await expect(page).toHaveURL(/\/login/);

        await fillLogin(page, admin);
        const button = page.getByRole('button', { name: '로그인', exact: true });
        // 누르는 버튼은 손가락 크기(44px) 이상
        expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await button.tap();
        await expect(page).toHaveURL(/\/dashboard$/);

        // 휴대폰은 왼쪽 메뉴 대신 위 막대의 메뉴 버튼, 화면이 옆으로 안 넘침
        const open = page.getByRole('button', { name: '메뉴 열기' });
        await expect(open).toBeVisible();
        await expect(page.getByRole('navigation', { name: '관리자 메뉴' })).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

        await open.tap();
        await expect(open).toHaveAttribute('aria-expanded', 'true');
        const menu = page.getByRole('navigation', { name: '관리자 메뉴' });
        await expect(menu.getByRole('link', { name: '운영 현황' })).toHaveAttribute('aria-current', 'page');

        await menu.getByRole('link', { name: '회원' }).tap();
        await expect(page).toHaveURL(/\/members$/);
        await expect(page.getByRole('navigation', { name: '관리자 메뉴' })).toHaveCount(0);

        // 닫기 버튼으로도 닫힘
        await open.tap();
        await page.getByRole('button', { name: '메뉴 닫기' }).tap();
        await expect(page.getByRole('navigation', { name: '관리자 메뉴' })).toHaveCount(0);
        await expect(open).toBeFocused();
    });
});
