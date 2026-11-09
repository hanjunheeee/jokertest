// 모바일 소셜 가입 마무리 시험 (375×812): 처음 온 소셜 계정 → 닉네임·생일·약관(·이메일 인증) → 로비 + DB 계정, 가로 안 넘침
// 빈칸 채우기(소셜) 상 11 — 콜백 직후 상태(가입 의도 줄 + 가입 시도 쿠키)를 만들고 그 뒤 화면 흐름은 진짜로
const crypto = require('node:crypto');
const { test, expect, ui, mail, E2E } = require('../../helpers/fixtures');
const db = require('../../helpers/db');
const { RUN_ID, EMAIL_DOMAIN } = require('../../helpers/accounts');
const social = require('../auth/socialHelpers');
const { overflowX } = require('./_talk');

const newEmail = () => `e2e+${RUN_ID}-ms${crypto.randomBytes(5).toString('hex')}${EMAIL_DOMAIN}`;
const newNickname = () => `n${crypto.randomBytes(4).toString('hex')}`.slice(0, 8);

const terms = (page) => page.getByRole('group', { name: '약관 동의' });
const finishButton = (page) => page.getByRole('button', { name: '가입 완료' });

async function openSocialSignup(page, intentToken) {
    const intentResponse = page.waitForResponse((r) => r.url() === `${E2E.apiUrl}/auth/social/signup/intent`);
    await page.goto(`/login?socialIntent=${encodeURIComponent(intentToken)}`);
    return intentResponse;
}

// 닉네임·생일·전체 동의 → 가입 완료 → 완료 응답
async function fillAndFinish(page, nickname) {
    await page.getByRole('textbox', { name: /사용할 닉네임을 입력하세요/ }).fill(nickname);
    await page.getByRole('textbox', { name: '생일 날짜를 선택해주세요' }).fill('2000-01-01');
    await terms(page).getByRole('checkbox', { name: '전체 동의' }).click();
    const done = page.waitForResponse((r) => r.url() === `${E2E.apiUrl}/auth/social/signup/complete`);
    await finishButton(page).click();
    return done;
}

test.afterAll(async () => { await social.cleanupSeeded(); });

test.describe('모바일 소셜 가입 마무리', () => {
    test('제공자가 이메일을 준 새 계정이면 → 이메일 칸 없이 가입하고 로비로, 가로로 안 넘침', async ({ page, context }) => {
        const email = newEmail();
        const intent = await social.prepareSocialSignup(context, { provider: 'google', email });
        expect((await (await openSocialSignup(page, intent.intentToken)).json()).data).toEqual({ emailVerificationRequired: false });
        await expect(page.getByText('소셜 계정으로 처음 오셨네요. 닉네임과 생년월일을 알려주세요')).toBeVisible();
        await expect(page.getByRole('textbox', { name: '이메일을 입력하세요' })).toHaveCount(0);
        expect(await overflowX(page)).toBeLessThanOrEqual(0);

        const nickname = newNickname();
        expect((await fillAndFinish(page, nickname)).status()).toBe(200);
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15000 });
        await ui.skipIntro(page);
        await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
        const [user] = await db.query('SELECT uuid, nickname, has_local_password FROM users WHERE email = ?', [email]);
        expect(user).toMatchObject({ nickname, has_local_password: 0 });
        expect(await db.query('SELECT provider FROM external_identities WHERE user_id = ? AND subject = ?', [user.uuid, intent.subject])).toEqual([{ provider: 'google' }]);
    });

    test('제공자가 이메일을 안 줬으면 → 인증 전엔 가입 버튼이 꺼져 있고, 메일 번호로 인증하면 그 이메일로 가입됨', async ({ page, context }) => {
        const intent = await social.prepareSocialSignup(context, { provider: 'discord', email: null });
        expect((await (await openSocialSignup(page, intent.intentToken)).json()).data).toEqual({ emailVerificationRequired: true });
        await expect(page.getByText('이메일 인증을 완료해야 가입할 수 있습니다.')).toBeVisible();
        await expect(finishButton(page)).toBeDisabled();

        const email = newEmail();
        await page.getByRole('textbox', { name: '이메일을 입력하세요' }).fill(email);
        const since = Date.now() - 1000;
        await page.getByTestId('signup-code-send').click();
        const code = await mail.waitForCode(email, 'SIGNUP_CODE', { since });
        await page.getByRole('textbox', { name: '인증번호를 입력하세요' }).fill(code);
        await page.getByTestId('signup-code-verify').click();
        await expect(page.getByTestId('signup-email-verification-notice')).toHaveText('이메일 인증이 완료되었습니다.');

        expect((await fillAndFinish(page, newNickname())).status()).toBe(200);
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15000 });
        const [user] = await db.query('SELECT uuid FROM users WHERE email = ?', [email]);
        expect(await db.query('SELECT provider FROM external_identities WHERE user_id = ? AND subject = ?', [user.uuid, intent.subject])).toEqual([{ provider: 'discord' }]);
    });

    test('가입 시도 쿠키 없이 가입 링크를 열면 → 만료 안내와 로그인 화면으로 버튼', async ({ page }) => {
        const intent = await social.seedIntent({ email: newEmail() });
        await openSocialSignup(page, intent.intentToken);
        await expect(page.getByRole('alert')).toHaveText('가입 가능 시간이 만료되었거나 다른 브라우저에서 연 가입 링크입니다. 다시 로그인해주세요.');
        await page.getByRole('button', { name: '로그인 화면으로' }).click();
        await expect(page).not.toHaveURL(/socialIntent/);
        await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    });
});
