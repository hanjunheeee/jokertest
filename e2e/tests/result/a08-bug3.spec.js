'use strict';

// [받은 버그 3] 판 끝 뒤 한쪽은 "로비로", 한쪽은 "대기방으로"를 누르는 브라우저 시험 (PC, 어려움) — 누른 사람만 대기방, 로비 간 사람은 안 갇힘, 남은 사람끼리 다음 판 시작
// 목록 A08-판끝-같은방.md 번호 A08-H-001~003·041 (판은 탈주 없이 끝냄: 사람 광대 암살 / 광대 봇 밤 암살 / 화면 투표로 처형)
const { test, expect } = require('../../helpers/fixtures');
const { e2e } = require('../../helpers/internal');
const { customRoleSettings } = require('../../helpers/game');
const { joinRoomByCodeUi } = require('../../helpers/ui');
const { hostGame, createRoomUi } = require('../room/roomHelpers');
const {
    U, startButton, hostSeat, openHumans, rolesFor, expectRoles, seatTable, killByNight, killByHuman, voteOutWithHumans,
    allAtResult, pressReturn, leaveToLobby, botReturn, seatsOf, expectParty, startByHuman, startByBot,
} = require('./_a08-hard-kit');

const sorted = (list) => [...list].sort();

// 로비에 있는 사람이 새 방을 만들 수 있는지 ("이미 참여 중인 방"으로 안 막힘), 새 방 명단은 그 사람뿐
async function expectCanCreateRoom(person, oldCode) {
    const room = await createRoomUi(person, {});
    expect(room.roomCode, '새 방은 다른 코드').not.toBe(oldCode);
    expect(room.players.map((p) => p.uuid), '새 방 명단').toEqual([U(person)]);
}

