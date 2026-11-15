'use strict';

// 남의 것에 손대기 거절 시험 (HTTP) — A가 로그인한 채 B의 지갑·구매·주문·알림·친구 신청·초대·문의·판 결과를 보거나 바꾸면 거절, B 것은 그대로
// 목록 A15-B-149~162 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 실제 앞단 + 라우터, 저장소는 가짜, 돌리기: node --env-file=.env.test --test tests/flow/a15-ownership-http.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// 시험 전용 서명 값 (시험 환경값에 없을 때만, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-ownership-http-test-only-not-a-real-secret';

const db = require('../../repositories/common/db');
const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const economyService = require('../../services/economy');
const purchaseRequestRepository = require('../../repositories/economy/purchaseRequest');
const notificationDeps = require('../../services/notification/deps');
const inviteDeps = require('../../services/friend/gameInvite/deps');
const friendRequestRepository = require('../../repositories/friend/request');
const friendshipRepository = require('../../repositories/friend/friendship');
const gameResultRepository = require('../../repositories/game/result');
const { createFakeTopupDb } = require('../helpers/fakeTopupDb');
const { swap } = require('../audit-2026-11-09/authFakes');
const { startRouterServer, send, json } = require('../audit-2026-11-09/securityHttp');

const A = 'a15-own-attacker';
const B = 'a15-own-victim';
const C = 'a15-own-third';

// 로그인 때 주는 것과 같은 모양 토큰, 세션은 늘 살아 있다고 봄
const cookieFor = (uuid) => `accessToken=${jwt.sign({ uuid, role: 'USER', sessionId: `s-${uuid}` }, process.env.JWT_SECRET, { algorithm: 'HS256' })}`;
const loginAlive = (t) => swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));

// 라우터 새로 불러 띄우기 (요청 수 세기 새로)
const freshRouter = (relative) => {
    const resolved = require.resolve(relative);
    delete require.cache[resolved];
    return require(resolved);
};
const serve = async (t, path, relative) => {
    loginAlive(t);
    return startRouterServer(t, [[path, freshRouter(relative)]]);
};

// 객체 칸 하나 바꿔 끼우고 끝나면 원래대로 (없던 칸은 지움)
const swapProp = (t, target, key, value) => {
    const had = Object.prototype.hasOwnProperty.call(target, key);
    const original = target[key];
    target[key] = value;
    t.after(() => { if (had) target[key] = original; else delete target[key]; });
};

// 트랜잭션은 그냥 함수 부르기 (진짜 DB 안 감)
const fakeTransaction = (t) => swapProp(t, db.sequelize, 'transaction', async (work) => work({ LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } }));

// 가짜 표: 같음 비교 칸만 봄, Op 같은 조건 칸이 있으면 안 맞음으로 봄 (만료 정리 같은 쓰기가 엉뚱한 줄 안 바꾸게)
const isSimple = (where) => Object.values(where).every((v) => v === null || typeof v !== 'object' || v instanceof Date);
const matches = (row, where) => isSimple(where) && Object.entries(where).every(([k, v]) => row[k] === v);
const fakeTable = (rows) => {
    for (const row of rows) {
        row.update = async (patch) => { Object.assign(row, patch); return row; };
        row.reload = async () => row;
    }
    return {
        rows,
        findOne: async ({ where = {} } = {}) => rows.find((row) => matches(row, where)) ?? null,
        findAll: async ({ where = {} } = {}) => rows.filter((row) => matches(row, where)),
        update: async (patch, { where = {} } = {}) => {
            const hit = rows.filter((row) => matches(row, where));
            for (const row of hit) Object.assign(row, patch);
            return [hit.length];
        },
    };
};
// 줄 값만 (함수 칸 뺌) — 그대로인지 비교용
const plain = (row) => Object.fromEntries(Object.entries(row).filter(([, v]) => typeof v !== 'function'));

// ── 남의 지갑·소유품·거래 (149~151) ──

