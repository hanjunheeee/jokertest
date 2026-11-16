'use strict';

// 소셜 로그인·가입 브라우저 시험 (PC) — 가짜 Google·Discord로 처음 가입·확인 안 된 이메일·재로그인·이메일 충돌·취소·정지·로그인 유지·다른 브라우저 가입 링크·실패 글이 보이는지
// 목록 A11a-가입-로그인-세션.md 번호 A11-E-058~074
const { test, expect, DESKTOP } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const K = require('./_a11a-kit');

const CONFLICT = '이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 연결해주세요.';
const CANCELLED = '소셜 로그인을 취소했습니다.';
const signupHeader = (page) => page.getByText(/^소셜 계정으로 처음 오셨네요\./);

// 가짜 제공자·따로 띄운 백엔드는 이 묶음이 한 작업자에서 차례로 같이 씀
test.describe('A11a 소셜 (가짜 제공자)', () => {
    test.describe.configure({ mode: 'default' });
    let S = null;
    const opened = [];

    test.beforeAll(async ({}, testInfo) => {
        test.setTimeout(200_000);
        S = await K.startSocial(testInfo.parallelIndex);
    });
    test.afterAll(async () => { await S?.stop(); });
    test.afterEach(async () => {
        await Promise.all(opened.splice(0).map((c) => c.close().catch(() => {})));
    });

    // 처음 온 소셜 계정으로 가입 칸까지 (이메일 확인 여부는 verified)
    async function toSignupForm(page, provider, { verified = true, rememberMe = false } = {}) {
        const person = { subject: K.newSubject(), email: K.newEmail('so') };
        S.fake.next(provider, K.providerPerson(provider, { ...person, verified }));
        await page.goto(K.socialStart(S, provider, { rememberMe }));
        await expect(page).toHaveURL(/\/login\?socialIntent=/);
        await expect(signupHeader(page)).toBeVisible();
        return person;
    }

    test('A11-E-058 구글 처음 가입 (PC): 가짜 구글(이메일 확인됨) → 가입 칸(이메일 인증 칸 없음) → 닉네임·생일·약관 → 로비 @smoke', async ({ page }) => {
        const person = await toSignupForm(page, 'google');
        await expect(K.codeSend(page)).toHaveCount(0);
        await expect(page.getByRole('textbox', { name: '이메일을 입력하세요' })).toHaveCount(0);
        await K.completeSocialSignup(page);
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15_000 });
        expect(await K.uuidOfEmail(person.email)).not.toBeNull();
    });

    test('A11-E-059 디스코드 처음 가입 (PC): 가짜 디스코드(verified true) → 가입 칸 → 로비', async ({ page }) => {
        await toSignupForm(page, 'discord');
        await K.completeSocialSignup(page);
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15_000 });
    });

    test('A11-E-060 확인 안 된 이메일 (PC): 가짜 구글 email_verified false → 이메일·인증 칸 → 메일 번호로 인증 → 가입 → 로비', async ({ page }) => {
        await toSignupForm(page, 'google', { verified: false });
        await expect(page.getByRole('button', { name: '가입 완료' })).toBeDisabled();
        const email = K.newEmail('sv');
        await page.getByRole('textbox', { name: '이메일을 입력하세요' }).fill(email);
        const code = await K.requestCode(page, email);
        await K.enterCode(page, code);
        await expect(K.codeNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');
        await K.completeSocialSignup(page);
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15_000 });
        expect(await K.uuidOfEmail(email)).not.toBeNull();
    });

    test('A11-E-061 연결된 계정 재로그인 (PC): 소셜 가입 → 로그아웃 → 같은 구글 → 바로 로비(가입 칸 없음)', async ({ page }) => {
        const person = await toSignupForm(page, 'google');
        await K.completeSocialSignup(page);
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15_000 });
        await K.logoutViaMenu(page);
        S.fake.next('google', K.providerPerson('google', person));
        await page.goto(K.socialStart(S, 'google'));
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15_000 });
        await ui.skipIntro(page);
        await expect(K.lobbyNav(page)).toBeVisible();
    });

    for (const [id, provider] of [['A11-E-062', 'google'], ['A11-E-063', 'discord']]) {
        test(`${id} 같은 이메일 충돌 (PC): ${provider} 이메일 = 있는 계정 → 로그인 화면 "${CONFLICT}"`, async ({ page, accounts }) => {
            const account = await accounts.create();
            S.fake.next(provider, K.providerPerson(provider, { subject: K.newSubject(), email: account.email }));
            await page.goto(K.socialStart(S, provider));
            await expect(page).toHaveURL(/\/login\?socialError=/);
            await expect(page.getByRole('alert')).toHaveText(CONFLICT);
        });
    }

    for (const [id, provider] of [['A11-E-064', 'google'], ['A11-E-065', 'discord']]) {
        test(`${id} 제공자 화면 취소 (PC): ${provider} 취소 → "${CANCELLED}"`, async ({ page }) => {
            S.fake.next(provider, 'cancel');
            await page.goto(K.socialStart(S, provider));
            await expect(page).toHaveURL(/\/login\?socialError=/);
            await expect(page.getByRole('alert')).toHaveText(CANCELLED);
        });
    }

    test('A11-E-066 정지된 소셜 계정 (PC): 연결 계정 정지 → "정지된 계정입니다. 운영정책을 확인해주세요."', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        const subject = K.newSubject();
        await K.linkIdentity(account, 'google', subject);
        await K.banUser(account.uuid, '시험용 정지 사유');
        S.fake.next('google', K.providerPerson('google', { subject, email: account.email }));
        await page.goto(K.socialStart(S, 'google'));
        await expect(page).toHaveURL(/\/login\?socialError=/);
        await expect(page.getByRole('alert')).toHaveText('정지된 계정입니다. 운영정책을 확인해주세요.');
        expect(await K.cookieNames(context)).not.toContain('accessToken');
    });

    test('A11-E-067 소셜 + 로그인 유지 (PC): 유지 켜고 구글 → 로비 + refreshToken 쿠키', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        const subject = K.newSubject();
        await K.linkIdentity(account, 'google', subject);
        S.fake.next('google', K.providerPerson('google', { subject, email: account.email }));
        await page.goto(K.socialStart(S, 'google', { rememberMe: true }));
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15_000 });
        expect(await K.cookieNames(context)).toContain('refreshToken');
    });

    test('A11-E-068 다른 브라우저로 가입 링크 (PC): 브라우저 1 가입 칸 주소를 브라우저 2에서 열기 → 만료 안내, 가입 안 됨', async ({ browser, page }) => {
        const person = await toSignupForm(page, 'google');
        const link = page.url();
        const other = await browser.newContext(DESKTOP);
        opened.push(other);
        const page2 = await other.newPage();
        await page2.goto(link);
        await expect(page2.getByRole('alert')).toContainText('만료');
        await expect(page2.getByRole('button', { name: '가입 완료' })).toHaveCount(0);
        expect(await K.uuidOfEmail(person.email)).toBeNull();
    });

    test('A11-E-069 제공자 코드 교환 실패 (PC) [지금 동작]: 가짜 구글 failToken → "Google 인증에 실패했습니다. 다시 시도해주세요."', async ({ page }) => {
        S.fake.next('google', { failToken: true });
        await page.goto(K.socialStart(S, 'google'));
        await expect(page).toHaveURL(/\/login\?socialError=/);
        await expect(page.getByRole('alert')).toHaveText('Google 인증에 실패했습니다. 다시 시도해주세요.');
    });

    test('A11-E-070 소셜 가입 칸 거절 (PC): 있는 닉네임 → "이미 사용 중인 닉네임입니다." 글', async ({ page, accounts }) => {
        const taken = await accounts.create();
        await toSignupForm(page, 'google');
        await K.completeSocialSignup(page, { nickname: taken.nickname });
        await expect(page.getByRole('alert')).toHaveText('이미 사용 중인 닉네임입니다.');
        await expect(page).toHaveURL(/\/login\?socialIntent=/);
    });

    test('A11-E-071 소셜 가입 칸 거절 (PC): 만 14세 미만 → "만 14세 미만은 가입할 수 없습니다." 글', async ({ page }) => {
        await toSignupForm(page, 'google');
        await K.completeSocialSignup(page, { birthDate: K.birthDateYearsAgo(14, -1) });
        await expect(page.getByRole('alert')).toHaveText('만 14세 미만은 가입할 수 없습니다.');
    });

    test('A11-E-072 소셜 실패 글이 보임 (PC): 로그인 화면 소셜 실패 줄 → 읽힘', async ({ page }) => {
        S.fake.next('google', 'cancel');
        await page.goto(K.socialStart(S, 'google'));
        await expect(page.getByRole('alert')).toHaveText(CANCELLED);
        await expectReadable(page.getByRole('alert'));
    });

    test('A11-E-073 소셜 실패 글이 보임 (PC): 소셜 가입 칸 오류 글 → 읽힘', async ({ page, accounts }) => {
        const taken = await accounts.create();
        await toSignupForm(page, 'google');
        await K.completeSocialSignup(page, { nickname: taken.nickname });
        await expect(page.getByRole('alert')).toHaveText('이미 사용 중인 닉네임입니다.');
        await expectReadable(page.getByRole('alert'));
    });

    test('A11-E-074 소셜 가입 칸 취소 (PC) [지금 동작]: "취소" → 로그인 칸, 다시 구글 → 가입 칸 다시', async ({ page }) => {
        const person = await toSignupForm(page, 'google');
        await page.getByRole('button', { name: '취소하고 로그인 화면으로' }).click();
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
        S.fake.next('google', K.providerPerson('google', person));
        await page.goto(K.socialStart(S, 'google'));
        await expect(page).toHaveURL(/\/login\?socialIntent=/);
        await expect(signupHeader(page)).toBeVisible();
    });
});
