'use strict';

// 관리자 로그인 브라우저 시험 (PC 크기) — 문 1(Access)·문 2(아이디·비번·OTP), 틀림·잠김 글, 가만히 30분 자동 로그아웃, 로그아웃, 플레이어 쪽에서 관리자 길이 막힘
// 목록 시험목록/A14-관리자.md 번호 A14-E-001~011 — 돌리지 않고 모임만: npx playwright test --list tests/admin/a14-login.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { E2E } = require('../../helpers/env');
const { createAdmin, fillLogin, otpNow, setAdminSessionIdle } = require('../../helpers/adminAccounts');
const { allowAccess } = require('../../helpers/adminAccess');
const k = require('./_a14-kit');

const { E, TEXT } = k;
const loginButton = (page) => page.getByRole('button', { name: '로그인', exact: true });
const loginAlert = (page) => page.getByRole('alert');

// 맞는 OTP의 한 자리만 바꾼 번호 (틀린 OTP)
const wrongOtp = (secret) => {
    const code = otpNow(secret);
    return `${(Number(code[0]) + 5) % 10}${code.slice(1)}`;
};

// 비번만 틀리게 한 번 → 틀림 글이 뜰 때까지 (OTP는 맞는 번호 — 실패한 로그인은 OTP 번호를 안 씀)
async function wrongPasswordOnce(page, account) {
    await fillLogin(page, account, { password: `${account.password}x`, otp: otpNow(account.totpSecret) });
    await loginButton(page).click();
    await expect(loginAlert(page)).toHaveText(TEXT.loginFailed);
}

test(`${E(1)} Access 쿠키 + 아이디·비번·OTP → 운영 현황 @smoke`, async ({ browser }) => {
    const w = await k.openAdmin(browser);
    try {
        await expect(w.page).toHaveURL(/\/dashboard/);
        await expectReadable(k.heading(w.page, '운영 현황'));
    } finally {
        await w.close();
    }
});

test(`${E(2)} Access 쿠키 없이 관리자 주소 → "접근 권한 없음", 로그인 칸 없음`, async ({ browser }) => {
    const w = await k.openAdminWindow(browser);
    try {
        await w.page.goto('/login');
        await expectReadable(k.heading(w.page, TEXT.noAccess));
        await expect(w.page.getByLabel('아이디', { exact: true })).toHaveCount(0);
        await expect(w.page.getByLabel('OTP 번호 6자리', { exact: true })).toHaveCount(0);
    } finally {
        await w.close();
    }
});

test(`${E(3)} 다른 이메일로 Access 통과 → 로그인 → 이메일 다름 글`, async ({ browser }) => {
    const w = await k.openAdminWindow(browser);
    try {
        await allowAccess(w.context, `other-${k.rand()}@example.test`);
        await w.page.goto('/login');
        await fillLogin(w.page, w.admin);
        await loginButton(w.page).click();
        await expectReadable(loginAlert(w.page).filter({ hasText: TEXT.emailMismatch }));
        await expect(w.page).toHaveURL(/\/login/);
    } finally {
        await w.close();
    }
});

test(`${E(4)} 비번 4번 틀린 뒤 맞는 비번 → 운영 현황`, async ({ browser }) => {
    const w = await k.openAdminWindow(browser);
    try {
        await allowAccess(w.context, w.admin.email);
        await w.page.goto('/login');
        for (let i = 0; i < 4; i += 1) await wrongPasswordOnce(w.page, w.admin);
        await fillLogin(w.page, w.admin);
        await loginButton(w.page).click();
        await expect(w.page).toHaveURL(/\/dashboard/);
        await expect(k.heading(w.page, '운영 현황')).toBeVisible();
    } finally {
        await w.close();
    }
});

test(`${E(5)} 비번 5번 틀림 → 잠김 글 "…15분 뒤 다시"가 읽힘, 맞는 비번도 잠김 글`, async ({ browser }) => {
    const w = await k.openAdminWindow(browser);
    try {
        await allowAccess(w.context, w.admin.email);
        await w.page.goto('/login');
        for (let i = 0; i < 5; i += 1) await wrongPasswordOnce(w.page, w.admin);
        // 다섯 번 틀린 뒤엔 맞는 비번·OTP로도 잠김 글
        await fillLogin(w.page, w.admin);
        await loginButton(w.page).click();
        await expect(loginAlert(w.page)).toHaveText(TEXT.locked);
        await expectReadable(loginAlert(w.page));
        await expect(w.page).toHaveURL(/\/login/);
    } finally {
        await w.close();
    }
});

