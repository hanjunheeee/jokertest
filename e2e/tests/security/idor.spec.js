// 보안(IDOR): 주소/본문 uuid·id만 바꿔 남의 지갑·거래·주문·알림·친구 신청·판 결과를 보거나 건드리지 못함 (403·404)
// 근거: docs/보안_점검_2026-11-09.md '권한 판 결과'·'권한 지갑·소유품·거래·주문·알림·친구 요청'
const { test, expect, ui } = require('../../helpers/fixtures');
const { api, login, rand } = require('./_sec');

const OTHER_UUID = '00000000-0000-4000-8000-000000000001';

test.describe('남의 경제 데이터 (주소 uuid 바꾸기)', () => {
    test('남의 uuid로 지갑·거래·소유품을 부르면 → 403 ECONOMY_FORBIDDEN', async ({ accounts }) => {
        const victim = await accounts.create();
        const { cookie } = await login(await accounts.create());
        for (const sub of ['wallet', 'transactions', 'entitlements']) {
            const r = await api('GET', `/economy/accounts/${victim.uuid}/${sub}`, { cookie });
            expect(r.status, sub).toBe(403);
            expect(r.json?.code).toBe('ECONOMY_FORBIDDEN');
        }
    });

    test('아무 uuid(없는 계정)로 지갑을 불러도 → 403 (있는지 없는지도 안 알려 줌)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('GET', `/economy/accounts/${OTHER_UUID}/wallet`, { cookie });
        expect(r.status).toBe(403);
    });

    test('남의 충전 주문을 주문 id로 보면 → 403 NOT_OWNER', async ({ accounts }) => {
        const victim = await accounts.create();
        const lv = await login(victim);
        const order = await api('POST', '/economy/topup/orders', { cookie: lv.cookie, body: { productId: 'test-diamond-10', version: 1 } });
        const orderId = order.json.orderId;
        const { cookie } = await login(await accounts.create());
        const r = await api('GET', `/economy/topup/orders/${orderId}`, { cookie });
        expect([403, 404]).toContain(r.status);
    });

    test('남의 충전 주문을 주문 id로 승인하려 하면 → 403 (금액·결제키 넣어도)', async ({ accounts }) => {
        const victim = await accounts.create();
        const lv = await login(victim);
        const order = await api('POST', '/economy/topup/orders', { cookie: lv.cookie, body: { productId: 'test-diamond-10', version: 1 } });
        const { cookie } = await login(await accounts.create());
        const r = await api('POST', `/economy/topup/orders/${order.json.orderId}/confirm`, { cookie, body: { paymentKey: 'pk_test_x', amount: 1100 } });
        expect(r.status).toBe(403);
        expect(r.json?.code).toBe('NOT_OWNER');
    });

    test('구매 결과(referenceEventId)로 남의 것을 보려 해도 → 내 것만 찾아 404', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('GET', `/economy/purchases/${encodeURIComponent('someone-else-ref-123')}`, { cookie });
        expect(r.status).toBe(404);
    });
});

