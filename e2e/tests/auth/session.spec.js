// 세션 시험: 로그아웃(종료 버튼), 로그인 안 한 채 보호 화면, 세션 만료·끊김 뒤 로그인 화면, 없는 주소
const { test, expect, ui, E2E } = require('../../helpers/fixtures');
const db = require('../../helpers/db');

const NEED_LOGIN = '로그인이 필요한 페이지입니다!';

test.describe('로그아웃', () => {
    test('로비에서 종료를 누르면 → 로그아웃되어 로그인 화면으로', async ({ user }) => {
        const { page } = user;
        await page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '종료' }).click();
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    });

    test('로그아웃 뒤에는 → 서버도 세션을 끊어 내 정보 요청이 401', async ({ user }) => {
        const { page, context } = user;
        await page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '종료' }).click();
        await expect(page).toHaveURL(/\/login$/);
        const me = await context.request.get(`${E2E.apiUrl}/auth/me`, { headers: { origin: E2E.desktopUrl } });
        expect(me.status()).toBe(401);
    });

    test('로그아웃 뒤 로비 주소를 열면 → 로그인 화면으로 돌아가고 "로그인 필요" 알림은 안 뜸', async ({ user }) => {
        const { page } = user;
        await page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '종료' }).click();
        await expect(page).toHaveURL(/\/login$/);
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push(d.message()); d.accept().catch(() => {}); });
        await page.goto('/lobby');
        await expect(page).toHaveURL(/\/login$/);
        expect(dialogs).not.toContain(NEED_LOGIN);
    });

    test('로그아웃 뒤 브라우저 뒤로 가기를 해도 → 로비에 못 들어가고 로그인 화면', async ({ user }) => {
        const { page } = user;
        await page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '종료' }).click();
        await expect(page).toHaveURL(/\/login$/);
        await page.goBack();
        await expect(page).toHaveURL(/\/login$/);
    });

    test('같은 브라우저 다른 탭에서 로그아웃하면 → 이 탭도 새로 읽을 때 로그인 화면', async ({ user }) => {
        const { page, context } = user;
        const tab2 = await context.newPage();
        await ui.gotoLobby(tab2);
        await tab2.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '종료' }).click();
        await expect(tab2).toHaveURL(/\/login$/);
        await page.goto('/store');
        await expect(page).toHaveURL(/\/login$/);
    });
});

test.describe('로그인 안 한 채 보호 화면', () => {
    test('로그인 안 하고 로비 주소를 열면 → 로비가 안 보이고 로그인 화면으로 튕김', async ({ page }) => {
        page.on('dialog', (d) => d.accept().catch(() => {}));
        await page.goto('/lobby');
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
        await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toHaveCount(0);
    });

    test('로그인 안 하고 다른 보호 화면들을 열어도 → 전부 로그인 화면으로', async ({ page }) => {
        page.on('dialog', (d) => d.accept().catch(() => {}));
        for (const path of ['/mypage', '/account', '/store', '/setting', '/library', '/gameMode', '/game-matching', '/ingame', '/gameresult']) {
            await page.goto(path);
            await expect(page, path).toHaveURL(/\/login$/);
        }
    });

    test('로그인 안 하고 아이디 찾기·비번 찾기 화면은 → 그대로 열림', async ({ page }) => {
        await page.goto('/find-id');
        await expect(page).toHaveURL(/\/find-id$/);
        await page.goto('/password-reset/request');
        await expect(page).toHaveURL(/\/password-reset\/request$/);
    });

    test('로그인한 채 없는 주소를 열면 → 없는 화면 안내가 뜸 (로비·로그인으로 안 튐)', async ({ user }) => {
        const { page } = user;
        await page.goto('/no-such-page-e2e');
        await expect(page).toHaveURL(/no-such-page-e2e/);
        await expect(page.getByRole('button').first()).toBeVisible();
    });
});

test.describe('세션 만료', () => {
    test('쿠키가 사라진 뒤(세션 만료) 화면을 새로 열면 → 로그인 화면으로', async ({ user }) => {
        const { page, context } = user;
        await context.clearCookies();
        page.on('dialog', (d) => d.accept().catch(() => {}));
        await page.goto('/lobby');
        await expect(page).toHaveURL(/\/login$/);
    });

    test('서버에서 세션이 끊긴 뒤 다른 화면으로 가면 → 로그인 화면으로', async ({ user }) => {
        const { page, account } = user;
        await db.query('UPDATE user_sessions SET is_online = 0, revoked_at = NOW() WHERE user_id = ?', [account.uuid]);
        page.on('dialog', (d) => d.accept().catch(() => {}));
        await page.goto('/store');
        await expect(page).toHaveURL(/\/login$/);
    });

    test('같은 계정으로 다른 곳에서 새로 로그인하면 → 먼저 있던 곳은 다음 화면 이동 때 로그인 화면', async ({ user, players }) => {
        const { page, account } = user;
        await players.add({ account });
        page.on('dialog', (d) => d.accept().catch(() => {}));
        await page.goto('/store');
        await expect(page).toHaveURL(/\/login$/);
    });

    test('로그인 유지로 들어오면 → 접속 쿠키도 기한이 있어 브라우저를 다시 열어도 로비에 들어감', async ({ browser, context, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaApi(context, account, { rememberMe: true });
        const kept = (await context.cookies(E2E.apiUrl)).filter((c) => c.expires > 0);
        expect(kept.map((c) => c.name)).toEqual(expect.arrayContaining(['accessToken', 'refreshToken']));
        // 기한 있는 쿠키만 새 브라우저로 옮김 = 브라우저를 껐다 켠 것
        const reopened = await browser.newContext({ baseURL: E2E.desktopUrl, viewport: { width: 1280, height: 800 } });
        try {
            await reopened.addCookies(kept);
            const page2 = await reopened.newPage();
            await ui.gotoLobby(page2);
            await expect(page2).toHaveURL(/\/lobby$/);
        } finally {
            await reopened.close();
        }
    });
});