test(`${E(6)} OTP만 틀림 → 셋 중 하나가 틀렸다는 같은 글 (어느 칸인지 안 알려 줌)`, async ({ browser }) => {
    const w = await k.openAdminWindow(browser);
    try {
        await allowAccess(w.context, w.admin.email);
        await w.page.goto('/login');
        await fillLogin(w.page, w.admin, { otp: wrongOtp(w.admin.totpSecret) });
        await loginButton(w.page).click();
        await expect(loginAlert(w.page)).toHaveText(TEXT.loginFailed);
        await expectReadable(loginAlert(w.page));
        await expect(loginAlert(w.page)).not.toContainText('OTP 번호가');
    } finally {
        await w.close();
    }
});

// A14-E-007~008: 마지막 활동을 29분 / 31분 전으로 당기고 메뉴(신고 — 열 때 서버에 물음)를 누름
[[7, 29, false], [8, 31, true]].forEach(([no, minutes, loggedOut]) => {
    test(`${E(no)} 가만히 ${minutes}분 뒤 메뉴 "신고" 누름 → ${loggedOut ? '로그인 화면 + 자동 로그아웃 글' : '그대로 신고 화면'}`, async ({ browser }) => {
        const w = await k.openAdmin(browser);
        try {
            expect(await setAdminSessionIdle(w.page, minutes), '세션 줄 하나 당김').toBe(1);
            await k.goMenu(w.page, '신고');
            if (loggedOut) {
                await expect(w.page).toHaveURL(/\/login/);
                await expectReadable(w.page.getByRole('status').filter({ hasText: TEXT.sessionExpired }));
            } else {
                await expect(w.page).toHaveURL(/\/reports/);
                await expect(k.heading(w.page, '신고')).toBeVisible();
                await expect(w.page.getByRole('group', { name: '상태 고르기' })).toBeVisible();
                await expect(w.page).not.toHaveURL(/\/login/);
            }
        } finally {
            await w.close();
        }
    });
});

test(`${E(9)} 로그아웃 → 로그인 화면, 뒤로 가기 → 다시 로그인 화면`, async ({ browser }) => {
    const w = await k.openAdmin(browser);
    try {
        // 뒤로 갈 자리를 하나 만들어 둠 (운영 현황 → 회원)
        await k.goMenu(w.page, '회원');
        await expect(k.heading(w.page, '회원')).toBeVisible();
        await w.page.getByRole('button', { name: '로그아웃', exact: true }).click();
        await expect(w.page).toHaveURL(/\/login/);
        await expect(k.heading(w.page, '관리자 로그인')).toBeVisible();
        await w.page.goBack();
        await expect(w.page).toHaveURL(/\/login/);
        await expect(k.heading(w.page, '관리자 로그인')).toBeVisible();
        await expect(w.page.getByRole('navigation', { name: '관리자 메뉴' })).toHaveCount(0);
    } finally {
        await w.close();
    }
});

test(`${E(10)} 플레이어(role=ADMIN) 로그인 창에서 /admin-api/members 직접 → 401`, async ({ accounts, players }) => {
    // 플레이어 토큰은 관리자 길을 못 엶 — Access 표는 통과시켜 문 2(관리자 세션)에서 막히는지 봄
    const player = await k.openPlayer(players, { account: await accounts.create({ role: 'ADMIN' }) });
    await allowAccess(player.context, player.account.email);
    const res = await player.page.goto(`${E2E.adminUrl}/admin-api/members?q=${encodeURIComponent(player.account.nickname)}`);
    expect(res.status()).toBe(401);
    expect((await res.json()).code).toBe('ADMIN_LOGIN_REQUIRED');
});

test(`${E(11)} 플레이어 화면 주소 /admin.html → 관리자 화면 아님`, async ({ players }) => {
    const player = await k.openPlayer(players);
    const res = await player.page.goto(`${E2E.desktopUrl}/admin.html`);
    // 404이거나 플레이어 화면 — 어느 쪽이든 관리자 로그인·권한 화면 글이 없어야 함
    expect(res?.status() ?? 200, '서버 오류 아님').toBeLessThan(500);
    await player.page.waitForLoadState('load');
    await expect(player.page.getByRole('heading', { name: '관리자 로그인' })).toHaveCount(0);
    await expect(player.page.getByText('MMC 관리자')).toHaveCount(0);
    await expect(player.page.getByText(TEXT.noAccess)).toHaveCount(0);
    await expect(player.page.getByLabel('OTP 번호 6자리')).toHaveCount(0);
});
