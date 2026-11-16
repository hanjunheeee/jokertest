'use strict';

// 시작 어려운 브라우저 시험 (사람 여럿) — 손님 탭 닫고 15초 안엔 연결 거절·16초 뒤 빠져 4명 거절(진짜 시간), 직접 구성 인원 모으기, 10명 시작 뒤 넷째 사람 목록에서 빠짐
// 목록 A01a-방만들기-설정-시작.md 번호 A01-H-005·007·013 (@hard), 돌리지 않고 모임만: npx playwright test --list tests/room/a01-hard-start.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { e2e } = require('../../helpers/internal');
const { botsJoinAndReady, openRoomList, findRoomRow } = require('./roomHelpers');
const A9 = require('../ingame/_a09-simple-kit');
const K = require('./_a01a-kit');

// 대기방 다시 붙기 기다림 15초 (01 글 1-10 5번), 진짜 시간 허용 폭 ±1.5초
const ROOM_GRACE_MS = 15_000;
const SLACK_MS = 1500;
const startButton = (page) => page.getByRole('button', { name: '게임시작' });

/** 손님 사람들 코드 입장·준비 */
async function guestsReady(guests, roomCode) {
    for (const g of guests) await ui.joinRoomByCodeUi(g.page, roomCode);
    for (const g of guests) await K.readyMe(g.page);
}

test('A01-H-005 사람 2 + 봇 3 전원 준비, B 탭 닫음 → 15초 안 시작은 연결 거절 / 16초 뒤 B 빠져 4명 → 인원 거절 @hard @realtime', async ({ user, players, bots }) => {
    test.setTimeout(180_000);
    const A = user;
    const B = await players.add();
    const room = await K.createRoomOn(A, { maxPlayers: 5, jokers: 1 });
    await guestsReady([B], room.roomCode);
    await botsJoinAndReady(await bots.spawn(3), K.U(A), room.roomCode);
    await K.readyMe(A.page);

    const closedAt = Date.now();
    await B.context.close();
    await startButton(A.page).click();
    await K.expectStartRejected(A, K.MSG.UNAVAILABLE);
    await K.closeBlocked(A.page);

    // 15초가 지나기 전엔 자리가 남음 (허용 폭만큼 앞에서 봄)
    await A9.sleepUntil(closedAt + ROOM_GRACE_MS - SLACK_MS);
    expect((await e2e.roomOf(K.U(A))).players.some((p) => p.uuid === K.U(B)), '15초 전에 빠짐').toBe(true);
    // 15초(+허용 폭) 안에 빠져 4명
    await expect.poll(async () => (await e2e.roomOf(K.U(A))).players.length, { timeout: Math.max(1000, (closedAt + ROOM_GRACE_MS + SLACK_MS + 1000) - Date.now()) }).toBe(4);
    await startButton(A.page).click();
    await K.expectStartRejected(A, K.MSG.MIN_PLAYERS);
});

test('A01-H-007 사람 3 + 봇: 정원 10 광대2·의사2·경비원2·마녀사냥꾼2, 7명 시작 거절 → 봇 1 더 → 8명 시작 → 사람 셋 판 @game @hard @smoke', async ({ user, players, bots }) => {
    test.setTimeout(240_000);
    const A = user;
    const B = await players.add();
    const C = await players.add();
    const room = await K.createRoomOn(A, { maxPlayers: 10, custom: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
    await guestsReady([B, C], room.roomCode);
    const botList = await bots.spawn(5);
    await botsJoinAndReady(botList.slice(0, 4), K.U(A), room.roomCode);
    await K.readyMe(A.page);
    await startButton(A.page).click();
    await K.expectStartRejected(A, K.MSG.ROLE_MISMATCH);
    await K.closeBlocked(A.page);

    await K.botsJoin([botList[4]], room.roomCode);
    await K.botsReady([botList[4]], K.U(A));
    const presets = {
        [K.U(A)]: 'DOCTOR', [K.U(B)]: 'GUARD', [K.U(C)]: 'WITCH_HUNTER',
        ...Object.fromEntries(botList.map((b, i) => [K.U(b), ['JOKER', 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'][i]])),
    };
    await e2e.setRoles(presets, { roomId: room.roomId });
    await startButton(A.page).click();
    for (const p of [A, B, C]) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const game = await e2e.gameOf(K.U(A));
    expect(game.players).toHaveLength(8);
    await K.expectRolesTaken(game.gameId, presets);
});

test('A01-H-013 사람 3 + 봇 7 = 10명 정원 10 전원 준비 시작 → 사람 셋 판, 넷째 사람 목록에서 그 방 사라짐 @game @hard', async ({ user, players, bots }) => {
    test.setTimeout(240_000);
    const A = user;
    const [B, C, D] = [await players.add(), await players.add(), await players.add()];
    const room = await K.createRoomOn(A, { maxPlayers: 10, jokers: 1, code: false });
    await guestsReady([B, C], room.roomCode);
    const botList = await bots.spawn(7);
    await botsJoinAndReady(botList, K.U(A), room.roomCode);
    await K.readyMe(A.page);

    await openRoomList(D.page);
    const title = K.titleOf(A);
    expect(await findRoomRow(D.page, title, { timeoutMs: 15_000 }), '넷째 사람 목록에 그 방').not.toBeNull();

    const presets = K.autoRoles([A, B, C], botList);
    await e2e.setRoles(presets, { roomId: room.roomId });
    await startButton(A.page).click();
    for (const p of [A, B, C]) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    expect((await e2e.gameOf(K.U(A))).players).toHaveLength(10);
    await expect.poll(async () => (await findRoomRow(D.page, title, { timeoutMs: 1500 })) === null, { timeout: 15_000 }).toBe(true);
});
