'use strict';

// [버그 1] 모바일 로비 톱니 브라우저 시험: 톱니는 장식 — 눌러도 주소 그대로·"계정 설정" 단추 없음
// 목록 A11b 브라우저 간단 A11-E-574·575 (쓰는 동안 안 돌림: npx playwright test --list tests/mobile/a11-lobby-gear.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const k = require('../auth/_a11b-kit');

test('A11-E-574 [버그 1] 모바일 로비 톱니 누름 → 주소 /lobby 그대로 @smoke', async ({ user }) => {
    const { page } = user;
    const gear = k.gearImage(page);
    await expect(gear).toBeVisible();
    const box = await gear.boundingBox();
    // 단추가 아니라 그림이라 그 자리를 손가락으로 누름
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    // "아무 데도 안 감"은 기다려 봐야 앎 → 1초 뒤에 봄 (PC E-571과 같게)
    await page.waitForTimeout(1_000);
    await expect(page).toHaveURL(/\/lobby$/);
});

test('A11-E-575 [버그 1] 모바일 로비에 "계정 설정" 이름 단추 0개', async ({ user }) => {
    const { page } = user;
    await expect(k.banner(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '계정 설정' })).toHaveCount(0);
});
