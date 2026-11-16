'use strict';

// 판 끝 뒤 방장 자리 브라우저 시험 (PC, 어려움) — 원래 방장 자리 남겨 두기·정원이 찬 방·방장이 새로고침/탭 닫기/로비로/나가기 했을 때 누가 방장이 되나
// 목록 A08-판끝-같은방.md 번호 A08-H-008~010·020·025·029·030 (사람이 방장인 판, 180초는 안 기다림)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { joinRoomByCodeUi } = require('../../helpers/ui');
const friends = require('../../helpers/friends');
const { hostGame } = require('../room/roomHelpers');
const {
    U, TEXT, startButton, hostSeat, openHumans, rolesFor, expectRoles, seatHosted, jokerLeaves, killByNight, allAtResult,
    pressReturn, leaveToLobby, botReturn, seatsOf, expectParty,
} = require('./_a08-hard-kit');

/**
 * 정원 6 방에서 6명 판(방장 ㄱ + ㄴ·ㄷ + 봇 3)을 탈주 없이 끝내고, 원래 방장 ㄱ만 빼고 5명이 대기방에 들어간 모습까지
 * 광대 2(ㄷ + 셋째 봇) → 셋째 봇이 두 밤에 봇 둘을 암살 → 광대 승
 */
async function fullRoomWithoutHost(players, bots) {
    const [a, b, c] = await openHumans(players, 3);
    const botList = await bots.spawn(3);
    const first = rolesFor([a, b, c], [c, botList[2]]);
    const t = await hostGame({
        host: a, guests: [b, c], botList, roles: first, settings: { maxPlayers: 6, custom: { JOKER: 2 } },
    });
    await expectRoles(t.gameId, first);
    await killByNight(t, [botList[2]], [U(botList[0]), U(botList[1])]);
    await allAtResult([a, b, c]);

    await pressReturn(b.page);
    await pressReturn(c.page);
    for (const bot of botList) await botReturn(bot, t.gameId);
    await expectParty(b.page, 5);
    // 방장 자리 1칸을 남겨 둔 채 5명 → 다른 사람에겐 가득 찬 방
    await expect(hostSeat(b.page)).toBeVisible();
    return { a, b, c, t };
}

// 원래 방장이 들어와 방장이 됐는지: "게임시작" 단추·6명·방장 자리 칸 없음·서버 방장
async function expectHostBack(a, others) {
    await expect(startButton(a.page)).toBeVisible();
    for (const p of [a, ...others]) await expectParty(p.page, 6);
    for (const p of others) await expect(hostSeat(p.page)).toHaveCount(0);
    const room = await e2e.roomOf(U(a));
    expect(room.hostUuid, '서버 방장').toBe(U(a));
    expect(room.players, '서버 방 6명').toHaveLength(6);
}

test('A08-H-008 6명 판(정원 6): 원래 방장 ㄱ 빼고 5명이 들어간 방 → 새 사람 코드 입장은 가득 참 → ㄱ "대기방으로"는 들어가 방장 @game @hard', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const { a, b, c, t } = await fullRoomWithoutHost(players, bots);

    const [fresh] = await bots.spawn(1);
    await expect(fresh.joinByCode(t.roomCode), '새 사람 코드 입장').rejects.toThrow(/ROOM_FULL/);
    expect(await seatsOf(U(b)), '서버 방 명단 그대로 5명').toHaveLength(5);

    await pressReturn(a.page);
    await expectHostBack(a, [b, c]);
});

test('A08-H-009 7명 판(사람 3 + 봇 4): ㄴ이 먼저 대기방에 있을 때 원래 방장 ㄱ이 결과 화면 새로고침 → ㄴ 화면에 "게임시작", ㄱ은 결과 없음 → 코드로 오면 보통 사람 @game @hard', async ({ players, bots }) => {
    test.setTimeout(360_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker } = await seatHosted(bots, a, [b, c], 4);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);

    await pressReturn(b.page);
    await expect(hostSeat(b.page)).toBeVisible();
    await expect(startButton(b.page)).toHaveCount(0);

    // 새로고침하면 바로 그 판에서 빠짐 → 남겨 둔 방장 자리도 끝 → 먼저 들어와 있던 ㄴ이 방장
    await a.page.reload();
    await expect(startButton(b.page)).toBeVisible({ timeout: 15_000 });
    await expect(hostSeat(b.page)).toHaveCount(0);

    await expectReadable(a.page.getByText(TEXT.noResult, { exact: true }), { timeout: 15_000 });
    await joinRoomByCodeUi(a.page, t.roomCode);
    await expect(a.page.getByRole('button', { name: '방 나가기' })).toBeVisible();
    await expect(startButton(a.page)).toHaveCount(0);
    const room = await e2e.roomOf(U(b));
    expect(room.hostUuid, '서버 방장 = ㄴ').toBe(U(b));
    expect(room.players.map((p) => p.uuid), '서버 방 명단').toEqual([U(b), U(a)]);
});

test('A08-H-010 5명 판(사람 3 + 봇 2): ㄴ·ㄷ이 대기방에 있을 때 원래 방장 ㄱ이 탭을 닫음 → 먼저 들어온 ㄴ이 방장 @game @hard', async ({ players, bots }) => {
    test.setTimeout(300_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker } = await seatHosted(bots, a, [b, c], 2);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);

    await pressReturn(b.page);
    await pressReturn(c.page);
    await expect(hostSeat(c.page)).toBeVisible();

    await a.page.close();
    await expect(startButton(b.page)).toBeVisible({ timeout: 15_000 });
    await expect(startButton(c.page)).toHaveCount(0);
    await expect(hostSeat(c.page)).toHaveCount(0);
    expect((await e2e.roomOf(U(b)))?.hostUuid, '서버 방장 = ㄴ').toBe(U(b));
});

