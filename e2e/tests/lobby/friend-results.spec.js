// 친구 빈칸 채우기 시험: 내 신청이 거절되면 검색 줄이 바로 빠짐(friend_request_declined), 전부 수락 응답이 끊기면 결과를 다시 물음(/friends/requests/results), 초대 하나 보기(/friends/invites/:id)
// 빈칸찾기 하 13·하 2·중 2 — 두 사람은 players.add로 각자 브라우저, 준비는 API
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const L = require('./lobbyHelpers');

// 친구 추가 탭에서 닉네임 검색 → 패널
async function searchUser(page, nickname) {
    const panel = await L.openFriendPanel(page);
    await L.openTab(page, '친구 추가');
    const box = panel.getByRole('searchbox', { name: '친구 검색' });
    await box.fill(nickname);
    await box.press('Enter');
    return panel;
}

// 받은 신청 id (받은 사람 쿠키로 목록 읽기)
async function incomingRequestId(receiver, sender) {
    const incoming = await L.api(receiver, 'GET', '/friends/requests/incoming');
    return incoming.find((r) => r.id === sender.account.uuid).request_id;
}

test.describe('내 신청이 거절되면', () => {
    test('상대가 거절하면 → 새로 검색하지 않아도 내 검색 결과에서 그 사람 줄이 빠짐', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        const panel = await searchUser(me.page, other.account.nickname);
        await panel.getByRole('button', { name: `${other.account.nickname}에게 친구 신청` }).click();
        await expect(panel.getByRole('button', { name: '신청 완료' })).toBeVisible();
        const requestId = await incomingRequestId(other, me);
        await L.api(other, 'PUT', `/friends/requests/${requestId}/decline`);
        await expect(L.friendRow(panel, other.account.nickname)).toHaveCount(0, { timeout: 10000 });
        await expect(panel.getByRole('button', { name: '신청 완료' })).toHaveCount(0);
    });

    test('상대가 화면에서 거절을 눌러도 → 내 화면 검색 줄이 바로 빠지고 친구 목록에는 안 생김', async ({ players }) => {
        const me = await players.add();
        const other = await players.add();
        const panel = await searchUser(me.page, other.account.nickname);
        await panel.getByRole('button', { name: `${other.account.nickname}에게 친구 신청` }).click();
        await expect(panel.getByRole('button', { name: '신청 완료' })).toBeVisible();
        const otherPanel = await L.openFriendPanel(other.page);
        await L.openTab(other.page, '요청 수락');
        await otherPanel.getByRole('button', { name: `${me.account.nickname} 거절` }).click();
        await expect(L.friendRow(panel, other.account.nickname)).toHaveCount(0, { timeout: 10000 });
        expect(JSON.stringify(await L.api(me, 'GET', '/friends'))).not.toContain(other.account.uuid);
    });
});