const B_WALLET = { balanceGold: 7_777, balanceDiamond: 3_333, entitlements: [{ item_id: 'b-secret-skin' }], loadout: { photo: 'b-photo' } };
const B_TX = [{ id: 'b-tx-1', amount: 3_333, memo: 'b-ledger-line' }];
const ECONOMY_READS = [
    ['A15-B-149', 'wallet'],
    ['A15-B-150', 'entitlements'],
    ['A15-B-151', 'transactions'],
];
for (const [id, kind] of ECONOMY_READS) {
    test(`${id} A 쿠키로 B의 /${kind} → 403 ECONOMY_FORBIDDEN, 본문에 B 값 없음`, async (t) => {
        // 막히지 않으면 B 값이 나오게 서비스는 늘 B 것을 돌려줌
        swap(t, economyService, 'getWalletSummary', async () => B_WALLET);
        swap(t, economyService, 'listTransactions', async () => B_TX);
        const base = await serve(t, '/economy', '../../routes/economy.routes');
        const res = await json(await send(base, 'GET', `/economy/accounts/${B}/${kind}`, { cookie: cookieFor(A) }));
        assert.equal(res.status, 403);
        assert.equal(res.body.code, 'ECONOMY_FORBIDDEN');
        assert.doesNotMatch(res.text, /7777|3333|b-secret-skin|b-photo|b-tx-1|b-ledger-line/, '본문에 B 값이 실림');
    });
}

// ── 남의 구매 결과 (152) ──

test('A15-B-152 A가 B 구매의 참조 id로 GET /economy/purchases/:id → 404, B 구매 내용 없음', async (t) => {
    // 구매 요청 표: B 줄 하나 (진짜 조회처럼 사람·참조 id 둘 다 맞아야 찾음)
    const rows = [{ user_id: B, reference_event_id: 'a15-b-purchase-ref', kind: 'ITEM', created_at: new Date('2026-11-16T00:00:00Z'),
        result_json: [{ item_id: 'b-bought-hat', currency: 'GOLD', amount: -500, balance_after: 4_321 }] }];
    swap(t, purchaseRequestRepository, 'findRequestByReference', async (models, { userId, referenceEventId }) => (
        rows.find((r) => r.user_id === userId && r.reference_event_id === referenceEventId) ?? null));
    const base = await serve(t, '/economy', '../../routes/economy.routes');
    // 같은 참조 id로 B가 부르면 나옴 (가짜 표가 제대로 있는지 확인)
    const own = await json(await send(base, 'GET', '/economy/purchases/a15-b-purchase-ref', { cookie: cookieFor(B) }));
    assert.equal(own.status, 200);
    const res = await json(await send(base, 'GET', '/economy/purchases/a15-b-purchase-ref', { cookie: cookieFor(A) }));
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, /b-bought-hat|4321/, '본문에 B 구매 내용이 실림');
});

// ── 남의 충전 주문 (153~154) ──

// B 주문 하나 든 가짜 주문 표를 진짜 저장소 자리에 끼움
const withBOrder = async (t) => {
    const fake = createFakeTopupDb();
    const order = await fake.EconomyTopupOrder.create({
        order_id: 'a15order_b_0001', user_id: B, product_id: 'diamond-100', pay_amount: 1_100, grant_amount: 100,
        bonus_amount: 0, order_name: '다이아 100', version: 1, status: 'CREATED',
    });
    swapProp(t, db, 'EconomyTopupOrder', fake.EconomyTopupOrder);
    fakeTransaction(t);
    return order;
};
const NOT_OWNER_MESSAGE = '다른 계정의 주문에는 접근할 수 없습니다.';

test('A15-B-153 A가 B 주문 id로 GET /economy/topup/orders/:orderId → 403 NOT_OWNER, B 주문 그대로', async (t) => {
    const order = await withBOrder(t);
    const before = plain(order);
    const base = await serve(t, '/economy', '../../routes/economy.routes');
    const res = await json(await send(base, 'GET', `/economy/topup/orders/${order.order_id}`, { cookie: cookieFor(A) }));
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'NOT_OWNER');
    assert.equal(res.body.message, NOT_OWNER_MESSAGE);
    assert.doesNotMatch(res.text, /다이아 100|1100/, '본문에 B 주문 내용이 실림');
    assert.deepEqual(plain(order), before);
});

test('A15-B-154 A가 B 주문 id로 POST …/confirm → 403 NOT_OWNER, B 주문 상태·결제 키 그대로', async (t) => {
    const order = await withBOrder(t);
    const before = plain(order);
    const base = await serve(t, '/economy', '../../routes/economy.routes');
    const res = await json(await send(base, 'POST', `/economy/topup/orders/${order.order_id}/confirm`, {
        cookie: cookieFor(A), body: { paymentKey: 'a15_attacker_paykey', amount: 1_100 },
    }));
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'NOT_OWNER');
    assert.equal(res.body.message, NOT_OWNER_MESSAGE);
    assert.equal(order.status, 'CREATED');
    assert.equal(order.payment_key, null);
    assert.deepEqual(plain(order), before);
});

