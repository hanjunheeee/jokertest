'use strict';

// 로그인 세션 브라우저 시험 (PC) — 로그인 유지 쿠키·브라우저 닫았다 열기·access 만료 뒤 새로고침·유지 30일 끝·로그아웃·다른 브라우저 로그인·재동의 창
// 목록 A11a-가입-로그인-세션.md 번호 A11-E-046~055·057
const { test, expect, DESKTOP } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const social = require('./socialHelpers');
const K = require('./_a11a-kit');

// 저장해 둔 상태로 새 창(새 context) 열기 → 시험 끝에 닫음
async function reopen(browser, state, opened) {
    const context = await browser.newContext({ ...DESKTOP, storageState: state });
    opened.push(context);
    return context.newPage();
}

test.describe('A11a 세션', () => {
    const opened = [];
    test.afterEach(async () => {
        await Promise.all(opened.splice(0).map((c) => c.close().catch(() => {})));
    });

    test('A11-E-046 로그인 유지 쿠키 (PC): 유지 켬 → 브라우저에 refreshToken 쿠키 @smoke', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account, { remember: true });
        expect(await K.cookieNames(context)).toContain('refreshToken');
    });

    test('A11-E-047 로그인 유지 쿠키 (PC): 유지 끔 → refreshToken 쿠키 없음', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account, { remember: false });
        expect(await K.cookieNames(context)).toContain('accessToken');
        expect(await K.cookieNames(context)).not.toContain('refreshToken');
    });

    test('A11-E-048 브라우저 닫았다 열기 (PC): 유지 켬 → 쿠키 그대로 새 창 /lobby → 로비', async ({ browser, page, context, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account, { remember: true });
        // 닫을 때 세션 쿠키는 버려짐 (유지 켬이면 끝 시각이 있어 남음)
        const state = K.dropSessionCookies(await context.storageState());
        await context.close();
        const again = await reopen(browser, state, opened);
        await again.goto('/lobby');
        await ui.skipIntro(again);
        await expect(K.lobbyNav(again)).toBeVisible();
        await expect(again).toHaveURL(/\/lobby$/);
    });

    test('A11-E-049 브라우저 닫았다 열기 (PC): 유지 끔 → 세션 쿠키 버린 새 창 /lobby → /login', async ({ browser, page, context, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account, { remember: false });
        const state = K.dropSessionCookies(await context.storageState());
        await context.close();
        const again = await reopen(browser, state, opened);
        await again.goto('/lobby');
        await expect(again).toHaveURL(/\/login$/);
    });

    test('A11-E-050 access 만료 뒤 새로고침 (PC): 유지 켬 → access를 만료 토큰으로 → 새로고침 → 로비 그대로, /auth/refresh 1번', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account, { remember: true });
        await social.expireAccessCookie(context);
        const refreshCalls = K.trackRequests(page, '/auth/refresh');
        await page.reload();
        await ui.skipIntro(page);
        await expect(K.lobbyNav(page)).toBeVisible();
        await expect(page).toHaveURL(/\/lobby$/);
        expect(refreshCalls).toHaveLength(1);
    });

    test('A11-E-051 로그인 유지 30일 끝 (PC): DB 세션 refresh 끝을 지난 시각으로 + access 만료 → 새로고침 → /login', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account, { remember: true });
        await K.expireRefresh(account.uuid);
        await social.expireAccessCookie(context);
        await page.reload();
        await expect(page).toHaveURL(/\/login$/);
    });

    test('A11-E-052 로그아웃 (PC): 로비 "종료" → /login', async ({ page, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account);
        await K.logoutViaMenu(page);
    });

    test('A11-E-053 로그아웃 (PC): 로그아웃 뒤 주소창 /lobby → /login', async ({ page, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account);
        await K.logoutViaMenu(page);
        await page.goto('/lobby');
        await expect(page).toHaveURL(/\/login$/);
    });

    test('A11-E-054 다른 브라우저 로그인 뒤 옛 쪽 새로고침 (PC): 브라우저 1 로그인 → 브라우저 2 같은 계정 로그인 → 브라우저 1 새로고침 → /login', async ({ players, accounts }) => {
        const account = await accounts.create();
        const first = await players.add({ account, login: false, lobby: false });
        await K.loginToLobby(first.page, account);
        const second = await players.add({ account, login: false, lobby: false });
        await K.loginToLobby(second.page, account);
        await first.page.reload();
        await expect(first.page).toHaveURL(/\/login$/);
    });

    test('A11-E-055 로그아웃 상태로 보호 화면 (PC): 쿠키 없이 /lobby → /login', async ({ page, context }) => {
        expect(await K.cookieNames(context)).toHaveLength(0);
        await page.goto('/lobby');
        await expect(page).toHaveURL(/\/login$/);
    });

    test('A11-E-057 재동의 창 (PC): 새 필수 약관에 동의 안 한 계정 → 로그인 → 로비 위 재동의 창, 닫기 없음 → 동의 → 창 사라짐', async ({ page, accounts }) => {
        // 시험 DB 전체에 새 약관을 넣으면 같이 도는 시험 모두에 창이 뜸 → 지금 약관에 동의 안 한 계정으로 같은 상태를 만듦
        const account = await accounts.create({ agreeTerms: false });
        await K.loginToLobby(page, account);
        const gate = page.getByRole('dialog', { name: '약관이 바뀌었습니다' });
        await expect(gate).toBeVisible();
        await expect(gate.getByRole('button', { name: '닫기' })).toHaveCount(0);
        // Esc로도 안 닫힘
        await page.keyboard.press('Escape');
        await expect(gate).toBeVisible();
        await gate.getByRole('button', { name: '모두 동의하고 계속' }).click();
        await expect(gate).toHaveCount(0);
        await expect(page).toHaveURL(/\/lobby$/);
    });
});
