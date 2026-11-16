'use strict';

// 비번 재설정 링크 브라우저 시험 (PC): 끝까지 재설정·옛 비번 막힘·쓴/만료/잘못된 링크 안내·칸 검사·다른 브라우저 세션 끊김·토큰 안 남김
// 목록 A11b 브라우저 간단 A11-E-505~513·518·520·521 (쓰는 동안 안 돌림: npx playwright test --list tests/auth/a11-reset-flow.spec.js)
const crypto = require('node:crypto');
const { test, expect, ui } = require('../../helpers/fixtures');
const k = require('./_a11b-kit');

test('A11-E-505 끝까지 재설정: 메일 링크 → 새 비번 두 칸 → 완료 문구 → "로그인으로 이동" → 새 비번 로그인 → /lobby @smoke', async ({ page, accounts }) => {
    const acc = await accounts.create();
    expect(await k.requestResetUi(page, acc.email)).toBe(200);
    const url = await k.resetLinkFor(acc.email);
    await k.openResetLink(page, url);
    const next = k.testPassword();
    await k.submitNewPassword(page, next);
    await expect(page.getByText(k.TEXT.resetDone, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '로그인으로 이동' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await ui.loginViaUi(page, { email: acc.email, password: next });
    await expect(page).toHaveURL(/\/lobby$/);
});

test('A11-E-506 재설정 뒤 옛 비번 로그인 → 로그인 화면 그대로 + 실패 알림', async ({ page, accounts }) => {
    const acc = await accounts.create();
    await k.resetPasswordVia(page, acc.email, k.testPassword());
    const message = await k.loginFailAlert(page, acc.email, acc.password);
    expect(message).toBe(k.TEXT.loginFailed);
    await expect(page).toHaveURL(/\/login$/);
});

test('A11-E-507 쓴 링크 다시 열기 → "이미 사용된 링크예요…" 보임', async ({ page, accounts }) => {
    const acc = await accounts.create();
    const url = await k.resetPasswordVia(page, acc.email, k.testPassword());
    await page.goto(url);
    await expect(page.getByText(k.TEXT.linkUsed, { exact: true })).toBeVisible();
    await expect(k.newPasswordBox(page)).toHaveCount(0);
});

test('A11-E-508 만료 링크 → "링크가 만료됐어요…" + "다시 요청하기" → 누르면 요청 화면', async ({ page, accounts }) => {
    const acc = await accounts.create();
    await k.requestResetApi(page.context(), acc.email);
    const url = await k.resetLinkFor(acc.email);
    // 30분을 기다리지 않고 시험 DB에서 그 토큰 끝난 시각을 지난 시각으로
    await k.expireResetTokens(acc.uuid);
    await page.goto(url);
    await expect(page.getByText(k.TEXT.linkExpired, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '다시 요청하기' }).click();
    await expect(page).toHaveURL(/\/password-reset\/request$/);
});

test('A11-E-509 잘못된 토큰 /password-reset?token=<아무 43자> → "유효하지 않은 링크예요…"', async ({ page }) => {
    const token = crypto.randomBytes(32).toString('base64url'); // 43자 → 'q3Vb…'
    expect(token).toHaveLength(43);
    await page.goto(`/password-reset?token=${token}`);
    await expect(page.getByText(k.TEXT.linkInvalid, { exact: true })).toBeVisible();
});

test('A11-E-510 토큰 없는 주소 /password-reset → 같은 문구, 링크 확인 요청 0번', async ({ page }) => {
    const verify = k.countRequests(page, '/auth/password-reset/verify');
    await page.goto('/password-reset');
    await expect(page.getByText(k.TEXT.linkInvalid, { exact: true })).toBeVisible();
    expect(verify.count).toBe(0);
});

test('A11-E-511 로그인 안 한 브라우저로 링크 → 새 비번 화면 그대로 (로그인으로 안 튕김)', async ({ page, accounts }) => {
    const acc = await accounts.create();
    await k.requestResetApi(page.context(), acc.email);
    await k.openResetLink(page, await k.resetLinkFor(acc.email));
    await expect(page).toHaveURL(/\/password-reset\?token=/);
    await expect(k.newPasswordConfirmBox(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '비밀번호 변경' })).toBeEnabled();
});

test('A11-E-512 새 비번 7자 → 규칙 문구 보임, 저장 요청 0번', async ({ page, accounts }) => {
    const acc = await accounts.create();
    await k.requestResetApi(page.context(), acc.email);
    await k.openResetLink(page, await k.resetLinkFor(acc.email));
    const confirm = k.countRequests(page, '/auth/password-reset/confirm');
    await k.submitNewPassword(page, k.SHORT_PASSWORD);
    await expect(page.getByText(k.TEXT.passwordRule, { exact: true })).toBeVisible();
    expect(confirm.count).toBe(0);
});

test('A11-E-513 두 칸이 다름 → "비밀번호 확인이 일치하지 않습니다." 보임', async ({ page, accounts }) => {
    const acc = await accounts.create();
    await k.requestResetApi(page.context(), acc.email);
    await k.openResetLink(page, await k.resetLinkFor(acc.email));
    await k.submitNewPassword(page, k.testPassword(), k.testPassword());
    await expect(page.getByText(k.TEXT.confirmMismatch, { exact: true })).toBeVisible();
});

test('A11-E-518 링크를 열어 둔 사이 만료 → 저장하면 만료 안내로 바뀜', async ({ page, accounts }) => {
    const acc = await accounts.create();
    await k.requestResetApi(page.context(), acc.email);
    await k.openResetLink(page, await k.resetLinkFor(acc.email));
    await k.expireResetTokens(acc.uuid);
    await k.submitNewPassword(page, k.testPassword());
    await expect(page.getByText(k.TEXT.linkExpired, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '다시 요청하기' })).toBeVisible();
});

test('A11-E-520 같은 계정으로 로그인한 다른 브라우저 → 재설정 → 그 브라우저 새로고침하면 로그인 화면', async ({ page, accounts, players }) => {
    const acc = await accounts.create();
    // 다른 브라우저: 로그인해서 로비에 있음
    const other = await players.add({ account: acc });
    await expect(other.page).toHaveURL(/\/lobby$/);
    // 이 브라우저(로그인 안 함)에서 재설정
    await k.resetPasswordVia(page, acc.email, k.testPassword());
    await other.page.reload();
    await expect(other.page).toHaveURL(/\/login/, { timeout: 15_000 });
});

test('A11-E-521 재설정 끝난 뒤 localStorage·sessionStorage에 토큰 글자 없음', async ({ page, accounts }) => {
    const acc = await accounts.create();
    const url = await k.resetPasswordVia(page, acc.email, k.testPassword());
    const token = k.tokenOf(url);
    expect(token?.length).toBeGreaterThan(20);
    // 두 저장소의 이름·값 전부 한 글로 → 토큰이 안 들어 있어야 함
    const stored = await page.evaluate(() => {
        const dump = (s) => Object.keys(s).map((key) => `${key}=${s.getItem(key)}`).join('\n');
        return `${dump(window.localStorage)}\n${dump(window.sessionStorage)}`;
    });
    expect(stored).not.toContain(token);
});
