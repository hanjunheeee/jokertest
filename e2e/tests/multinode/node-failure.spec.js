// Node 여러 개 — Node 하나 죽음·끄기·하나씩 바꾸기·앞단 (계획 6-4 F·G, E 수준): MN-105·107·108·113·116·120
// Node를 끄므로 @shutdown (serial 프로젝트, 한 번에 하나), finally에서 꼭 다시 켜진 걸 확인
const { execFileSync } = require('node:child_process');
const mn = require('./_mn');
const servers = require('../../helpers/servers');
const { sleep } = require('../../helpers/wait');

const { test, expect, E2E, e2e, NODE_IDS } = mn;
const [N1, N2] = NODE_IDS;

// 봇 방장 방 + 봇 손님 → 판 시작 (모두 host Node) → { host, guests, gameId }
async function gameOn(bots, node, guestNode = node) {
    const [host] = await mn.botsOn(bots, 1, node);
    const guests = await mn.botsOn(bots, 2, guestNode);
    const room = await host.createRoom();
    for (const g of guests) await g.joinByCode(room.roomCode);
    for (const b of [host, ...guests]) await b.setReady(room.roomId, room.settingsVersion);
    const { gameId } = await host.startGame(room.roomId, room.settingsVersion);
    return { host, guests, gameId };
}

test.afterEach(async () => { await servers.waitBackendUp({ timeoutMs: 90000 }); });

test('MN-107 n2를 정리 없이 죽여도 → n1 판은 계속 돎 @shutdown @game', async ({ bots }) => {
    const { gameId } = await gameOn(bots, N1);
    const before = await e2e.game(gameId);
    await mn.stopNode(N2, { kill: true });
    await e2e.advance(gameId);
    await expect.poll(async () => JSON.stringify(await e2e.game(gameId)), { timeout: 10000 }).not.toBe(JSON.stringify(before));
    expect((await mn.nodeHealth(N1))?.ok).toBe(true);
});

test('MN-108 판 Node가 죽은 뒤 그 사람이 다시 붙으면 → 다른 Node 로비, 판 사라짐 @shutdown @game', async ({ bots }) => {
    const { guests } = await gameOn(bots, N2);
    const [g] = guests;
    await mn.stopNode(N2, { kill: true });
    // 화면처럼: 힌트 Node가 죽음 → 앞단 backup(n1)이 받고 loc를 안 믿음 (MN-109)
    await expect.poll(() => g.socket.connected, { timeout: 30000 }).toBe(true);
    await expect.poll(async () => (await e2e.gameOf(g.uuid))?.gameId ?? null, { timeout: 30000 }).toBeNull();
});

test('MN-113 n1에 SIGTERM → n1 사람만 server_shutdown을 받음 @shutdown', async ({ bots }) => {
    const [a] = await mn.botsOn(bots, 1, N1);
    const [b] = await mn.botsOn(bots, 1, N2);
    await mn.stopNode(N1);
    await expect.poll(() => a.events.some((e) => e.event === 'server_shutdown'), { timeout: 15000 }).toBe(true);
    await sleep(1000);
    expect(b.events.some((e) => e.event === 'server_shutdown')).toBe(false);
});

test('MN-116 하나씩 바꾸기: n1 드레인 → 판 0개 → 끔 → 켬 동안 n2 판은 정상 @shutdown @game', async ({ bots }) => {
    test.setTimeout(240_000);
    const { gameId } = await gameOn(bots, N2);
    await mn.drain(N1);
    // 드레인 중 새 방은 n1에 안 생김 (새 로비 접속을 n1이 다른 Node로 보냄)
    const [late] = await bots.spawn(1);
    await late.createRoom();
    expect((await mn.clusterNodes()).find((n) => n.id === N1)?.rooms ?? 0).toBe(0);
    await expect.poll(async () => (await mn.clusterNodes()).find((n) => n.id === N1)?.games ?? -1, { timeout: 60000 }).toBe(0);
    await mn.stopNode(N1);
    await mn.waitNodeUp(N1, 90000);
    expect((await mn.nodeHealth(N1))?.draining).toBe(false);
    await e2e.advance(gameId);
    expect(await e2e.game(gameId)).not.toBeNull();
});

test('MN-120 앞단이 ?node=로 고름: 아는 값은 그 Node, 모르는 값·없음은 아무 Node, 죽은 Node는 다른 Node @shutdown', async () => {
    for (const id of NODE_IDS) expect(await mn.routedServerId(id)).toBe(id);
    expect(NODE_IDS).toContain(await mn.routedServerId('nope'));
    expect(NODE_IDS).toContain(await mn.routedServerId(null));
    await mn.stopNode(N2, { kill: true });
    expect(await mn.routedServerId(N2)).toBe(N1);
});

test('MN-105 Redis가 멈춘 동안 판이 끝까지 가고, 살아난 뒤 다른 Node끼리 새 판 @shutdown @game', async ({ bots }) => {
    test.skip(E2E.redisUrlGiven, '시험 Redis가 docker mmc-redis-test일 때만 (멈추기·풀기를 docker로 함)');
    test.setTimeout(240_000);
    const { gameId } = await gameOn(bots, N1);
    execFileSync('docker', ['pause', 'mmc-redis-test']);
    try {
        for (let i = 0; i < 60 && (await e2e.game(gameId))?.phase !== 'ENDED'; i += 1) {
            await e2e.advance(gameId).catch(() => {});
            await sleep(300);
        }
        expect((await e2e.game(gameId))?.phase ?? 'ENDED').toBe('ENDED');
    } finally {
        execFileSync('docker', ['unpause', 'mmc-redis-test']);
    }
    await expect.poll(async () => (await mn.nodeHealth(N1))?.redis, { timeout: 15000 }).toBe('up');
    const again = await gameOn(bots, N1, N2);
    expect(await mn.gameNodeOf(again.guests[0].uuid)).toBe(N1);
});
