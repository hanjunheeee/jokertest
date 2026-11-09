// 로그인·가입 이상한 순서·동시 화면 시험: 로그인 따닥, 두 브라우저 같은 순간 로그인, 인증번호 받기 따닥
// 화면에서만 생기는 것(버튼 두 번·창 둘)만 봄, 서버 규칙은 backend tests/services/auth·tests/routes 의 odd 시험 몫
const { test, expect, ui, E2E } = require('../../helpers/fixtures');
const db = require('../../helpers/db');
const mail = require('../../helpers/mail');
const h = require('./authHelpers');

// 이 브라우저 쿠키로 내 정보 요청 → 상태 숫자
const meStatus = async (context) => (await context.request.get(`${E2E.apiUrl}/auth/me`, { headers: { origin: E2E.desktopUrl } })).status();
const aliveSessions = async (uuid) => {
    const [row] = await db.query('SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = ? AND is_online = 1 AND revoked_at IS NULL', [uuid]);
    return Number(row.n);
};

test.describe('로그인 이상한 순서·동시', () => {
    test('[따닥] 로그인 버튼을 빠르게 두 번 누르면 → 로비에 들어가고, 이 브라우저 세션이 서버에 살아 있음(내 정보 200), 살아 있는 세션 하나', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        page.on('dialog', (d) => d.accept().catch(() => {}));
        await h.fillLogin(page, account.email, account.password);
        await h.loginButton(page).dblclick();
        await expect(page).toHaveURL(/\/lobby$/);
        await ui.skipIntro(page);
        // 응답 둘이 엇갈려 먼저 끊긴 세션 쿠키가 남으면 여기서 401
        await expect.poll(() => meStatus(context)).toBe(200);
        expect(await aliveSessions(account.uuid)).toBe(1);
        await page.goto('/store');
        await expect(page).not.toHaveURL(/\/login/);
    });

    test('[동시] 두 브라우저에서 같은 계정으로 같은 순간 로그인 → 한 곳만 살아 있고, 다른 곳은 다음 화면 이동 때 로그인 화면', async ({ browser, accounts }) => {
        const account = await accounts.create();
        const contexts = await Promise.all([1, 2].map(() => browser.newContext({ baseURL: E2E.desktopUrl, viewport: { width: 1280, height: 800 } })));
        try {
            const pages = await Promise.all(contexts.map((context) => context.newPage()));
            for (const page of pages) {
                page.on('dialog', (d) => d.accept().catch(() => {}));
                await h.fillLogin(page, account.email, account.password);
            }
            await Promise.all(pages.map((page) => h.loginButton(page).click()));
            await Promise.all(pages.map((page) => expect(page).toHaveURL(/\/lobby$/)));
            const statuses = await Promise.all(contexts.map(meStatus));
            expect([...statuses].sort()).toEqual([200, 401]);
            expect(await aliveSessions(account.uuid)).toBe(1);
            const loser = pages[statuses.indexOf(401)];
            const winner = pages[statuses.indexOf(200)];
            await loser.goto('/store');
            await expect(loser).toHaveURL(/\/login$/);
            await winner.goto('/store');
            await expect(winner).toHaveURL(/\/store$/);
        } finally {
            await Promise.all(contexts.map((context) => context.close()));
        }
    });
});

test.describe('가입 인증번호 이상한 순서', () => {
    test('[따닥] 새 이메일로 인증번호 받기를 빠르게 두 번 누르면 → 오류 문구 없이 번호 칸이 뜨고 메일은 한 통', async ({ page }) => {
        const email = h.newEmail('dbl');
        const since = Date.now() - 1000;
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        await h.sendCodeButton(page).dblclick();
        await expect(h.codeBox(page)).toBeVisible();
        await expect(h.sendCodeButton(page)).toHaveText(/재발송/);
        await expect(h.verifyNotice(page)).toHaveText(/남은 시간 \d+초/);
        await mail.waitForCode(email, 'SIGNUP_CODE', { since });
        const codes = mail.readMails(email.toLowerCase()).filter((sent) => sent.template === 'SIGNUP_CODE');
        expect(codes).toHaveLength(1);
    });
});
