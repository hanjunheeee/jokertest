'use strict';

// 모바일 사람 셋이 판 끝 뒤 서로 다른 단추를 누르는 브라우저 시험 (어려움) — 누른 사람만 대기방, 로비 간 사람은 방 만들기 됨
// 목록 A08-판끝-같은방.md 번호 A08-H-045 (받은 버그 3의 폰 쪽)
const { test, expect } = require('../../helpers/fixtures');
const {
    U, hostSeat, openHumans, seatTable, jokerLeaves, allAtResult, pressReturn, leaveToLobby, botReturn, seatsOf, expectParty,
    createRoomOnPhone,
} = require('../result/_a08-hard-kit');

test('A08-H-045 [모바일] 6명 판: ㄱ 대기방으로 · ㄴ 로비로 · ㄷ 대기방으로 → 명단은 ㄱ·ㄷ·봇, ㄴ은 방 만들기 됨 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const a = user;
    const [b, c] = await openHumans(players, 2);
    // 사람 3 + 봇 3, 광대 봇이 나가 시민 승 (그 봇은 탈주라 뒤에 안 씀)
    const { t, joker } = await seatTable(table, [a, b, c], 3);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c]);
    const backBots = t.bots.filter((bot) => bot !== joker);

    await pressReturn(a.page);
    await leaveToLobby(b.page);
    await pressReturn(c.page);
    for (const bot of backBots) await botReturn(bot, t.gameId);

    // 서버 방 명단 = 누른 사람만 (ㄱ·ㄷ·봇 2)
    const expected = [U(a), U(c), ...backBots.map(U)].sort();
    expect((await seatsOf(U(a))).sort(), '서버 방 명단').toEqual(expected);
    for (const p of [a, c]) await expectParty(p.page, 4);
    // 원래 방장 봇이 들어와 방장 자리 칸은 사라짐
    await expect(hostSeat(a.page)).toHaveCount(0);

    // ㄴ: "이미 참여 중인 방"으로 안 막히고 새 방이 열림
    const room = await createRoomOnPhone(b);
    expect(room.roomCode, '새 방은 다른 코드').not.toBe(t.roomCode);
    expect(room.players.map((p) => p.uuid), '새 방 명단').toEqual([U(b)]);
    expect(await seatsOf(U(a)), '옛 방 명단에 ㄴ 없음').not.toContain(U(b));
});
