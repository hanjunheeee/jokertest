'use strict';

// 모바일 가입·로그인·세션·소셜 브라우저 시험 — 로그인 성공·실패·잠금 양피지 창이 보이는지·가입 처음부터 끝까지·인증·약관·비번 칸·로그인 유지·로그아웃·다른 기기·가짜 Google·Discord
// 목록 A11a-가입-로그인-세션.md 번호 A11-E-079~105 (@safari는 079·082·091만)
const { test, expect, DESKTOP, MOBILE, E2E } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const social = require('../auth/socialHelpers');
const K = require('../auth/_a11a-kit');

const DONE = '회원가입이 완료되었습니다! 로그인해주세요.';
const LOGIN_FAIL = '이메일 또는 비밀번호가 일치하지 않습니다.';
const LOCK_NOW = '비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.';
const BAD_PW = 'wrongpass1234';

// 떠 있는 양피지 안내 창과 그 글
const parchment = (page) => page.getByRole('alertdialog', { name: '안내' }).last();
const parchmentText = (page) => parchment(page).getByRole('paragraph').first();
// 양피지 글이 읽히는지 본 뒤 "확인"으로 닫음
async function expectParchmentReadable(page) {
    await expectReadable(parchmentText(page));
    await parchment(page).getByRole('button', { name: '확인' }).click();
}
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mobileLobbyUrl = new RegExp(`^${escapeRe(E2E.mobileUrl)}/lobby$`);

