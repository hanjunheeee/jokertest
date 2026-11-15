'use strict';

// 로그인 없이 막히는 길 시험 — 쿠키 없이 부르면 401이고 DB에 쓰기가 하나도 안 감
// 목록 A15-B-101~130 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/flow/a15-login-required.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 모델이 진짜 DB에 안 붙게
// 시험 전용 서명 값 (시험 환경값에 없을 때만, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-login-required-test-only-signing-text';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../models');
const { swap } = require('../audit-2026-11-09/authFakes');
const { startRouterServer, send, json } = require('../audit-2026-11-09/securityHttp');

// 라우터는 부를 때마다 새로 (요청 수 세는 장부가 시험끼리 안 섞이게)
const freshRouter = (relative) => {
    const resolved = require.resolve(relative);
    delete require.cache[resolved];
    return require(resolved);
};

// 가짜 DB 입구: 들어온 SQL을 모으고 늘 실패 (쓰기가 오면 장부에 남음)
const trapDb = (t) => {
    const statements = [];
    let transactions = 0;
    swap(t, db.sequelize, 'query', async (sql) => {
        statements.push(String(sql?.query ?? sql));
        throw new Error('시험: DB 막음');
    });
    swap(t, db.sequelize, 'transaction', async () => {
        transactions += 1;
        throw new Error('시험: DB 막음');
    });
    return {
        writes: () => statements.filter((s) => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s)),
        transactions: () => transactions,
    };
};

// 실제 앞단 + 이 영역 라우터 전부
const startServer = (t) => startRouterServer(t, [
    ['/auth', freshRouter('../../routes/auth.routes')],
    ['/user', freshRouter('../../routes/user.routes')],
    ['/friends', freshRouter('../../routes/friend.routes')],
    ['/economy', freshRouter('../../routes/economy.routes')],
    ['/notifications', freshRouter('../../routes/notification.routes')],
    ['/reports', freshRouter('../../routes/report.routes')],
    ['/inquiries', freshRouter('../../routes/inquiry.routes')],
]);

// 쿠키 없이 쓰는 길: 번호 | 방법 | 경로 | 보낼 본문 (값 하나 = 케이스 하나)
const WRITE_ROUTES = [
    // 계정 쓰기 (A15-B-101~107)
    ['A15-B-101', 'PATCH', '/user/me/nickname', { nickname: '새이름' }],
    ['A15-B-102', 'PATCH', '/user/me/password', { currentPassword: 'old-pass-1', newPassword: 'new-pass-12' }],
    ['A15-B-103', 'POST', '/user/me/terms/agree', { agreedTermsVersionIds: [1] }],
    ['A15-B-104', 'POST', '/user/me/withdraw', { password: 'any-pass-1' }],
    ['A15-B-105', 'POST', '/user/me/email/code', { email: 'next@example.test' }],
    ['A15-B-106', 'POST', '/user/me/email/verify', { code: '123456' }],
    ['A15-B-107', 'PUT', '/user/me/emoji-palette', { slots: [] }],
    // 친구·초대 쓰기 (A15-B-108~115)
    ['A15-B-108', 'POST', '/friends/requests', { targetUuid: 'someone' }],
    ['A15-B-109', 'PUT', '/friends/requests/1/accept', {}],
    ['A15-B-110', 'PUT', '/friends/requests/1/decline', {}],
    ['A15-B-111', 'PUT', '/friends/favorites/friend-1', { favorite: true }],
    ['A15-B-112', 'POST', '/friends/blocks', { targetId: 'someone' }],
    ['A15-B-113', 'DELETE', '/friends/blocks/someone', undefined],
    ['A15-B-114', 'POST', '/friends/invites', { targetUuid: 'someone' }],
    ['A15-B-115', 'POST', '/friends/invites/invite-1/decline', {}],
    // 재화 쓰기 (A15-B-116~124)
    ['A15-B-116', 'POST', '/economy/purchase', { itemId: 'x', referenceEventId: 'ref-1' }],
    ['A15-B-117', 'POST', '/economy/purchases/bulk', { items: ['x'], referenceEventId: 'ref-2' }],
    ['A15-B-118', 'POST', '/economy/gold-purchases', { productId: 'p', referenceEventId: 'ref-3' }],
    ['A15-B-119', 'POST', '/economy/equip', { itemId: 'x' }],
    ['A15-B-120', 'POST', '/economy/equip-profile', { itemId: 'x' }],
    ['A15-B-121', 'POST', '/economy/admin/grant', { userId: 'x', currency: 'DIAMOND', amount: 999 }],
    ['A15-B-122', 'POST', '/economy/coupons/redeem', { code: 'TRY-CODE' }],
    ['A15-B-123', 'POST', '/economy/topup/orders', { productId: 'p' }],
    ['A15-B-124', 'POST', '/economy/topup/orders/order-1/confirm', { paymentKey: 'k', amount: 1000 }],
    // 알림 쓰기 (A15-B-125~126)
    ['A15-B-125', 'DELETE', '/notifications/read', undefined],
    ['A15-B-126', 'PATCH', '/notifications/1/read', {}],
    // 신고·문의 (A15-B-127~128)
    ['A15-B-127', 'POST', '/reports', { targetUuid: 'someone', reason: 'ABUSE', memo: '시험' }],
    ['A15-B-128', 'POST', '/inquiries', { title: '시험 제목', body: '시험 본문' }],
];

for (const [id, method, path, body] of WRITE_ROUTES) {
    test(`${id} 쿠키 없이 ${method} ${path} → 401, DB 쓰기 0번`, async (t) => {
        const trap = trapDb(t);
        const base = await startServer(t);
        const res = await json(await send(base, method, path, { body }));
        assert.equal(res.status, 401);
        assert.deepEqual(trap.writes(), [], 'DB에 쓰기가 감');
        assert.equal(trap.transactions(), 0, 'DB 묶음(트랜잭션)이 열림');
    });
}

// 내 정보 읽기 (A15-B-129~130): 401 + 본문에 이메일·닉네임 칸 없음
const READ_ROUTES = [
    ['A15-B-129', '/auth/me'],
    ['A15-B-130', '/user/me/account'],
];

for (const [id, path] of READ_ROUTES) {
    test(`${id} 쿠키 없이 GET ${path} → 401, 본문에 이메일·닉네임 칸 없음`, async (t) => {
        trapDb(t);
        const base = await startServer(t);
        const res = await json(await send(base, 'GET', path));
        assert.equal(res.status, 401);
        assert.doesNotMatch(res.text, /"email"|"nickname"/i, '본문에 내 정보 칸이 실림');
    });
}
