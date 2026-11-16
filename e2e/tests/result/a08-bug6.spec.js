'use strict';

// [받은 버그 6] 판 끝 뒤 방장이 "대기방으로 → 방 삭제 → 방 다시 만들기"를 밟는 브라우저 시험 (PC) — 다른 사람은 끌려가지 않고, 로비 간 사람은 어느 방에든 들어감
// 목록 A08-판끝-같은방.md 번호 A08-E-066~067(간단)·A08-H-004~006(어려움) (판은 광대 봇이 나가거나 봇 표 처형으로 끝냄)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { joinRoomByCodeUi } = require('../../helpers/ui');
const { createRoomUi } = require('../room/roomHelpers');
const {
    U, returnButton, lobbyButton, leaveNotice, startButton, openHumans, seatTable, seatHosted, jokerLeaves, voteOutJoker,
    allAtResult, pressReturn, leaveToLobby, botReturn, seatsOf, expectParty,
} = require('./_a08-hard-kit');

// 방장이 "방 삭제하기" → 브라우저 확인 창에서 확인 → 대기방 화면을 벗어남, 서버 방 자리도 없음
async function deleteRoomUi(person) {
    const page = person.page;
    const asked = page.waitForEvent('dialog', { timeout: 10_000 });
    const clicking = page.getByRole('button', { name: '방 삭제하기' }).click();
    const dialog = await asked;
    await dialog.accept();
    await clicking;
    await expect(page).not.toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await expect.poll(() => e2e.roomOf(U(person)), { message: '지운 방 자리 없음' }).toBeNull();
}

// 새로 만든 방 명단이 만든 사람뿐인지 (끝난 판 사람이 끌려오지 않음)
async function createOwnRoom(person, oldCode) {
    const room = await createRoomUi(person, {});
    expect(room.roomCode, '새 방은 다른 코드').not.toBe(oldCode);
    expect(room.players.map((p) => p.uuid), '새 방 명단').toEqual([U(person)]);
    return room;
}

// 결과 화면에 그대로 있는지: 주소 그대로·두 단추 눌림·서버 방 자리 없음
async function expectStillAtResult(person) {
    await expect(person.page).toHaveURL(/\/gameresult/);
    await expect(returnButton(person.page)).toBeEnabled();
    await expect(lobbyButton(person.page)).toBeEnabled();
    expect(await e2e.roomOf(U(person)), '방에 끌려가지 않음').toBeNull();
}

test('A08-E-066 [버그 6] 5명 판(내가 방장): 대기방으로 → 방 삭제 → 방 다시 만들기 → 새 방 명단은 나뿐, 봇은 안 끌려옴 @game @smoke', async ({ user, bots }) => {
    const { t, joker, botList } = await seatHosted(bots, user, [], 4);
    await jokerLeaves(t, joker);
    await allAtResult([user]);
    const endedAt = Date.now();

    await pressReturn(user.page);
    await expect(startButton(user.page)).toBeVisible();
    await deleteRoomUi(user);
    await createOwnRoom(user, t.roomCode);

    // 봇은 어느 방에도 없고, 판 끝 뒤 방 입장 알림도 안 받음
    for (const bot of botList) {
        expect(await e2e.roomOf(U(bot)), '봇 방 자리 없음').toBeNull();
        expect(bot.events.filter((r) => r.at >= endedAt && r.event === 'room_joined'), '봇 방 입장 알림 없음').toHaveLength(0);
    }
});

test('A08-E-067 [버그 6] 6명 판: 방장 봇이 대기방으로 → 방 삭제 → 방 다시 만들기를 해도 내 결과 화면은 그대로 @game', async ({ user, table }) => {
    const { t, joker, host } = await seatTable(table, [user], 5);
    await voteOutJoker(t, joker);
    await allAtResult([user]);

    await botReturn(host, t.gameId);
    const deleted = await host.request('delete_room', {});
    expect(deleted?.ok, `방 삭제 답 ${JSON.stringify(deleted)}`).toBe(true);
    const fresh = await host.createRoom();
    expect(fresh.roomCode, '새 방은 다른 코드').not.toBe(t.roomCode);
    expect(await seatsOf(U(host)), '방장 봇 새 방 명단').toEqual([U(host)]);

    await expectStillAtResult(user);
});

