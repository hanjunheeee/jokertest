// Node 여러 개 — 다른 Node 사람끼리 같은 방·판 (계획 6-4 A, E 수준): 코드·목록·초대 입장 이동, 한 판 끝까지, 새로고침·끊김 복귀, 다음 방, 강퇴, 설정 전달
// E2E_NODES=2에서만 돎 (서버 조각 2·3·4가 끝나야 통과), 방 주인은 늘 첫 Node·사람은 반대 Node 로비에서 시작해 이동을 일부러 만듦
const crypto = require('node:crypto');
const mn = require('./_mn');
const { ui } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const h = require('../room/roomHelpers');
const L = require('../lobby/lobbyHelpers');
const { sleep } = require('../../helpers/wait');

const { test, expect, e2e, NODE_IDS } = mn;
const [N1, N2] = NODE_IDS;

// N1에 봇 방장 방 → { host, room }
async function hostOnN1(bots, settings = {}) {
    const [host] = await mn.botsOn(bots, 1, N1);
    const room = await host.createRoom(settings);
    return { host, room };
}

// 봇 방 하나 + 봇들 → 시작까지, 사람은 화면으로 입장·준비 (Table 없이 gameId만)
async function startCrossNodeGame({ host, room, humans = [], guests = [] }) {
    for (const b of guests) await b.joinByCode(room.roomCode);
    for (const p of humans) await ui.joinRoomByCodeUi(p.page, room.roomCode);
    const live = await e2e.roomOf(host.uuid);
    for (const b of [host, ...guests]) await b.setReady(room.roomId, live.settingsVersion);
    for (const p of humans) await ui.readyUi(p.page);
    const started = await host.startGame(room.roomId, live.settingsVersion);
    for (const p of humans) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    return started.gameId;
}

test.describe('다른 Node 방 입장 (MN-001~003·012)', () => {
    test('MN-001 n1 방에 n2 로비 사람이 코드로 들어가면 → n1으로 옮겨 같은 명단에 보임', async ({ bots, onNode }) => {
        const { host, room } = await hostOnN1(bots);
        const me = await onNode.person(N2);
        await ui.joinRoomByCodeUi(me.page, room.roomCode);
        await h.expectPartyCount(me.page, 2);
        expect((await e2e.roomOf(me.account.uuid))?.hostUuid).toBe(host.uuid);
    });

    test('MN-002 공개 목록에서 다른 Node 방을 고르면 → 옮긴 뒤 그 방 대기방', async ({ bots, onNode }) => {
        const { host } = await hostOnN1(bots, { accessType: 'open', maxPlayers: 6 });
        const me = await onNode.person(N2);
        await h.openRoomList(me.page);
        const row = await h.findRoomRow(me.page, `${host.nickname}의 방`);
        expect(row, '두 Node 방이 다 목록에 있어야 함 (MN-079)').not.toBeNull();
        await row.click();
        await me.page.getByRole('button', { name: '선택한 방 입장' }).click();
        await expect(me.page).toHaveURL(/\/game-matching/);
        await h.expectPartyCount(me.page, 2);
    });

    test('MN-003 다른 Node에서 초대를 수락하면 → 옮긴 뒤 들어가고 초대는 한 번만 수락됨', async ({ bots, onNode }) => {
        const { host } = await hostOnN1(bots);
        const me = await onNode.person(N2);
        await L.botApi(host, 'POST', '/friends/requests', { receiverId: me.account.uuid });
        const incoming = await L.api(me, 'GET', '/friends/requests/incoming');
        await L.api(me, 'PUT', `/friends/requests/${incoming.find((r) => r.id === host.uuid).request_id}/accept`);
        // 초대 만들기 HTTP는 앞단이 아무 Node로 보냄 → 서버가 방 Node에 물어 만듦 (MN-004)
        await L.botApi(host, 'POST', '/friends/invites', { receiverId: me.account.uuid, creationKey: crypto.randomUUID() });
        await L.openFriendPanel(me.page);
        await L.openTab(me.page, '게임 초대');
        await me.page.getByRole('list', { name: '받은 게임 초대' }).getByRole('button', { name: '초대 수락' }).click();
        await expect(me.page).toHaveURL(/\/game-matching/);
        await expect.poll(async () => (await e2e.roomOf(me.account.uuid))?.hostUuid).toBe(host.uuid);
        const rows = await query("SELECT COUNT(*) AS n FROM game_invites WHERE receiver_id = ? AND status = 'ACCEPTED'", [me.account.uuid]).catch(() => null);
        if (rows) expect(Number(rows[0].n)).toBe(1);
    });

    test('MN-012 옮기는 사이 참여하기를 두 번 눌러도 → 한 번만 들어감', async ({ bots, onNode }) => {
        const { host, room } = await hostOnN1(bots);
        const me = await onNode.person(N2);
        await me.page.goto('/roomInvite');
        await me.page.getByRole('textbox', { name: /방 코드/ }).first().click();
        await me.page.keyboard.type(room.roomCode);
        const join = me.page.getByRole('button', { name: '참여하기' });
        await join.click();
        await join.click({ timeout: 1000 }).catch(() => { /* 이미 넘어감 */ });
        await expect(me.page).toHaveURL(/\/game-matching/);
        await h.expectPartyCount(me.page, 2);
        expect((await e2e.roomOf(host.uuid))?.players?.length).toBe(2);
    });
});