test('A08-H-020 5명 판(ㄱ·ㄴ + 봇 3): 판 밖 ㄷ이 코드로 가장 먼저 → 방장 아님·방장 자리 칸 보임 → 원래 방장 ㄱ "대기방으로" → ㄱ이 방장 @game @hard', async ({ players, bots }) => {
    test.setTimeout(300_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker } = await seatHosted(bots, a, [b], 3);
    await jokerLeaves(t, joker);
    await allAtResult([a, b]);

    await joinRoomByCodeUi(c.page, t.roomCode);
    await expect(startButton(c.page)).toHaveCount(0);
    // 이름표는 눌림을 안 받게 해 둔 글이라 가려짐 검사는 못 씀
    await expectReadable(hostSeat(c.page).getByText('방장 자리', { exact: true }), { uncovered: false });
    expect((await e2e.roomOf(U(c)))?.hostUuid, '서버 방장 칸 비어 있음').toBeNull();

    await pressReturn(a.page);
    await expect(startButton(a.page)).toBeVisible();
    await expect(hostSeat(c.page)).toHaveCount(0);
    await expect(startButton(c.page)).toHaveCount(0);
    expect((await e2e.roomOf(U(c)))?.hostUuid, '서버 방장 = ㄱ').toBe(U(a));
});

test('A08-H-025 5명 판(사람 3 + 봇 2): ㄷ → ㄴ 순서로 대기방에 든 뒤 원래 방장 ㄱ이 "로비로" → 먼저 들어온 ㄷ 화면에만 "게임시작" @game @hard @smoke', async ({ players, bots }) => {
    test.setTimeout(300_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker } = await seatHosted(bots, a, [b, c], 2);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);

    await pressReturn(c.page);
    await pressReturn(b.page);
    expect(await seatsOf(U(c)), '들어온 순서').toEqual([U(c), U(b)]);

    await leaveToLobby(a.page);
    await expect(startButton(c.page)).toBeVisible();
    await expect(startButton(b.page)).toHaveCount(0);
    await expect(hostSeat(b.page)).toHaveCount(0);
    expect((await e2e.roomOf(U(c)))?.hostUuid, '서버 방장 = ㄷ').toBe(U(c));
});

test('A08-H-029 6명 판(사람 3 + 봇 3): ㄴ → 원래 방장 ㄱ 순서로 들어간 뒤 ㄱ이 방을 나감 → ㄴ이 방장 @game @hard', async ({ players, bots }) => {
    test.setTimeout(300_000);
    const [a, b, c] = await openHumans(players, 3);
    const { t, joker } = await seatHosted(bots, a, [b, c], 3);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);

    await pressReturn(b.page);
    await pressReturn(a.page);
    await expect(startButton(a.page)).toBeVisible();
    await expect(startButton(b.page)).toHaveCount(0);

    // 방장 화면엔 "방 나가기"가 없어 왼쪽 아래 뒤로 가기로 나감
    await a.page.getByRole('button', { name: '멀티플레이 선택으로 돌아가기' }).click();
    await expect(a.page).not.toHaveURL(/\/game-matching/);
    await expect(startButton(b.page)).toBeVisible();
    const room = await e2e.roomOf(U(b));
    expect(room.hostUuid, '서버 방장 = ㄴ').toBe(U(b));
    expect(room.players.map((p) => p.uuid), '서버 방 명단').toEqual([U(b)]);
    await expect(c.page).toHaveURL(/\/gameresult/);
});

test('A08-H-030 6명 판(정원 6): 원래 방장 ㄱ 빼고 5명이 들어간 방에서 ㄴ이 친구 초대 → 친구 수락은 가득 참 → ㄱ은 들어감 @game @hard', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const { a, b, c } = await fullRoomWithoutHost(players, bots);

    // 친구 = 판 밖 봇, ㄴ이 신청하고 봇이 수락해 친구가 됨
    const [friend] = await bots.spawn(1);
    await friends.api(b, 'POST', '/friends/requests', { receiverId: U(friend) });
    const incoming = await friends.botApi(friend, 'GET', '/friends/requests/incoming');
    const request = incoming.find((row) => row.id === U(b));
    expect(request, '받은 친구 신청').toBeTruthy();
    await friends.botApi(friend, 'PUT', `/friends/requests/${request.request_id}/accept`);

    // ㄴ 화면에서 친구 초대 → 친구가 수락 → 남겨 둔 방장 자리 때문에 가득 참
    await b.page.getByRole('button', { name: '친구 초대', exact: true }).click();
    await b.page.getByRole('dialog', { name: '친구초대' }).getByRole('button', { name: `${friend.nickname} 게임 초대` }).click();
    const received = await friend.waitForEvent('game_invite_received');
    const reply = await friend.request('accept_game_invite', { inviteId: received.invite.inviteId });
    expect(reply?.ok, `초대 수락 답 ${JSON.stringify(reply)}`).toBe(false);
    expect(reply.code, '거절 까닭').toBe('ROOM_FULL');
    expect(await seatsOf(U(b)), '서버 방 명단 그대로 5명').toHaveLength(5);

    await pressReturn(a.page);
    await expectHostBack(a, [b, c]);
});
