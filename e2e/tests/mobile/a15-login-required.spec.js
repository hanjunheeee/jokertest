'use strict';

// 로그인 없이 여는 화면 주소 브라우저 시험 (모바일) — 로비·상점 주소는 로그인 화면으로 튕기고 원래 내용이 안 보임
// 목록 A15-보안.md 번호 A15-E-023~024 [지금 동작] (쓰는 동안 안 돌림: npx playwright test --list tests/mobile/a15-login-required.spec.js)
const { test, expect } = require('../../helpers/fixtures');

// [번호, 주소, 그 화면에만 있는 것]
const GUARDED = [
    ['A15-E-023', '/lobby', (page) => page.getByRole('navigation', { name: '로비 메뉴' })],
    // 모바일 상점 위 줄 "쿠폰" 단추
    // 합친 뒤 "쿠폰" 단추는 숨김 → 상점이 열린 표시는 "보유 재화" 칸
    ['A15-E-024', '/store', (page) => page.getByLabel('보유 재화', { exact: true })],
];

for (const [id, path, ownContent] of GUARDED) {
    const smoke = id === 'A15-E-023' ? ' @smoke' : '';
    test(`${id} 모바일 쿠키 없이 ${path} → 로그인 화면, 원래 화면 내용 안 보임${smoke}`, async ({ page, context }) => {
        expect(await context.cookies(), '쿠키 없는 새 창').toEqual([]);
        await page.goto(path);
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByPlaceholder('이메일을 입력하세요')).toBeVisible();
        await expect(ownContent(page)).toHaveCount(0);
    });
}