test.describe('A11a 모바일', () => {
    const opened = [];
    test.afterEach(async () => {
        await Promise.all(opened.splice(0).map((c) => c.close().catch(() => {})));
    });
    async function newWindow(browser, options) {
        const context = await browser.newContext(options);
        opened.push(context);
        return { context, page: await context.newPage() };
    }

    test('A11-E-079 모바일 로그인: 시험 계정 로그인 → 로비 @smoke @safari', async ({ page, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account);
        await expect(page).toHaveURL(/\/lobby$/);
    });

    test('A11-E-080 모바일 로그인 실패: 틀린 비번 → 양피지 알림 "이메일 또는 비밀번호가 일치하지 않습니다." 보임', async ({ page, accounts }) => {
        const account = await accounts.create();
        expect(await K.loginAlert(page, account.email, BAD_PW, { close: false })).toBe(LOGIN_FAIL);
        await expectParchmentReadable(page);
        await expect(page).toHaveURL(/\/login$/);
    });

    test('A11-E-081 모바일 잠금 문구: 5번 틀림 → 잠금 문구 보임', async ({ page, accounts }) => {
        const account = await accounts.create();
        for (let i = 0; i < 4; i += 1) expect(await K.loginAlert(page, account.email, BAD_PW)).toBe(LOGIN_FAIL);
        expect(await K.loginAlert(page, account.email, BAD_PW, { close: false })).toBe(LOCK_NOW);
        await expectParchmentReadable(page);
    });

    test('A11-E-082 모바일 가입 처음부터 끝까지: 가입 → 인증 → 약관 → 완료 → 로그인 → 로비 @safari', async ({ page }) => {
        const v = await K.prepareSignup(page);
        expect(await K.submitSignupByButton(page)).toBe(DONE);
        await K.loginToLobby(page, { email: v.email, password: v.password });
        await expect(page).toHaveURL(/\/lobby$/);
    });

    const BLOCKED = [
        ['A11-E-083', '비번 7자', { password: K.testPw(7) }, '비밀번호는 8~64자여야 합니다.'],
        ['A11-E-084', '닉네임 9자', { nickname: '가나다라마바사아자' }, '닉네임은 2~8자여야 합니다.'],
    ];
    for (const [id, name, override, message] of BLOCKED) {
        test(`${id} 모바일 가입 막힘 양피지 창: ${name} → "${message}" 글 보임`, async ({ page }) => {
            await K.prepareSignup(page, override);
            expect(await K.submitSignupByEnter(page, { close: false })).toBe(message);
            await expectParchmentReadable(page);
        });
    }

    test('A11-E-085 모바일 인증 칸 오류 글: 틀린 번호 → 오류 글 보임', async ({ page }) => {
        const email = K.newEmail('me');
        await K.openSignup(page);
        await K.fillSignup(page, { email });
        const code = await K.requestCode(page, email);
        await K.enterCode(page, code === '000000' ? '111111' : '000000');
        await expect(K.codeNotice(page)).toContainText('인증번호가 올바르지 않습니다.');
        await expectReadable(K.codeNotice(page));
    });

    test('A11-E-089 모바일 로그인 유지: 유지 켬 → 새 창 /lobby → 로비', async ({ browser, page, context, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account, { remember: true });
        // 브라우저 닫기: 세션 쿠키만 버려짐
        const state = K.dropSessionCookies(await context.storageState());
        const again = await newWindow(browser, { ...MOBILE, storageState: state });
        await again.page.goto('/lobby');
        await ui.skipIntro(again.page);
        await expect(K.lobbyNav(again.page)).toBeVisible();
        await expect(again.page).toHaveURL(/\/lobby$/);
    });

    test('A11-E-090 모바일 로그아웃: 모바일 메뉴 종료 → /login', async ({ page, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account);
        await K.logoutViaMenu(page);
    });

    test('A11-E-091 모바일 비번 칸 글자 크기: 로그인·가입 비번 칸 계산된 글자 크기 16px 이상 (아이폰 확대 막기) @safari', async ({ page }) => {
        const fontPx = (locator) => locator.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
        await page.goto('/login');
        expect(await fontPx(page.getByPlaceholder('비밀번호를 입력하세요', { exact: true }))).toBeGreaterThanOrEqual(16);
        await K.openSignup(page);
        const area = K.signupArea(page);
        expect(await fontPx(area.getByPlaceholder('비밀번호를 입력하세요', { exact: true }))).toBeGreaterThanOrEqual(16);
        expect(await fontPx(area.getByPlaceholder('비밀번호를 다시 입력하세요'))).toBeGreaterThanOrEqual(16);
    });

    test('A11-E-092 모바일 비번 보기 단추가 잘 보임: 로그인 비번 칸 보기 단추 → 화면 안·안 가려짐, 둘레 그림 대비 3 이상', async ({ page }) => {
        await page.goto('/login');
        const toggle = page.getByRole('button', { name: '비밀번호 보기' });
        await expectReadable(toggle, { contrast: false });
        expect(await K.iconContrast(toggle)).toBeGreaterThanOrEqual(3);
    });

    test('A11-E-093 모바일 약관 전체 동의: "전체 동의" → 약관 전부·만 14세 켜짐', async ({ page }) => {
        await K.openSignup(page);
        await K.agreeAll(page);
        const boxes = K.termsGroup(page).getByRole('checkbox');
        expect(await boxes.count()).toBeGreaterThanOrEqual(3);
        for (const box of await boxes.all()) await expect(box).toHaveAttribute('aria-checked', 'true');
        await expect(K.termsGroup(page).getByRole('checkbox', { name: /만 14세 이상입니다/ })).toHaveAttribute('aria-checked', 'true');
    });

    test('A11-E-095 모바일 다른 기기 로그인 뒤 새로고침: 모바일 로그인 → PC 같은 계정 로그인 → 모바일 새로고침 → /login', async ({ browser, page, accounts }) => {
        const account = await accounts.create();
        page.on('dialog', (d) => d.accept().catch(() => {}));
        await K.loginToLobby(page, account);
        const pc = await newWindow(browser, DESKTOP);
        await K.loginToLobby(pc.page, account);
        await page.reload();
        await expect(page).toHaveURL(/\/login$/);
    });

    test('A11-E-096 모바일 재동의 창: 새 필수 약관에 동의 안 한 계정 → 로그인 → 재동의 창 → 동의 → 로비', async ({ page, accounts }) => {
        // 시험 DB 전체에 새 약관을 넣으면 같이 도는 시험 모두에 창이 뜸 → 지금 약관에 동의 안 한 계정으로 같은 상태를 만듦
        const account = await accounts.create({ agreeTerms: false });
        await K.loginToLobby(page, account);
        const gate = page.getByRole('dialog', { name: '약관이 바뀌었습니다' });
        await expect(gate).toBeVisible();
        await gate.getByRole('button', { name: '모두 동의하고 계속' }).click();
        await expect(gate).toHaveCount(0);
        await expect(page).toHaveURL(/\/lobby$/);
    });

    test('A11-E-097 모바일 비번 앞뒤 빈칸: " pass1234"로 가입 → " pass1234" 로그인 → 로비', async ({ page }) => {
        const v = await K.prepareSignup(page, { password: ' pass1234' });
        expect(await K.submitSignupByEnter(page)).toBe(DONE);
        await K.loginToLobby(page, { email: v.email, password: ' pass1234' });
    });

    test('A11-E-098 모바일 중복 확인 글: 있는 주소 중복 확인 → "이미 사용 중인 이메일입니다." 보임', async ({ page, accounts }) => {
        const taken = await accounts.create();
        await K.openSignup(page);
        await K.fillSignup(page, { email: taken.email });
        await page.getByRole('button', { name: '이메일 중복확인' }).click();
        await expectReadable(page.getByText('이미 사용 중인 이메일입니다.'));
    });

    test('A11-E-099 모바일 인증 안 하고 가입: → 가입 단추 꺼짐 + 안내 줄 "이메일 인증을 완료해야 가입할 수 있습니다.", Enter로도 요청 0번', async ({ page }) => {
        const signupCalls = K.trackRequests(page, '/auth/signup');
        await K.prepareSignup(page, { verify: false });
        // 출처(F-31 2-3a): 인증 전엔 가입 단추 꺼짐 + 안내 줄
        await expect(K.signupSubmit(page)).toBeDisabled();
        await expectReadable(K.signupHint(page));
        // 꺼진 단추는 못 누르고 Enter 제출도 브라우저가 막음 → 양피지 창 없이 그대로
        await K.nicknameBox(K.signupArea(page)).press('Enter');
        await expect(K.signupSubmit(page)).toBeDisabled();
        await expect(K.signupArea(page)).toBeVisible();
        expect(signupCalls).toHaveLength(0);
    });

    test('A11-E-100 모바일 잠금 끝나면 들어감: 5번 틀려 잠김 → 잠금 끝 시각 옮김 → 맞는 비번 → 로비', async ({ page, accounts }) => {
        const account = await accounts.create();
        let last = null;
        for (let i = 0; i < 5; i += 1) last = await K.loginAlert(page, account.email, BAD_PW);
        expect(last).toBe(LOCK_NOW);
        await K.unlockByTime(account.uuid);
        await K.loginToLobby(page, account);
    });

    test('A11-E-101 모바일 정지 계정: 정지 계정 로그인 → "정지된 계정입니다. 사유: …" 보임', async ({ page, accounts }) => {
        const account = await accounts.create();
        await K.banUser(account.uuid, '시험용 정지 사유');
        expect(await K.loginAlert(page, account.email, account.password, { close: false })).toBe('정지된 계정입니다. 사유: 시험용 정지 사유');
        await expectParchmentReadable(page);
        await expect(page).toHaveURL(/\/login$/);
    });

    test('A11-E-102 모바일 access 만료 뒤 새로고침: 유지 켬 → access 만료 → 새로고침 → 로비 그대로', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await K.loginToLobby(page, account, { remember: true });
        await social.expireAccessCookie(context);
        await page.reload();
        await ui.skipIntro(page);
        await expect(K.lobbyNav(page)).toBeVisible();
        await expect(page).toHaveURL(/\/lobby$/);
    });

    test('A11-E-103 모바일 비번 보기 단추: 보기 → 글자 보임·이름 바뀜', async ({ page }) => {
        await page.goto('/login');
        const input = page.getByPlaceholder('비밀번호를 입력하세요', { exact: true });
        await input.fill('testpass1234');
        await page.getByRole('button', { name: '비밀번호 보기' }).click();
        await expect(input).toHaveAttribute('type', 'text');
        await expect(input).toHaveValue('testpass1234');
        await expect(page.getByRole('button', { name: '비밀번호 숨기기' })).toBeVisible();
    });

    test('A11-E-104 모바일 약관 보기 창: 약관 "보기" → 창 글 보임 → 닫기', async ({ page }) => {
        await K.openSignup(page);
        await K.termsGroup(page).getByRole('button', { name: '보기' }).first().click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expectReadable(dialog.getByText(/^버전 /));
        await dialog.getByRole('button', { name: '닫기' }).click();
        await expect(dialog).toHaveCount(0);
    });
});

