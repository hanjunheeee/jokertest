'use strict';

// 서버 한 대 비우기(새 손님 안 받기) 브라우저 시험 (어려움) — 비우는 서버의 판은 끝까지 가고 새 방은 다른 서버에 생김, 판 끝 "대기방으로"는 거절, 비운 서버를 꺼도 다른 서버 사람·판은 그대로
// 목록 A17-서버-여러대.md 번호 A17-H-018~020 (서버 전체에 걸려 하나씩만 돎 @serial, 019·020은 서버를 꺼서 @shutdown, 끝에 비우기를 풀고 서버가 켜진 것까지, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-drain.spec.js
const K = require('./_a17-kit');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');
const K8 = require('../result/_a08-hard-kit');

const { test, expect, e2e, mn, N1, N2, U } = K;

// 비우기를 풀고(새로 켠 서버는 꺼진 채 시작) 두 서버·앞단이 제자리인지까지
test.afterEach(async () => {
    await K.settleNodes();
});

// 그 서버 판·방 수 (/internal/cluster)
async function loadOf(id) {
    const row = (await mn.clusterNodes()).find((n) => n.id === id);
    return { games: row?.games ?? -1, rooms: row?.rooms ?? -1 };
}

test('A17-H-018 서버 ㄱ 5명 판(사람 2 + 봇 3) 중 서버 ㄱ 비우기 → 로비 사람 ㄷ 새 방은 서버 ㄴ → 판 끝 "대기방으로" 거절 글, "로비로"는 됨 @game @hard @serial @smoke', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    // ㄷ은 비우기 전에 서버 ㄱ 로비에 붙어 있던 사람
    const c = await crowd.on(N1);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 3, N1);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N1);
    await N.toDay(t, { dayIndex: 1 });

    await mn.drain(N1);
    expect((await mn.nodeHealth(N1))?.draining, '서버 ㄱ 비우는 중').toBe(true);

    // ㄷ "게임 만들기" → 서버가 다른 서버로 옮겨 만들게 함 → 대기방 화면, 방은 서버 ㄴ
    await createRoomUi(c, {});
    expect(await K.roomNodeOf(U(c)), 'ㄷ 새 방이 있는 서버').toBe(N2);

    // 서버 ㄱ 판은 그대로 넘어가 끝까지
    await t.advanceUntil('NIGHT');
    expect((await e2e.game(t.gameId))?.phase, '판이 밤으로 넘어감').toBe('NIGHT');
    await K.endByJoker(t, joker);
    await K8.allAtResult([a, b]);

    // "대기방으로": 비우는 서버엔 방을 다시 안 엶 → 거절 글, 결과 화면 그대로
    await K8.returnButton(a.page).click();
    await expect(K8.leaveNotice(a.page)).toHaveText(K.TEXT.draining);
    await expectReadable(K8.leaveNotice(a.page));
    await expect(a.page).toHaveURL(/\/gameresult/);
    expect(await e2e.roomOf(U(a)), 'ㄱ은 방에 안 들어감').toBeNull();

    // "로비로"는 됨
    await K8.leaveToLobby(a.page);
    await K8.leaveToLobby(b.page);
});

test('A17-H-019 서버 ㄱ 비우기 → 판·방 0 → 서버 ㄱ 끔 → 서버 ㄱ 로비 사람만 서버 꺼짐 안내, 서버 ㄴ 사람 화면 그대로 @hard @serial @shutdown', async ({ crowd }) => {
    test.setTimeout(240_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    const saidA = K.collectDialogs(a.page);
    const saidB = K.collectDialogs(b.page);

    await mn.drain(N1);
    // 비우기를 기다리는 값: 서버 ㄱ 판 0·방 0
    await expect.poll(() => loadOf(N1), { timeout: 60_000, message: '서버 ㄱ 판·방 수' }).toEqual({ games: 0, rooms: 0 });

    // 안내를 보내고 꺼짐 (정리하며 끄기)
    await mn.stopNode(N1);
    await expect.poll(() => saidA.includes(K.TEXT.shutdown), { timeout: 15_000, message: '서버 ㄱ 사람이 받은 꺼짐 안내' }).toBe(true);

    // 서버 ㄴ 사람은 안내도 없고 화면도 그대로 (로비 그대로, 단추가 눌리는 자리에 보임)
    await mn.waitNodeUp(N1, 90_000);
    expect(saidB, '서버 ㄴ 사람이 받은 알림').toEqual([]);
    await expect(b.page).toHaveURL(/\/lobby$/);
    await expectReadable(b.page.getByRole('button', { name: '친구 목록' }), { contrast: false });
    // 새로 켠 서버는 비우기가 꺼진 채 시작
    expect((await mn.nodeHealth(N1))?.draining, '다시 켠 서버 ㄱ 비우기').toBe(false);
});

test('A17-H-020 서버 ㄴ 6명 판(사람 2 + 봇 4) 중 서버 ㄱ 비우기 → 끔 → 다시 켬 → 서버 ㄴ 판 끝까지, 결과 화면 @game @hard @serial @shutdown', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N2);
    const b = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 4, N2);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N2);
    await N.toDay(t, { dayIndex: 1 });

    // 하나씩 바꾸기: 서버 ㄱ 비우기 → 판 0 → 끔 → 다시 켜짐
    await mn.drain(N1);
    await expect.poll(async () => (await loadOf(N1)).games, { timeout: 60_000, message: '서버 ㄱ 판 수' }).toBe(0);
    await mn.stopNode(N1);
    await mn.waitNodeUp(N1, 90_000);
    expect((await mn.nodeHealth(N1))?.draining, '다시 켠 서버 ㄱ 비우기').toBe(false);

    // 그동안 서버 ㄴ 판은 멀쩡: 판 서버에 바로 물어 밤까지 넘기고, 광대 봇이 나가 끝
    for (const p of [a, b]) await expect(p.page).toHaveURL(/\/ingame/);
    await expect(async () => {
        const s = await K.gameAt(N2, t.gameId);
        if (s?.phase !== 'NIGHT') await K.advanceAt(N2, t.gameId);
        expect((await K.gameAt(N2, t.gameId))?.phase, '밤으로 넘어감').toBe('NIGHT');
    }).toPass({ timeout: 60_000, intervals: [600] });
    await K8.jokerLeaves(t, joker);
    await expect.poll(async () => (await K.gameAt(N2, t.gameId))?.phase ?? 'GONE', { timeout: 20_000, message: '판 끝' }).toBe('ENDED');
    await K8.allAtResult([a, b]);
});
