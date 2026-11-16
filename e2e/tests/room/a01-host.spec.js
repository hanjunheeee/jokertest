'use strict';

// 대기방 방장 넘김·방 삭제·나가기·끊김 15초 브라우저 시험 (PC, 간단) — 방장은 나갈 때만 먼저 들어온 사람에게, 끊김은 15초 자리 남김
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-626~638 (사람 1 + 봇, 판 안 씀, 15초는 늘 진짜로 기다림 @realtime)
const { test, expect, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { findRoomRow } = require('./roomHelpers');
const K = require('./_a01b-kick-kit');

const { U, TEXT, HOST_BUTTONS, hostRoom, guestRoom } = K;
const back = (page) => page.getByRole('button', { name: '멀티플레이 선택으로 돌아가기' });
const leaveButton = (page) => K.hostButton(page, '방 나가기');

// 방장 단추 넷이 다 보임 (넘겨받은 화면)
async function expectHostButtons(page, o = {}) {
    for (const name of HOST_BUTTONS) await expect(K.hostButton(page, name), `${name} 단추`).toBeVisible(o);
}

test('A01-E-626 방장이 나가면 먼저 들어온 사람에게 — 사람 화면에 "게임시작"·"방 삭제하기"·"방 설정 변경"·"참가자 추방" (정원 6 · 봇 방장 → 사람 → 봇 2) @smoke', async ({ user, bots }) => {
    const page = user.page;
    // 사람이 두 번째, 봇 둘은 그 뒤
    const { host, room } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 0 });
    await K.joinBots(bots, 2, room.roomCode);
    await K.expectParty(page, 4);

    await K.botLeave(host);

    await expectHostButtons(page);
    await K.expectParty(page, 3);
    expect((await e2e.roomOf(U(user)))?.hostUuid, '서버 방장').toBe(U(user));
});

test('A01-E-627 두 번째로 들어오지 않았으면 방장 안 됨 — 사람 화면은 손님 단추 그대로 (정원 6 · 봇 방장 → 봇 → 사람)', async ({ user, bots }) => {
    const page = user.page;
    // 봇 하나가 사람보다 먼저 들어감
    const { host, list } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 1 });
    const second = list[0];

    await K.botLeave(host);

    await expect.poll(async () => (await e2e.roomOf(U(user)))?.hostUuid, { message: '서버 방장' }).toBe(U(second));
    // 방장 바뀜 알림 뒤에 나감 알림이 옴 → 인원이 줄었으면 방장 바뀜도 받은 뒤
    await K.expectParty(page, 2);
    await expect(leaveButton(page)).toBeVisible();
    await expect(K.hostButton(page, '게임시작')).toHaveCount(0);
    await expect(K.kickButton(page)).toHaveCount(0);
});

test('A01-E-628 사람 방장이 앱 안 "뒤로"로 나가면 방 목록으로, 봇 방은 남음 (목록에 3/6) (정원 6 · 사람 방장 + 봇 3)', async ({ user, bots }) => {
    const page = user.page;
    const { list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 3, open: true });
    const title = `${K.nick(user)}의 방`;

    await back(page).click();

    await expect(page).toHaveURL(/\/multiplay/);
    expect(await K.seatsOf(U(list[0])), '봇 셋은 방에 남음').toHaveLength(3);
    const row = await findRoomRow(page, title, { timeoutMs: 15_000 });
    expect(row, '방 목록에 그 방').not.toBeNull();
    await expect(row).toHaveAttribute('aria-label', /, 3\/6명/);
});

test('A01-E-629 손님이 "방 나가기" → 방 목록으로 (정원 6 · 봇 방장)', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 0 });

    await leaveButton(page).click();

    await expect(page).toHaveURL(/\/multiplay/);
    expect(await e2e.roomOf(U(user)), '서버 방 자리 없음').toBeNull();
    expect(await K.seatsOf(U(host))).toEqual([U(host)]);
});

test('A01-E-630 "방 삭제하기" → 확인 창 글 → 취소 → 방 그대로 (정원 6 · 사람 방장 + 봇 2)', async ({ user, bots }) => {
    const page = user.page;
    const { room } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 2 });
    const asked = K.answerNextConfirm(page, false);

    await K.hostButton(page, '방 삭제하기').click();

    expect(await asked).toBe(TEXT.deleteConfirm);
    await expect(page).toHaveURL(/\/game-matching/);
    await K.expectParty(page, 3);
    expect((await e2e.roomOf(U(user)))?.roomId, '방 그대로').toBe(room.roomId);
});

test('A01-E-631 "방 삭제하기" → 확인 → 방장 화면 방 목록, 목록에 그 방 없음 (정원 6 · 사람 방장 + 봇 2)', async ({ user, bots }) => {
    const page = user.page;
    const { list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 2, open: true });
    const asked = K.answerNextConfirm(page, true);

    await K.hostButton(page, '방 삭제하기').click();

    expect(await asked).toBe(TEXT.deleteConfirm);
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    await expect.poll(async () => e2e.roomOf(U(user))).toBeNull();
    expect(await e2e.roomOf(U(list[0])), '봇도 방 없음').toBeNull();
    expect(await findRoomRow(page, `${K.nick(user)}의 방`, { timeoutMs: 3_000 }), '목록에 없음').toBeNull();
});

