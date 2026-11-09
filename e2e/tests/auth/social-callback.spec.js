// 소셜 콜백 시험: Google·Discord 로그인 콜백과 Discord 연결 콜백이 state·지문·세션을 보고 화면으로 돌려보내는 흐름
// 빈칸 채우기(소셜) 상 4·5·6 중 제공자 응답 없이 되는 곳 (state 확인·취소·세션 다름), 성공 로그인·연결은 social-provider.spec.js(가짜 제공자)
const { test, expect, ui, E2E } = require('../../helpers/fixtures');
const social = require('./socialHelpers');

const loginAlert = (page) => page.getByRole('alert');
const linkMessage = (page) => page.getByRole('button', { name: '연결 결과 메시지 닫기' });
const hasAttemptCookie = async (context) => (await context.cookies(E2E.apiUrl)).some((c) => c.name === 'oauthAttempt');

test.afterAll(async () => { await social.cleanupSeeded(); });

test.describe('Google 로그인 콜백', () => {
    test('Google 화면에서 취소하고 돌아오면 → 로그인 화면에 "취소했습니다" 안내, state는 쓴 표시·시도 쿠키는 지워짐', async ({ page, context }) => {
        const { state } = await social.prepareLoginAttempt(context, { provider: 'google' });
        await page.goto(social.callbackUrl('google/callback', { state, error: 'access_denied' }));
        await expect(page).toHaveURL(`${E2E.desktopUrl}/login?socialError=OAUTH_CANCELLED`);
        await expect(loginAlert(page)).toHaveText('소셜 로그인을 취소했습니다.');
        expect((await social.stateRow(state)).consumed_at).not.toBeNull();
        expect(await hasAttemptCookie(context)).toBe(false);
    });

    test('같은 state로 한 번 더 돌아오면 → "이미 처리된 로그인 요청" 안내', async ({ page, context }) => {
        const seeded = await social.prepareLoginAttempt(context, { provider: 'google' });
        await page.goto(social.callbackUrl('google/callback', { state: seeded.state, error: 'access_denied' }));
        await expect(page).toHaveURL(/socialError=OAUTH_CANCELLED/);
        // 같은 브라우저(같은 지문) 시도 쿠키를 다시 넣고 같은 state로
        await social.setAttemptCookie(context, social.signAttempt({ fp: seeded.fp, rememberMe: false, purpose: 'login', provider: 'google' }));
        await page.goto(social.callbackUrl('google/callback', { state: seeded.state, code: 'any-code' }));
        await expect(page).toHaveURL(/socialError=STATE_REUSED/);
        await expect(loginAlert(page)).toHaveText('이미 처리된 로그인 요청입니다. 다시 시도해주세요.');
    });

    test('다른 브라우저에서 시작한 state로 돌아오면(지문 다름) → "요청 출처가 일치하지 않습니다" 안내, state는 안 씀', async ({ page, context }) => {
        const { state } = await social.seedState({ purpose: 'login' });
        await social.setAttemptCookie(context, social.signAttempt({ fp: 'other-browser-fingerprint', rememberMe: false, purpose: 'login', provider: 'google' }));
        await page.goto(social.callbackUrl('google/callback', { state, code: 'any-code' }));
        await expect(page).toHaveURL(/socialError=STATE_FINGERPRINT_MISMATCH/);
        await expect(loginAlert(page)).toHaveText('요청 출처가 일치하지 않습니다. 다시 시도해주세요.');
        expect((await social.stateRow(state)).consumed_at).toBeNull();
    });

    test('모바일에서 시작한 시도면 → 결과를 모바일 화면 주소로 돌려보냄', async ({ page, context }) => {
        const { state } = await social.prepareLoginAttempt(context, { provider: 'google', client: 'mobile' });
        await page.goto(social.callbackUrl('google/callback', { state, error: 'access_denied' }));
        await expect(page).toHaveURL(`${E2E.mobileUrl}/login?socialError=OAUTH_CANCELLED`);
    });
});

