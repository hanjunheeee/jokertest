'use strict';

// 서버 2대 모바일 브라우저 시험 — 폰 화면에서도 다른 서버 방에 코드로 들어가고, 판 중 새로고침해도 판 화면·앞 채팅이 그대로
// 목록 A17-서버-여러대.md 번호 A17-E-019~020 (모바일 프로젝트, E2E_NODES=2에서만 돎), 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/mobile/a17-node-move.spec.js
const K = require('../_a17-kit');
const { ui } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const K8 = require('../../result/_a08-hard-kit');
const M = require('../../mobile/_talk');

const { test, expect, e2e, mn, N1, N2, U } = K;
const { talk } = M;

test('A17-E-019 모바일: 서버 ㄱ 방(봇 4)에 서버 ㄴ 로비 사람이 코드로 입장 → 대기방 5명 @smoke', async ({ crowd, bots }) => {
    const list = await mn.botsOn(bots, 4, N1);
    const room = await list[0].createRoom({ maxPlayers: 5 });
    for (const bot of list.slice(1)) await bot.joinByCode(room.roomCode);

    const me = await crowd.on(N2);
    await ui.joinRoomByCodeUi(me.page, room.roomCode);
    await K8.expectParty(me.page, 5);
    await expectReadable(me.page.getByRole('button', { name: '준비완료' }), { contrast: false });
    expect((await e2e.roomOf(U(me)))?.roomCode, '들어간 방 코드').toBe(room.roomCode);
    expect(await K.roomNodeOf(U(me)), '방이 있는 서버').toBe(N1);
});

test('A17-E-020 모바일: 서버 ㄱ 5명 판 낮에 새로고침 → 판 화면 그대로, 앞 채팅도 그대로 @game', async ({ crowd, bots }) => {
    test.setTimeout(180_000);
    const me = await crowd.on(N1);
    const [hostBot, ...otherBots] = await mn.botsOn(bots, 4, N1);
    const { t } = await K.startGame({ hostBot, otherBots, people: [me] });
    expect(await mn.gameNodeOf(U(me)), '판이 도는 서버').toBe(N1);
    await M.toDay(t, me.page);

    // 새로고침 전에 봇이 한 말
    const said = `서버2대 ${Math.random().toString(36).slice(2, 7)}`;
    expect((await M.botSay(t, 0, said))?.ok, '봇 채팅').toBe(true);
    await expect(talk.others(me.page).filter({ hasText: said })).toBeVisible();

    await me.page.reload();
    await expect(me.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expect(talk.layout(me.page)).toBeVisible({ timeout: 20_000 });
    await M.clearOverlays(me.page);
    await expect(talk.phaseLine(me.page)).toContainText('낮', { timeout: 15_000 });
    await expectReadable(talk.others(me.page).filter({ hasText: said }).getByText(said), { timeout: 15_000 });
    expect((await e2e.gameOf(U(me)))?.gameId, '같은 판').toBe(t.gameId);
});