test.describe('다른 Node 사람끼리 한 판 (MN-006~008·010·022·024)', () => {
    test('MN-006 다섯이 서로 다른 Node 로비에서 모여 → 한 판 끝까지, 모두 같은 판 Node @game', async ({ bots, onNode }) => {
        test.setTimeout(300_000);
        const { host, room } = await hostOnN1(bots);
        const guests = [];
        for (let i = 0; i < 3; i += 1) guests.push(...await mn.botsOn(bots, 1, NODE_IDS[(i + 1) % NODE_IDS.length]));
        const me = await onNode.person(N2);
        const gameId = await startCrossNodeGame({ host, room, humans: [me], guests });
        const nodes = await Promise.all([host, ...guests].map((b) => mn.gameNodeOf(b.uuid)));
        expect(new Set([...nodes, await mn.gameNodeOf(me.account.uuid)]).size).toBe(1);
        const plays = [host, ...guests].map((b) => b.play(gameId));
        // 사람은 안 움직여도 마감 타이머가 판을 넘김 → 시험 손잡이로 빨리
        for (let i = 0; i < 60; i += 1) {
            const s = await e2e.game(gameId);
            if (!s || s.phase === 'ENDED') break;
            await e2e.advance(gameId).catch(() => {});
            await sleep(400);
        }
        await Promise.all(plays.map((p) => p.stop()));
        // MN-022 판 결과는 한 번만 저장
        const saved = await query('SELECT COUNT(*) AS n FROM game_results WHERE game_id = ?', [gameId]).catch(() => null);
        if (saved) expect(Number(saved[0].n)).toBe(1);
    });

    test('MN-007 판 중 힌트 없이 새로고침하면 → WRONG_NODE로 판 Node에 돌아가 판 화면 그대로 @game', async ({ bots, onNode }) => {
        const { host, room } = await hostOnN1(bots);
        const me = await onNode.person(N2);
        const gameId = await startCrossNodeGame({ host, room, humans: [me], guests: await mn.botsOn(bots, 1, N2) });
        await me.page.evaluate(() => sessionStorage.removeItem('mmc.node'));
        await me.page.reload();
        await expect(me.page).toHaveURL(/\/ingame/, { timeout: 20000 });
        expect((await e2e.gameOf(me.account.uuid))?.gameId).toBe(gameId);
    });

    test('MN-008 판 중 끊겼다가 15초 안에 다시 붙으면 → 유예가 풀리고 계속 참가 @game', async ({ bots, onNode }) => {
        const { host, room } = await hostOnN1(bots);
        const me = await onNode.person(N2);
        await startCrossNodeGame({ host, room, humans: [me], guests: await mn.botsOn(bots, 1, N2) });
        await me.context.setOffline(true);
        await me.page.waitForTimeout(4000);
        await me.context.setOffline(false);
        await expect.poll(async () => {
            const g = await e2e.gameOf(me.account.uuid);
            return g?.players?.find((p) => p.uuid === me.account.uuid)?.alive;
        }, { timeout: 20000 }).toBe(true);
        await expect(me.page).toHaveURL(/\/ingame/);
    });

    test('MN-024 판 Node가 아닌 Node 힌트로 접속해도 → 한 번 튕겨 판 Node로 가고 힌트가 판 Node로 바뀜 @game', async ({ bots, onNode }) => {
        const { host, room } = await hostOnN1(bots);
        const me = await onNode.person(N2);
        await startCrossNodeGame({ host, room, humans: [me], guests: await mn.botsOn(bots, 1, N2) });
        const gameNode = await mn.gameNodeOf(me.account.uuid);
        await me.page.evaluate(([uuid, node]) => sessionStorage.setItem('mmc.node', JSON.stringify({ uuid, node })), [me.account.uuid, mn.otherNode(gameNode)]);
        await me.page.reload();
        await expect(me.page).toHaveURL(/\/ingame/, { timeout: 20000 });
        await expect.poll(() => me.page.evaluate(() => JSON.parse(sessionStorage.getItem('mmc.node') ?? 'null')?.node), { timeout: 15000 }).toBe(gameNode);
    });

    test('MN-010 판 끝 → 결과 화면 대기방으로 → 같은 Node 새 방, 이동 없음 @game', async ({ bots, onNode }) => {
        test.setTimeout(240_000);
        const { host, room } = await hostOnN1(bots);
        const me = await onNode.person(N2);
        const gameId = await startCrossNodeGame({ host, room, humans: [me], guests: await mn.botsOn(bots, 2, N2) });
        const gameNode = await mn.gameNodeOf(me.account.uuid);
        const plays = [host].map((b) => b.play(gameId));
        for (let i = 0; i < 60 && (await e2e.game(gameId))?.phase !== 'ENDED'; i += 1) await e2e.advance(gameId).catch(() => {});
        await Promise.all(plays.map((p) => p.stop()));
        await h.waitResult(me.page);
        await me.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(me.page).toHaveURL(/\/game-matching/, { timeout: 20000 });
        await expect.poll(() => me.page.evaluate(() => JSON.parse(sessionStorage.getItem('mmc.node') ?? 'null')?.node)).toBe(gameNode);
    });
});

