// Node 여러 개 — 다른 Node로 가야 하는 신호 (계획 6-4 B·D·E, E 수준): 공지·끊기·정지·점검·금지어·친구·초대·접속 상태·옛 탭·방 목록
// E2E_NODES=2에서만 돎, 신호를 보내는 요청은 일부러 받는 사람과 다른 Node로 (HTTP는 ?node=로 고름)
const crypto = require('node:crypto');
const mn = require('./_mn');
const { query } = require('../../helpers/db');
const { readSecrets } = require('../../helpers/env');
const L = require('../lobby/lobbyHelpers');
const h = require('../room/roomHelpers');

const { test, expect, E2E, internal, NODE_IDS } = mn;
const [N1, N2] = NODE_IDS;

// 관리자 통로를 정한 Node로 (앞단 ?node=)
async function internalOn(node, method, pathname, body) {
    const sep = pathname.includes('?') ? '&' : '?';
    const res = await fetch(`${E2E.apiUrl}${pathname}${sep}node=${encodeURIComponent(node)}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-internal-key': readSecrets().INTERNAL_API_KEY },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
}

test.describe('공지·끊기·정지 (MN-029·032·034)', () => {
    test('MN-029 n1으로 보낸 사람 공지가 → n2 로비 사람에게 바로 뜸', async ({ onNode }) => {
        const me = await onNode.person(N2);
        const title = `mn-공지-${crypto.randomBytes(3).toString('hex')}`;
        const r = await internalOn(N1, 'POST', '/internal/announcements', { announcementId: `mn-${Date.now()}`, title, body: '본문', target: 'users', userUuids: [me.account.uuid] });
        expect(r.status).toBeLessThan(300);
        const dialog = await L.openNotifications(me.page);
        await expect(dialog.getByText(title)).toBeVisible({ timeout: 15000 });
    });

    test('MN-032 강제 끊기 요청이 다른 Node로 와도 → 끊기고 끊은 수가 맞음', async ({ bots }) => {
        const [bot] = await mn.botsOn(bots, 1, N2);
        const r = await internalOn(N1, 'POST', `/internal/users/${bot.uuid}/disconnect`, {});
        expect(r.status).toBe(200);
        expect(JSON.stringify(r.body)).toMatch(/1/);
        await expect.poll(() => bot.socket.connected, { timeout: 10000 }).toBe(false);
    });

    test('MN-034 정지하면 → 다른 Node 판 중인 사람이 ACCOUNT_BANNED로 끊김 @game', async ({ bots }) => {
        const [host] = await mn.botsOn(bots, 1, N1);
        const [guest] = await mn.botsOn(bots, 1, N2);
        const room = await host.createRoom();
        await guest.joinByCode(room.roomCode);
        await guest.setReady(room.roomId, room.settingsVersion);
        await host.setReady(room.roomId, room.settingsVersion);
        await host.startGame(room.roomId, room.settingsVersion);
        await query('INSERT INTO user_bans (user_id, reason, is_permanent, start_at, end_at, created_at) VALUES (?, ?, 0, NOW() - INTERVAL 1 MINUTE, NOW() + INTERVAL 1 HOUR, NOW())', [guest.uuid, 'mn 시험']);
        await internalOn(N2, 'POST', `/internal/users/${guest.uuid}/disconnect`, {});
        await expect.poll(() => guest.events.some((e) => /BANNED/.test(JSON.stringify(e.payload ?? ''))), { timeout: 15000 }).toBe(true);
    });
});

test.describe('점검·금지어 (MN-035·038) @serial', () => {
    test('MN-035 한 Node에만 점검 다시 읽기 → 다른 Node에서도 방 만들기 거절 @serial', async ({ bots }) => {
        const [bot] = await mn.botsOn(bots, 1, N2);
        try {
            await query("UPDATE maintenance_state SET is_enabled = 1, message = '점검', updated_at = NOW() WHERE id = 1");
            // 일부러 n1에만 → 서버 방송(ops.reload)으로 n2도 다시 읽어야 함
            await internalOn(N1, 'POST', '/internal/maintenance/reload', {});
            await expect.poll(async () => String((await bot.request('create_room', {}))?.code ?? ''), { timeout: 10000 }).toMatch(/MAINTENANCE/);
        } finally {
            await query('UPDATE maintenance_state SET is_enabled = 0, message = NULL, updated_at = NOW() WHERE id = 1');
            await internal.reloadMaintenance();
        }
    });

    test('MN-038 n1에만 금지어 다시 읽기 → n2 판 채팅에서도 가려짐 @serial @game', async ({ bots }) => {
        const word = `mn${crypto.randomBytes(3).toString('hex')}`;
        await query('INSERT INTO banned_words (word, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())', [word]);
        try {
            await internalOn(N1, 'POST', '/internal/banned-words/reload', {});
            const [host] = await mn.botsOn(bots, 1, N2);
            const [guest] = await mn.botsOn(bots, 1, N2);
            const room = await host.createRoom();
            await guest.joinByCode(room.roomCode);
            for (const b of [host, guest]) await b.setReady(room.roomId, room.settingsVersion);
            const { gameId } = await host.startGame(room.roomId, room.settingsVersion);
            await expect.poll(async () => (await mn.e2e.game(gameId))?.dayPhase, { timeout: 30000 }).toBe('DAY_DISCUSSION').catch(() => {});
            await host.request('submit_game_chat_message', { gameId, text: `안녕 ${word}` });
            await expect.poll(() => guest.events.some((e) => JSON.stringify(e.payload ?? '').includes('*'.repeat(word.length))), { timeout: 10000 }).toBe(true);
        } finally {
            await query('DELETE FROM banned_words WHERE word = ?', [word]);
            await internal.reloadBannedWords();
        }
    });
});

test.describe('친구·초대·접속 상태 (MN-040·041·042)', () => {
    test('MN-040 n1 사람이 친구 신청하면 → n2 사람 화면에 알림', async ({ onNode }) => {
        const a = await onNode.person(N1);
        const b = await onNode.person(N2);
        await L.api(a, 'POST', '/friends/requests', { receiverId: b.account.uuid });
        await expect(b.page.getByRole('button', { name: /^알림 \(읽지 않음 [1-9]/ })).toBeVisible({ timeout: 15000 });
    });

    test('MN-041 n1 방에서 보낸 게임 초대가 → n2 사람 게임 초대 탭에 뜸', async ({ bots, onNode }) => {
        const [host] = await mn.botsOn(bots, 1, N1);
        const me = await onNode.person(N2);
        await L.botApi(host, 'POST', '/friends/requests', { receiverId: me.account.uuid });
        const incoming = await L.api(me, 'GET', '/friends/requests/incoming');
        await L.api(me, 'PUT', `/friends/requests/${incoming.find((r) => r.id === host.uuid).request_id}/accept`);
        await host.createRoom();
        await L.botApi(host, 'POST', '/friends/invites', { receiverId: me.account.uuid, creationKey: crypto.randomUUID() });
        const panel = await L.openFriendPanel(me.page);
        await expect(panel.getByRole('tab', { name: '게임 초대 1' })).toBeVisible({ timeout: 15000 });
    });

    test('MN-042 친구가 n1에 접속·끊김 → n2 친구 목록에 ONLINE·OFFLINE', async ({ onNode, bots }) => {
        const me = await onNode.person(N2);
        const [friend] = await mn.botsOn(bots, 1, N1);
        await L.botApi(friend, 'POST', '/friends/requests', { receiverId: me.account.uuid });
        const incoming = await L.api(me, 'GET', '/friends/requests/incoming');
        await L.api(me, 'PUT', `/friends/requests/${incoming.find((r) => r.id === friend.uuid).request_id}/accept`);
        const online = async () => (await L.api(me, 'GET', '/friends')).find((f) => (f.id ?? f.uuid) === friend.uuid)?.status;
        await expect.poll(online, { timeout: 15000 }).toMatch(/ONLINE/i);
        await friend.close();
        await expect.poll(online, { timeout: 20000 }).toMatch(/OFFLINE/i);
    });
});

test.describe('옛 탭 밀어내기·방 목록 (MN-063·064·079)', () => {
    test('MN-063 같은 계정 새 탭이 다른 Node로 붙으면 → 옛 탭은 REPLACED로 끊김', async ({ bots }) => {
        const [old] = await mn.botsOn(bots, 1, N1);
        const { E2eBot } = require('../../helpers/bots');
        const fresh = new E2eBot({ account: old.account, index: 99 });
        fresh.cookie = old.cookie;
        fresh.uuid = old.uuid;
        try {
            await fresh.connect();
            await mn.moveBot(fresh, N2);
            await expect.poll(() => old.events.some((e) => /REPLACED/.test(JSON.stringify(e.payload ?? ''))) || !old.socket.connected, { timeout: 10000 }).toBe(true);
            expect(fresh.socket.connected).toBe(true);
        } finally {
            await fresh.close().catch(() => {});
        }
    });

    test('MN-064 다른 기기에서 새로 로그인해 다른 Node로 붙으면 → 옛 기기는 REPLACED_BY_OTHER_LOGIN', async ({ bots }) => {
        const [old] = await mn.botsOn(bots, 1, N1);
        const { E2eBot } = require('../../helpers/bots');
        const other = new E2eBot({ account: old.account, index: 98 });
        try {
            await other.login();
            await other.connect();
            await mn.moveBot(other, N2);
            await expect.poll(() => old.events.some((e) => /REPLACED_BY_OTHER_LOGIN|OTHER_LOGIN/.test(JSON.stringify(e.payload ?? ''))) || !old.socket.connected, { timeout: 10000 }).toBe(true);
        } finally {
            await other.close().catch(() => {});
        }
    });

    test('MN-079 n1 방·n2 방이 → 두 Node 화면 목록에 다 보임', async ({ bots, onNode }) => {
        const [b1] = await mn.botsOn(bots, 1, N1);
        const [b2] = await mn.botsOn(bots, 1, N2);
        await b1.createRoom({ accessType: 'open', maxPlayers: 6 });
        await b2.createRoom({ accessType: 'open', maxPlayers: 6 });
        for (const node of [N1, N2]) {
            const viewer = await onNode.person(node);
            await h.openRoomList(viewer.page);
            expect(await h.findRoomRow(viewer.page, `${b1.nickname}의 방`), `${node} 화면에 n1 방`).not.toBeNull();
            expect(await h.findRoomRow(viewer.page, `${b2.nickname}의 방`), `${node} 화면에 n2 방`).not.toBeNull();
        }
    });
});

test.describe('결제 회귀 (MN-046)', () => {
    test('MN-046 지갑 읽기 HTTP가 → 어느 Node로 가도 같은 값', async ({ onNode }) => {
        const me = await onNode.person(N1);
        const read = async (node) => {
            const res = await me.context.request.get(`${E2E.apiUrl}/economy/accounts/${me.account.uuid}/wallet?node=${node}`, { headers: { origin: E2E.desktopUrl } });
            return res.ok() ? JSON.stringify((await res.json())?.data ?? null) : `status ${res.status()}`;
        };
        expect(await read(N1)).toBe(await read(N2));
    });
});