test('A08-H-001 [버그 3] 사람 5명 판: ㄱ "로비로", ㄴ~ㅁ "대기방으로" → 새 사람 ㅂ 코드 입장 → 5명 준비 → 시작 됨, ㄱ은 방 만들기 됨 @game @hard', async ({ players }) => {
    test.setTimeout(480_000);
    const [a, b, c, d, e] = await openHumans(players, 5);
    // ㄴ이 방장 (ㄱ이 방장인 길은 H-003), 광대 ㄹ·ㅁ 중 ㄹ이 밤에 ㄷ을 암살 → 광대 2 : 나머지 2 → 광대 승 (아무도 안 나감)
    const first = rolesFor([a, b, c, d, e], [d, e]);
    const t = await hostGame({ host: b, guests: [a, c, d, e], roles: first, settings: { jokers: 2 } });
    await expectRoles(t.gameId, first);
    await killByHuman(t, d, c);
    await allAtResult([a, b, c, d, e]);

    await leaveToLobby(a.page);
    for (const p of [b, c, d, e]) await pressReturn(p.page);
    // 원래 방장 ㄴ이 방장, 명단은 누른 4명뿐
    await expect(startButton(b.page)).toBeVisible();
    await expectParty(b.page, 4);
    expect(sorted(await seatsOf(U(b))), '서버 방 명단').toEqual(sorted([b, c, d, e].map(U)));

    // 새 사람 ㅂ이 같은 코드로 들어옴 → 5명
    const f = await players.add();
    await joinRoomByCodeUi(f.page, t.roomCode);
    await expectParty(b.page, 5);
    const t2 = await startByHuman(b, [c, d, e, f], [], rolesFor([b, c, d, e, f], [d, e]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    const s2 = await e2e.game(t2.gameId);
    expect(sorted(s2.players.map((p) => p.uuid)), '새 판 사람 (ㄱ 없음)').toEqual(sorted([b, c, d, e, f].map(U)));

    await expectCanCreateRoom(a, t.roomCode);
});

test('A08-H-002 [버그 3] 6명 판(사람 3 + 봇 3): ㄱ 대기방으로 → ㄴ 로비로 → ㄷ 대기방으로 → 봇 대기방으로 → ㄴ 같은 코드로 다시 → 6명 준비 → 시작 됨 @game @hard', async ({ players, table }) => {
    test.setTimeout(420_000);
    const [a, b, c] = await openHumans(players, 3);
    // 광대 2(ㄷ + 방장 봇), 나머지 시민 → 방장 봇이 두 밤에 봇 둘을 암살 → 광대 2 : 나머지 2 → 광대 승 (아무도 안 나감)
    const t = await table.setup({
        humans: [a, b, c],
        bots: 3,
        settings: customRoleSettings({ JOKER: 2 }),
        roles: ({ bots }) => rolesFor([a, b, c], [c, bots[0]]),
    });
    const [host, v1, v2] = t.bots;
    await expectRoles(t.gameId, rolesFor([a, b, c], [c, host]));
    await killByNight(t, [host], [U(v1), U(v2)]);
    await allAtResult([a, b, c]);

    await pressReturn(a.page);
    await leaveToLobby(b.page);
    await pressReturn(c.page);
    for (const bot of t.bots) await botReturn(bot, t.gameId);
    await expectParty(a.page, 5);
    expect(await seatsOf(U(a)), '로비 간 ㄴ은 명단에 없음').not.toContain(U(b));

    await joinRoomByCodeUi(b.page, t.roomCode);
    for (const p of [a, b, c]) await expectParty(p.page, 6);
    const t2 = await startByBot(host, [a, b, c], t.bots, rolesFor([a, b, c], [c, host]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    const s2 = await e2e.game(t2.gameId);
    expect(s2.players, '새 판 6명').toHaveLength(6);
    expect(s2.players.map((p) => p.uuid)).toContain(U(b));
});

test('A08-H-003 [버그 3] 5명 판(사람 3 + 봇 2): 원래 방장 ㄱ이 "로비로", ㄴ·ㄷ·봇은 "대기방으로" → ㄴ이 방장 → 새 사람 1 → 시작 됨, ㄱ은 방 만들기 됨 @game @hard @smoke', async ({ players, bots }) => {
    test.setTimeout(420_000);
    const [a, b, c] = await openHumans(players, 3);
    const botList = await bots.spawn(2);
    // 광대 2(ㄷ + 둘째 봇) → 둘째 봇이 밤에 첫째 봇을 암살 → 광대 2 : 나머지 2 → 광대 승 (아무도 안 나감)
    const first = rolesFor([a, b, c], [c, botList[1]]);
    const t = await hostGame({ host: a, guests: [b, c], botList, roles: first, settings: { jokers: 2 } });
    await expectRoles(t.gameId, first);
    await killByNight(t, [botList[1]], [U(botList[0])]);
    await allAtResult([a, b, c]);

    // 방장이 로비로 가면 남겨 둘 방장 자리가 없음 → 먼저 들어온 ㄴ이 방장
    await leaveToLobby(a.page);
    await pressReturn(b.page);
    await expect(startButton(b.page)).toBeVisible();
    await expect(hostSeat(b.page)).toHaveCount(0);
    await pressReturn(c.page);
    for (const bot of botList) await botReturn(bot, t.gameId);
    await expect(startButton(c.page)).toHaveCount(0);
    expect((await e2e.roomOf(U(b)))?.hostUuid, '서버 방장').toBe(U(b));

    // 새 사람(판 밖 봇) 하나가 같은 코드로 → 5명 → 시작
    const [fresh] = await bots.spawn(1);
    await fresh.joinByCode(t.roomCode);
    await expectParty(b.page, 5);
    const t2 = await startByHuman(b, [c], [...botList, fresh], rolesFor([b, c], [c, botList[1]]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    const s2 = await e2e.game(t2.gameId);
    expect(s2.players, '새 판 5명').toHaveLength(5);
    expect(s2.players.map((p) => p.uuid), '새 판에 ㄱ 없음').not.toContain(U(a));

    await expectCanCreateRoom(a, t.roomCode);
});

test('A08-H-041 [버그 3] 10명 판(사람 5 + 봇 5): 사람 2 로비로 · 2 대기방으로 · 1 결과 화면 그대로 · 봇 5 대기방으로 → 명단 7, 새 사람 없이 시작 됨, 로비 간 둘은 방 만들기 됨 @game @hard', async ({ players, table }) => {
    test.setTimeout(480_000);
    const people = await openHumans(players, 5);
    const [a, b, c, d, e] = people;
    const { t, joker, host } = await seatTable(table, people, 5);
    // 봇 4 + 사람 3이 광대 봇에게 투표 → 처형 → 시민 승 (봇 표만으로는 기권 6을 못 넘음, 아무도 안 나감)
    await voteOutWithHumans(t, joker, [a, b, c]);
    await allAtResult(people);

    await leaveToLobby(a.page);
    await leaveToLobby(b.page);
    await pressReturn(c.page);
    await pressReturn(d.page);
    for (const bot of t.bots) await botReturn(bot, t.gameId);
    expect(sorted(await seatsOf(U(c))), '서버 방 명단 7명').toEqual(sorted([c, d, ...t.bots].map(U)));
    for (const p of [c, d]) await expectParty(p.page, 7);
    await expect(e.page).toHaveURL(/\/gameresult/);

    // 결과 화면에 머무는 ㅁ·로비 간 둘을 안 기다리고 7명으로 시작
    const t2 = await startByBot(host, [c, d], t.bots, rolesFor([c, d], [joker]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    expect((await e2e.game(t2.gameId)).players, '새 판 7명').toHaveLength(7);
    await expect(e.page).toHaveURL(/\/gameresult/);

    await expectCanCreateRoom(a, t.roomCode);
    await expectCanCreateRoom(b, t.roomCode);
});
