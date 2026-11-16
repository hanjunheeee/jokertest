'use strict';

// PC 사람과 모바일 사람이 섞인 판 끝 뒤 브라우저 시험 (어려움) — 기기가 달라도 누른 사람만 같은 대기방, 로비 간 사람은 방 만들기 됨, 결과 화면에 남은 사람은 닫히면 로비
// 목록 A08-판끝-같은방.md 번호 A08-H-015 (모바일 사람은 폰 크기 창으로 엶, 180초는 손잡이 closeResults로)
const { test, expect } = require('../../helpers/fixtures');
const {
    U, seatTable, jokerLeaves, allAtResult, pressReturn, leaveToLobby, botReturn, seatsOf, expectParty, expectRoomCodeShown,
    createRoomAny,
} = require('./_a08-hard-kit');

const sorted = (list) => [...list].sort();

test('A08-H-015 6명 판(PC 2 + 모바일 2 + 봇 2): PC ㄱ 대기방으로 · 모바일 ㄴ 로비로 · PC ㄷ 결과 화면 그대로 · 모바일 ㄹ 대기방으로 → 명단 ㄱ·ㄹ·봇만, ㄴ 방 만들기 됨, 닫히면 ㄷ 로비 @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(360_000);
    const a = await players.add();
    const b = await players.add({ mobile: true });
    const c = await players.add();
    const d = await players.add({ mobile: true });
    // 광대 봇이 나가 시민 승 (그 봇은 탈주라 뒤에 안 씀, 방장 봇만 돌아옴)
    const { t, joker, host } = await seatTable(table, [a, b, c, d], 2);
    await jokerLeaves(t, joker);
    await allAtResult([a, b, c, d]);

    await pressReturn(a.page);
    await leaveToLobby(b.page);
    await pressReturn(d.page);
    await botReturn(host, t.gameId);

    // 서버 방 명단 = 누른 사람만, PC·폰 화면 둘 다 3명·같은 코드
    expect(sorted(await seatsOf(U(a))), '서버 방 명단').toEqual(sorted([U(a), U(d), U(host)]));
    for (const p of [a, d]) {
        await expectParty(p.page, 3);
        await expectRoomCodeShown(p.page, t.roomCode);
    }

    // 모바일 ㄴ: 로비에서 방 만들기 됨
    const room = await createRoomAny(b);
    expect(room.roomCode, '새 방은 다른 코드').not.toBe(t.roomCode);
    expect(room.players.map((p) => p.uuid), '새 방 명단').toEqual([U(b)]);

    // 결과 화면이 닫히면 남아 있던 ㄷ만 로비로, 대기방 사람은 그대로
    const closed = await t.closeResults();
    expect(closed.fired, '180초 시계 돌림').toBe(true);
    await expect(c.page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    for (const p of [a, d]) await expect(p.page).toHaveURL(/\/game-matching/);
    expect(await seatsOf(U(a)), '서버 방 명단 그대로').toHaveLength(3);
});
