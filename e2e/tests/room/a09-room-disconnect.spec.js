'use strict';

// 대기방 끊김 15초 브라우저 시험 (PC) — 끊긴 봇은 15초 동안 명단에 남았다가 빠짐, 방장이 금방 새로고침하면 방·방장 그대로, 끊긴 사람이 있으면 시작 거절 글, 내가 끊겨 20초 못 붙으면 방 목록으로
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-080~083·121 — 15초·20초는 늘 진짜로 기다림 (@realtime), 대기방은 이름 없이 인원 수("파티 인원 N명")로 명단을 봄
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi, botsJoinAndReady } = require('./roomHelpers');
const K = require('../ingame/_a09-simple-kit');

// 대기방 다시 붙기 기다림 (서버 ROOM_RECONNECT_GRACE_MS)
const ROOM_GRACE_MS = 15_000;
const party = (page, n) => page.locator(`[aria-label="파티 인원 ${n}명"]`);
const partyText = (page, n) => page.getByText(`파티 인원 ${n}명`);

// 봇 방장 방(n명 정원)에 봇들과 사람이 들어감 → { host, guests }
async function botRoom(bots, user, n) {
    const list = await bots.spawn(n - 1);
    const [host, ...guests] = list;
    const room = await host.createRoom({ maxPlayers: n });
    for (const bot of guests) await bot.joinByCode(room.roomCode);
    await ui.joinRoomByCodeUi(user.page, room.roomCode);
    await expect(party(user.page, n)).toBeVisible();
    return { host, guests };
}

// 서버 대기방 명단에 그 사람이 있는지
async function inRoom(hostUuid, uuid) {
    const room = await e2e.roomOf(hostUuid);
    return Boolean(room?.players.some((p) => p.uuid === uuid));
}

test('A09-E-080 5명 방, 봇이 끊긴 지 14초 → 아직 명단에 있음 @realtime', async ({ user, bots }) => {
    const page = user.page;
    const { host, guests } = await botRoom(bots, user, 5);
    const gone = guests[0];
    const droppedAt = Date.now();
    K.dropBot(gone);
    await K.sleepUntil(droppedAt + ROOM_GRACE_MS - 1000);
    await expect(party(page, 5)).toBeVisible();
    await expectReadable(partyText(page, 5));
    expect(await inRoom(host.uuid, gone.uuid), '14초엔 서버 명단에 있음').toBe(true);
    // 위 확인이 15초 전에 끝났어야 뜻이 있음
    expect(Date.now() - droppedAt).toBeLessThan(ROOM_GRACE_MS);
});

test('A09-E-081 5명 방, 봇이 끊긴 지 16초 → 명단에서 빠짐 @realtime', async ({ user, bots }) => {
    const page = user.page;
    const { host, guests } = await botRoom(bots, user, 5);
    const gone = guests[0];
    const droppedAt = Date.now();
    K.dropBot(gone);
    // 15초 전엔 남아 있고, 15초(+1.5초) 뒤엔 빠져 있음
    await K.sleepUntil(droppedAt + ROOM_GRACE_MS - 1000);
    expect(await inRoom(host.uuid, gone.uuid), '14초엔 서버 명단에 있음').toBe(true);
    await K.sleepUntil(droppedAt + ROOM_GRACE_MS + K.SLACK_MS);
    expect(await inRoom(host.uuid, gone.uuid), '16.5초엔 서버 명단에 없음').toBe(false);
    await expect(party(page, 4)).toBeVisible({ timeout: 2000 });
    await expectReadable(partyText(page, 4));
});

test('A09-E-082 6명 방, 방장(나)이 새로고침해 10초 안에 돌아옴 → 15초가 지나도 방·방장 그대로 @realtime', async ({ user, bots }) => {
    const page = user.page;
    const me = K.U(user);
    const room = await createRoomUi(user, { maxPlayers: 6 });
    await botsJoinAndReady(await bots.spawn(5), me, room.roomCode);
    await expect(party(page, 6)).toBeVisible();

    const reloadedAt = Date.now();
    await page.reload();
    await expect(page).toHaveURL(/\/game-matching/);
    await expect(page.getByRole('button', { name: '게임시작' })).toBeVisible({ timeout: 10_000 });
    expect(Date.now() - reloadedAt, '10초 안에 돌아옴').toBeLessThan(10_000);

    // 끊긴 때부터 15초(+1.5초)가 지나도 그대로
    await K.sleepUntil(reloadedAt + ROOM_GRACE_MS + K.SLACK_MS);
    const now = await e2e.roomOf(me);
    expect(now?.roomId, '같은 방').toBe(room.roomId);
    expect(now.hostUuid, '방장 그대로').toBe(me);
    expect(now.players).toHaveLength(6);
    await expect(page).toHaveURL(/\/game-matching/);
    await expect(party(page, 6)).toBeVisible();
    await expectReadable(page.getByRole('button', { name: '게임시작' }));
});

