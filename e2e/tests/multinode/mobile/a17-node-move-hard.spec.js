'use strict';

// 서버 2대 모바일 브라우저 시험 (어려움) — 폰 사람 둘이 다른 서버 로비에서 모인 판에서 새로고침해도 판 서버의 판 화면, 판 끝 "대기방으로"는 같은 코드 대기방
// 목록 A17-서버-여러대.md 번호 A17-H-035~036 (모바일 프로젝트, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/mobile/a17-node-move-hard.spec.js
const K = require('../_a17-kit');
const { expectReadable } = require('../../../helpers/visible');
const K8 = require('../../result/_a08-hard-kit');
const M = require('../../mobile/_talk');

const { test, expect, e2e, mn, N1, N2, U, nick } = K;
const { talk } = M;

test('A17-H-035 모바일: 6명 판(폰 사람 ㄱ 서버 ㄱ·ㄴ 서버 ㄴ + 봇 4) 낮에 ㄴ 새로고침 → 판 화면 그대로, 판 서버로 다시 붙음 @game @hard @smoke', async ({ crowd, bots }) => {
    test.setTimeout(300_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 4, N1);
    const { t } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    for (const p of [a, b]) expect(await mn.gameNodeOf(U(p)), `${nick(p)} 판 서버`).toBe(N1);
    await M.toDay(t, [a.page, b.page]);

    // ㄴ은 서버 ㄴ 힌트로 다시 엶 → 서버가 판 서버로 돌려보냄
    await b.page.reload();
    await expect(b.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expect(talk.layout(b.page)).toBeVisible({ timeout: 20_000 });
    await M.clearOverlays(b.page);
    await expect(talk.phaseLine(b.page)).toContainText('낮', { timeout: 15_000 });
    await expectReadable(talk.phaseLine(b.page));
    await expect.poll(() => K.hintOf(b.page), { timeout: 15_000, message: '판 서버로 바뀐 힌트' }).toBe(N1);

    // 같은 판·산 채 그대로, ㄱ 화면에도 ㄴ이 산 사람
    const g = await e2e.gameOf(U(b));
    expect(g?.gameId, '같은 판').toBe(t.gameId);
    const row = g.players.find((p) => p.uuid === U(b));
    expect(row?.alive, '산 채').toBe(true);
    expect(row?.isParticipating, '판에 남음').toBe(true);
    await expect(a.page.locator(`[data-ingame-player-nickname="${nick(b)}"]`).first()).toHaveAttribute('data-ingame-player-status', 'alive', { timeout: 15_000 });
});

test('A17-H-036 모바일: 5명 판(폰 사람 2 + 봇 3) 끝 → 둘 다 "대기방으로" → 같은 코드 대기방 화면 @game @hard', async ({ crowd, bots }) => {
    test.setTimeout(300_000);
    const a = await crowd.on(N1);
    const b = await crowd.on(N2);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 3, N1);
    const { t, joker } = await K.startGame({ hostBot, otherBots, people: [a, b] });
    expect(await mn.gameNodeOf(U(b)), '다른 서버에서 온 ㄴ의 판 서버').toBe(N1);

    await K.endByJoker(t, joker);
    await K8.allAtResult([a, b]);
    await K8.pressReturn(a.page);
    await K8.pressReturn(b.page);

    for (const p of [a, b]) {
        await K8.expectParty(p.page, 2);
        await K8.expectRoomCodeShown(p.page, t.roomCode);
    }
    expect(await K8.seatsOf(U(a)), '서버 방 명단').toEqual([U(a), U(b)]);
    expect((await e2e.roomOf(U(b)))?.roomCode, '같은 방 코드').toBe(t.roomCode);
    expect(await K.roomNodeOf(U(b)), '다시 연 방이 있는 서버').toBe(N1);
});
