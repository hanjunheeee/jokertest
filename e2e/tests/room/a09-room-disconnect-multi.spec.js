'use strict';

// 대기방 끊김 15초 어려운 브라우저 시험 (PC, 사람 2명) — 15초 뒤 명단에서 빠짐을 남이 봄·방장이 끊기면 먼저 들어온 사람이 방장·끊긴 사람 있으면 시작 거절·14초 안에 돌아오면 그대로
// 목록 A09-끊김-나가기-탈주.md A09-H-026·027·028·052, 15초는 늘 진짜로 기다림 — 모이는지만: npx playwright test --list tests/room/a09-room-disconnect-multi.spec.js
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi, blockedDialog, botsJoinAndReady } = require('./roomHelpers');
const K = require('../ingame/_a09-simple-kit');
const H = require('../ingame/_a09-hard-kit');

const { U, TOL } = H;
const ROOM_GRACE_MS = 15_000;

const partyText = (page, n) => page.getByText(`파티 인원 ${n}명`);
const inRoom = async (hostUuid, uuid) => Boolean((await e2e.roomOf(hostUuid))?.players.some((p) => p.uuid === uuid));

// 봇 방장 방(정원 5) + 봇 손님 둘 + 사람 둘 → { host, room }
async function botRoom(bots, people) {
    const [host, ...rest] = await bots.spawn(3);
    const room = await host.createRoom({ maxPlayers: 5 });
    for (const bot of rest) await bot.joinByCode(room.roomCode);
    for (const p of people) await ui.joinRoomByCodeUi(p.page, room.roomCode);
    for (const p of people) await expect(partyText(p.page, 5)).toBeVisible({ timeout: 15_000 });
    return { host, room };
}

