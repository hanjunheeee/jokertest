'use strict';

// 관리자 로그인 브라우저 시험 (휴대폰 크기 375×812) — 로그인 → 운영 현황·메뉴 서랍 열고 닫기, 5번 틀린 뒤 잠김 글이 읽힘
// 목록 시험목록/A14-관리자.md 번호 A14-E-012~013 — 모임만: npx playwright test --list tests/admin/phone/a14-login.spec.js
const { test, expect } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const { fillLogin, otpNow } = require('../../../helpers/adminAccounts');
const { allowAccess } = require('../../../helpers/adminAccess');
const k = require('../_a14-kit');

const { E, TEXT } = k;
const loginButton = (page) => page.getByRole('button', { name: '로그인', exact: true });

test(`${E(12)} 휴대폰 크기 로그인 → 운영 현황, 메뉴 서랍 열고 닫힘 @smoke`, async ({ browser }) => {
    const w = await k.openAdmin(browser, { phone: true });
    try {
        await expect(w.page).toHaveURL(/\/dashboard/);
        await expectReadable(k.heading(w.page, '운영 현황'));
        const menu = w.page.getByRole('navigation', { name: '관리자 메뉴' });
        await expect(menu).toHaveCount(0);
        await w.page.getByRole('button', { name: '메뉴 열기' }).click();
        await expect(menu).toBeVisible();
        await expectReadable(menu.getByRole('link', { name: '회원', exact: true }));
        await w.page.getByRole('button', { name: '메뉴 닫기' }).click();
        await expect(menu).toHaveCount(0);
        await expect(w.page.getByRole('button', { name: '메뉴 열기' })).toBeFocused();
    } finally {
        await w.close();
    }
});

test(`${E(13)} 휴대폰 크기 5번 틀린 뒤 → 잠김 글이 읽힘`, async ({ browser }) => {
    const w = await k.openAdminWindow(browser, { phone: true });
    try {
        await allowAccess(w.context, w.admin.email);
        await w.page.goto('/login');
        for (let i = 0; i < 5; i += 1) {
            await fillLogin(w.page, w.admin, { password: `${w.admin.password}x`, otp: otpNow(w.admin.totpSecret) });
            await loginButton(w.page).click();
            await expect(w.page.getByRole('alert')).toHaveText(TEXT.loginFailed);
        }
        await fillLogin(w.page, w.admin);
        await loginButton(w.page).click();
        await expect(w.page.getByRole('alert')).toHaveText(TEXT.locked);
        await expectReadable(w.page.getByRole('alert'));
    } finally {
        await w.close();
    }
});
