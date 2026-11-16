'use strict';

// 로그인 브라우저 시험 (PC) — 성공·실패 알림·5번 틀림 잠금·잠금 끝·정지 계정·탈퇴 계정 옛 이메일·비번 보기 단추와 그 단추가 잘 보이는지
// 목록 A11a-가입-로그인-세션.md 번호 A11-E-038~045·056·075~078
const { test, expect, E2E } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { deleteAccounts } = require('../../helpers/accounts');
const K = require('./_a11a-kit');

const LOGIN_FAIL = '이메일 또는 비밀번호가 일치하지 않습니다.';
const LOCK_NOW = '비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.';
const LOCKED = '비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.';
const BAD_PW = 'wrongpass1234';

// 틀린 비번 n번 → 마지막 알림 글
async function failTimes(page, account, n) {
    let last = null;
    for (let i = 0; i < n; i += 1) last = await K.loginAlert(page, account.email, BAD_PW);
    return last;
}

test('A11-E-038 로그인 성공 (PC): 시험 계정 로그인 → 로비 @smoke', async ({ page, accounts }) => {
    const account = await accounts.create();
    await K.loginToLobby(page, account);
    await expect(page).toHaveURL(/\/lobby$/);
});

test('A11-E-039 로그인 실패 (PC): 틀린 비번 → 알림 "이메일 또는 비밀번호가 일치하지 않습니다.", 주소 /login 그대로', async ({ page, accounts }) => {
    const account = await accounts.create();
    expect(await K.loginAlert(page, account.email, BAD_PW)).toBe(LOGIN_FAIL);
    await expect(page).toHaveURL(/\/login$/);
});

test('A11-E-040 로그인 실패 (PC): 없는 이메일 → 같은 알림 글, 주소 /login 그대로', async ({ page }) => {
    expect(await K.loginAlert(page, K.newEmail('none'), K.PW)).toBe(LOGIN_FAIL);
    await expect(page).toHaveURL(/\/login$/);
});

test('A11-E-041 5번째 틀림 (PC): 틀린 비번 5번 → 5번째 알림 "비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다."', async ({ page, accounts }) => {
    const account = await accounts.create();
    expect(await failTimes(page, account, 4)).toBe(LOGIN_FAIL);
    expect(await K.loginAlert(page, account.email, BAD_PW)).toBe(LOCK_NOW);
});

test('A11-E-042 잠긴 동안 맞는 비번 (PC): 잠금 뒤 맞는 비번 → "비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.", /login 그대로', async ({ page, accounts }) => {
    const account = await accounts.create();
    expect(await failTimes(page, account, 5)).toBe(LOCK_NOW);
    expect(await K.loginAlert(page, account.email, account.password)).toBe(LOCKED);
    await expect(page).toHaveURL(/\/login$/);
});

test('A11-E-043 잠금 끝나면 들어감 (PC): 잠금 뒤 DB 잠금 끝 시각을 지난 시각으로 → 맞는 비번 → 로비', async ({ page, accounts }) => {
    const account = await accounts.create();
    expect(await failTimes(page, account, 5)).toBe(LOCK_NOW);
    await K.unlockByTime(account.uuid);
    await K.loginToLobby(page, account);
});

test('A11-E-044 4번 틀린 뒤 맞음 (PC): 틀림 4번 → 맞는 비번 → 로비', async ({ page, accounts }) => {
    const account = await accounts.create();
    expect(await failTimes(page, account, 4)).toBe(LOGIN_FAIL);
    await K.loginToLobby(page, account);
});

test('A11-E-045 정지 계정 (PC): 맞는 비번 → 알림 "정지된 계정입니다. 사유: …", /login 그대로', async ({ page, accounts }) => {
    const account = await accounts.create();
    await K.banUser(account.uuid, '시험용 정지 사유');
    expect(await K.loginAlert(page, account.email, account.password)).toBe('정지된 계정입니다. 사유: 시험용 정지 사유');
    await expect(page).toHaveURL(/\/login$/);
});

test('A11-E-056 탈퇴한 계정의 옛 이메일 (PC): 옛 이메일·비번으로 로그인 → "이메일 또는 비밀번호가 일치하지 않습니다."', async ({ page, context, accounts }) => {
    const account = await accounts.create();
    // 진짜 탈퇴 길(API)로 탈퇴시킴 — 로그인 뒤 비번으로 탈퇴
    const login = await context.request.post(`${E2E.apiUrl}/auth/login`, { data: { email: account.email, password: account.password }, headers: { origin: E2E.desktopUrl } });
    expect(login.ok()).toBe(true);
    const out = await context.request.post(`${E2E.apiUrl}/user/me/withdraw`, { data: { password: account.password }, headers: { origin: E2E.desktopUrl } });
    expect(out.status()).toBe(200);
    try {
        expect(await K.loginAlert(page, account.email, account.password)).toBe(LOGIN_FAIL);
        await expect(page).toHaveURL(/\/login$/);
    } finally {
        // 탈퇴하면 이메일이 바뀌어 실행 끝 정리(이메일 모양)에 안 걸림 → 여기서 지움
        await deleteAccounts([account.uuid]).catch(() => {});
    }
});

// 로그인 칸 비번 입력 칸과 그 보기 단추
const loginPwInput = (page) => page.getByPlaceholder('비밀번호를 입력하세요', { exact: true });

test('A11-E-075 비번 보기 단추 (PC): 로그인 비번 칸 보기 → 글자 보임·이름 "비밀번호 숨기기"', async ({ page }) => {
    await page.goto('/login');
    await loginPwInput(page).fill('testpass1234');
    await expect(loginPwInput(page)).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: '비밀번호 보기' }).click();
    await expect(loginPwInput(page)).toHaveAttribute('type', 'text');
    await expect(loginPwInput(page)).toHaveValue('testpass1234');
    await expect(page.getByRole('button', { name: '비밀번호 숨기기' })).toBeVisible();
});

test('A11-E-076 비번 보기 단추 (PC): 다시 누름 → 숨김·이름 "비밀번호 보기"', async ({ page }) => {
    await page.goto('/login');
    await loginPwInput(page).fill('testpass1234');
    await page.getByRole('button', { name: '비밀번호 보기' }).click();
    await page.getByRole('button', { name: '비밀번호 숨기기' }).click();
    await expect(loginPwInput(page)).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: '비밀번호 보기' })).toBeVisible();
});

test('A11-E-077 비번 보기 단추가 잘 보임 (PC): 로그인 비번 칸 보기 단추 → 화면 안·안 가려짐, 둘레 그림 대비 3 이상', async ({ page }) => {
    await page.goto('/login');
    const toggle = page.getByRole('button', { name: '비밀번호 보기' });
    // 글 없는 그림 단추라 글자 대비 대신 그림 대비를 따로 잼
    await expectReadable(toggle, { contrast: false });
    expect(await K.iconContrast(toggle)).toBeGreaterThanOrEqual(3);
});

test('A11-E-078 비번 보기 단추가 잘 보임 (PC): 가입 비번 칸 보기 단추 → 화면 안·안 가려짐, 둘레 그림 대비 3 이상', async ({ page }) => {
    await K.openSignup(page);
    const toggle = K.signupArea(page).getByRole('button', { name: '비밀번호 보기' }).first();
    await expectReadable(toggle, { contrast: false });
    expect(await K.iconContrast(toggle)).toBeGreaterThanOrEqual(3);
});
