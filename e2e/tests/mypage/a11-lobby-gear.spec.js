'use strict';

// [버그 1] 로비 톱니 브라우저 시험 (PC): 톱니는 장식 — 눌러도 주소 그대로·"계정 설정" 단추 없음·Tab 차례에도 없음
// 목록 A11b 브라우저 간단 A11-E-571~573 (쓰는 동안 안 돌림: npx playwright test --list tests/mypage/a11-lobby-gear.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const k = require('../auth/_a11b-kit');

// 톱니 그림 가운데 좌표를 진짜 마우스로 누름 (단추가 아니라 click()으로 못 고름)
async function clickGearSpot(page) {
    const gear = k.gearImage(page);
    await expect(gear).toBeVisible();
    const box = await gear.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('A11-E-571 [버그 1] 톱니 자리 누름 → 1초 뒤에도 주소 /lobby, 마이페이지·계정 관리 안 열림 @smoke', async ({ user }) => {
    const { page } = user;
    await clickGearSpot(page);
    // "아무 데도 안 감"은 기다려 봐야 앎 → 목록대로 1초 뒤에 봄
    await page.waitForTimeout(1_000);
    await expect(page).toHaveURL(/\/lobby$/);
    await expect(page.getByText(/지금 이메일:/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '계정 관리', exact: true })).toHaveCount(0);
});

test('A11-E-572 [버그 1] 로비에 "계정 설정" 이름 단추 0개', async ({ user }) => {
    const { page } = user;
    await expect(k.banner(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '계정 설정' })).toHaveCount(0);
});

test('A11-E-573 [버그 1] 키보드로도 못 감: Tab 차례에 톱니 없음, 배너 다음 초점이 톱니 아님', async ({ user }) => {
    const { page } = user;
    await expect(k.gearImage(page)).toBeVisible();
    const gearSrc = await k.gearImage(page).getAttribute('src');
    // 지금 초점 요소가 톱니 그림을 품었나
    const focusOnGear = () => page.evaluate((src) => {
        const el = document.activeElement;
        return Boolean(el && el !== document.body && [...el.querySelectorAll('img')].some((img) => img.getAttribute('src') === src));
    }, gearSrc);
    await k.banner(page).focus();
    await page.keyboard.press('Tab');
    expect(await focusOnGear()).toBe(false);
    // 로비 한 바퀴 Tab (30번) 동안 한 번도 톱니에 안 감
    for (let i = 0; i < 30; i += 1) {
        await page.keyboard.press('Tab');
        expect(await focusOnGear(), `${i + 2}번째 Tab`).toBe(false);
    }
    await expect(page).toHaveURL(/\/lobby$/);
});
