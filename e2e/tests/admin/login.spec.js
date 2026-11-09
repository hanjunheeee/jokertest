// 관리자 로그인 브라우저 시험 (AD-050~055): 문 1(Access 흉내)·문 2(아이디·비번·OTP), 관리자 아닌 이메일, 잠깐 막기, 자동 로그아웃, 플레이어 토큰 막힘
// 프로젝트 admin (1280×800, 5275) — 시험마다 새 관리자·가짜 IP라 다른 시험과 잠금이 안 섞임
const { test, expect } = require('../../helpers/fixtures');
const { allowAccess } = require('../../helpers/adminAccess');
const { createAdmin, fillLogin, freshOtp, loginAsAdmin, setAdminSessionIdle } = require('../../helpers/adminAccounts');
const { E2E } = require('../../helpers/env');

const WRONG_TEXT = '아이디, 비밀번호, OTP 번호 중 맞지 않는 것이 있어요';
const LOCKED_TEXT = /로그인이 잠겼어요\. \d+분 뒤 다시/;

// 관리자 화면 안에서 /admin-api 직접 부르기 → { status, code }
const callAdminApi = (page, path) => page.evaluate(async (target) => {
    const res = await fetch(target, { credentials: 'same-origin', cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, code: body.code ?? null };
}, path);

const loginButton = (page) => page.getByRole('button', { name: '로그인', exact: true });

test.describe('관리자 로그인', () => {
    test('AD-050: 관리자 메일로 Access 통과 → 아이디·비번·OTP 로그인 → 운영 현황 화면', async ({ page }) => {
        const admin = await createAdmin();
        await allowAccess(page.context(), admin.email);

        // 로그인 전엔 어느 주소로 와도 로그인 화면
        await page.goto('/');
        await expect(page).toHaveURL(/\/login/);
        await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();

        await fillLogin(page, admin);
        await loginButton(page).click();

        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(page.getByRole('link', { name: '운영 현황' })).toHaveAttribute('aria-current', 'page');
        await expect(page.getByText(admin.loginId)).toBeVisible();
        // 세션 쿠키는 화면 글이 못 읽음
        const sid = (await page.context().cookies(E2E.adminUrl)).find((c) => c.name === 'mmc_admin_sid');
        expect(sid?.httpOnly).toBe(true);
        expect(sid?.sameSite).toBe('Strict');
    });

    test('AD-051: Access 쿠키 없이 열면 → "접근 권한 없음" 화면, 로그인 칸 없음', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: '접근 권한 없음' })).toBeVisible();
        await expect(page.getByLabel('아이디', { exact: true })).toHaveCount(0);
        expect(await callAdminApi(page, '/admin-api/auth/me')).toEqual({ status: 403, code: 'ADMIN_ACCESS_REQUIRED' });
    });

    test('AD-052: 관리자 아닌 이메일로 Access 통과 → 맞는 아이디·비번·OTP여도 로그인 막힘', async ({ page }) => {
        const admin = await createAdmin();
        await allowAccess(page.context(), `stranger-${Date.now()}@example.test`);
        await page.goto('/login');
        await fillLogin(page, admin);
        await loginButton(page).click();

        await expect(page.getByRole('alert')).toContainText('관리자 메일 확인에 쓴 메일과 이 계정의 메일이 달라요');
        await expect(page).toHaveURL(/\/login/);
        expect(await callAdminApi(page, '/admin-api/auth/me')).toMatchObject({ status: 401 });
    });

    test('AD-053: 비번 5번 틀림 → 잠김 안내, 그 뒤엔 맞는 비번·OTP도 막힘', async ({ page }) => {
        const admin = await createAdmin();
        await allowAccess(page.context(), admin.email);
        await page.goto('/login');

        for (let i = 1; i <= 5; i += 1) {
            await fillLogin(page, admin, { password: `wrong-password-${i}`, otp: '123456' });
            await loginButton(page).click();
            await expect(page.getByRole('alert')).toContainText(WRONG_TEXT);
            // 다음 시도 전에 칸이 다시 눌리게 (OTP 칸은 실패하면 비워짐)
            await expect(page.getByLabel('OTP 번호 6자리', { exact: true })).toHaveValue('');
        }

        await fillLogin(page, admin, { otp: await freshOtp(admin) });
        await loginButton(page).click();
        await expect(page.getByRole('alert')).toHaveText(LOCKED_TEXT);
        await expect(page).toHaveURL(/\/login/);
        expect(await callAdminApi(page, '/admin-api/auth/me')).toMatchObject({ status: 401 });
    });

    test('AD-054: 가만히 31분 → 다음 화면 열 때 로그인 화면 + 로그아웃 안내, 다시 로그인하면 가던 화면', async ({ page }) => {
        const admin = await createAdmin();
        await loginAsAdmin(page, admin);
        expect(await setAdminSessionIdle(page, 31)).toBe(1);

        await page.goto('/members');
        await expect(page).toHaveURL(/\/login\?next=%2Fmembers/);
        await expect(page.getByRole('status')).toContainText('오래 쓰지 않아 로그아웃됐어요');

        await fillLogin(page, admin);
        await loginButton(page).click();
        await expect(page).toHaveURL(/\/members$/);
    });

    test('AD-055: 플레이어(관리자 역할 포함)로 로그인한 브라우저 → 관리자 API 직접 불러도 401, 화면은 로그인', async ({ page, accounts }) => {
        const player = await accounts.create({ role: 'ADMIN' });
        await page.context().request.post(`${E2E.apiUrl}/auth/login`, {
            data: { email: player.email, password: player.password },
            headers: { origin: E2E.desktopUrl },
        }).then((res) => expect(res.ok()).toBe(true));
        // 플레이어 쿠키가 관리자 주소로도 실려 감 (같은 localhost)
        const sent = await page.context().cookies(E2E.adminUrl);
        expect(sent.some((c) => c.name === 'accessToken')).toBe(true);
        await allowAccess(page.context(), player.email);

        await page.goto('/');
        await expect(page).toHaveURL(/\/login/);
        for (const path of ['/admin-api/auth/me', '/admin-api/dashboard', '/admin-api/members?q=ab']) {
            expect(await callAdminApi(page, path), path).toEqual({ status: 401, code: 'ADMIN_LOGIN_REQUIRED' });
        }
    });
});
