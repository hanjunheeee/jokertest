'use strict';

// 서버 2대 판 끝 뒤 같은 방 브라우저 시험 — 판 중엔 다른 서버에서 코드를 쳐도 "이미 시작", 판 끝 "대기방으로"는 같은 코드 방, 로비로 간 사람은 다른 서버 로비에서 그 코드로 다시 들어감
// 목록 A17-서버-여러대.md 번호 A17-E-008~010 (E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-return-room.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K8 = require('../result/_a08-hard-kit');

const { test, expect, e2e, mn, N1, N2, U } = K;

test('A17-E-008 서버 ㄱ 봇 10명 판 중, 서버 ㄴ 로비 사람이 그 코드 입력 → "이미 게임이 시작된 방…" 글 @game @smoke', async ({ crowd, bots }) => {
    test.setTimeout(180_000);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 10, N1);
    const { t } = await K.startGame({ hostBot, otherBots });
    expect(await mn.gameNodeOf(U(hostBot)), '판이 도는 서버').toBe(N1);

    const me = await crowd.on(N2);
    const text = await K8.codeEntryAlert(me.page, t.roomCode);
    expect(text).toContain(K.TEXT.started);
    // PC는 알림 창을 닫은 뒤에도 까닭 글이 화면 띠에 남음 → 그 글이 사람 눈에 읽히는지
    await expect(K.entryNotice(me.page)).toContainText(K.TEXT.started);
    await expectReadable(K.entryNotice(me.page).getByText(K.TEXT.started));
    await expect(me.page).not.toHaveURL(/\/game-matching/);
    expect(await e2e.roomOf(U(me)), '방에 안 들어감').toBeNull();
});

test('A17-E-009 5명 판(봇 4는 서버 ㄴ 출신) 끝 → "대기방으로" → 대기방 방 코드 = 판 전 코드 @game', async ({ crowd, bots }) => {
    test.setTimeout(240_000);
    const me = await crowd.on(N1);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 4, N2);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [me] });
    const gameNode = await mn.gameNodeOf(U(me));
    expect(gameNode, '판은 방장 봇이 있던 서버').toBe(N2);

    await K.endByJoker(t, joker);
    await K8.allAtResult([me]);
    await K8.pressReturn(me.page);

    await K8.expectRoomCodeShown(me.page, t.roomCode);
    const room = await e2e.roomOf(U(me));
    expect(room?.roomCode, '서버 방 코드').toBe(t.roomCode);
    // 다시 연 방은 판이 돌던 서버에 생김 (옮겨 붙지 않음)
    expect(await K.roomNodeOf(U(me)), '다시 연 방이 있는 서버').toBe(gameNode);
});

test('A17-E-010 6명 판 끝 → "로비로" → 다른 서버 로비에서 같은 코드 입력 → 그 대기방 화면 @game', async ({ crowd, bots }) => {
    test.setTimeout(240_000);
    const me = await crowd.on(N1);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 5, N1);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [me] });
    expect(await mn.gameNodeOf(U(me)), '판이 도는 서버').toBe(N1);

    await K.endByJoker(t, joker);
    await K8.allAtResult([me]);
    await K8.leaveToLobby(me.page);
    // 로비로 간 사람은 어느 방에도 없음
    await expect.poll(() => e2e.roomOf(U(me)), { message: '로비로 간 뒤 방 자리' }).toBeNull();

    // 서버 ㄴ 로비에서 같은 코드 → 방이 있는 서버 ㄱ으로 옮겨 들어감
    await K.lobbyOn(me, N2);
    await ui.joinRoomByCodeUi(me.page, t.roomCode);
    await K8.expectRoomCodeShown(me.page, t.roomCode);
    const room = await e2e.roomOf(U(me));
    expect(room?.roomCode, '서버 방 코드').toBe(t.roomCode);
    expect(room.players.map((p) => p.uuid), '그 방 명단').toEqual([U(me)]);
    expect(await K.roomNodeOf(U(me)), '방이 있는 서버').toBe(N1);
});
