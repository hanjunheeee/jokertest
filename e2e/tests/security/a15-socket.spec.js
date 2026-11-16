'use strict';

// 소켓 사건 제한·소속 검사 브라우저 시험 (PC) — 화면 소켓으로 10초 안 121번은 121번째부터 거절·361번은 끊김·64KB 넘는 글은 끊김, 접속 중 정지는 바로 로그인 화면, 남의 판에 표·스냅샷은 거절
// 목록 A15-보안.md 번호 A15-E-075~080 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-socket.spec.js)
const { test, expect, ui, internal } = require('../../helpers/fixtures');
const { ban } = require('./_sec');
const k = require('./_a15-kit');

const C = (count) => Array(count).fill('CITIZEN');

// 화면 소켓을 잡고 로비를 새로 엶
async function hookedLobby(page) {
    await k.hookPageSocket(page);
    await ui.gotoLobby(page);
    await k.expectSocketHooked(page);
}

const closedCount = (page) => page.evaluate(() => window.__a15Net?.closed ?? 0);

test('A15-E-075 6명 판 중 화면 소켓으로 10초 안 121번 → 121번째 답 RATE_LIMITED, 판 화면 그대로 @game @smoke', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    // 판 차리기가 코드 입장 화면을 새로 열 때 소켓을 잡음
    await k.hookPageSocket(page);
    const { t } = await k.setupGame(table, { humans: [user], bots: 5, counts: { JOKER: 1, DOCTOR: 1 }, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', ...C(3)] });
    await t.advanceUntil('DAY');
    await k.expectSocketHooked(page);
    const closedBefore = await closedCount(page);
    const startedAt = Date.now();
    const replies = await k.pageEmitMany(page, 'get_session_snapshot', Array(121).fill({ gameId: t.gameId }));
    expect(Date.now() - startedAt, '121번이 10초 창 안').toBeLessThan(10_000);
    expect(replies[0]?.ok, '첫 번째는 받음').toBe(true);
    expect(replies[120]?.code).toBe('RATE_LIMITED');
    // 끊기지 않고 판 화면 그대로
    expect(await closedCount(page)).toBe(closedBefore);
    await expect(page).toHaveURL(/\/ingame/);
    await expect(page.locator('[data-ingame-player-nickname]')).toHaveCount(6);
});

test('A15-E-076 로비에서 화면 소켓으로 10초 안 361번 → 연결 끊김', async ({ user }) => {
    const page = user.page;
    await hookedLobby(page);
    const index = await k.pageSendRaw(page, Array(361).fill('42["get_current_room",{}]'));
    await expect.poll(() => k.socketClosed(page, index), { timeout: 10_000, message: '보낸 소켓이 끊김' }).toBe(true);
});

test('A15-E-077 로비에서 65KB 사건 하나 → 연결 끊김', async ({ user }) => {
    const page = user.page;
    await hookedLobby(page);
    const big = `42${JSON.stringify(['get_current_room', { pad: 'x'.repeat(65 * 1024) }])}`;
    const index = await k.pageSendRaw(page, [big]);
    await expect.poll(() => k.socketClosed(page, index), { timeout: 10_000, message: '보낸 소켓이 끊김' }).toBe(true);
});

test('A15-E-078 로비 접속 중 정지 + 안쪽 통로 끊기 → 5초 안 "정지된 계정" 안내 + 로그인 화면', async ({ user }) => {
    const page = user.page;
    const alerts = [];
    page.on('dialog', (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
    await ban(user.account.uuid, { reason: 'a15 시험 정지' });
    const bannedAt = Date.now();
    await internal.disconnect(user.account.uuid);
    await expect.poll(() => alerts.some((m) => m.startsWith('정지된 계정')), { timeout: 5_000, message: '정지 안내' }).toBe(true);
    await expect(page).toHaveURL(/\/login$/, { timeout: Math.max(1, 5_000 - (Date.now() - bannedAt)) });
});

test('A15-E-079 로비 사람 화면 소켓이 6명 봇 판 gameId로 cast_day_vote → 거절, 판 표 현황 그대로 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    await hookedLobby(page);
    const { t } = await k.setupGame(table, { humans: [], bots: 6, counts: { JOKER: 1, DOCTOR: 1 }, botRoles: ['JOKER', 'DOCTOR', ...C(4)] });
    // 봇은 토론만 끝내고 표는 안 냄 → 표 낸 수 0인 투표 단계
    t.playBots({ readyForVote: true, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
    await t.advanceUntil('DAY_VOTE');
    const before = (await t.bots[0].snapshot(t.gameId))?.progress;
    expect(before?.kind, '투표 단계 (준비)').toBe('DAY_VOTE');
    const reply = await k.pageEmit(page, 'cast_day_vote', { gameId: t.gameId, targetId: t.bots[1].account.uuid });
    expect(reply?.timeout, '답을 받음').toBeUndefined();
    expect(reply?.ok).toBe(false);
    const after = (await t.bots[0].snapshot(t.gameId))?.progress;
    expect(after).toEqual(before);
    await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
});

test('A15-E-080 5명 판 1의 사람이 5명 판 2 gameId로 get_session_snapshot → 거절, 판 2 명단·단계 없음 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    await k.hookPageSocket(page);
    await k.setupGame(table, { humans: [user], bots: 4, counts: { JOKER: 1 }, humanRoles: ['CITIZEN'], botRoles: ['JOKER', ...C(3)] });
    const { t: t2, s: s2 } = await k.setupGame(table, { humans: [], bots: 5, counts: { JOKER: 1 }, botRoles: ['JOKER', ...C(4)] });
    await k.expectSocketHooked(page);
    const reply = await k.pageEmit(page, 'get_session_snapshot', { gameId: t2.gameId });
    expect(reply?.timeout, '답을 받음').toBeUndefined();
    expect(reply?.ok).toBe(false);
    expect(reply?.players).toBeUndefined();
    expect(reply?.phase).toBeUndefined();
    const text = JSON.stringify(reply);
    for (const p of s2.players) {
        expect(text, '판 2 사람 uuid').not.toContain(p.uuid);
        expect(text, '판 2 사람 닉네임').not.toContain(p.nickname);
    }
});