// ── 남의 알림 읽음 (155) ──

test('A15-B-155 A가 B 알림 id로 PATCH /notifications/:id/read → 404, 없는 알림 id와 같은 본문, B 읽음 시각 그대로', async (t) => {
    const bNote = { id: '11111111-2222-4333-8444-555555555555', user_id: B, type: 'system', source_key: 'a15-note',
        title: 'B에게 온 알림', body: 'b-private-note', target: null, created_at: new Date('2026-11-16T00:00:00Z'), read_at: null };
    const fakeDb = { sequelize: { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } }) }, Notification: fakeTable([bNote]) };
    notificationDeps.__internal.__setDepsForTests({ db: fakeDb, emitToUser: () => {} });
    t.after(() => notificationDeps.__internal.__setDepsForTests(null));
    const base = await serve(t, '/notifications', '../../routes/notification.routes');
    const res = await json(await send(base, 'PATCH', `/notifications/${bNote.id}/read`, { cookie: cookieFor(A) }));
    const missing = await json(await send(base, 'PATCH', '/notifications/99999999-2222-4333-8444-555555555555/read', { cookie: cookieFor(A) }));
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, missing.body);
    assert.doesNotMatch(res.text, /b-private-note|B에게 온 알림/);
    assert.equal(bNote.read_at, null, 'B 알림이 읽음으로 바뀜');
});

// ── 남끼리의 친구 신청 (156~157) ──

// B→C 대기 신청 하나 + 계정 셋
const withPendingRequest = (t) => {
    const request = { id: 9_156, requester_id: B, receiver_id: C, status: 'PENDING', responded_at: null };
    fakeTransaction(t);
    swap(t, friendRequestRepository, 'findRequestById', async (id) => (id === request.id ? request : null));
    swap(t, friendRequestRepository, 'updateFriendRequestStatus', async (id, status) => {
        if (id === request.id) Object.assign(request, { status, responded_at: new Date() });
        return [1];
    });
    swap(t, friendshipRepository, 'lockAccountsInOrder', async (uuids) => [...new Set(uuids)].sort().map((uuid) => ({ uuid, status: 'ACTIVE' })));
    swap(t, friendshipRepository, 'findExistingFriendship', async () => null);
    swap(t, friendshipRepository, 'createFriendship', async () => ({}));
    return request;
};
for (const [id, action] of [['A15-B-156', 'accept'], ['A15-B-157', 'decline']]) {
    test(`${id} B→C 신청을 A가 PUT /friends/requests/:id/${action} → 404, 신청 대기 그대로`, async (t) => {
        const request = withPendingRequest(t);
        const base = await serve(t, '/friends', '../../routes/friend.routes');
        const res = await send(base, 'PUT', `/friends/requests/${request.id}/${action}`, { cookie: cookieFor(A), body: {} });
        assert.equal(res.status, 404);
        assert.equal(request.status, 'PENDING');
        assert.equal(request.responded_at, null);
    });
}

// ── 남이 받은 초대 (158~159) ──

