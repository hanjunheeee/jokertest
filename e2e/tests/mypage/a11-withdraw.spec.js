'use strict';

// 회원 탈퇴 브라우저 시험 (PC 계정 관리): 확인 창 안내·탈퇴 뒤 로그인 막힘·창 닫기·틀린 비번·6번째 막힘·판 중 409(5·10명)·소셜 전용 계정·같은 이메일 다시 가입
// 목록 A11b 브라우저 간단 A11-E-549~558 (쓰는 동안 안 돌림: npx playwright test --list tests/mypage/a11-withdraw.spec.js)
const { test, expect, ui } = require('../../helpers/fixtures');
const { prepareValidSignup, submitSignup } = require('../auth/authHelpers');
const k = require('../auth/_a11b-kit');

test('A11-E-549 비번 → "탈퇴" → 확인 창 안내 4줄 보임 → "탈퇴하기" → 로그인 화면 @smoke', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const dialog = await k.openWithdrawConfirm(page, account.password);
    await expect(dialog.getByRole('listitem')).toHaveText([...k.WITHDRAW_NOTICE_LINES]);
    const res = page.waitForResponse(k.isPost('/user/me/withdraw'));
    await dialog.getByRole('button', { name: '탈퇴하기' }).click();
    expect((await res).status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
});

test('A11-E-550 탈퇴한 계정의 이메일·비번으로 로그인 → 실패 알림', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    expect(await k.withdrawUi(page, account.password)).toBe(200);
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
    expect(await k.loginFailAlert(page, account.email, account.password)).toBe(k.TEXT.loginFailed);
    await expect(page).toHaveURL(/\/login$/);
});

test('A11-E-551 확인 창 닫기 → 새로고침해도 계정 화면 그대로', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const withdrawCalls = k.countRequests(page, '/user/me/withdraw', 'POST');
    const dialog = await k.openWithdrawConfirm(page, account.password);
    await dialog.getByRole('button', { name: '취소' }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(`지금 이메일: ${account.email}`, { exact: true })).toBeVisible();
    expect(withdrawCalls.count).toBe(0);
});

test('A11-E-552 틀린 비번 → "비밀번호가 올바르지 않습니다."', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    expect(await k.withdrawUi(page, k.WRONG_PASSWORD)).toBe(400);
    await expect(k.withdrawSection(page).getByText(k.TEXT.withdrawPwWrong, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);
});

test('A11-E-553 5번 틀린 뒤 6번째(맞는 비번) → "여러 번 잘못 입력했습니다…"', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    for (let i = 1; i <= 5; i += 1) expect(await k.withdrawUi(page, k.WRONG_PASSWORD), `${i}번째`).toBe(400);
    expect(await k.withdrawUi(page, account.password)).toBe(429);
    await expect(k.withdrawSection(page).getByText(k.TEXT.withdrawLocked, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);
});

test('A11-E-554 판 중 탈퇴 거절 (5명 판, 사람 1 + 봇 4): 그 사람 쿠키로 탈퇴 요청 → 409, 판 화면 그대로·판 계속 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await k.startCitizenGame(table, user, 5);
    await k.expectWithdrawBlockedInGame(t, user);
});

test('A11-E-555 판 중 탈퇴 거절 (10명 판, 사람 1 + 봇 9): 409, 판 화면 그대로·판 계속 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await k.startCitizenGame(table, user, 10);
    await k.expectWithdrawBlockedInGame(t, user);
});

test('A11-E-556 소셜 전용 계정 탈퇴: 본인 확인 칸이 이메일 칸 → 계정 이메일 → 로그인 화면', async ({ user }) => {
    const { page, account } = user;
    await k.makeSocialOnly(account.uuid);
    await k.gotoAccount(page);
    const s = k.withdrawSection(page);
    await expect(s.locator('input[name="withdrawConfirmEmail"]')).toBeVisible();
    await expect(s.locator('input[name="withdrawPassword"]')).toHaveCount(0);
    expect(await k.withdrawUi(page, account.email)).toBe(200);
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
});

test('A11-E-557 소셜 전용 계정에 다른 이메일 → "계정 이메일을 정확히 입력해주세요."', async ({ user }) => {
    const { page, account } = user;
    await k.makeSocialOnly(account.uuid);
    await k.gotoAccount(page);
    expect(await k.withdrawUi(page, k.freshEmail('other'))).toBe(400);
    await expect(k.withdrawSection(page).getByText(k.TEXT.withdrawEmailMismatch, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);
});

test('A11-E-558 탈퇴 → 같은 이메일로 가입(인증 메일 포함) → 로그인 → /lobby', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    expect(await k.withdrawUi(page, account.password)).toBe(200);
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
    const values = await prepareValidSignup(page, { email: account.email, password: k.testPassword() });
    expect(await submitSignup(page)).toMatch(/회원가입이 완료되었습니다/);
    await ui.loginViaUi(page, { email: account.email, password: values.password });
    await expect(page).toHaveURL(/\/lobby$/);
});
