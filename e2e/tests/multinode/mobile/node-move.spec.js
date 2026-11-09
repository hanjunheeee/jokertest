// Node 여러 개 — 모바일 화면 Node 이동 (계획 6-4 MN-026 mobile·MN-027 mobile-safari, E 수준)
// mobile·mobile-safari 프로젝트가 같은 시험을 두 번 돎 (E2E_NODES=2에서만), 모바일도 shared/socket 이동 코드를 같이 씀
const mn = require('../_mn');
const { ui } = require('../../../helpers/fixtures');

const { test, expect, e2e, NODE_IDS } = mn;
const [N1, N2] = NODE_IDS;

test('MN-026·027 모바일: n1 방에 n2 로비에서 코드로 들어가면 → 옮긴 뒤 같은 방', async ({ bots, onNode }) => {
    const [host] = await mn.botsOn(bots, 1, N1);
    const room = await host.createRoom();
    const me = await onNode.person(N2, { mobile: true });
    await ui.joinRoomByCodeUi(me.page, room.roomCode);
    await expect.poll(async () => (await e2e.roomOf(me.account.uuid))?.hostUuid, { timeout: 15000 }).toBe(host.uuid);
    await expect.poll(() => me.page.evaluate(() => JSON.parse(sessionStorage.getItem('mmc.node') ?? 'null')?.node)).toBe(N1);
});

test('MN-026·027 모바일: 판 중 새로고침해도 → 판 Node로 돌아가 판 화면 @game', async ({ bots, onNode }) => {
    const [host] = await mn.botsOn(bots, 1, N1);
    const [guest] = await mn.botsOn(bots, 1, N2);
    const room = await host.createRoom();
    const me = await onNode.person(N2, { mobile: true });
    await guest.joinByCode(room.roomCode);
    await ui.joinRoomByCodeUi(me.page, room.roomCode);
    const live = await e2e.roomOf(host.uuid);
    for (const b of [host, guest]) await b.setReady(room.roomId, live.settingsVersion);
    await ui.readyUi(me.page);
    await host.startGame(room.roomId, live.settingsVersion);
    await expect(me.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    await me.page.evaluate(() => sessionStorage.removeItem('mmc.node'));
    await me.page.reload();
    await expect(me.page).toHaveURL(/\/ingame/, { timeout: 20000 });
});
