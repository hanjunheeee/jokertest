// 소셜 가입 마무리 창 시험 (데스크톱): 처음 온 소셜 계정 → 가입 의도 확인 → 닉네임·생일·약관(·이메일 인증) → 로비 + DB 계정
// 빈칸 채우기(소셜) 상 2·3·10 — 제공자 왕복은 못 해서 콜백 직후 상태(가입 의도 줄 + 가입 시도 쿠키)를 만들고 그 뒤 흐름은 진짜로
const { test, expect, E2E } = require('../../helpers/fixtures');
const db = require('../../helpers/db');
const social = require('./socialHelpers');
const { newEmail, newNickname, requestCode, enterCode, verifyNotice, agreeAll } = require('./authHelpers');

const nicknameBox = (page) => page.getByRole('textbox', { name: /사용할 닉네임을 입력하세요/ });
const birthBox = (page) => page.getByRole('textbox', { name: '생년월일을 선택하세요' });
const finishButton = (page) => page.getByRole('button', { name: '가입 완료' });

// 가입 칸 열기: 의도 확인 응답을 같이 받음
async function openSocialSignup(page, intentToken) {
    const intentResponse = page.waitForResponse((r) => r.url() === `${E2E.apiUrl}/auth/social/signup/intent`);
    await page.goto(`/login?socialIntent=${encodeURIComponent(intentToken)}`);
    return intentResponse;
}

// 닉네임·생일·약관 채우고 가입 완료 → 완료 응답
async function fillAndFinish(page, { nickname, birthDate = '2000-01-01' }) {
    await nicknameBox(page).fill(nickname);
    await birthBox(page).fill(birthDate);
    await agreeAll(page);
    const done = page.waitForResponse((r) => r.url() === `${E2E.apiUrl}/auth/social/signup/complete`);
    await finishButton(page).click();
    return done;
}

const cookieNames = async (context) => (await context.cookies(E2E.apiUrl)).map((c) => c.name);

test.afterAll(async () => { await social.cleanupSeeded(); });

