'use strict';

// 되풀이·정지 어려움 브라우저 시험 (PC, 사람 여럿) — 옛 refresh를 31초 뒤 다른 기기가 다시 쓰면 두 기기 다 풀림(진짜 시간), 판 중 정지되면 그 사람만 바로 로그인 화면·다른 사람 화면엔 탈락만
// 목록 A15-보안.md 번호 A15-H-008·009 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-replay-hard.spec.js)
const { test, expect, E2E, DESKTOP, ui, internal } = require('../../helpers/fixtures');
const { ban } = require('./_sec');
const K = require('../auth/_a11a-kit');
const k = require('./_a15-kit');

const { n } = k;
const C = (count) => Array(count).fill('CITIZEN');
// 옛 refresh를 직전 토큰으로 봐주는 30초 (서버 유예) + 1초
const AFTER_GRACE_MS = 31_000;

test('A15-H-008 같은 계정 브라우저 2개: 기기 1이 refresh 회전 → 31초 뒤 기기 2가 옛 refresh로 요청 → 두 기기 다 로그인 화면 @hard @realtime @smoke', async ({ browser, players, accounts }) => {
    test.setTimeout(180_000);
    const account = await accounts.create();
    const one = await players.add({ account, login: false, lobby: false });
    await ui.loginViaApi(one.context, account, { rememberMe: true });
    await ui.gotoLobby(one.page);
    // 기기 2 = 기기 1 쿠키 그대로 (같은 세션, 옛 refresh를 들고 있음)
    const two = await browser.newContext({ ...DESKTOP, storageState: await one.context.storageState() });
    try {
        // 기기 2는 소켓을 안 붙임: 같은 세션 소켓이 붙으면 서버가 "같은 브라우저 다른 창"으로 보고 기기 1 소켓을 끊어
        // 기기 1이 5초 세션 검사를 못 받게 됨 (같은 세션 탭끼리 밀어내기 규칙, known 1-15) — 이 시험은 회전·재사용만 봄
        await two.routeWebSocket(/\/socket\.io\//, (ws) => { ws.close(); });
        const twoPage = await two.newPage();
        await ui.gotoLobby(twoPage);
        // 기기 1 회전 (브라우저 쿠키 그대로 씀, 새 refresh가 기기 1에만 들어감)
        const rotated = await one.context.request.post(`${E2E.apiUrl}/auth/refresh`, { headers: { origin: E2E.desktopUrl } });
        expect(rotated.status(), '기기 1 회전').toBe(200);
        // 진짜로 31초 기다림 (유예 30초를 넘김)
        await twoPage.waitForTimeout(AFTER_GRACE_MS);
        const reused = await two.request.post(`${E2E.apiUrl}/auth/refresh`, { headers: { origin: E2E.desktopUrl } });
        expect(reused.status(), '기기 2 옛 refresh').toBe(401);
        await twoPage.goto('/lobby');
        await expect(twoPage).toHaveURL(/\/login$/);
        // 기기 1도 세션이 끊겨 로그인 화면으로 (접속 세션 검사 5초마다)
        one.page.on('dialog', (d) => d.accept().catch(() => {}));
        await expect(one.page).toHaveURL(/\/login$/, { timeout: 15_000 });
    } finally {
        await two.close().catch(() => {});
    }
});

test('A15-H-009 6명 판 사람 A 산 채 정지 + 끊기 → A 화면 5초 안 "정지된 계정" + 로그인 화면, 다시 로그인 거절, 사람 B 화면엔 A 탈락만·A 직업 없음 @hard @game', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const b = await players.add();
    const framesB = k.watchFrames(b.page);
    const { t } = await k.setupGame(table, {
        humans: [user, b], bots: 4, counts: { JOKER: 1, DOCTOR: 1 }, humanRoles: ['CITIZEN', 'CITIZEN'], botRoles: ['JOKER', 'DOCTOR', ...C(2)],
    });
    await t.advanceUntil('DAY');
    const a = user;
    const alerts = [];
    a.page.on('dialog', (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
    await ban(a.account.uuid, { reason: 'a15 판 중 정지' });
    const bannedAt = Date.now();
    await internal.disconnect(a.account.uuid);
    await expect.poll(() => alerts.some((m) => m.startsWith('정지된 계정')), { timeout: 5_000, message: '정지 안내' }).toBe(true);
    await expect(a.page).toHaveURL(/\/login$/, { timeout: Math.max(1, 5_000 - (Date.now() - bannedAt)) });
    expect(await K.loginAlert(a.page, a.account.email, a.account.password)).toMatch(/^정지된 계정입니다\./);
    // 끊긴 60초는 이 시험이 보는 규칙이 아니라 손잡이로 끝냄 → A 탈락
    await t.expireGraces();
    await expect.poll(async () => {
        const row = await t.player(a.account.uuid);
        return row?.alive === false || row?.isParticipating === false;
    }, { timeout: 15_000, message: 'A가 판에서 빠짐' }).toBe(true);
    // B 화면: A 카드가 산 사람 표시가 아니고 직업 글 없음
    const nickA = a.account.nickname;
    await expect(n.cardStatus(b.page, nickA)).not.toHaveAttribute('data-ingame-player-status', 'alive', { timeout: 15_000 });
    await k.expectCardsHideRoles(b.page, [nickA]);
    const s = await t.state();
    k.expectNoLeak(framesB, s, b.account.uuid, { needTribunal: false, needNight: false });
});