test('A01-E-632 봇 방장이 방을 삭제하면 손님 사람도 방 목록으로 (정원 6 · 봇 방장)', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 0 });

    const reply = await host.request('delete_room', {});

    expect(reply?.ok, `삭제 답 ${JSON.stringify(reply)}`).toBe(true);
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    expect(await e2e.roomOf(U(user))).toBeNull();
});

test('A01-E-633 혼자 남은 방장 방은 그대로 — 봇이 나가도 대기방·인원 1 (정원 6 · 사람 방장 + 봇 1)', async ({ user, bots }) => {
    const page = user.page;
    const { room, list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 1 });

    await K.botLeave(list[0]);

    await K.expectParty(page, 1);
    await expect(page).toHaveURL(/\/game-matching/);
    await expect(K.hostButton(page, '게임시작')).toBeVisible();
    expect((await e2e.roomOf(U(user)))?.roomId, '방 그대로').toBe(room.roomId);
});

test('A01-E-634 10명 방에서 방장 넘김 — 봇 방장 나감 → 사람이 방장 (정원 10 · 봇 방장 → 사람 → 봇 8)', async ({ user, bots }) => {
    const page = user.page;
    const { host, room } = await guestRoom(user, bots, { maxPlayers: 10, botCount: 0 });
    await K.joinBots(bots, 8, room.roomCode);
    await K.expectParty(page, 10);

    await K.botLeave(host);

    await expectHostButtons(page);
    await K.expectParty(page, 9);
    expect((await e2e.roomOf(U(user)))?.hostUuid).toBe(U(user));
});

test('A01-E-635 봇이 끊기면 14초엔 자리 있음, 16초 안에 빠짐 (정원 6 · 사람 방장 + 봇 3) @realtime', async ({ user, bots }) => {
    const page = user.page;
    const { list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 3 });
    const gone = list[0];

    const droppedAt = Date.now();
    gone.socket.disconnect();

    await K.sleepUntil(droppedAt + 14_000);
    await K.expectParty(page, 4, { timeout: 500 });
    expect(await K.seatsOf(U(user)), '14초엔 서버 명단에 있음').toContain(U(gone));
    expect(Date.now() - droppedAt, '15초 전에 본 것').toBeLessThan(K.ROOM_GRACE_MS);

    await K.expectParty(page, 3, { timeout: Math.max(1, droppedAt + 16_000 - Date.now()) });
    expect(await K.seatsOf(U(user))).not.toContain(U(gone));
    await expectReadable(page.getByText('파티 인원 3명'));
});

test('A01-E-636 봇이 끊긴 지 8초에 다시 붙어 방을 물으면 20초 뒤에도 자리 있음 (정원 6 · 사람 방장 + 봇 3) @realtime', async ({ user, bots }) => {
    const page = user.page;
    const { room, list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 3 });
    const gone = list[0];

    const droppedAt = Date.now();
    gone.socket.disconnect();
    await K.sleepUntil(droppedAt + 8_000);
    gone.socket.connect();
    await expect.poll(() => gone.socket.connected, { message: '봇 다시 붙음' }).toBe(true);
    const reply = await gone.request('get_current_room', {});
    expect(reply?.room?.roomId, '다시 붙은 봇의 방').toBe(room.roomId);

    await K.sleepUntil(droppedAt + 20_000);
    await K.expectParty(page, 4, { timeout: 500 });
    expect(await K.seatsOf(U(user)), '20초 뒤에도 서버 명단에 있음').toContain(U(gone));
});

test('A01-E-637 봇 방장이 끊기면 16초 안에 사람 화면에 방장 단추 (정원 6 · 봇 방장 → 사람) @realtime', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 0 });
    await expect(K.hostButton(page, '게임시작')).toHaveCount(0);

    const droppedAt = Date.now();
    host.socket.disconnect();

    await expect(K.hostButton(page, '게임시작')).toBeVisible({ timeout: Math.max(1, droppedAt + 16_000 - Date.now()) });
    await expectHostButtons(page, { timeout: 2_000 });
    expect((await e2e.roomOf(U(user)))?.hostUuid).toBe(U(user));
});

test('A01-E-638 사람이 새로고침해도 자리 그대로 — 대기방 다시, 20초 뒤에도 그대로 (정원 6 · 봇 방장 + 봇 2) @realtime', async ({ user, bots }) => {
    const page = user.page;
    const { room } = await guestRoom(user, bots, { maxPlayers: 6, botCount: 2 });

    const reloadedAt = Date.now();
    await page.reload();
    await expect(page).toHaveURL(/\/game-matching/);
    await K.expectParty(page, 4, { timeout: 14_000 });

    await K.sleepUntil(reloadedAt + 20_000);
    expect((await e2e.roomOf(U(user)))?.roomId, '20초 뒤에도 같은 방').toBe(room.roomId);
    await K.expectParty(page, 4, { timeout: 500 });
    await expect(page).toHaveURL(/\/game-matching/);
});
