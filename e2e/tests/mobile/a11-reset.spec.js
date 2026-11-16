'use strict';

// 모바일 비번 찾기·재설정 브라우저 시험: 요청 안내·끝까지 재설정·PC 링크를 폰에서·쓴/만료/잘못된 링크·로그아웃 상태·눈 그림·오류 글·칸 글자 크기
// 목록 A11b 브라우저 간단 A11-E-580~590 (쓰는 동안 안 돌림: npx playwright test --list tests/mobile/a11-reset.spec.js)
const crypto = require('node:crypto');
const { test, expect, ui, mail } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('../auth/_a11b-kit');

// 폰 화면 주소로 바꾼 재설정 링크까지 (요청은 준비라 화면 안 거침)
async function phoneLink(page, accounts) {
    const acc = await accounts.create();
    await k.requestResetApi(page.context(), acc.email);
    const url = await k.resetLinkFor(acc.email, { mobile: true });
    return { acc, url };
}

test('A11-E-580 모바일 비번 찾기 요청 → 접수 안내 보임 @smoke', async ({ page, accounts }) => {
    const acc = await accounts.create();
    expect(await k.requestResetUi(page, acc.email)).toBe(200);
    await expectReadable(k.requestSentNotice(page, true));
});

test('A11-E-581 모바일 끝까지 재설정: 링크 → 새 비번 → 완료 → 로그인 → /lobby', async ({ page, accounts }) => {
    const { acc, url } = await phoneLink(page, accounts);
    await k.openResetLink(page, url);
    const next = k.testPassword();
    await k.submitNewPassword(page, next);
    await expect(page.getByText(k.TEXT.resetDone, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '로그인으로 이동' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await ui.loginViaUi(page, { email: acc.email, password: next });
    await expect(page).toHaveURL(/\/lobby$/);
});

test('A11-E-582 PC 링크를 폰에서: 메일 링크를 모바일 주소로 바꿔(같은 경로·쿼리) 열기 → 새 비번 화면', async ({ page, accounts }) => {
    const acc = await accounts.create();
    await k.requestResetApi(page.context(), acc.email);
    const pcUrl = await mail.waitForResetUrl(acc.email);
    const phoneUrl = mail.toMobile(pcUrl);
    // 앞 주소만 바뀌고 경로·token은 그대로
    expect(new URL(phoneUrl).pathname).toBe(new URL(pcUrl).pathname);
    expect(new URL(phoneUrl).search).toBe(new URL(pcUrl).search);
    await k.openResetLink(page, phoneUrl);
    await expect(k.newPasswordConfirmBox(page)).toBeVisible();
});

test('A11-E-583 모바일 쓴 링크 다시 → "이미 사용된 링크예요…"', async ({ page, accounts }) => {
    const acc = await accounts.create();
    const url = await k.resetPasswordVia(page, acc.email, k.testPassword(), { mobile: true });
    await page.goto(url);
    await expect(page.getByText(k.TEXT.linkUsed, { exact: true })).toBeVisible();
});

test('A11-E-584 모바일 만료 링크 → 만료 문구 + "다시 요청하기"', async ({ page, accounts }) => {
    const { acc, url } = await phoneLink(page, accounts);
    await k.expireResetTokens(acc.uuid);
    await page.goto(url);
    await expect(page.getByText(k.TEXT.linkExpired, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '다시 요청하기' })).toBeVisible();
});

test('A11-E-585 모바일 잘못된 링크 → 유효하지 않은 링크 문구', async ({ page }) => {
    await page.goto(`/password-reset?token=${crypto.randomBytes(32).toString('base64url')}`);
    await expect(page.getByText(k.TEXT.linkInvalid, { exact: true })).toBeVisible();
});

test('A11-E-586 모바일 로그아웃 상태 링크 → 로그인으로 안 튕김', async ({ page, accounts }) => {
    const { url } = await phoneLink(page, accounts);
    await k.openResetLink(page, url);
    await expect(page).toHaveURL(/\/password-reset\?token=/);
    await expect(k.newPasswordConfirmBox(page)).toBeVisible();
});

test('A11-E-587 모바일 새 비번 칸 눈 그림 단추가 읽힘 (그림 단추 대비 3 이상)', async ({ page, accounts }) => {
    const { url } = await phoneLink(page, accounts);
    await k.openResetLink(page, url);
    await k.expectIconReadable(k.eyeButtonOf(k.newPasswordBox(page)));
});

test('A11-E-588 모바일 확인 다름 문구가 읽힘', async ({ page, accounts }) => {
    const { url } = await phoneLink(page, accounts);
    await k.openResetLink(page, url);
    await k.submitNewPassword(page, k.testPassword(), k.testPassword());
    await expectReadable(page.getByText(k.TEXT.confirmMismatch, { exact: true }));
});

test('A11-E-589 모바일 보기 단추 누름 → 보였다 숨었다', async ({ page, accounts }) => {
    const { url } = await phoneLink(page, accounts);
    await k.openResetLink(page, url);
    const box = k.newPasswordBox(page);
    const typed = k.testPassword();
    await box.fill(typed);
    await k.eyeButtonOf(box).click();
    await expect(box).toHaveAttribute('type', 'text');
    await expect(box).toHaveValue(typed);
    await k.eyeButtonOf(box).click();
    await expect(box).toHaveAttribute('type', 'password');
});

test('A11-E-590 모바일 새 비번 칸 실제 글자 크기 16px 이상 (폰이 확대 안 하게), autocomplete="new-password"', async ({ page, accounts }) => {
    const { url } = await phoneLink(page, accounts);
    await k.openResetLink(page, url);
    for (const box of [k.newPasswordBox(page), k.newPasswordConfirmBox(page)]) {
        const size = await box.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
        expect(size).toBeGreaterThanOrEqual(16);
        await expect(box).toHaveAttribute('autocomplete', 'new-password');
    }
});