// C가 B에게 보낸 대기 초대 하나 + 계정 표
const withInviteToB = (t) => {
    const invite = {
        id: 'a15-invite-to-b', sender_id: C, receiver_id: B, status: 'PENDING', revision: 1, creation_seq: 7,
        created_at: new Date('2026-11-16T00:00:00Z'), expires_at: new Date('2099-01-01T00:00:00Z'),
        decided_at: null, end_reason: null, entry_outcome: null, InviteSender: { uuid: C, nickname: '보낸이' },
    };
    const fakeDb = {
        sequelize: { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } }) },
        GameInvite: fakeTable([invite]),
        User: fakeTable([{ uuid: A, nickname: '가', status: 'ACTIVE' }, { uuid: B, nickname: '나', status: 'ACTIVE' }, { uuid: C, nickname: '보낸이', status: 'ACTIVE' }]),
    };
    inviteDeps.__internal.__setDepsForTests({ db: fakeDb, emitToUser: () => {} });
    t.after(() => inviteDeps.__internal.__setDepsForTests(null));
    return invite;
};
const INVITE_CALLS = [
    ['A15-B-158', 'GET', (id) => `/friends/invites/${id}`],
    ['A15-B-159', 'POST', (id) => `/friends/invites/${id}/decline`],
];
for (const [id, method, pathOf] of INVITE_CALLS) {
    test(`${id} B가 받은 초대 id로 A가 ${method} ${pathOf(':inviteId')} → 없는 초대와 같은 답, 초대 상태 그대로`, async (t) => {
        const invite = withInviteToB(t);
        const before = plain(invite);
        const base = await serve(t, '/friends', '../../routes/friend.routes');
        const body = method === 'POST' ? {} : undefined;
        const res = await json(await send(base, method, pathOf(invite.id), { cookie: cookieFor(A), body }));
        const missing = await json(await send(base, method, pathOf('a15-no-such-invite'), { cookie: cookieFor(A), body }));
        assert.equal(res.status, missing.status);
        assert.deepEqual(res.body, missing.body);
        assert.notEqual(res.status, 200, '남의 초대가 열림');
        assert.doesNotMatch(res.text, /보낸이|a15-invite-to-b/);
        assert.deepEqual(plain(invite), before, '초대 상태가 바뀜');
    });
}

// ── 남의 문의 (160) ──

test('A15-B-160 A가 B 문의 id로 GET /inquiries/:id → 404 INQUIRY_NOT_FOUND "문의를 찾을 수 없어요.", 제목·본문 없음', async (t) => {
    const bInquiry = { id: '4160', user_id: B, category: 'ACCOUNT', title: 'b-inquiry-title', body: 'b-inquiry-body',
        status: 'OPEN', created_at: new Date('2026-11-16T00:00:00Z'), answered_at: null };
    swapProp(t, db, 'Inquiry', fakeTable([bInquiry]));
    swapProp(t, db, 'InquiryReply', fakeTable([]));
    const base = await serve(t, '/inquiries', '../../routes/inquiry.routes');
    // B가 부르면 보임 (가짜 표 확인)
    assert.equal((await send(base, 'GET', '/inquiries/4160', { cookie: cookieFor(B) })).status, 200);
    const res = await json(await send(base, 'GET', '/inquiries/4160', { cookie: cookieFor(A) }));
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'INQUIRY_NOT_FOUND');
    assert.equal(res.body.message, '문의를 찾을 수 없어요.');
    assert.doesNotMatch(res.text, /b-inquiry-title|b-inquiry-body/);
});

// ── 판 결과는 참가자만 (161~162) ──

// 끝난 6명 판 기록 (광대 1·의사 1·시민 4)
const ROLES6 = ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'];
const ENDED_GAME = {
    id: 'a15-ended-game-6', room_id: 'a15-room', winner: 'CITIZEN', win_reason: 'ALL_JOKERS_ELIMINATED',
    started_at: '2026-11-16T00:00:00Z', ended_at: '2026-11-16T00:20:00Z', day_index: 2, player_count: 6, settings: {}, completed: true,
    players: ROLES6.map((role, i) => ({
        user_id: `a15-game-p${i + 1}`, nickname_snapshot: `참가${i + 1}`, role, team: role === 'JOKER' ? 'JOKER' : 'CITIZEN',
        won: role !== 'JOKER', is_alive: i !== 0, death_reason: i === 0 ? 'EXECUTION' : null,
    })),
};
const withEndedGame = (t) => swap(t, gameResultRepository, 'findGameResultById', async (id) => (id === ENDED_GAME.id ? ENDED_GAME : null));

test('A15-B-161 끝난 6명 판 id로 판에 없던 A → 404, 본문이 없는 판 id와 같음', async (t) => {
    withEndedGame(t);
    const base = await serve(t, '/game', '../../routes/game.routes');
    const res = await json(await send(base, 'GET', `/game/${ENDED_GAME.id}`, { cookie: cookieFor(A) }));
    const missing = await json(await send(base, 'GET', '/game/a15-no-such-game', { cookie: cookieFor(A) }));
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, missing.body);
    assert.doesNotMatch(res.text, /JOKER|참가1/);
});

test('A15-B-162 끝난 6명 판 id로 참가자 → 200', async (t) => {
    withEndedGame(t);
    const base = await serve(t, '/game', '../../routes/game.routes');
    const res = await json(await send(base, 'GET', `/game/${ENDED_GAME.id}`, { cookie: cookieFor('a15-game-p3') }));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.players.length, 6);
});
