'use strict';

// 서버 2대 판 끝 뒤 섞인 단추 브라우저 시험 (어려움) — "로비로"와 "대기방으로"가 섞여도 누른 사람만 방에 들고(받은 버그 3·6), 원래 방장 자리는 결과 화면에 있는 동안만 남음
// 목록 A17-서버-여러대.md 번호 A17-H-003~006 (사람 일부는 다른 서버 로비에서 출발, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-return-room-mixed.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi } = require('../room/roomHelpers');
const K8 = require('../result/_a08-hard-kit');

const { test, expect, e2e, mn, N1, N2, U } = K;

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

// 결과 화면에 그대로 있는지: 주소 그대로·두 단추 눌림·서버 방 자리 없음
async function expectStillAtResult(person) {
    await expect(person.page).toHaveURL(/\/gameresult/);
    await expect(K8.returnButton(person.page)).toBeEnabled();
    await expect(K8.lobbyButton(person.page)).toBeEnabled();
    expect(await e2e.roomOf(U(person)), '방에 끌려가지 않음').toBeNull();
}

test('A17-H-003 [버그 3] 7명 판(사람 3 + 봇 4) 끝 → 서버 ㄴ 출신 ㄷ "로비로", ㄱ·ㄴ "대기방으로" → 대기방 2명뿐 → ㄷ은 서버 ㄴ에서 "게임 만들기" 됨 @game @hard @smoke', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    const c = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 4, N1);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a, b, c] });
    expect(await mn.gameNodeOf(U(c)), '다른 서버에서 온 ㄷ의 판 서버').toBe(N1);
    await K.endByJoker(t, joker);
    await K8.allAtResult([a, b, c]);

    await K8.leaveToLobby(c.page);
    await K8.pressReturn(a.page);
    await K8.pressReturn(b.page);

    // 누른 두 사람만 방에 있음 (로비로 간 ㄷ·결과 화면의 봇은 안 끌려옴)
    for (const p of [a, b]) await K8.expectParty(p.page, 2);
    expect(await K8.seatsOf(U(a)), '서버 방 명단').toEqual([U(a), U(b)]);
    expect((await e2e.roomOf(U(a)))?.roomCode, '같은 방 코드').toBe(t.roomCode);
    expect(await e2e.roomOf(U(c)), 'ㄷ은 방에 없음').toBeNull();

    // ㄷ: 서버 ㄴ 로비에서 새 방 만들기 → 그 방은 서버 ㄴ에, 명단은 ㄷ뿐
    await K.lobbyOn(c, N2);
    const fresh = await createRoomUi(c, {});
    expect(fresh.roomCode, '새 방은 다른 코드').not.toBe(t.roomCode);
    expect(fresh.players.map((p) => p.uuid), '새 방 명단').toEqual([U(c)]);
    expect(await K.roomNodeOf(U(c)), 'ㄷ 새 방이 있는 서버').toBe(N2);
    // ㄱ·ㄴ 화면은 그대로 2명
    for (const p of [a, b]) await K8.expectParty(p.page, 2);
});

test('A17-H-004 [버그 6] 5명 판(사람 3 + 봇 2) 끝 → 방장 ㄱ이 대기방 → 삭제 → 다시 만들기 → ㄴ·ㄷ은 안 끌려감, 로비로 간 ㄷ은 다른 서버 방에 코드로 들어감 @game @hard', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    const c = await crowd.on(N2);
    const botList = await mn.botsOn(bots, 2, N2);
    const { t, joker } = await K.startHosted({ host: a, guests: [b, c], botList });
    expect(await mn.gameNodeOf(U(c)), '판은 방장 ㄱ이 있던 서버').toBe(N1);
    await K.endByJoker(t, joker);
    await K8.allAtResult([a, b, c]);

    await K8.pressReturn(a.page);
    await expect(K8.startButton(a.page)).toBeVisible();
    await deleteRoomUi(a);
    const fresh = await createRoomUi(a, {});
    expect(fresh.roomCode, '새 방은 다른 코드').not.toBe(t.roomCode);
    expect(fresh.players.map((p) => p.uuid), '새 방 명단은 ㄱ뿐').toEqual([U(a)]);
    expect(await K.roomNodeOf(U(a)), 'ㄱ 새 방이 있는 서버').toBe(N1);
    // ㄴ·ㄷ: 갑자기 방이 안 생기고 결과 화면 그대로
    await expectStillAtResult(b);
    await expectStillAtResult(c);

    // ㄷ: 로비로 → 서버 ㄴ 로비에서 ㄱ 새 방(서버 ㄱ) 코드 → 옮겨 들어감
    await K8.leaveToLobby(c.page);
    await K.lobbyOn(c, N2);
    await ui.joinRoomByCodeUi(c.page, fresh.roomCode);
    expect(await K8.seatsOf(U(c)), 'ㄱ 새 방 명단').toEqual([U(a), U(c)]);
    expect(await K.roomNodeOf(U(c)), 'ㄷ이 들어간 방의 서버').toBe(N1);
    await expectStillAtResult(b);
});

