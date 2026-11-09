// access 끝난 뒤 이어지기 시험: 만료 access로 화면을 열면 refresh로 새 쿠키를 받아 그대로 쓰고, refresh가 없거나 막혔으면 로그인 화면으로
// 빈칸 채우기(소셜) 상 1 — POST /auth/refresh를 브라우저 화면이 실제로 부르는 흐름 (만료 access는 시험 비밀키로 같은 내용 다시 서명)
const { test, expect, ui, E2E } = require('../../helpers/fixtures');
const social = require('./socialHelpers');

const refreshUrl = `${E2E.apiUrl}/auth/refresh`;
const cookieOf = async (context, name) => (await context.cookies(E2E.apiUrl)).find((c) => c.name === name) ?? null;

test.describe('access 만료 뒤 이어지기', () => {
    test('로그인 유지 계정이 access가 끝난 채 로비를 열면 → refresh로 새 access·refresh를 받고 로비가 그대로 열림', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaApi(context, account, { rememberMe: true });
        const oldRefresh = (await cookieOf(context, 'refreshToken')).value;
        const expired = await social.expireAccessCookie(context);

        const refreshed = page.waitForResponse((r) => r.url() === refreshUrl);
        await page.goto('/lobby');
        expect((await refreshed).status()).toBe(200);
        await ui.skipIntro(page);
        await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
        await expect(page).toHaveURL(/\/lobby$/);

        // 새 access는 만료본과 다르고, refresh는 회전돼 새 값
        expect((await cookieOf(context, 'accessToken')).value).not.toBe(expired);
        expect((await cookieOf(context, 'refreshToken')).value).not.toBe(oldRefresh);
        // 새로 받은 쿠키로 다시 열어도 refresh 없이 바로 됨
        let refreshedAgain = false;
        page.on('request', (r) => { if (r.url() === refreshUrl) refreshedAgain = true; });
        await ui.gotoLobby(page);
        expect(refreshedAgain).toBe(false);
    });

    test('로그인 유지가 아닌 계정이 access가 끝난 채 로비를 열면 → refresh가 실패하고 로그인 화면으로 감', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaApi(context, account);
        expect(await cookieOf(context, 'refreshToken')).toBeNull();
        await social.expireAccessCookie(context);

        const refreshed = page.waitForResponse((r) => r.url() === refreshUrl);
        await page.goto('/lobby');
        expect((await refreshed).status()).toBe(401);
        await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });
        await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    });

    test('밀려난 옛 refresh가 남은 채 access가 끝나면 → 재사용으로 막혀 로그인 화면으로, 세션째 끊겨 새 refresh로도 못 이어감', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaApi(context, account, { rememberMe: true });
        const stale = await cookieOf(context, 'refreshToken');
        // 다른 곳에서 두 번 refresh → 처음 값은 직전(유예 30초)도 아닌 밀려난 값이 됨
        for (let i = 0; i < 2; i += 1) {
            const r = await context.request.post(refreshUrl, { headers: { origin: E2E.desktopUrl } });
            expect(r.status()).toBe(200);
        }
        const latest = await cookieOf(context, 'refreshToken');
        expect(latest.value).not.toBe(stale.value);
        // 밀려난 refresh를 되돌려 넣고 access 만료
        await context.addCookies([{ ...stale }]);
        await social.expireAccessCookie(context);

        const refreshed = page.waitForResponse((r) => r.url() === refreshUrl);
        await page.goto('/lobby');
        expect([401, 403]).toContain((await refreshed).status());
        await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });

        // 재사용이 걸리면 세션째 끊겨 가장 새 refresh도 거절
        const retry = await fetch(refreshUrl, {
            method: 'POST',
            headers: { origin: E2E.desktopUrl, cookie: `refreshToken=${latest.value}` },
        });
        expect([401, 403]).toContain(retry.status);
    });
});
