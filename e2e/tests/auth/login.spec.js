// 로그인 화면 시험: 성공·틀림·없는 계정·빈 칸·유지 체크·5번 잠금·정지/비활성 계정·화면 안 링크
// 로그인 자체를 보는 시험이라 화면으로 누름 (API 로그인 도우미 안 씀)
const { test, expect, ui, E2E } = require('../../helpers/fixtures');
const db = require('../../helpers/db');
const h = require('./authHelpers');

const FAILED = '이메일 또는 비밀번호가 일치하지 않습니다.';
const LOCKED_NOW = '비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.';
const LOCKED = '비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.';
const EMPTY = '이메일과 비밀번호를 입력해주세요.';

test.describe('로그인', () => {
    test('맞는 이메일·비번으로 로그인하면 → 로비로 가고 내 닉네임이 보임', async ({ page, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaUi(page, account);
        await ui.skipIntro(page);
        await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
        await expect(page.getByRole('button', { name: '마이페이지' })).toContainText(account.nickname);
    });

    test('비번을 틀리면 → 알림이 뜨고 로그인 화면에 그대로 있음', async ({ page, accounts }) => {
        const account = await accounts.create();
        await page.goto('/login');
        await page.getByPlaceholder('이메일을 입력하세요').fill(account.email);
        await page.getByPlaceholder('비밀번호를 입력하세요').fill('틀린비번입니다123');
        const message = await ui.captureAlert(page, () => page.getByRole('button', { name: '로그인', exact: true }).click());
        expect(message).toMatch(/이메일|비밀번호/);
        await expect(page).toHaveURL(/\/login$/);
    });

    test('비번을 틀리면 → "이메일 또는 비밀번호가 일치하지 않습니다" 문구가 그대로 나옴', async ({ page, accounts }) => {
        const account = await accounts.create();
        expect(await h.loginAlert(page, account.email, `${account.password}x`)).toBe(FAILED);
    });

    test('가입 안 된 이메일로 로그인하면 → 비번 틀림과 같은 문구 (가입 여부 안 드러남)', async ({ page }) => {
        expect(await h.loginAlert(page, h.newEmail('none'), 'Whatever123!')).toBe(FAILED);
        await expect(page).toHaveURL(/\/login$/);
    });

    test('이메일·비번 둘 다 비우고 누르면 → 입력하라는 알림', async ({ page }) => {
        expect(await h.loginAlert(page, '', '')).toBe(EMPTY);
    });

    test('이메일만 비우고 누르면 → 입력하라는 알림', async ({ page }) => {
        expect(await h.loginAlert(page, '', 'Whatever123!')).toBe(EMPTY);
    });

    test('비번만 비우고 누르면 → 입력하라는 알림', async ({ page, accounts }) => {
        const account = await accounts.create();
        expect(await h.loginAlert(page, account.email, '')).toBe(EMPTY);
    });

    test('이메일 앞뒤에 빈칸을 넣어도 → 로그인 됨', async ({ page, accounts }) => {
        const account = await accounts.create();
        await h.fillLogin(page, `  ${account.email}  `, account.password);
        await h.loginButton(page).click();
        await expect(page).toHaveURL(/\/lobby$/);
    });

    test('비번 칸에서 Enter를 누르면 → 버튼 누른 것과 같이 로그인 됨', async ({ page, accounts }) => {
        const account = await accounts.create();
        await h.fillLogin(page, account.email, account.password);
        await h.passwordBox(page).press('Enter');
        await expect(page).toHaveURL(/\/lobby$/);
    });

    test('비밀번호 보기를 누르면 → 글자가 보이고 다시 누르면 가려짐', async ({ page }) => {
        await h.fillLogin(page, 'a@b.test', 'secret-pass');
        const box = page.getByPlaceholder('비밀번호를 입력하세요');
        await expect(box).toHaveAttribute('type', 'password');
        await page.getByRole('button', { name: '비밀번호 보기' }).click();
        await expect(box).toHaveAttribute('type', 'text');
        await page.getByRole('button', { name: '비밀번호 숨기기' }).click();
        await expect(box).toHaveAttribute('type', 'password');
    });

    test('로그인 상태 유지 체크를 누르면 → 체크 표시가 켜지고 다시 누르면 꺼짐', async ({ page }) => {
        await page.goto('/login');
        const box = page.getByRole('checkbox', { name: '로그인 상태 유지' });
        await expect(box).toHaveAttribute('aria-checked', 'false');
        await box.click();
        await expect(box).toHaveAttribute('aria-checked', 'true');
        await box.click();
        await expect(box).toHaveAttribute('aria-checked', 'false');
    });

    test('로그인 상태 유지를 켜고 로그인하면 → 오래 가는 갱신 쿠키가 생김', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaUi(page, account, { remember: true });
        const refresh = (await context.cookies(E2E.apiUrl)).find((c) => c.name === 'refreshToken');
        expect(refresh).toBeTruthy();
        expect(refresh.expires).toBeGreaterThan(Date.now() / 1000 + 3600);
    });

    test('로그인 상태 유지를 끄고 로그인하면 → 갱신 쿠키가 없음 (브라우저 닫으면 끝)', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaUi(page, account);
        const cookies = await context.cookies(E2E.apiUrl);
        expect(cookies.find((c) => c.name === 'refreshToken')).toBeFalsy();
        expect(cookies.find((c) => c.name === 'accessToken')).toBeTruthy();
    });

    test('비번을 5번 틀리면 → 5번째에 15분 잠금 안내', async ({ page, accounts }) => {
        const account = await accounts.create();
        for (let i = 1; i <= 4; i += 1) {
            expect(await h.loginAlert(page, account.email, `wrong-${i}-pass`)).toBe(FAILED);
        }
        expect(await h.loginAlert(page, account.email, 'wrong-5-pass')).toBe(LOCKED_NOW);
    });

    test('잠긴 뒤에는 맞는 비번을 넣어도 → 잠김 안내가 나오고 로비로 안 감', async ({ page, accounts }) => {
        const account = await accounts.create();
        for (let i = 1; i <= 5; i += 1) await h.loginAlert(page, account.email, `wrong-${i}-pass`);
        expect(await h.loginAlert(page, account.email, account.password)).toBe(LOCKED);
        await expect(page).toHaveURL(/\/login$/);
    });

    test('4번 틀린 뒤 맞게 넣으면 → 로그인 되고 틀린 횟수가 0으로 돌아감', async ({ page, accounts }) => {
        const account = await accounts.create();
        for (let i = 1; i <= 4; i += 1) await h.loginAlert(page, account.email, `wrong-${i}-pass`);
        await h.fillLogin(page, account.email, account.password);
        await h.loginButton(page).click();
        await expect(page).toHaveURL(/\/lobby$/);
        const [row] = await db.query('SELECT failed_login_count, locked_until FROM users WHERE uuid = ?', [account.uuid]);
        expect(Number(row.failed_login_count)).toBe(0);
        expect(row.locked_until).toBeNull();
    });

    test('잠금 시간이 지나면 → 맞는 비번으로 다시 로그인 됨', async ({ page, accounts }) => {
        const account = await accounts.create();
        for (let i = 1; i <= 5; i += 1) await h.loginAlert(page, account.email, `wrong-${i}-pass`);
        // 15분 기다리는 대신 잠금 끝 시각을 지난 시각으로
        await db.query('UPDATE users SET locked_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE uuid = ?', [account.uuid]);
        await h.fillLogin(page, account.email, account.password);
        await h.loginButton(page).click();
        await expect(page).toHaveURL(/\/lobby$/);
    });

    test('정지된 계정이 맞는 비번으로 로그인하면 → 정지 사유가 담긴 알림', async ({ page, accounts }) => {
        const account = await accounts.create();
        await db.query('INSERT INTO user_bans (user_id, reason, is_permanent, start_at, end_at, created_at) VALUES (?, ?, 0, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 1 DAY), NOW())', [account.uuid, '시험 정지 사유']);
        expect(await h.loginAlert(page, account.email, account.password)).toBe('정지된 계정입니다. 사유: 시험 정지 사유');
        await expect(page).toHaveURL(/\/login$/);
    });

    test('정지된 계정이 비번을 틀리면 → 정지 사유 없이 일반 실패 문구만', async ({ page, accounts }) => {
        const account = await accounts.create();
        await db.query('INSERT INTO user_bans (user_id, reason, is_permanent, start_at, created_at) VALUES (?, ?, 1, NULL, NOW())', [account.uuid, '보이면 안 되는 사유']);
        expect(await h.loginAlert(page, account.email, `${account.password}x`)).toBe(FAILED);
    });

    test('정지 기간이 끝난 계정은 → 그대로 로그인 됨', async ({ page, accounts }) => {
        const account = await accounts.create();
        await db.query('INSERT INTO user_bans (user_id, reason, is_permanent, start_at, end_at, created_at) VALUES (?, ?, 0, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), NOW())', [account.uuid, '지난 정지']);
        await h.fillLogin(page, account.email, account.password);
        await h.loginButton(page).click();
        await expect(page).toHaveURL(/\/lobby$/);
    });

    test('비활성 계정이 로그인하면 → "이용할 수 없는 계정입니다" 알림', async ({ page, accounts }) => {
        const account = await accounts.create();
        await db.query("UPDATE users SET status = 'INACTIVE' WHERE uuid = ?", [account.uuid]);
        expect(await h.loginAlert(page, account.email, account.password)).toBe('이용할 수 없는 계정입니다.');
    });

    test('이미 로그인한 채 로그인 화면을 열면 → 로비로 넘어감', async ({ user }) => {
        const { page } = user;
        await page.goto('/login');
        await expect(page).toHaveURL(/\/lobby$/);
    });

    test('아이디 찾기·비밀번호 찾기 글자를 누르면 → 각 찾기 화면으로 감', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('link', { name: '아이디 찾기' }).click();
        await expect(page).toHaveURL(/\/find-id$/);
        await page.goto('/login');
        await page.getByRole('link', { name: '비밀번호 찾기' }).click();
        await expect(page).toHaveURL(/\/password-reset\/request$/);
    });

    test('회원가입을 누르면 → 가입 칸으로 바뀌고 로그인하기를 누르면 다시 로그인 칸', async ({ page }) => {
        await h.openSignup(page);
        await expect(page.getByText('무도회 입장을 위한 정보를 입력해주세요.')).toBeVisible();
        await page.getByRole('button', { name: '로그인하기' }).click();
        await expect(page.getByText('계정을 로그인 하여 무도회에 입장하세요.')).toBeVisible();
        await expect(h.loginButton(page)).toBeVisible();
    });
});
