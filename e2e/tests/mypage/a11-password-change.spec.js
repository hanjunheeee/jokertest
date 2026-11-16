'use strict';

// 비번 바꾸기 브라우저 시험 (PC 계정 관리): 로비에서 끝까지·바꾼 비번·현재 비번 틀림·5번 틀림 막힘(로그인은 안 잠김)·짧은 새 비번·두 번 누름·다른 브라우저 끊김
// 목록 A11b 브라우저 간단 A11-E-528~534·538 (쓰는 동안 안 돌림: npx playwright test --list tests/mypage/a11-password-change.spec.js)
const { test, expect, ui } = require('../../helpers/fixtures');
const k = require('../auth/_a11b-kit');

test('A11-E-528 로비 배너 → 마이페이지 → "계정 관리" → 비번 바꾸기 → 안내 보임 → 잠깐 뒤 로그인 화면 @smoke', async ({ user }) => {
    const { page, account } = user;
    await k.gotoMyPage(page);
    await page.getByRole('button', { name: '계정 관리', exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(/지금 이메일: .+@/)).toBeVisible();
    expect(await k.changePasswordUi(page, { current: account.password, next: k.testPassword() })).toBe(200);
    await expect(k.pwSection(page).getByText(k.TEXT.pwChanged, { exact: true })).toBeVisible();
    // 안내를 읽을 시간(약 1.5초) 뒤 로그인 화면
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
});

test('A11-E-529 바꾼 뒤 새 비번 로그인 됨, 옛 비번은 실패', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const next = k.testPassword();
    expect(await k.changePasswordUi(page, { current: account.password, next })).toBe(200);
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
    expect(await k.loginFailAlert(page, account.email, account.password)).toBe(k.TEXT.loginFailed);
    await ui.loginViaUi(page, { email: account.email, password: next });
    await expect(page).toHaveURL(/\/lobby$/);
});

test('A11-E-530 현재 비번 틀림 → "현재 비밀번호가 올바르지 않습니다." 보임, 계정 화면 그대로', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    expect(await k.changePasswordUi(page, { current: k.WRONG_PASSWORD, next: k.testPassword() })).toBe(400);
    await expect(k.pwSection(page).getByText(k.TEXT.currentPwWrong, { exact: true })).toBeVisible();
    // 401이 아니라서 공통 처리가 로그아웃시키지 않음 → 계정 화면에 남음
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(/지금 이메일: .+@/)).toBeVisible();
});

test('A11-E-531 5번 틀린 뒤 6번째는 맞는 비번이어도 "현재 비밀번호를 여러 번 잘못 입력했습니다…"', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    await k.failCurrentPassword(page, 5);
    expect(await k.changePasswordUi(page, { current: account.password, next: k.testPassword() })).toBe(429);
    await expect(k.pwSection(page).getByText(k.TEXT.currentPwLocked, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);
});

test('A11-E-532 비번 바꾸기 5번 틀린 뒤에도 로그인은 안 잠김 → 맞는 비번 로그인 → /lobby', async ({ user, players }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    await k.failCurrentPassword(page, 5);
    // 로그아웃 단추가 없어 깨끗한 새 브라우저에서 로그인
    const fresh = await k.freshBrowser(players, account);
    await ui.loginViaUi(fresh.page, account);
    await expect(fresh.page).toHaveURL(/\/lobby$/);
});

test('A11-E-533 새 비번 7자 → 서버 규칙 문구 보임, 비번 그대로', async ({ user, players }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    expect(await k.changePasswordUi(page, { current: account.password, next: k.SHORT_PASSWORD })).toBe(400);
    await expect(k.pwSection(page).getByText(k.TEXT.passwordRule, { exact: true })).toBeVisible();
    // 비번이 안 바뀜 → 원래 비번으로 다른 브라우저 로그인 됨
    const fresh = await k.freshBrowser(players, account);
    await ui.loginViaUi(fresh.page, account);
    await expect(fresh.page).toHaveURL(/\/lobby$/);
});

test('A11-E-534 변경 단추 빠르게 두 번 → PATCH /user/me/password 요청 1번', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const patches = k.countRequests(page, '/user/me/password', 'PATCH');
    const button = await k.fillPasswordChange(page, { current: account.password, next: k.testPassword() });
    await button.dblclick();
    await expect(k.pwSection(page).getByText(k.TEXT.pwChanged, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
    expect(patches.count).toBe(1);
});

test('A11-E-538 같은 계정 다른 브라우저 → 비번 바꿈 → 그 브라우저 다음 이동에서 로그인 화면', async ({ user, players }) => {
    const { page, account } = user;
    // 다른 브라우저: 같은 세션 쿠키를 옮겨 넣음 (따로 로그인하면 이 브라우저 세션이 먼저 끊김), 소켓은 막음 (붙이면 이 브라우저가 밀려나 시험이 섞임)
    const other = await players.add({ account, login: false, lobby: false });
    await k.blockSocket(other.context);
    await k.shareSession(user, other);
    await other.page.goto('/mypage');
    await expect(other.page.getByRole('button', { name: '계정 관리', exact: true })).toBeVisible();
    // 이 브라우저에서 비번 바꿈
    await k.gotoAccount(page);
    expect(await k.changePasswordUi(page, { current: account.password, next: k.testPassword() })).toBe(200);
    // 다른 브라우저가 다음 화면으로 가면 로그인 화면
    await other.page.goto('/lobby');
    await expect(other.page).toHaveURL(/\/login/, { timeout: 15_000 });
});