test.describe('전부 수락 결과 다시 묻기', () => {
    // 수락 요청 하나만 서버엔 보내고(처리됨) 브라우저엔 끊긴 것처럼 → 화면이 결과를 다시 물어야 함
    async function cutAcceptResponse(page, requestId, { reachServer }) {
        await page.route(`**/friends/requests/${requestId}/accept`, async (route) => {
            if (route.request().method() !== 'PUT') return route.continue();
            if (reachServer) await route.fetch();
            return route.abort('failed');
        });
    }

    test('응답이 끊긴 수락도 서버엔 됐으면 → 결과를 다시 물어 "2건 수락"으로 셈', async ({ players }) => {
        const me = await players.add();
        const a = await players.add();
        const b = await players.add();
        await L.sendRequest(a, me);
        const cutId = await L.sendRequest(b, me);
        await cutAcceptResponse(me.page, cutId, { reachServer: true });
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '요청 수락');
        await expect(panel.getByRole('button', { name: `${b.account.nickname} 수락` })).toBeVisible();
        const asked = me.page.waitForRequest((req) => req.url().includes('/friends/requests/results') && req.url().includes(String(cutId)));
        await panel.getByRole('button', { name: '전부 수락' }).click();
        await asked;
        await expect(panel.locator('[data-accept-all-status="true"]')).toContainText('2건 수락');
        await expect(panel.locator('[data-accept-all-status="true"]')).not.toContainText('확정하지 못했습니다');
    });

    test('서버에 닿지도 않은 수락은 → 다시 물어 "1건 수락 · 1건 실패"로 셈 (아직 대기 중이라)', async ({ players }) => {
        const me = await players.add();
        const a = await players.add();
        const b = await players.add();
        await L.sendRequest(a, me);
        const cutId = await L.sendRequest(b, me);
        await cutAcceptResponse(me.page, cutId, { reachServer: false });
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '요청 수락');
        await expect(panel.getByRole('button', { name: `${b.account.nickname} 수락` })).toBeVisible();
        await panel.getByRole('button', { name: '전부 수락' }).click();
        await expect(panel.locator('[data-accept-all-status="true"]')).toContainText('1건 수락 · 1건 실패');
        const results = await L.api(me, 'GET', `/friends/requests/results?ids=${cutId}`);
        expect(results.find((r) => r.request_id === cutId)?.status).toBe('PENDING');
    });
});

test.describe('게임 초대 하나 보기', () => {
    // 봇과 나를 친구로 만들고 봇이 방을 만들어 나를 초대 → { bot, invite }
    async function inviteFromBot(bots, me) {
        const [bot] = await bots.spawn(1);
        await L.botApi(bot, 'POST', '/friends/requests', { receiverId: me.account.uuid });
        const incoming = await L.api(me, 'GET', '/friends/requests/incoming');
        await L.api(me, 'PUT', `/friends/requests/${incoming.find((r) => r.id === bot.uuid).request_id}/accept`);
        await bot.createRoom();
        const invite = await L.botApi(bot, 'POST', '/friends/invites', { receiverId: me.account.uuid, creationKey: crypto.randomUUID() });
        return { bot, invite };
    }

    test('받은 초대 id로 물으면 → 받은 사람·보낸 사람 둘 다 같은 초대(대기 중)가 보임', async ({ players, bots }) => {
        const me = await players.add();
        const { bot, invite } = await inviteFromBot(bots, me);
        const mine = await L.api(me, 'GET', `/friends/invites/${invite.inviteId}`);
        expect(mine.inviteId).toBe(invite.inviteId);
        expect(mine.status).toBe(invite.status);
        const senders = await L.botApi(bot, 'GET', `/friends/invites/${invite.inviteId}`);
        expect(senders.inviteId).toBe(invite.inviteId);
        expect(mine.senderId).toBe(bot.uuid);
        expect(mine.receiverId).toBe(me.account.uuid);
    });

    test('거절한 뒤 다시 물으면 → 끝난 초대 상태로 보임 (거절 응답과 같은 상태)', async ({ players, bots }) => {
        const me = await players.add();
        const { invite } = await inviteFromBot(bots, me);
        const declined = await L.api(me, 'POST', `/friends/invites/${invite.inviteId}/decline`);
        const after = await L.api(me, 'GET', `/friends/invites/${invite.inviteId}`);
        expect(after.status).toBe(declined.status);
        expect(after.status).not.toBe(invite.status);
    });

    test('남의 초대 id·없는 id로 물으면 → 404', async ({ players, bots }) => {
        const me = await players.add();
        const stranger = await players.add();
        const { invite } = await inviteFromBot(bots, me);
        await expect(L.api(stranger, 'GET', `/friends/invites/${invite.inviteId}`)).rejects.toThrow(/→ 404/);
        await expect(L.api(me, 'GET', `/friends/invites/${crypto.randomUUID()}`)).rejects.toThrow(/→ 404/);
    });
});
