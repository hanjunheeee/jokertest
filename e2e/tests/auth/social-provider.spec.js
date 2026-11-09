// 가짜 제공자 소셜 시험: 따로 띄운 백엔드(시험 키 + 가짜 Google·Discord 주소)로 시작 → 제공자 → 콜백 → 화면까지 진짜 왕복
// 빈칸 채우기(소셜) 상 4·5·6 성공 길 — 본 서버(4100)는 키가 없어서 social-terms "키 없음" 시험은 그대로
const crypto = require('node:crypto');
const { test, expect, ui, E2E } = require('../../helpers/fixtures');
const db = require('../../helpers/db');
const servers = require('../../helpers/servers');
const social = require('./socialHelpers');
const { startFakeOAuth } = require('./fakeOAuth');
const { newEmail, newNickname, agreeAll } = require('./authHelpers');

// 소셜 파트 포트: 따로 띄운 백엔드 4170~4175, 가짜 제공자 4180~4185, 시작 거부 시험 4179
const slot = () => test.info().parallelIndex % 6;
let fake = null;
let api = null;

// 따로 띄운 백엔드 환경값 (시험 키 값은 가짜, 돌아올 주소는 그 백엔드)
const providerEnv = (apiUrl, fakeUrl) => ({
    GOOGLE_CLIENT_ID: 'e2e-google-client',
    GOOGLE_CLIENT_SECRET: 'e2e-google-secret',
    GOOGLE_REDIRECT_URI: `${apiUrl}/auth/google/callback`,
    GOOGLE_OAUTH_BASE_URL: fakeUrl,
    DISCORD_CLIENT_ID: 'e2e-discord-client',
    DISCORD_CLIENT_SECRET: 'e2e-discord-secret',
    DISCORD_REDIRECT_URI: `${apiUrl}/auth/discord/callback`,
    DISCORD_LINK_REDIRECT_URI: `${apiUrl}/auth/discord/link/callback`,
    DISCORD_OAUTH_BASE_URL: fakeUrl,
});

