'use strict';

// 가입·로그인·세션 어려운 브라우저 시험 (PC, 사람·탭 여럿) — 번갈아 로그인·탭 셋 동시 만료·같은 닉네임 동시 가입·기기 넘는 잠금·로그인 중 정지·60초 진짜로·브라우저 닫기 포함 처음부터 끝까지
// 목록 A11a-가입-로그인-세션.md 번호 A11-H-001~007
const { test, expect, DESKTOP, E2E } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const social = require('./socialHelpers');
const K = require('./_a11a-kit');

const DONE = '회원가입이 완료되었습니다! 로그인해주세요.';
const LOCK_NOW = '비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.';
const LOCKED = '비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.';

// 그 화면에 뜨는 브라우저 알림 글을 모으며 닫음 (소켓이 밀려나며 뜨는 안내 등)
function collectAlerts(page) {
    const alerts = [];
    page.on('dialog', (dialog) => { alerts.push(dialog.message()); dialog.accept().catch(() => {}); });
    return alerts;
}

test.describe('A11a 어려움', () => {
    const opened = [];
    test.afterEach(async () => {
        await Promise.all(opened.splice(0).map((c) => c.close().catch(() => {})));
    });
    // 새 창 (자기 쿠키만), 저장 상태가 있으면 그걸로
    async function newWindow(browser, storageState) {
        const context = await browser.newContext({ ...DESKTOP, ...(storageState ? { storageState } : {}) });
        opened.push(context);
        return { context, page: await context.newPage() };
    }

    test('A11-H-001 같은 계정 두 브라우저 번갈아 로그인 (사람 2): A → B → A 새로고침 /login → A 다시 → B 새로고침 /login @hard @smoke', async ({ browser, accounts }) => {
        const account = await accounts.create();
        const a = await newWindow(browser);
        const b = await newWindow(browser);
        collectAlerts(a.page);
        collectAlerts(b.page);
        await K.loginToLobby(a.page, account);
        await K.loginToLobby(b.page, account);
        await a.page.reload();
        await expect(a.page).toHaveURL(/\/login$/);
        await K.loginToLobby(a.page, account);
        await b.page.reload();
        await expect(b.page).toHaveURL(/\/login$/);
        // 마지막에 로그인한 A는 그대로 로비
        await a.page.reload();
        await expect(a.page).toHaveURL(/\/lobby$/);
    });

    test('A11-H-002 탭 셋이 동시에 만료 (사람 1·탭 3): 유지 켬 → 탭 3개 로비 → access 만료 → 동시 새로고침 → 셋 다 로비, 세션 살아 있음 @hard', async ({ browser, accounts }) => {
        const account = await accounts.create();
        const w = await newWindow(browser);
        collectAlerts(w.page);
        await K.loginToLobby(w.page, account, { remember: true });
        const tabs = [w.page];
        for (let i = 0; i < 2; i += 1) {
            const tab = await w.context.newPage();
            collectAlerts(tab);
            await ui.gotoLobby(tab);
            tabs.push(tab);
        }
        await social.expireAccessCookie(w.context);
        await Promise.all(tabs.map((tab) => tab.reload()));
        for (const tab of tabs) {
            await expect(tab).toHaveURL(/\/lobby$/);
            await ui.skipIntro(tab);
            await expect(K.lobbyNav(tab)).toBeVisible();
        }
        // 동시 refresh를 봐주는 30초 안이라 세션이 안 끊김
        expect(await K.liveSessionCount(account.uuid)).toBe(1);
        const me = await w.context.request.get(`${E2E.apiUrl}/auth/me`, { headers: { origin: E2E.desktopUrl } });
        expect(me.status()).toBe(200);
    });

    test('A11-H-003 같은 닉네임 동시 가입 (사람 2): 각자 인증 끝 → 같은 닉네임 동시 가입 → 한쪽 완료·다른 쪽 "이미 사용 중인 닉네임입니다." @hard', async ({ browser }) => {
        const a = await newWindow(browser);
        const b = await newWindow(browser);
        const nickname = K.newNickname('h');
        await K.prepareSignup(a.page, { nickname });
        await K.prepareSignup(b.page, { nickname });
        const results = await Promise.all([K.submitSignupByEnter(a.page), K.submitSignupByEnter(b.page)]);
        expect([...results].sort()).toEqual([DONE, '이미 사용 중인 닉네임입니다.'].sort());
    });

    test('A11-H-004 잠금은 기기를 안 가림 (사람 2): A 브라우저에서 5번 틀림 → B 브라우저에서 맞는 비번 → 잠김 문구 @hard', async ({ browser, accounts }) => {
        const account = await accounts.create();
        const a = await newWindow(browser);
        const b = await newWindow(browser);
        let last = null;
        for (let i = 0; i < 5; i += 1) last = await K.loginAlert(a.page, account.email, 'wrongpass1234');
        expect(last).toBe(LOCK_NOW);
        expect(await K.loginAlert(b.page, account.email, account.password)).toBe(LOCKED);
        await expect(b.page).toHaveURL(/\/login$/);
    });

    test('A11-H-005 로그인 중 정지 → 다시 로그인 (사람 1): 로비 → DB 정지 → 5초 안 정지 안내 뒤 /login → 다시 로그인 → 사유 알림 → 정지 풀기 → 로비 @hard', async ({ browser, accounts }) => {
        const account = await accounts.create();
        const w = await newWindow(browser);
        const alerts = collectAlerts(w.page);
        await K.loginToLobby(w.page, account);
        const bannedAt = Date.now();
        await K.banUser(account.uuid, '시험용 정지 사유');
        // 접속 세션 검사가 5초마다 → 정지를 찾아 안내하고 로그인 화면으로 (검사 한 번 걸리는 몫 1.5초 더)
        await expect.poll(() => alerts.some((m) => m.startsWith('정지된 계정입니다.')), { timeout: 6_500 }).toBe(true);
        await expect(w.page).toHaveURL(/\/login$/, { timeout: Math.max(1, 6_500 - (Date.now() - bannedAt)) });
        // 다시 로그인하면 사유가 보이는 알림 (모으는 알림과 안 겹치게 새 창에서)
        const again = await newWindow(browser);
        expect(await K.loginAlert(again.page, account.email, account.password)).toBe('정지된 계정입니다. 사유: 시험용 정지 사유');
        await K.liftBan(account.uuid);
        // 정지 풀려도 옛 세션은 안 살아남음
        await w.page.goto('/lobby');
        await expect(w.page).toHaveURL(/\/login$/);
        await K.loginToLobby(again.page, account);
    });

    test('A11-H-006 인증번호 60초 진짜로 기다려 다시 받기: 60초 기다림 → 재발송 → 첫 번호 틀림·새 번호 완료 → 가입 → 로그인 @hard @realtime', async ({ page }) => {
        test.setTimeout(240_000);
        const email = K.newEmail('h6');
        await K.openSignup(page);
        await K.fillSignup(page, { email });
        // 받기를 누른 때부터 셈
        const startedAt = Date.now();
        const first = await K.requestCode(page, email);
        // 진짜 시간 규칙이라 손잡이 없이 단추가 켜질 때까지 (60초 ± 1.5초)
        await expect(K.codeSend(page)).toBeEnabled({ timeout: 65_000 });
        const elapsed = Date.now() - startedAt;
        expect(elapsed).toBeGreaterThanOrEqual(58_500);
        expect(elapsed).toBeLessThanOrEqual(61_500);
        await expect(K.codeSend(page)).toHaveText('재발송');
        const second = await K.requestCode(page, email);
        expect(second).not.toBe(first);
        await K.enterCode(page, first);
        await expect(K.codeNotice(page)).toContainText('인증번호가 올바르지 않습니다.');
        await K.enterCode(page, second);
        await expect(K.codeNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');
        const nickname = K.newNickname('h');
        await K.fillSignup(page, { password: K.PW, passwordConfirm: K.PW, nickname, birthDate: '2000-01-01' });
        await K.agreeAll(page);
        expect(await K.submitSignupByButton(page)).toBe(DONE);
        await K.loginToLobby(page, { email, password: K.PW });
    });

    test('A11-H-007 가입부터 로그아웃까지 브라우저 닫기 포함: 가입 → 유지 켜고 로그인 → 닫기 → 새 창 로비 → 로그아웃 → 옛 쿠키로 새 창 /lobby → /login @hard', async ({ browser }) => {
        test.setTimeout(180_000);
        const first = await newWindow(browser);
        const v = await K.prepareSignup(first.page);
        expect(await K.submitSignupByButton(first.page)).toBe(DONE);
        await K.loginToLobby(first.page, { email: v.email, password: v.password }, { remember: true });
        // 브라우저 닫기: 세션 쿠키만 버려지고 유지 쿠키는 남음
        const saved = K.dropSessionCookies(await first.context.storageState());
        await first.context.close();
        const second = await newWindow(browser, saved);
        await second.page.goto('/lobby');
        await ui.skipIntro(second.page);
        await expect(K.lobbyNav(second.page)).toBeVisible();
        await K.logoutViaMenu(second.page);
        // 로그아웃 전에 저장해 둔 옛 쿠키는 이제 못 씀
        const third = await newWindow(browser, saved);
        await third.page.goto('/lobby');
        await expect(third.page).toHaveURL(/\/login$/);
    });
});