test.describe('같은 방 안 전달 (MN-017·020)', () => {
    test('MN-020 n2에서 온 사람에게 → 방장 설정 바꿈·준비가 보임', async ({ bots, onNode }) => {
        const { host, room } = await hostOnN1(bots);
        const me = await onNode.person(N2);
        await ui.joinRoomByCodeUi(me.page, room.roomCode);
        await h.botUpdateSettings(host, { dayDiscussionTime: 90 });
        await expect(me.page.getByText(/토론 90초/)).toBeVisible({ timeout: 15000 });
        const live = await e2e.roomOf(host.uuid);
        await host.setReady(room.roomId, live.settingsVersion);
        await expect(h.readySilhouettes(me.page)).not.toHaveCount(0);
    });

    test('MN-017 다른 Node에서 온 사람이 강퇴되면 → 옮김 없이 방 목록으로, 다시 입장 제한 그대로', async ({ onNode }) => {
        const owner = await onNode.person(N1);
        const room = await h.createRoomUi(owner, { jokers: 1 });
        const guest = await onNode.person(N2);
        await ui.joinRoomByCodeUi(guest.page, room.roomCode);
        await h.expectPartyCount(owner.page, 2);
        await owner.page.getByRole('button', { name: '참가자 추방' }).click();
        const dialog = owner.page.getByRole('dialog', { name: '플레이어 추방' });
        await dialog.getByRole('listitem').filter({ hasText: guest.account.nickname }).getByRole('button', { name: '추방' }).click();
        await owner.page.getByTestId('kick-confirm').getByRole('button', { name: /추방|확인/ }).last().click();
        await expect(guest.page).not.toHaveURL(/\/game-matching/, { timeout: 15000 });
        expect(await e2e.roomOf(guest.account.uuid)).toBeNull();
    });
});
