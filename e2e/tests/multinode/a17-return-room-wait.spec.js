'use strict';

// 서버 2대 방 코드 잡아 두기 브라우저 시험 (어려움) — 판 끝 180초 동안 아무도 안 오면 코드가 풀리고, 한 명이라도 있으면 다른 서버 사람이 그 코드로 들어옴, 판 중엔 "이미 시작"·다른 서버 새 방 코드와 안 겹침
// 목록 A17-서버-여러대.md 번호 A17-H-007~010 (007·008은 180초를 손잡이 없이 진짜로 기다림 @realtime, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-return-room-wait.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K1 = require('../room/_a01a-kit');
const K8 = require('../result/_a08-hard-kit');

const { test, expect, e2e, mn, N1, N2, U } = K;
// 진짜 시간 허용 폭 ±1.5초 (시험_계획 3-5, 늘려서 덮지 않음)
const NEAR_MS = 1500;

test('A17-H-007 5명 판(사람 2 + 봇 3) 끝 → 둘 다 결과 화면에서 180초 → 둘 다 로비 → 서버 ㄴ 사람이 그 코드 입력 → 방 없음 글 @game @hard @realtime', async ({ crowd, bots }) => {
    test.setTimeout(480_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 3, N1);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    await K.endByJoker(t, joker);
    await K8.allAtResult([a, b]);
    const closesAt = await K8.closesAtOf(hostBot, t.gameId);

    // 180초 직전까지는 결과 화면, 180초가 지나면 둘 다 로비 (손잡이 안 씀)
    await K8.sleepUntil(closesAt - NEAR_MS);
    for (const p of [a, b]) await expect(p.page).toHaveURL(/\/gameresult/);
    await K8.sleepUntil(closesAt + NEAR_MS);
    for (const p of [a, b]) await expect(p.page).toHaveURL(/\/lobby/, { timeout: 1000 });

    // 아무도 안 온 방은 없어지고 코드도 풀림 → 서버 ㄴ 로비에서 그 코드는 없는 코드
    await K.lobbyOn(b, N2);
    const text = await K8.codeEntryAlert(b.page, t.roomCode);
    expect(text).toBe(K.TEXT.noRoom);
    await expectReadable(K.entryNotice(b.page).getByText(K.TEXT.noRoom, { exact: true }));
    await expect(b.page).not.toHaveURL(/\/game-matching/);
    expect(await e2e.roomOf(U(b)), '방에 안 들어감').toBeNull();
});

test('A17-H-008 6명 판 끝 → ㄱ "대기방으로" → 180초 → 서버 ㄴ 로비 ㄴ이 그 코드 입력 → 그 방 화면, ㄱ과 같이 명단 @game @hard @realtime', async ({ crowd, bots }) => {
    test.setTimeout(480_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 5, N1);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a] });
    await K.endByJoker(t, joker);
    await K8.allAtResult([a]);
    const closesAt = await K8.closesAtOf(hostBot, t.gameId);
    await K8.pressReturn(a.page);

    // 180초를 진짜로 넘김 → 한 명이 있는 방은 그대로 남음
    await K8.sleepUntil(closesAt + NEAR_MS);
    await expect(a.page).toHaveURL(/\/game-matching/);
    expect((await e2e.roomOf(U(a)))?.roomCode, '180초 뒤에도 같은 방 코드').toBe(t.roomCode);

    await ui.joinRoomByCodeUi(b.page, t.roomCode);
    for (const p of [a, b]) await K8.expectParty(p.page, 2);
    expect(await K8.seatsOf(U(b)), '서버 방 명단').toEqual([U(a), U(b)]);
    expect((await e2e.roomOf(U(b)))?.roomCode, 'ㄴ이 들어간 방 코드').toBe(t.roomCode);
    expect(await K.roomNodeOf(U(b)), '방이 있는 서버').toBe(N1);
});

test('A17-H-009 7명 판 중 서버 ㄴ 사람이 코드 입력 → "이미 게임이 시작된 방…" → 판 끝 뒤 같은 코드 → 대기방 화면 @game @hard @smoke', async ({ crowd, bots }) => {
    test.setTimeout(300_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 6, N1);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N1);

    // 판 중: 거절 글 + 방에 안 들어감
    const text = await K8.codeEntryAlert(b.page, t.roomCode);
    expect(text).toContain(K.TEXT.started);
    await expectReadable(K.entryNotice(b.page).getByText(K.TEXT.started));
    expect(await e2e.roomOf(U(b)), '판 중엔 방에 안 들어감').toBeNull();

    // 판 끝(ㄱ은 결과 화면에 그대로) → 같은 코드로 새 사람도 들어감
    await K.endByJoker(t, joker);
    await K8.allAtResult([a]);
    await ui.joinRoomByCodeUi(b.page, t.roomCode);
    await K8.expectParty(b.page, 1);
    const room = await e2e.roomOf(U(b));
    expect(room?.roomCode, '같은 방 코드').toBe(t.roomCode);
    expect(room.players.map((p) => p.uuid), '그 방 명단').toEqual([U(b)]);
    expect(await K.roomNodeOf(U(b)), '방이 있는 서버').toBe(N1);
});

test('A17-H-010 서버 ㄱ 8명 판 중 서버 ㄴ 사람이 방 만들기·지우기 10번 → 어느 방 코드도 판 코드와 다름 @game @hard', async ({ crowd, bots }) => {
    test.setTimeout(480_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 7, N1);
    const { t } = await K.startGame({ hostBot, otherBots, people: [a] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N1);

    const codes = [];
    for (let i = 0; i < 10; i += 1) codes.push(await K1.createAndDelete(b));
    expect(codes).toHaveLength(10);
    for (const code of codes) {
        expect(code, '새 방 코드 모양').toMatch(/^[A-Z0-9]{6}$/);
        expect(code, '판이 쓰는 코드와 다름').not.toBe(t.roomCode);
    }
    // 그동안 판은 그대로 돎
    expect((await e2e.game(t.gameId))?.phase, '판은 계속').not.toBe('ENDED');
});