// 가짜 Google·Discord + 따로 띄운 백엔드 (모바일에서 시작하면 모바일 주소로 돌아옴)
test.describe('A11a 모바일 소셜 (가짜 제공자)', () => {
    test.describe.configure({ mode: 'default' });
    let S = null;
    test.beforeAll(async ({}, testInfo) => {
        test.setTimeout(200_000);
        S = await K.startSocial(testInfo.parallelIndex);
    });
    test.afterAll(async () => { await S?.stop(); });

    test('A11-E-086 모바일 구글 가입: 가짜 구글 → 모바일 주소 가입 칸 → 로비(모바일 주소)', async ({ page }) => {
        const email = K.newEmail('mg');
        S.fake.next('google', K.providerPerson('google', { subject: K.newSubject(), email }));
        await page.goto(K.socialStart(S, 'google', { mobile: true }));
        await expect(page).toHaveURL(new RegExp(`^${escapeRe(E2E.mobileUrl)}/login\\?socialIntent=`));
        await K.completeSocialSignup(page);
        await expect(page).toHaveURL(mobileLobbyUrl, { timeout: 15_000 });
        expect(await K.uuidOfEmail(email)).not.toBeNull();
    });

    test('A11-E-087 모바일 디스코드 재로그인: 연결된 디스코드 → 모바일 로비', async ({ page, accounts }) => {
        const account = await accounts.create();
        const subject = K.newSubject();
        await K.linkIdentity(account, 'discord', subject);
        S.fake.next('discord', K.providerPerson('discord', { subject, email: account.email }));
        await page.goto(K.socialStart(S, 'discord', { mobile: true }));
        await expect(page).toHaveURL(mobileLobbyUrl, { timeout: 15_000 });
        await ui.skipIntro(page);
        await expect(K.lobbyNav(page)).toBeVisible();
    });

    test('A11-E-088 모바일 소셜 실패 줄: 구글 취소 → 모바일 로그인 화면 실패 줄 보임', async ({ page }) => {
        S.fake.next('google', 'cancel');
        await page.goto(K.socialStart(S, 'google', { mobile: true }));
        await expect(page).toHaveURL(new RegExp(`^${escapeRe(E2E.mobileUrl)}/login\\?socialError=`));
        await expect(page.getByRole('alert')).toHaveText('소셜 로그인을 취소했습니다.');
        await expectReadable(page.getByRole('alert'));
    });

    test('A11-E-094 모바일 같은 이메일 충돌: 구글 이메일 = 있는 계정 → 실패 줄 "이미 가입된 이메일입니다…"', async ({ page, accounts }) => {
        const account = await accounts.create();
        S.fake.next('google', K.providerPerson('google', { subject: K.newSubject(), email: account.email }));
        await page.goto(K.socialStart(S, 'google', { mobile: true }));
        await expect(page.getByRole('alert')).toHaveText(/^이미 가입된 이메일입니다\./);
    });

    test('A11-E-105 모바일 확인 안 된 이메일 소셜 가입: 가짜 디스코드 verified false → 이메일·인증 칸 → 가입 → 로비', async ({ page }) => {
        S.fake.next('discord', K.providerPerson('discord', { subject: K.newSubject(), email: K.newEmail('mv'), verified: false }));
        await page.goto(K.socialStart(S, 'discord', { mobile: true }));
        await expect(page).toHaveURL(/\/login\?socialIntent=/);
        await expect(page.getByRole('button', { name: '가입 완료' })).toBeDisabled();
        const email = K.newEmail('mv');
        await page.getByRole('textbox', { name: '이메일을 입력하세요' }).fill(email);
        const code = await K.requestCode(page, email);
        await K.enterCode(page, code);
        await expect(K.codeNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');
        await K.completeSocialSignup(page);
        await expect(page).toHaveURL(mobileLobbyUrl, { timeout: 15_000 });
        expect(await K.uuidOfEmail(email)).not.toBeNull();
    });
});