test.describe('Discord 로그인 콜백', () => {
    test('시도 쿠키 없이 콜백 주소만 열면 → "로그인 요청 정보가 없습니다" 안내', async ({ page }) => {
        await page.goto(social.callbackUrl('discord/callback', { state: 'made-up-state', code: 'any-code' }));
        await expect(page).toHaveURL(/\/login\?socialError=STATE_MISSING$/);
        await expect(loginAlert(page)).toHaveText('로그인 요청 정보가 없습니다. 다시 시도해주세요.');
    });

    test('시도 쿠키는 맞는데 state가 틀리면 → "로그인 요청이 유효하지 않습니다" 안내', async ({ page, context }) => {
        await social.prepareLoginAttempt(context, { provider: 'discord' });
        await page.goto(social.callbackUrl('discord/callback', { state: 'not-the-issued-state', code: 'any-code' }));
        await expect(page).toHaveURL(/socialError=STATE_INVALID/);
        await expect(loginAlert(page)).toHaveText('로그인 요청이 유효하지 않습니다. 다시 시도해주세요.');
    });

    test('Google 시도 쿠키로 Discord 콜백에 오면 → 지문을 안 믿어 "요청 정보 없음"으로 거절, state는 안 씀', async ({ page, context }) => {
        const { state } = await social.prepareLoginAttempt(context, { provider: 'google' });
        await page.goto(social.callbackUrl('discord/callback', { state, code: 'any-code' }));
        await expect(page).toHaveURL(/socialError=STATE_MISSING/);
        expect((await social.stateRow(state)).consumed_at).toBeNull();
    });

    test('만료된 state로 돌아오면 → "로그인 요청이 만료되었습니다" 안내', async ({ page, context }) => {
        const seeded = await social.seedState({ purpose: 'login', ttlMs: -60 * 1000 });
        await social.setAttemptCookie(context, social.signAttempt({ fp: seeded.fp, rememberMe: false, purpose: 'login', provider: 'discord' }));
        await page.goto(social.callbackUrl('discord/callback', { state: seeded.state, code: 'any-code' }));
        await expect(page).toHaveURL(/socialError=STATE_EXPIRED/);
        await expect(loginAlert(page)).toHaveText('로그인 요청이 만료되었습니다. 다시 시도해주세요.');
    });

    test('Discord 화면에서 취소하고 돌아오면 → "취소했습니다" 안내, 로그인 안 됨', async ({ page, context }) => {
        const { state } = await social.prepareLoginAttempt(context, { provider: 'discord', rememberMe: true });
        await page.goto(social.callbackUrl('discord/callback', { state, error: 'access_denied' }));
        await expect(loginAlert(page)).toHaveText('소셜 로그인을 취소했습니다.');
        const names = (await context.cookies(E2E.apiUrl)).map((c) => c.name);
        expect(names).not.toContain('accessToken');
        expect(names).not.toContain('refreshToken');
    });
});

test.describe('Discord 연결 콜백', () => {
    // 로그인한 사람의 연결 시작 상태 (지금 세션에 묶인 state + 연결 시도 쿠키)
    async function prepareLink(context, { userId, sessionId }) {
        const seeded = await social.seedState({ purpose: 'link', userId, sessionId });
        await social.setAttemptCookie(context, social.signAttempt({ fp: seeded.fp, purpose: 'link', provider: 'discord' }));
        return seeded;
    }

    test('연결 중 Discord 화면에서 취소하면 → 계정 화면에 "연결을 취소했습니다" 안내, 로그인은 그대로', async ({ user }) => {
        const { page, context } = user;
        const me = await social.accessPayload(context);
        const { state } = await prepareLink(context, { userId: me.uuid, sessionId: me.sessionId });
        await page.goto(social.callbackUrl('discord/link/callback', { state, error: 'access_denied' }));
        await ui.skipIntro(page);
        await expect(page).toHaveURL(/\/account\?socialLinkError=OAUTH_CANCELLED/);
        await expect(linkMessage(page)).toContainText('Discord 계정 연결을 취소했습니다.');
        await expect(page.getByText(/지금 이메일:/)).toBeVisible();
        expect((await social.stateRow(state)).consumed_at).not.toBeNull();
    });

    test('다른 사람 세션에 묶인 연결 state로 돌아오면 → "시작한 세션과 일치하지 않습니다" 안내', async ({ user, accounts, browser }) => {
        const { page, context } = user;
        // 다른 사람이 따로 로그인한 세션
        const otherAccount = await accounts.create();
        const otherContext = await browser.newContext();
        await ui.loginViaApi(otherContext, otherAccount);
        const other = await social.accessPayload(otherContext);
        await otherContext.close();
        const seeded = await social.seedState({ purpose: 'link', userId: other.uuid, sessionId: other.sessionId });
        await social.setAttemptCookie(context, social.signAttempt({ fp: seeded.fp, purpose: 'link', provider: 'discord' }));
        await page.goto(social.callbackUrl('discord/link/callback', { state: seeded.state, code: 'any-code' }));
        await ui.skipIntro(page);
        await expect(page).toHaveURL(/socialLinkError=STATE_USER_MISMATCH/);
        await expect(linkMessage(page)).toContainText('연결 요청을 시작한 세션과 일치하지 않습니다. 다시 로그인 후 시도해주세요.');
    });

    test('로그인 state로 연결 콜백에 오면 → 용도가 달라 거절되고 연결 실패 안내', async ({ user }) => {
        const { page, context } = user;
        const seeded = await social.seedState({ purpose: 'login' });
        await social.setAttemptCookie(context, social.signAttempt({ fp: seeded.fp, purpose: 'link', provider: 'discord' }));
        await page.goto(social.callbackUrl('discord/link/callback', { state: seeded.state, code: 'any-code' }));
        await ui.skipIntro(page);
        await expect(page).toHaveURL(/socialLinkError=STATE_PURPOSE_MISMATCH/);
        await expect(linkMessage(page)).toContainText('Discord 계정 연결에 실패했습니다. 다시 시도해주세요.');
    });

    test('로그인 안 한 채 연결 콜백에 오면 → 연결 안 되고 로그인 화면으로 감', async ({ page }) => {
        await page.goto(social.callbackUrl('discord/link/callback', { state: 'any-state', code: 'any-code' }));
        await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    });
});
