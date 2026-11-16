'use strict';

// 관리자 판 설정 브라우저 시험 (휴대폰 크기) — 좁은 창에서 메뉴 서랍으로 "판 설정"에 들어가 판 골드를 바꿈
// 목록 시험목록/A07-승패-결과-골드.md A07-E-063 (값을 바꿔서 @serial), 모이는지만 봄: npx playwright test --list tests/admin/phone/a07-game-settings.spec.js
const { test, expect } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const admins = require('../../../helpers/adminAccounts');
const k = require('../../ingame/_a07-simple-kit');

const { settingsScreen: screen } = k;

test('A07-E-063 관리자 폰 화면: 메뉴 서랍 → 판 설정 → 2로 바꾸기 → "2골드" @serial @smoke', async ({ page }) => {
    const admin = await admins.createAdmin();
    await admins.loginAsAdmin(page, admin);
    try {
        // 좁은 창은 왼쪽 메뉴 대신 "메뉴 열기" 서랍
        await page.getByRole('button', { name: '메뉴 열기' }).click();
        await page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('link', { name: '판 설정', exact: true }).click();
        await expect(page).toHaveURL(/\/game-settings/);
        await expect(screen.now(page)).toHaveText('1골드');
        const box = await k.askGoldChange(page, 2);
        await expectReadable(box.getByText('1골드 → 2골드', { exact: true }));
        await expectReadable(box.getByRole('button', { name: '바꾸기' }));
        await box.getByRole('button', { name: '바꾸기' }).click();
        await expect(box).toBeHidden();
        await expect(screen.now(page)).toHaveText('2골드');
        await expectReadable(screen.now(page));
        expect(await k.goldSetting()).toBe(2);
    } finally {
        // 값은 서버 전체가 같이 씀 → 꼭 1로 되돌림
        await k.setGold(page, 1);
    }
});