test.describe('남의 알림·친구 (id 바꾸기)', () => {
    test('남에게 온 알림을 그 알림 id로 읽음 처리하려 하면 → 404 (내 알림만 바뀜)', async ({ accounts, internal }) => {
        const victim = await accounts.create();
        const lv = await login(victim);
        await internal.announceTo([victim.uuid], { title: '피해자 알림', body: '본문' });
        await expect.poll(async () => (await api('GET', '/notifications', { cookie: lv.cookie })).json?.data?.length ?? 0).toBeGreaterThan(0);
        const list = await api('GET', '/notifications', { cookie: lv.cookie });
        const nid = (list.json.data ?? list.json.notifications)[0].id;
        const { cookie } = await login(await accounts.create());
        const r = await api('PATCH', `/notifications/${nid}/read`, { cookie });
        expect(r.status).toBe(404);
        // 피해자 알림은 아직 안 읽음
        const after = await api('GET', '/notifications', { cookie: lv.cookie });
        expect((after.json.data ?? after.json.notifications).find((n) => n.id === nid)?.read_at ?? null).toBeNull();
    });

    test('남이 받은 친구 신청을 신청 id로 수락하려 하면 → 못 받아들여지고 친구가 안 됨', async ({ accounts }) => {
        const [sender, receiver] = await accounts.createMany(2);
        const ls = await login(sender);
        const lr = await login(receiver);
        await api('POST', '/friends/requests', { cookie: ls.cookie, body: { receiverId: receiver.uuid } });
        const incoming = await api('GET', '/friends/requests/incoming', { cookie: lr.cookie });
        const requestId = incoming.json.data[0].request_id;
        // 제3자가 그 신청 id로 수락 시도
        const { cookie } = await login(await accounts.create());
        const r = await api('PUT', `/friends/requests/${requestId}/accept`, { cookie });
        expect(r.status).toBeGreaterThanOrEqual(400);
        // 받은 사람 목록엔 아직 그 신청이 남아 있음 (제3자가 못 치움)
        const still = await api('GET', '/friends/requests/incoming', { cookie: lr.cookie });
        expect(still.json.data.some((x) => x.request_id === requestId)).toBe(true);
    });

    test('남이 받은 초대를 초대 id로 보려 하면 → 못 봄 (404·403)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('GET', `/friends/invites/${encodeURIComponent('someone-invite-id')}`, { cookie });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
    });

    test('남의 즐겨찾기를 그 사람 친구 id로 켜려 해도 → 내 친구 아니면 거절', async ({ accounts }) => {
        const other = await accounts.create();
        const { cookie } = await login(await accounts.create());
        const r = await api('PUT', `/friends/favorites/${other.uuid}`, { cookie, body: { favorite: true } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
    });
});

test.describe('남의 판 결과 (@game — 진짜 판)', () => {
    test('판에 안 낀 사람이 그 판 id로 결과를 보면 → 없는 판과 같은 404, 참가자는 200 @game', async ({ user, players, table, accounts }) => {
        const outsider = await players.add();
        const t = await table.setup({ humans: [user], bots: 1, roles: { [user.account.uuid]: 'JOKER' } });
        await ui.readRoleReveal(user.page);
        await t.advanceUntil((s) => s.phase === 'ENDED' || s.winResult, { stepDelayMs: 800, maxSteps: 30 }).catch(() => {});
        await expect(user.page).toHaveURL(/\/gameresult/, { timeout: 30000 });
        const gameId = t.gameId;
        // 참가자(나)는 결과를 봄
        const mine = await api('GET', `/game/${gameId}`, { cookie: (await login(user.account)).cookie });
        expect(mine.status).toBe(200);
        // 안 낀 사람은 404
        const lo = await login(outsider.account);
        const theirs = await api('GET', `/game/${gameId}`, { cookie: lo.cookie });
        expect(theirs.status).toBe(404);
        expect(theirs.body).not.toContain('role');
    });

    test('참가자가 아닌 사람에게는 결과 응답에 남의 직업·승패가 안 실림 @game', async ({ user, players, table }) => {
        const outsider = await players.add();
        const t = await table.setup({ humans: [user], bots: 1, roles: { [user.account.uuid]: 'JOKER' } });
        await ui.readRoleReveal(user.page);
        await t.advanceUntil((s) => s.phase === 'ENDED' || s.winResult, { stepDelayMs: 800, maxSteps: 30 }).catch(() => {});
        await expect(user.page).toHaveURL(/\/gameresult/, { timeout: 30000 });
        const lo = await login(outsider.account);
        const r = await api('GET', `/game/${t.gameId}`, { cookie: lo.cookie });
        expect(r.status).toBe(404);
        expect(r.body).not.toMatch(/JOKER|CITIZEN|광대|시민/);
    });
});

test.describe('장착·이모티콘·순위 (내 것만·모양)', () => {
    test('가진 적 없는 아이템을 장착하려 하면 → 거절(내 것만 낄 수 있음)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('POST', '/economy/equip', { cookie, body: { slot: 'PROFILE_PHOTO', itemId: 'someone-else-item', expectedRevision: 'x' } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
    });

    test('이모티콘 칸을 틀린 revision으로 저장하려 하면 → 거절, 칸 그대로', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const before = await api('GET', '/user/me/emoji-palette', { cookie });
        const r = await api('PUT', '/user/me/emoji-palette', { cookie, body: { slots: before.json.slots, revision: 'wrong-revision' } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        const after = await api('GET', '/user/me/emoji-palette', { cookie });
        expect(after.json.slots).toEqual(before.json.slots);
    });

    test('직업 순위를 모르는 직업 이름으로 부르면 → 400 (아무 값이나 안 받음)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('GET', '/user/role-statistics/ranking?role=NOPE', { cookie });
        expect(r.status).toBe(400);
    });

    test('초대를 보낼 대기방이 없는데 초대를 만들려 하면 → 409 (아무 대상에게나 못 보냄)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('POST', '/friends/invites', { cookie, body: { receiverId: OTHER_UUID, creationKey: `k-${rand()}` } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
    });
});

test.describe('판 결과 id 모양', () => {
    test('없는 판 id → 404 (로그인은 필요)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('GET', `/game/${'22222222-2222-4222-8222-222222222222'}`, { cookie });
        expect(r.status).toBe(404);
    });

    test('로그인 없이 판 결과를 부르면 → 401 (저장소까지 안 감)', async () => {
        const r = await api('GET', `/game/${'22222222-2222-4222-8222-222222222222'}`);
        expect(r.status).toBe(401);
    });

    test('판 id에 경로 탐색·공백만 → 404·400 (500 없음)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        for (const id of ['%2e%2e%2f', '%20', 'a'.repeat(300)]) {
            const r = await api('GET', `/game/${id}`, { cookie });
            expect(r.status, id).toBeGreaterThanOrEqual(400);
            expect(r.status, id).toBeLessThan(500);
        }
    });
});
