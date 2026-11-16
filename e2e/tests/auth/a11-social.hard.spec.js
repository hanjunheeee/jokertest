'use strict';

// 소셜 어려운 브라우저 시험 (PC, 탭·기기 여럿) — 소셜 가입 칸 두 탭 동시 보내기·모바일 소셜 로그인이 PC를 끊음·확인 안 된 디스코드로 처음부터 다시 로그인까지
// 목록 A11a-가입-로그인-세션.md 번호 A11-H-008~010
const { test, expect, DESKTOP, MOBILE, E2E } = require('../../helpers/fixtures');
const mail = require('../../helpers/mail');
const ui = require('../../helpers/ui');
const social = require('./socialHelpers');
const K = require('./_a11a-kit');

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('A11a 소셜 어려움', () => {
    // 가짜 제공자·따로 띄운 백엔드를 이 묶음이 한 작업자에서 차례로 같이 씀
    test.describe.configure({ mode: 'default' });
    let S = null;
    const opened = [];

    test.beforeAll(async ({}, testInfo) => {
        test.setTimeout(200_000);
        S = await K.startSocial(testInfo.parallelIndex);
    });
    test.afterAll(async () => {
        await S?.stop();
        await social.cleanupSeeded();
    });
    test.afterEach(async () => {
        await Promise.all(opened.splice(0).map((c) => c.close().catch(() => {})));
    });

    test('A11-H-008 소셜 가입 칸 두 탭 동시 보내기 (사람 1·탭 2): 한 탭만 로비, 다른 탭 "이미 처리된 가입 요청" 안내 @hard @smoke', async ({ browser }) => {
        const context = await browser.newContext(DESKTOP);
        opened.push(context);
        // 제공자가 이메일을 확인해 준 가입 의도 + 이 브라우저 시도 쿠키 (콜백이 가입 칸으로 보낸 직후)
        const email = K.newEmail('h8');
        const intent = await social.prepareSocialSignup(context, { provider: 'google', email });
        const tabs = [await context.newPage(), await context.newPage()];
        const nickname = K.newNickname('h');
        for (const tab of tabs) {
            await tab.goto(`/login?socialIntent=${encodeURIComponent(intent.intentToken)}`);
            await K.nicknameBox(tab).fill(nickname);
            await K.birthBox(tab).fill('2000-01-01');
            await K.agreeAll(tab);
        }
        await Promise.all(tabs.map((tab) => tab.getByRole('button', { name: '가입 완료' }).click()));
        // 한 탭은 로비, 다른 탭은 막힘 안내
        await expect.poll(async () => tabs.filter((tab) => /\/lobby$/.test(tab.url())).length, { timeout: 15_000 }).toBe(1);
        const loser = tabs.find((tab) => !/\/lobby$/.test(tab.url()));
        await expect(loser.getByRole('alert')).toContainText('이미 처리된 가입 요청');
        // 계정은 하나만
        expect(await K.uuidOfEmail(email)).not.toBeNull();
    });

    test('A11-H-009 모바일 소셜 로그인이 PC를 끊음 (사람 1·기기 2): PC 이메일 로그인 → 모바일 연결된 구글 로그인 → PC 새로고침 /login @hard', async ({ browser, accounts }) => {
        const account = await accounts.create();
        const subject = K.newSubject();
        await K.linkIdentity(account, 'google', subject);
        const pc = await browser.newContext(DESKTOP);
        opened.push(pc);
        const pcPage = await pc.newPage();
        pcPage.on('dialog', (d) => d.accept().catch(() => {}));
        await K.loginToLobby(pcPage, account);

        const phone = await browser.newContext(MOBILE);
        opened.push(phone);
        const phonePage = await phone.newPage();
        S.fake.next('google', K.providerPerson('google', { subject, email: account.email }));
        await phonePage.goto(K.socialStart(S, 'google', { mobile: true }));
        await expect(phonePage).toHaveURL(new RegExp(`^${escapeRe(E2E.mobileUrl)}/lobby$`), { timeout: 15_000 });

        await pcPage.reload();
        await expect(pcPage).toHaveURL(/\/login$/);
    });

    test('A11-H-010 확인 안 된 디스코드로 처음부터 다시 로그인까지: 이메일 인증 → 소셜 가입 → 로그아웃 → 같은 디스코드 → 로비 → 같은 이메일 가입은 인증 단계에서 이미 가입(메일 0통) @hard', async ({ page }) => {
        test.setTimeout(180_000);
        const subject = K.newSubject();
        S.fake.next('discord', K.providerPerson('discord', { subject, email: K.newEmail('dv'), verified: false }));
        await page.goto(K.socialStart(S, 'discord'));
        await expect(page).toHaveURL(/\/login\?socialIntent=/);
        // 가입 칸에서 내 이메일로 인증
        const email = K.newEmail('h10');
        await page.getByRole('textbox', { name: '이메일을 입력하세요' }).fill(email);
        const code = await K.requestCode(page, email);
        await K.enterCode(page, code);
        await expect(K.codeNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');
        await K.completeSocialSignup(page);
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15_000 });
        await K.logoutViaMenu(page);

        // 같은 디스코드면 가입 칸 없이 바로 로비
        S.fake.next('discord', K.providerPerson('discord', { subject, email, verified: false }));
        await page.goto(K.socialStart(S, 'discord'));
        await expect(page).toHaveURL(/\/lobby$/, { timeout: 15_000 });
        await ui.skipIntro(page);
        await expect(K.lobbyNav(page)).toBeVisible();
        await K.logoutViaMenu(page);

        // 같은 이메일로 이메일 가입: 위 인증 메일의 다시 보내기 대기(60초)만 DB로 끝냄 — 그 규칙은 이 시험이 보는 것이 아님
        await K.shiftSignupSentAt(email, 61);
        await K.openSignup(page);
        await K.fillSignup(page, { email });
        const since = Date.now();
        const sent = page.waitForResponse((r) => r.url() === `${E2E.apiUrl}/auth/signup/email-code` && r.request().method() === 'POST');
        await K.codeSend(page).click();
        expect((await sent).status()).toBe(200);
        // 처음 주소와 같은 화면, 새 메일은 0통
        await expect(K.codeSend(page)).toHaveText('재발송 (60초)');
        expect(mail.readMails(email).filter((m) => Date.parse(m.sentAt) >= since)).toHaveLength(0);
    });
});
