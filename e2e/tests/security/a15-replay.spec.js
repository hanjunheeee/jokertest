'use strict';

// 같은 것 되풀이 브라우저 시험 (PC) — 로그아웃한 쿠키 다시 쓰기, 같은 공지 번호 두 번, 남의 소셜 가입 링크를 다른 브라우저에서 열기
// 목록 A15-보안.md 번호 A15-E-063~065 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-replay.spec.js)
const crypto = require('node:crypto');
const { test, expect, E2E, DESKTOP, ui, internal } = require('../../helpers/fixtures');
const { api, sec } = require('./_sec');
const lobby = require('../lobby/lobbyHelpers');
const K = require('../auth/_a11a-kit');

test('A15-E-063 로그아웃 전 쿠키를 복사 → 화면에서 로그아웃 → 그 쿠키로 GET /auth/me 401, 소켓 접속 거절 @smoke', async ({ user }) => {
    const { page, context } = user;
    const access = (await context.cookies(E2E.apiUrl)).find((c) => c.name === 'accessToken');
    expect(access, '로그인 쿠키가 있음 (준비)').toBeTruthy();
    const copied = `accessToken=${access.value}`;
    // 복사한 쿠키가 로그아웃 전엔 됨 (뒤의 401이 쿠키 모양 탓이 아님)
    expect((await api('GET', '/auth/me', { cookie: copied })).status).toBe(200);
    await K.logoutViaMenu(page);
    expect((await api('GET', '/auth/me', { cookie: copied })).status).toBe(401);
    const s = await sec.openRawSocket({ cookie: copied });
    try {
        expect(s.connected).toBe(false);
    } finally {
        s.close();
    }
});

test('A15-E-064 같은 공지 번호(announcementId)로 두 번 보냄 → 알림 창에 그 공지 한 줄', async ({ user }) => {
    const announcementId = `a15-dup-${crypto.randomBytes(6).toString('hex')}`;
    const title = `시험 공지 ${announcementId.slice(-6)}`;
    const payload = { announcementId, title, body: '같은 번호 두 번 시험 본문', target: 'users', userUuids: [user.account.uuid] };
    await internal.announce(payload);
    await internal.announce(payload);
    await ui.gotoLobby(user.page);
    const dialog = await lobby.openNotifications(user.page);
    await expect(dialog.locator('li[data-notification-id]').filter({ hasText: title }).first()).toBeVisible();
    await expect(dialog.locator('li[data-notification-id]').filter({ hasText: title })).toHaveCount(1);
});

test('A15-E-065 가짜 구글로 가입 마무리 주소를 얻고 시도 쿠키 없는 다른 브라우저에서 엶 → 만료 안내, 계정 안 생김', async ({ page, browser }, testInfo) => {
    test.setTimeout(240_000);
    const social = await K.startSocial(testInfo.parallelIndex);
    const other = await browser.newContext(DESKTOP);
    try {
        const person = { subject: K.newSubject(), email: K.newEmail('a15so') };
        social.fake.next('google', K.providerPerson('google', { ...person, verified: true }));
        await page.goto(K.socialStart(social, 'google'));
        await expect(page).toHaveURL(/\/login\?socialIntent=/);
        await expect(page.getByText(/^소셜 계정으로 처음 오셨네요\./)).toBeVisible();
        const link = page.url();
        const page2 = await other.newPage();
        await page2.goto(link);
        await expect(page2.getByRole('alert')).toContainText('만료');
        await expect(page2.getByRole('button', { name: '가입 완료' })).toHaveCount(0);
        expect(await K.uuidOfEmail(person.email)).toBeNull();
    } finally {
        await other.close().catch(() => {});
        await social.stop();
    }
});