test('A08-H-004 [버그 6] 6명 판(사람 3 + 봇 3): 방장 ㄱ이 대기방 → 삭제 → 다시 만들기 → ㄴ·ㄷ 결과 화면 그대로 → ㄴ 로비로 가서 다른 방 입장 / ㄷ 대기방으로는 안내 글 @game @hard', async ({ players, bots }) => {
    test.setTimeout(360_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker } = await seatHosted(bots, a, [b, c], 3);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);

    await pressReturn(a.page);
    await deleteRoomUi(a);
    await createOwnRoom(a, t.roomCode);
    // ㄴ·ㄷ: 갑자기 방이 안 생기고 결과 화면 그대로
    await expectStillAtResult(b);
    await expectStillAtResult(c);

    // ㄴ: 로비로 → 다른 방(판 밖 봇이 만든 방)에 코드로 들어감
    const [other] = await bots.spawn(1);
    const otherRoom = await other.createRoom();
    await leaveToLobby(b.page);
    await joinRoomByCodeUi(b.page, otherRoom.roomCode);
    expect(await seatsOf(U(b)), '다른 방 명단').toEqual([U(other), U(b)]);

    // ㄷ: "대기방으로" → 안내 글만 뜨고 결과 화면 그대로, ㄱ 새 방으로 안 끌려감
    await returnButton(c.page).click();
    await expectReadable(leaveNotice(c.page));
    await expect(leaveNotice(c.page)).toHaveAttribute('data-notice-source', 'return');
    await expectStillAtResult(c);
    expect(await seatsOf(U(a)), 'ㄱ 새 방 명단').toEqual([U(a)]);
});

test('A08-H-005 [버그 6] 7명 판(사람 4 + 봇 3): ㄴ·ㄷ이 먼저 대기방에 있을 때 방장 ㄱ이 대기방 → 삭제 → 다시 만들기 → ㄴ·ㄷ은 방에서 빠진 뒤 어디든 들어감, 새 방 명단 ㄱ만, ㄹ 결과 화면 그대로 @game @hard', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const [a, b, c, d] = await openHumans(players, 4);
    const { t, joker } = await seatHosted(bots, a, [b, c, d], 3);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c, d]);

    await pressReturn(b.page);
    await pressReturn(c.page);
    await pressReturn(a.page);
    await expect(startButton(a.page)).toBeVisible();
    await expectParty(a.page, 3);
    await deleteRoomUi(a);

    // ㄴ·ㄷ: 방이 지워져 대기방 화면을 벗어남, 서버 방 자리 없음
    for (const p of [b, c]) {
        await expect(p.page).not.toHaveURL(/\/game-matching/, { timeout: 15_000 });
        await expect.poll(() => e2e.roomOf(U(p)), { message: '방에서 빠짐' }).toBeNull();
    }
    const fresh = await createOwnRoom(a, t.roomCode);
    for (const p of [b, c]) expect(await e2e.roomOf(U(p)), 'ㄱ 새 방으로 안 끌려감').toBeNull();
    await expectStillAtResult(d);

    // ㄴ은 ㄱ 새 방에 코드로, ㄷ은 새 방 만들기
    await joinRoomByCodeUi(b.page, fresh.roomCode);
    expect(await seatsOf(U(a)), 'ㄱ 새 방 명단').toEqual([U(a), U(b)]);
    await createOwnRoom(c, t.roomCode);
});

test('A08-H-006 [버그 6] 5명 판(사람 3 + 봇 2): ㄷ 로비로 → 방장 ㄱ이 대기방 → 삭제 → 다시 만들기 → ㄷ은 로비에서 방 만들기 됨, ㄱ 새 방 코드로도 들어감 @game @hard', async ({ players, bots }) => {
    test.setTimeout(360_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker } = await seatHosted(bots, a, [b, c], 2);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);

    await leaveToLobby(c.page);
    await pressReturn(a.page);
    await deleteRoomUi(a);
    const fresh = await createOwnRoom(a, t.roomCode);

    // ㄷ: 어느 방에도 못 들어가던 것 → 방 만들기 됨
    await createOwnRoom(c, t.roomCode);
    // 그 방을 지우고 ㄱ 새 방 코드로 들어감
    await deleteRoomUi(c);
    await joinRoomByCodeUi(c.page, fresh.roomCode);
    expect(await seatsOf(U(a)), 'ㄱ 새 방 명단').toEqual([U(a), U(c)]);
    await expectStillAtResult(b);
});