test.describe('소셜 가입 마무리 (데스크톱)', () => {
    test('제공자가 이메일을 준 새 계정이면 → 이메일 칸 없이 닉네임·생일만 받고 가입하면 로비로, DB에 소셜 전용 계정', async ({ page, context }) => {
        const email = newEmail('so');
        const intent = await social.prepareSocialSignup(context, { provider: 'google', email, rememberMe: true });
        const intentRes = await openSocialSignup(page, intent.intentToken);
        expect(intentRes.status()).toBe(200);
        expect((await intentRes.json()).data).toEqual({ emailVerificationRequired: false });
        await expect(page.getByText('소셜 계정으로 처음 오셨네요. 닉네임과 생년월일을 알려주세요')).toBeVisible();
        await expect(page.getByRole('textbox', { name: '이메일을 입력하세요' })).toHaveCount(0);

        const nickname = newNickname('g');
        const done = await fillAndFinish(page, { nickname });
        expect(done.status()).toBe(200);
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15000 });

        const [user] = await db.query('SELECT uuid, nickname, has_local_password, email_verified FROM users WHERE email = ?', [email]);
        expect(user).toMatchObject({ nickname, has_local_password: 0, email_verified: 1 });
        const identities = await db.query('SELECT provider, subject FROM external_identities WHERE user_id = ?', [user.uuid]);
        expect(identities).toEqual([{ provider: 'google', subject: intent.subject }]);
        expect((await social.intentRow(intent.intentToken)).consumed_at).not.toBeNull();
        // 로그인 유지 시도였으니 refresh도 받음, 가입 시도 쿠키는 지워짐
        const names = await cookieNames(context);
        expect(names).toEqual(expect.arrayContaining(['accessToken', 'refreshToken']));
        expect(names).not.toContain('oauthAttempt');
    });

    test('제공자가 이메일을 안 준 새 계정이면 → 이메일 인증 전엔 가입 버튼이 꺼져 있고, 인증하면 그 이메일로 가입됨', async ({ page, context }) => {
        const intent = await social.prepareSocialSignup(context, { provider: 'discord', email: null });
        const intentRes = await openSocialSignup(page, intent.intentToken);
        expect((await intentRes.json()).data).toEqual({ emailVerificationRequired: true });
        await expect(page.getByText('소셜 계정으로 처음 오셨네요. 이메일 인증과 닉네임·생년월일이 필요해요')).toBeVisible();
        await expect(page.getByText('이메일 인증을 완료해야 가입할 수 있습니다.')).toBeVisible();
        await expect(finishButton(page)).toBeDisabled();

        const email = newEmail('sd');
        await page.getByRole('textbox', { name: '이메일을 입력하세요' }).fill(email);
        const code = await requestCode(page, email);
        await enterCode(page, code);
        await expect(verifyNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');

        const done = await fillAndFinish(page, { nickname: newNickname('d') });
        expect(done.status()).toBe(200);
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15000 });
        const [user] = await db.query('SELECT uuid, has_local_password FROM users WHERE email = ?', [email]);
        expect(user.has_local_password).toBe(0);
        const identities = await db.query('SELECT provider, subject FROM external_identities WHERE user_id = ?', [user.uuid]);
        expect(identities).toEqual([{ provider: 'discord', subject: intent.subject }]);
        // 로그인 유지 아님 → refresh 없음
        expect(await cookieNames(context)).not.toContain('refreshToken');
    });

    test('가입 시도 쿠키 없이(다른 브라우저에서) 가입 링크를 열면 → 만료 안내와 로그인 화면으로 버튼만', async ({ page }) => {
        const intent = await social.seedIntent({ email: newEmail('sx') });
        const intentRes = await openSocialSignup(page, intent.intentToken);
        expect(intentRes.status()).toBe(400);
        expect((await intentRes.json()).code).toBe('INTENT_EXPIRED');
        await expect(page.getByRole('alert')).toHaveText('가입 가능 시간이 만료되었거나 다른 브라우저에서 연 가입 링크입니다. 다시 로그인해주세요.');
        await expect(finishButton(page)).toHaveCount(0);
        await page.getByRole('button', { name: '로그인 화면으로' }).click();
        await expect(page).not.toHaveURL(/socialIntent/);
        await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
        expect(await social.intentRow(intent.intentToken)).toMatchObject({ consumed_at: null });
    });

    test('이미 가입을 끝낸 가입 링크를 다시 열면 → "이미 처리된 가입 요청" 안내', async ({ page, context }) => {
        const email = newEmail('sr');
        const intent = await social.prepareSocialSignup(context, { email });
        await openSocialSignup(page, intent.intentToken);
        await fillAndFinish(page, { nickname: newNickname('r') });
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15000 });

        // 로비 화면이 쿠키 지움(로그아웃)을 보고 로그인 화면으로 옮기는 것과 안 겹치게 빈 화면으로 먼저 떠남
        await page.goto('about:blank');
        // 로그인된 채면 로그인 화면이 로비로 돌려보낼 수 있어 쿠키 비우고 같은 브라우저 시도 쿠키만 다시
        await context.clearCookies();
        await social.setAttemptCookie(context, social.signAttempt({ intentToken: intent.intentToken, rememberMe: false, purpose: 'signup', provider: 'google' }));
        const again = await openSocialSignup(page, intent.intentToken);
        expect((await again.json()).code).toBe('INTENT_CONSUMED');
        await expect(page.getByRole('alert')).toHaveText('이미 처리된 가입 요청입니다.');
        expect(await db.query('SELECT 1 FROM users WHERE email = ?', [email])).toHaveLength(1);
    });

    test('그사이 같은 이메일로 다른 계정이 생겼으면 → 가입 완료가 "이미 가입된 이메일" 안내로 막히고 계정 안 생김', async ({ page, context, accounts }) => {
        const existing = await accounts.create();
        const intent = await social.prepareSocialSignup(context, { email: existing.email });
        await openSocialSignup(page, intent.intentToken);
        const done = await fillAndFinish(page, { nickname: newNickname('c') });
        expect(done.status()).toBe(409);
        await expect(page.getByRole('alert')).toHaveText('이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 소셜 계정을 연결해주세요.');
        await expect(page).toHaveURL(/socialIntent=/);
        expect(await db.query('SELECT 1 FROM external_identities WHERE subject = ?', [intent.subject])).toHaveLength(0);
        expect(await social.intentRow(intent.intentToken)).toMatchObject({ consumed_at: null });
    });
});
