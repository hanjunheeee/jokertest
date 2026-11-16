'use strict';

// 서버 2대 중 한 대가 갑자기 꺼지는 브라우저 시험 (어려움) — 다른 서버 판은 끝까지 가고, 꺼진 서버 판 사람은 판 밖 화면으로, 꺼진 서버 방을 고르면 "방을 찾을 수 없습니다"
// 목록 A17-서버-여러대.md 번호 A17-H-015~017 (서버를 죽여서 하나씩만 돎 @serial @shutdown, 끝에 두 서버가 다시 켜진 것까지 기다림, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a17-node-failure.spec.js
const K = require('./_a17-kit');
const { ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { openRoomList, findRoomRow } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');
const K8 = require('../result/_a08-hard-kit');
const K9 = require('../ingame/_a09-simple-kit');

const { test, expect, e2e, mn, N1, N2, U, nick } = K;

// 죽인 서버는 곧 다시 켜짐 → 다음 시험 전에 두 서버·앞단이 제자리인지까지
test.afterEach(async () => {
    await K.settleNodes();
});

// 판 서버에 바로 물어 그 단계가 될 때까지 넘김 (죽은 서버 쪽으로 간 물음이 빈 답으로 오는 것 피함)
async function advanceTo(node, gameId, match, message) {
    await expect(async () => {
        const s = await K.gameAt(node, gameId);
        expect(s, '판이 서버에 있음').not.toBeNull();
        if (!match(s)) await K.advanceAt(node, gameId);
        expect(match(await K.gameAt(node, gameId)), message).toBe(true);
    }).toPass({ timeout: 60_000, intervals: [600] });
}

test('A17-H-015 서버 ㄱ 5명 판(사람 2 + 봇 3) 중 서버 ㄴ을 강제로 끔 → 서버 ㄱ 판은 낮·밤 계속 → 결과 화면 @game @hard @serial @shutdown @smoke', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N1);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 3, N1);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N1);
    await N.toDay(t, { dayIndex: 1 });

    // 서버 ㄴ을 정리 없이 죽임 (판은 서버 ㄱ)
    await mn.stopNode(N2, { kill: true });
    expect((await mn.nodeHealth(N1))?.ok, '서버 ㄱ은 살아 있음').toBe(true);

    // 판은 그대로 넘어감: 첫 낮 → 밤 → 둘째 날 낮
    await advanceTo(N1, t.gameId, (s) => s.phase === 'NIGHT', '밤으로 넘어감');
    await advanceTo(N1, t.gameId, (s) => s.phase === 'DAY' && s.dayIndex === 2, '둘째 날 낮');
    for (const p of [a, b]) {
        await expect(p.page).toHaveURL(/\/ingame/);
        await expect(async () => {
            await K9.clear(p.page);
            await expectReadable(N.cardStatus(p.page, nick(p)).getByText(nick(p), { exact: true }), { timeout: 2000 });
        }).toPass({ timeout: 30_000 });
    }

    // 광대 봇이 나가 판 끝 → 두 사람 결과 화면
    await K8.jokerLeaves(t, joker);
    await expect.poll(async () => (await K.gameAt(N1, t.gameId))?.phase ?? 'GONE', { timeout: 20_000, message: '판 끝' }).toBe('ENDED');
    await K8.allAtResult([a, b]);
});

test('A17-H-016 서버 ㄴ 5명 판(사람 2 + 봇 3) 중 서버 ㄴ을 강제로 끔 → 새로고침 → 판 밖 화면 + 판이 사라졌다는 안내 @game @hard @serial @shutdown', async ({ crowd, bots }) => {
    test.setTimeout(360_000);
    const a = await crowd.on(N2);
    const b = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 3, N2);
    const { t } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(a)), '판이 도는 서버').toBe(N2);
    await N.toDay(t, { dayIndex: 1 });

    await mn.stopNode(N2, { kill: true });

    for (const p of [a, b]) {
        // 새로고침 뒤 뜨는 알림 글을 모음 (PC는 브라우저 알림 창)
        const said = K.collectDialogs(p.page);
        await p.page.reload();
        // 판이 사라졌으니 판 화면에 못 남음: 로비·방 목록 같은 판 밖 화면 (몇 초 늦을 수 있어 넉넉히 — 걸리는 시간은 안 봄)
        await expect(p.page).toHaveURL(/\/(lobby|multiplay)/, { timeout: 60_000 });
        await expect.poll(() => e2e.gameOf(U(p)), { timeout: 30_000, message: '서버에 내 판 없음' }).toBeNull();
        // 왜 나왔는지 알려 주는 글 (정해진 문구가 없어 "게임·판이 없다/끝났다/사라졌다"는 뜻의 글이면 됨)
        await expect.poll(() => said.join(' / '), { timeout: 15_000, message: '판이 사라졌다는 안내 글' }).toMatch(/(게임|판).*(사라|종료|끝|없)/);
    }
});

test('A17-H-017 서버 ㄴ 공개 방을 서버 ㄱ 사람이 목록에 띄운 뒤 서버 ㄴ을 강제로 끔 → 그 방 입장 → "방을 찾을 수 없습니다…" 글, 화면 그대로 @hard @serial @shutdown', async ({ crowd, bots }) => {
    test.setTimeout(240_000);
    const [host] = await mn.botsOn(bots, 1, N2);
    await host.createRoom({ accessType: 'open', maxPlayers: 6 });
    expect(await K.roomNodeOf(U(host)), '공개 방이 있는 서버').toBe(N2);

    const me = await crowd.on(N1);
    await openRoomList(me.page);
    const title = `${host.nickname}의 방`;
    const row = await findRoomRow(me.page, title, { timeoutMs: 20_000 });
    expect(row, `목록에 "${title}" 줄`).not.toBeNull();
    await row.click();

    await mn.stopNode(N2, { kill: true });
    // PC 공개 방 입장 거절은 브라우저 알림 창뿐 → 글만 봄 (대비는 못 잼)
    const text = await ui.captureAlert(me.page, () => me.page.getByRole('button', { name: '선택한 방 입장' }).click(), { timeoutMs: 20_000 });
    expect(text).toBe(K.TEXT.nodeGone);
    await expect(me.page).toHaveURL(/\/multiplay/);
    expect(await e2e.roomOf(U(me)), '방에 안 들어감').toBeNull();
    // 목록 화면은 그대로 쓸 수 있음
    await expectReadable(me.page.getByRole('region', { name: '공개 방 목록' }), { contrast: false });
});