test('A09-H-026 [5명 방] 사람 2 + 봇 3, ㄴ이 탭을 닫음 → 14초엔 ㄱ 화면 파티 인원 5명, 15초에 ㄴ 빠져 4명 @hard @realtime @smoke', async ({ user, players, bots }) => {
    test.setTimeout(180_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const { host } = await botRoom(bots, [a, b]);
    const cutAt = Date.now();
    await b.page.close();
    await K.sleepUntil(cutAt + ROOM_GRACE_MS - 1500);
    await expect(partyText(a.page, 5)).toBeVisible();
    expect(await inRoom(U(host), U(b)), '14초엔 명단에 있음').toBe(true);
    const left = await H.eventAt(host, 'player_left_room', { since: cutAt, match: (p) => p?.uuid === U(b), timeoutMs: 15_000 });
    expect(Math.abs(left.at - cutAt - ROOM_GRACE_MS), `끊긴 지 15초에 빠짐 (차이 ${left.at - cutAt - ROOM_GRACE_MS}ms)`).toBeLessThanOrEqual(TOL);
    await expect(partyText(a.page, 4)).toBeVisible({ timeout: 5000 });
    expect(await inRoom(U(host), U(b))).toBe(false);
});

test('A09-H-027 [6명 방] 사람 2 + 봇 4, 방장 ㄱ이 탭을 닫음 → 14초엔 아직 ㄱ, 15초에 ㄴ 화면 방장 = 먼저 들어온 ㄴ @hard @realtime', async ({ user, players, bots }) => {
    test.setTimeout(180_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const room = await createRoomUi(a);
    // ㄴ이 둘째로 들어옴 → 그다음 봇 넷
    await ui.joinRoomByCodeUi(b.page, room.roomCode);
    const guests = await bots.spawn(4);
    for (const bot of guests) await bot.joinByCode(room.roomCode);
    await expect(partyText(b.page, 6)).toBeVisible({ timeout: 15_000 });
    await expect(b.page.getByRole('button', { name: '게임시작' })).toHaveCount(0);

    const cutAt = Date.now();
    await a.page.close();
    await K.sleepUntil(cutAt + ROOM_GRACE_MS - 1500);
    expect((await e2e.roomOf(U(b)))?.hostUuid, '14초엔 아직 ㄱ이 방장').toBe(U(a));
    const changed = await H.eventAt(guests[0], 'host_changed', { since: cutAt, timeoutMs: 15_000 });
    expect(Math.abs(changed.at - cutAt - ROOM_GRACE_MS), `끊긴 지 15초에 방장 바뀜 (차이 ${changed.at - cutAt - ROOM_GRACE_MS}ms)`).toBeLessThanOrEqual(TOL);
    expect(changed.payload.hostUuid, '먼저 들어온 ㄴ이 방장').toBe(U(b));
    await expectReadable(b.page.getByRole('button', { name: '게임시작' }));
    await expect(partyText(b.page, 5)).toBeVisible();
});

test('A09-H-028 [5명 방] 사람 2 + 봇 3, ㄴ 오프라인(15초 안) → 방장 ㄱ이 시작 → "일부 참가자와의 연결을 확인할 수 없습니다" @hard', async ({ user, players, bots }) => {
    test.setTimeout(180_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const gate = await H.socketGate(b);
    const room = await createRoomUi(a);
    await ui.joinRoomByCodeUi(b.page, room.roomCode);
    await ui.readyUi(b.page);
    await expect(b.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await botsJoinAndReady(await bots.spawn(3), U(a), room.roomCode);
    await expect(partyText(a.page, 5)).toBeVisible({ timeout: 15_000 });
    await ui.readyUi(a.page);
    await expect(a.page.getByRole('button', { name: '준비취소' })).toBeVisible();

    const cutAt = Date.now();
    await gate.cut();
    // ㄴ 화면이 다시 붙으려다 거절당함 = 소켓이 끊긴 것을 양쪽이 앎
    await expect.poll(() => gate.refused, { timeout: 10_000, message: 'ㄴ 화면 다시 붙기 거절' }).toBeGreaterThan(0);
    await a.page.getByRole('button', { name: '게임시작' }).click();
    const dialog = blockedDialog(a.page);
    await expect(dialog).toContainText(H.TEXT.startBlocked, { timeout: 10_000 });
    await expectReadable(dialog.getByText(H.TEXT.startBlocked, { exact: false }));
    expect(Date.now() - cutAt, '15초 안 (ㄴ이 아직 명단에 있을 때)').toBeLessThan(ROOM_GRACE_MS);
    expect(await e2e.gameOf(U(a)), '판이 안 열림').toBeNull();
    expect(await inRoom(U(a), U(b))).toBe(true);
});

test('A09-H-052 [지금 동작] [5명 방] 사람 2 + 봇 3, 준비한 ㄴ이 끊긴 뒤 14초 안에 새로고침으로 돌아옴 → 명단·준비 상태 그대로 @hard @realtime', async ({ user, players, bots }) => {
    test.setTimeout(180_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const gate = await H.socketGate(b);
    const { host } = await botRoom(bots, [a, b]);
    await ui.readyUi(b.page);
    await expect(b.page.getByRole('button', { name: '준비취소' })).toBeVisible();

    const cutAt = Date.now();
    await gate.cut();
    await K.sleepUntil(cutAt + ROOM_GRACE_MS - 3000);
    gate.open();
    await b.page.reload();
    await expect(b.page).toHaveURL(/\/game-matching/);
    await expect(b.page.getByRole('button', { name: '준비취소' })).toBeVisible({ timeout: 10_000 });
    expect(Date.now() - cutAt, '15초 안에 돌아옴').toBeLessThan(ROOM_GRACE_MS);

    // 끊긴 지 15초가 지나도 명단에 그대로, 준비도 그대로
    await K.sleepUntil(cutAt + ROOM_GRACE_MS + 2000);
    await expect(partyText(a.page, 5)).toBeVisible();
    const me = (await e2e.roomOf(U(host)))?.players.find((p) => p.uuid === U(b));
    expect(me?.isReady, 'ㄴ 준비 그대로').toBe(true);
    expect(host.events.filter((r) => r.event === 'player_left_room' && r.at >= cutAt && r.payload?.uuid === U(b)), 'ㄴ 빠짐 알림 없음').toEqual([]);
});