test('A09-E-083 5명 방, 끊긴 봇이 있는 채 방장(나)이 시작 → "일부 참가자와의 연결을 확인할 수 없습니다" @smoke', async ({ user, bots }) => {
    const page = user.page;
    const me = K.U(user);
    const room = await createRoomUi(user, { maxPlayers: 5 });
    const guests = await bots.spawn(4);
    await botsJoinAndReady(guests, me, room.roomCode);
    await expect(party(page, 5)).toBeVisible();
    await ui.readyUi(page);
    await expect(page.getByRole('button', { name: '준비취소' })).toBeVisible();

    // 봇 하나가 끊김 (15초 안이라 명단엔 남아 있음) → 바로 시작을 누름
    K.dropBot(guests[0]);
    await page.getByRole('button', { name: '게임시작' }).click();
    const blocked = page.locator('[data-game-start-blocked]');
    const reason = blocked.getByRole('alert');
    await expect(reason).toContainText('일부 참가자와의 연결을 확인할 수 없습니다');
    await expectReadable(reason);
    await expect(page).toHaveURL(/\/game-matching/);
    expect(await e2e.gameOf(me), '판이 안 열림').toBeNull();
});

// 합친 뒤 동작: 대기방에서 소켓이 끊긴 채 20초 안에 못 붙으면 알림 뒤 방 목록 (서버 유예 15초 + 여유, frontend matching/constants/roomTiming.js MATCHING_DISCONNECT_EXIT_MS·roomMessages.js SESSION_LOST)
const DISCONNECT_EXIT_MS = 20_000;
const SESSION_LOST = '대기방 연결이 끊어졌습니다.\n로비로 이동합니다.';

// 화면 소켓 길을 시험이 쥠: cut()을 부르면 지금 연결을 끊고 그 뒤 새 연결은 바로 닫음 (화면은 다시 붙으려 해도 못 붙음)
// 페이지가 새로 열릴 때 만드는 소켓부터 잡힘 → 코드 입장(새 주소로 감) 전에 부름
async function socketCutter(page) {
    const open = [];
    let blocked = false;
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
        if (blocked) { ws.close(); return; }
        const server = ws.connectToServer();
        open.push({ ws, server });
    });
    return {
        cut() {
            blocked = true;
            for (const c of open.splice(0)) { c.ws.close().catch(() => {}); c.server.close().catch(() => {}); }
        },
    };
}

test('A09-E-121 5명 방 손님(나)이 끊긴 채 못 붙으면 → 15초엔 대기방 그대로, 20초(±1.5초)에 "대기방 연결이 끊어졌습니다" 알림 뒤 방 목록 @realtime', async ({ user, bots }) => {
    const page = user.page;
    const cutter = await socketCutter(page);
    await botRoom(bots, user, 5);
    const droppedAt = Date.now();
    cutter.cut();
    const alert = ui.captureAlert(page, async () => {}, { timeoutMs: DISCONNECT_EXIT_MS + 10_000 });
    let alertAt = null;
    alert.then(() => { alertAt = Date.now(); }, () => {});
    // 15초: 아직 대기방, 알림 없음 (서버 유예 안이라 다시 붙을 틈을 줌)
    await K.sleepUntil(droppedAt + ROOM_GRACE_MS);
    await expect(page).toHaveURL(/\/game-matching/);
    expect(alertAt, '15초 전엔 알림 없음').toBeNull();
    // 20초: 알림 글 → 방 목록
    expect(await alert).toBe(SESSION_LOST);
    expect(Math.abs(alertAt - (droppedAt + DISCONNECT_EXIT_MS)), `알림 시각 (끊긴 뒤 ${alertAt - droppedAt}ms)`).toBeLessThanOrEqual(K.SLACK_MS);
    await expect(page).toHaveURL(/\/multiplay/);
});