// 따로 띄운 백엔드·가짜 제공자는 이 묶음만 (시작 거부 시험은 안 띄움)
test.describe('가짜 제공자 왕복', () => {
    // 한 작업자에서 차례로 (따로 띄운 백엔드를 작업자마다 띄우지 않게), 실패해도 다음 시험은 돎
    test.describe.configure({ mode: 'default' });
    test.beforeAll(async () => {
        test.setTimeout(200_000);
        const n = slot();
        fake = await startFakeOAuth(4180 + n);
        const port = 4170 + n;
        api = await servers.startExtraBackend({
            port, defaultIpLimits: false, timeoutMs: 150_000,
            overrides: { SERVER_ID: `e2e-social-${n}`, ...providerEnv(`http://localhost:${port}`, fake.url) },
        });
    });

    test.afterAll(async () => {
        await api?.stop();
        await fake?.close();
        await social.cleanupSeeded();
    });

    const subjectOf = () => `e2e-${crypto.randomBytes(6).toString('hex')}`;
    // 계정 하나에 외부 계정 붙이기 (예전에 소셜로 가입·연결해 둔 상태)
    async function linkIdentity(account, provider, subject) {
        await db.backend().userRepository.createExternalIdentity({ provider, subject, user_id: account.uuid, email_snapshot: null });
    }
    const apiCookies = async (context) => (await context.cookies(E2E.apiUrl)).map((c) => c.name);

    test.describe('Google 로그인 (가짜 제공자)', () => {
        test('처음 온 Google 계정이면 → 시작·제공자·콜백을 지나 가입 마무리 창, 끝내면 로비와 DB 소셜 계정', async ({ page }) => {
            const email = newEmail('gp');
            const sub = subjectOf();
            fake.next('google', { sub, email, email_verified: true });
            await page.goto(`${api.url}/auth/google?rememberMe=false`);
            await expect(page).toHaveURL(/\/login\?socialIntent=/);
            // 제공자로 간 인가 주소 모양 (키·돌아올 주소·범위)
            const sent = fake.authorizeLog.at(-1);
            expect(sent).toMatchObject({ provider: 'google', client_id: 'e2e-google-client', redirect_uri: `${api.url}/auth/google/callback`, scope: 'openid email profile' });
            await expect(page.getByText('소셜 계정으로 처음 오셨네요. 닉네임과 생년월일을 알려주세요')).toBeVisible();

            await page.getByRole('textbox', { name: /사용할 닉네임을 입력하세요/ }).fill(newNickname('p'));
            await page.getByRole('textbox', { name: '생년월일을 선택하세요' }).fill('2000-01-01');
            await agreeAll(page);
            await page.getByRole('button', { name: '가입 완료' }).click();
            await expect(page).toHaveURL(/\/lobby$/, { timeout: 15000 });
            const [user] = await db.query('SELECT uuid FROM users WHERE email = ?', [email]);
            expect(await db.query('SELECT provider FROM external_identities WHERE user_id = ? AND subject = ?', [user.uuid, sub])).toEqual([{ provider: 'google' }]);
        });

        test('Google로 연결해 둔 계정이면 → 바로 로그인돼 로비로, 로그인 기록이 남고 로그인 유지면 refresh도 받음', async ({ page, context, accounts }) => {
            const account = await accounts.create();
            const sub = subjectOf();
            await linkIdentity(account, 'google', sub);
            fake.next('google', { sub, email: account.email, email_verified: true });
            await page.goto(`${api.url}/auth/google?rememberMe=true`);
            await expect(page).toHaveURL(/\/lobby$/, { timeout: 15000 });
            await ui.skipIntro(page);
            await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
            expect(await apiCookies(context)).toEqual(expect.arrayContaining(['accessToken', 'refreshToken']));
            expect(await apiCookies(context)).not.toContain('oauthAttempt');
            const rows = await db.query('SELECT success FROM login_history WHERE user_id = ?', [account.uuid]);
            expect(rows.length).toBeGreaterThanOrEqual(1);
        });

        test('정지된 계정에 연결된 Google이면 → 로그인 화면에 정지 안내, 세션 안 받음 (사유는 안 보임)', async ({ page, context, accounts }) => {
            const account = await accounts.create();
            const sub = subjectOf();
            await linkIdentity(account, 'google', sub);
            await db.query('INSERT INTO user_bans (user_id, reason, is_permanent, start_at, end_at, created_at) VALUES (?, ?, 0, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 1 DAY), NOW())', [account.uuid, '보이면 안 되는 사유']);
            fake.next('google', { sub, email: account.email, email_verified: true });
            await page.goto(`${api.url}/auth/google?rememberMe=false`);
            await expect(page).toHaveURL(/\/login\?socialError=ACCOUNT_BANNED$/);
            await expect(page.getByRole('alert')).toHaveText('정지된 계정입니다. 운영정책을 확인해주세요.');
            await expect(page.getByText('보이면 안 되는 사유')).toHaveCount(0);
            expect(await apiCookies(context)).not.toContain('accessToken');
        });

        test('Google 이메일로 이미 가입한 계정이 있으면 → 가입 대신 "로그인한 뒤 연결" 안내', async ({ page, accounts }) => {
            const account = await accounts.create();
            fake.next('google', { sub: subjectOf(), email: account.email, email_verified: true });
            await page.goto(`${api.url}/auth/google?rememberMe=false`);
            await expect(page).toHaveURL(/socialError=EMAIL_CONFLICT$/);
            await expect(page.getByRole('alert')).toHaveText('이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 연결해주세요.');
        });
    });

    test.describe('Discord 로그인 (가짜 제공자)', () => {
        test('Discord로 연결해 둔 계정이면 → 바로 로그인돼 로비로', async ({ page, accounts }) => {
            const account = await accounts.create();
            const id = subjectOf();
            await linkIdentity(account, 'discord', id);
            fake.next('discord', { id, email: account.email, verified: true });
            await page.goto(`${api.url}/auth/discord?rememberMe=false`);
            await expect(page).toHaveURL(/\/lobby$/, { timeout: 15000 });
            await ui.skipIntro(page);
            await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
            expect(fake.authorizeLog.at(-1)).toMatchObject({ provider: 'discord', client_id: 'e2e-discord-client', scope: 'identify email' });
        });

        test('처음 온 Discord 계정이 확인 안 된 이메일이면 → 가입 마무리 창이 이메일 인증을 요구함', async ({ page }) => {
            fake.next('discord', { id: subjectOf(), email: newEmail('dv'), verified: false });
            const intent = page.waitForResponse((r) => r.url() === `${E2E.apiUrl}/auth/social/signup/intent`);
            await page.goto(`${api.url}/auth/discord?rememberMe=false`);
            expect((await (await intent).json()).data).toEqual({ emailVerificationRequired: true });
            await expect(page.getByText('소셜 계정으로 처음 오셨네요. 이메일 인증과 닉네임·생년월일이 필요해요')).toBeVisible();
            await expect(page.getByRole('button', { name: '가입 완료' })).toBeDisabled();
        });

        test('Discord 코드 교환이 실패하면 → "Discord 인증에 실패했습니다" 안내', async ({ page }) => {
            fake.next('discord', { failToken: true });
            await page.goto(`${api.url}/auth/discord?rememberMe=false`);
            await expect(page).toHaveURL(/socialError=DISCORD_TOKEN_EXCHANGE_FAILED$/);
            await expect(page.getByRole('alert')).toHaveText('Discord 인증에 실패했습니다. 다시 시도해주세요.');
        });
    });

    test.describe('Discord 계정 연결 (가짜 제공자)', () => {
        test('로그인한 사람이 연결을 끝까지 하면 → 계정 화면에 "연결되었습니다", DB에 내 외부 계정', async ({ user }) => {
            const { page, account } = user;
            const id = subjectOf();
            fake.next('discord', { id, email: newEmail('dl'), verified: true });
            await page.goto(`${api.url}/auth/discord/link`);
            await ui.skipIntro(page);
            await expect(page).toHaveURL(/\/account\?socialLinkSuccess=discord/);
            await expect(page.getByRole('button', { name: '연결 결과 메시지 닫기' })).toContainText('Discord 계정이 연결되었습니다.');
            expect(await db.query('SELECT provider FROM external_identities WHERE user_id = ? AND subject = ?', [account.uuid, id])).toEqual([{ provider: 'discord' }]);
            expect(fake.authorizeLog.at(-1).redirect_uri).toBe(`${api.url}/auth/discord/link/callback`);
        });

        test('다른 계정이 이미 쓰는 Discord로 연결하면 → "이미 다른 계정에 연결된" 안내, 내 계정엔 안 붙음', async ({ user, accounts }) => {
            const { page, account } = user;
            const owner = await accounts.create();
            const id = subjectOf();
            await linkIdentity(owner, 'discord', id);
            fake.next('discord', { id, email: owner.email, verified: true });
            await page.goto(`${api.url}/auth/discord/link`);
            await ui.skipIntro(page);
            await expect(page).toHaveURL(/socialLinkError=IDENTITY_ALREADY_LINKED/);
            await expect(page.getByRole('button', { name: '연결 결과 메시지 닫기' })).toContainText('이미 다른 계정에 연결된 Discord 계정입니다.');
            expect(await db.query('SELECT 1 FROM external_identities WHERE user_id = ?', [account.uuid])).toHaveLength(0);
            expect(await db.query('SELECT user_id FROM external_identities WHERE provider = ? AND subject = ?', ['discord', id])).toEqual([{ user_id: owner.uuid }]);
        });
    });
});

test.describe('가짜 제공자 주소 지킴', () => {
    test('운영(NODE_ENV=production)에 가짜 제공자 주소가 있으면 → 서버가 시작 거부', async () => {
        test.setTimeout(200_000);
        const r = await servers.startExtraBackend({
            port: 4179, expectExit: true, timeoutMs: 150_000,
            overrides: { SERVER_ID: 'e2e-social-prod', NODE_ENV: 'production', E2E_HOOKS: undefined, MAIL_TEST_OUTBOX_DIR: undefined, GOOGLE_OAUTH_BASE_URL: 'http://127.0.0.1:4189' },
        });
        expect(r.code).toBe(1);
        expect(r.output).toMatch(/GOOGLE_OAUTH_BASE_URL/);
    });
});