test('A17-H-005 8명 판(사람 2 + 봇 6) 끝 → 원래 방장 ㄱ "로비로" → ㄴ 먼저 "대기방으로" → ㄱ이 서버 ㄴ 로비에서 코드로 돌아와도 방장은 ㄴ @game @hard', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    const botList = await mn.botsOn(bots, 6, N1);
    const { t, joker } = await K.startHosted({ host: a, guests: [b], botList });
    await K.endByJoker(t, joker);
    await K8.allAtResult([a, b]);

    // 원래 방장이 로비로 가면 남겨 둔 방장 자리는 끝 → 먼저 들어온 ㄴ이 방장
    await K8.leaveToLobby(a.page);
    await K8.pressReturn(b.page);
    await expectReadable(K8.startButton(b.page), { contrast: false });
    await expect(K8.hostSeat(b.page)).toHaveCount(0);
    expect((await e2e.roomOf(U(b)))?.hostUuid, '서버 방장 = ㄴ').toBe(U(b));

    // ㄱ: 서버 ㄴ 로비에서 같은 코드 → 방이 있는 서버 ㄱ으로 옮겨 보통 사람으로 들어감
    await K.lobbyOn(a, N2);
    await ui.joinRoomByCodeUi(a.page, t.roomCode);
    for (const p of [a, b]) await K8.expectParty(p.page, 2);
    await expect(K8.startButton(a.page)).toHaveCount(0);
    await expect(K8.startButton(b.page)).toBeVisible();
    const room = await e2e.roomOf(U(a));
    expect(room?.roomCode, '같은 방 코드').toBe(t.roomCode);
    expect(room.hostUuid, 'ㄱ이 와도 방장은 ㄴ').toBe(U(b));
    expect(await K.roomNodeOf(U(a)), '방이 있는 서버').toBe(N1);
});

test('A17-H-006 6명 판(사람 2 + 봇 4) 끝 → ㄴ "대기방으로" → "방장 자리" 칸 보임 → 결과 화면에 있던 원래 방장 ㄱ "대기방으로" → 방장은 ㄱ @game @hard', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    const botList = await mn.botsOn(bots, 4, N2);
    const { t, joker } = await K.startHosted({ host: a, guests: [b], botList });
    await K.endByJoker(t, joker);
    await K8.allAtResult([a, b]);

    // ㄴ이 먼저: 원래 방장이 결과 화면에 있는 동안은 방장 자리를 비워 둠 → ㄴ은 방장 아님
    await K8.pressReturn(b.page);
    await expectReadable(K8.hostSeat(b.page).getByText('방장 자리', { exact: true }), { uncovered: false });
    await expect(K8.startButton(b.page)).toHaveCount(0);
    expect((await e2e.roomOf(U(b)))?.hostUuid, '서버 방장 칸 비어 있음').toBeNull();

    // 원래 방장 ㄱ이 들어오면 방장
    await K8.pressReturn(a.page);
    await expectReadable(K8.startButton(a.page), { contrast: false });
    for (const p of [a, b]) await K8.expectParty(p.page, 2);
    await expect(K8.hostSeat(b.page)).toHaveCount(0);
    await expect(K8.startButton(b.page)).toHaveCount(0);
    const room = await e2e.roomOf(U(a));
    expect(room.hostUuid, '서버 방장 = ㄱ').toBe(U(a));
    expect(room.roomCode, '같은 방 코드').toBe(t.roomCode);
});
