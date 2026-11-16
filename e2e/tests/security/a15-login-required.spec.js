'use strict';

// 로그인 없이 여는 화면 주소 브라우저 시험 (PC) — 로그인 필요한 화면은 로그인 화면으로 튕기고 원래 내용이 안 보임, 로그인·비번 찾기 화면은 그대로
// 목록 A15-보안.md 번호 A15-E-019~022·025~026 [지금 동작] (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-login-required.spec.js)
const { test, expect } = require('../../helpers/fixtures');

// 로그인 화면 표시 (이메일 칸)
const loginBox = (page) => page.getByPlaceholder('이메일을 입력하세요');

// [번호, 주소, 그 화면에만 있는 것(로그인 안 하면 안 보여야 함)]
const GUARDED = [
    ['A15-E-019', '/lobby', (page) => page.getByRole('navigation', { name: '로비 메뉴' })],
    ['A15-E-020', '/mypage', (page) => page.getByRole('button', { name: '계정 관리', exact: true })],
    ['A15-E-021', '/store', (page) => page.getByRole('button', { name: '쿠폰 입력' })],
    ['A15-E-022', '/ingame', (page) => page.locator('[data-ingame-player-nickname]')],
];

for (const [id, path, ownContent] of GUARDED) {
    const smoke = id === 'A15-E-019' ? ' @smoke' : '';
    test(`${id} 쿠키 없이 ${path} → 로그인 화면, 원래 화면 내용 안 보임${smoke}`, async ({ page, context }) => {
        expect(await context.cookies(), '쿠키 없는 새 창').toEqual([]);
        // "로그인이 필요한 페이지입니다!" 알림은 닫기만
        page.on('dialog', (d) => d.accept().catch(() => {}));
        await page.goto(path);
        await expect(page).toHaveURL(/\/login$/);
        await expect(loginBox(page)).toBeVisible();
        await expect(ownContent(page)).toHaveCount(0);
    });
}

test('A15-E-025 쿠키 없이 로그인 화면(/login) → 그 화면 그대로 (안 튕김)', async ({ page }) => {
    await page.goto('/login');
    await expect(loginBox(page)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
});

test('A15-E-026 쿠키 없이 비밀번호 찾기 화면(/password-reset/request) → 그 화면 그대로, 로그인 화면으로 안 튕김', async ({ page }) => {
    await page.goto('/password-reset/request');
    await expect(page.getByPlaceholder('가입할 때 등록한 이메일을 입력하세요', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/password-reset\/request$/);
});
