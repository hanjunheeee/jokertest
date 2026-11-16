'use strict';

// 로그인 없으면 막힘 요청 시험(시험 DB 씀) — 친구·알림·신고·문의 길 18개가 쿠키 없이 401, DB 줄은 안 바뀜
// 목록 A13-B-115~129·533~535 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/flow/a13-auth-required.test.js
const W = require('../db/a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');

const { db } = W;
const noDb = W.useTestDb(test);

// 이름이 늘 같게 고정 uuid (아무 사람도 아님)
const SOME_UUID = '0a130000-0000-4000-8000-000000000001';
// 요청 몸 (있어야 하는 길만)
const ROUTES = [
    ['A13-B-115', 'GET', '/friends'],
    ['A13-B-116', 'POST', '/friends/requests', { receiverId: SOME_UUID }],
    ['A13-B-117', 'PUT', '/friends/requests/1/accept'],
    ['A13-B-118', 'PUT', `/friends/favorites/${SOME_UUID}`, { favorite: true }],
    ['A13-B-119', 'POST', '/friends/blocks', { targetId: SOME_UUID }],
    ['A13-B-120', 'DELETE', `/friends/blocks/${SOME_UUID}`],
    ['A13-B-121', 'GET', '/friends/invites'],
    ['A13-B-122', 'POST', '/friends/invites', { receiverId: SOME_UUID, creationKey: 'k-1' }],
    ['A13-B-123', 'POST', `/friends/invites/${SOME_UUID}/decline`],
    ['A13-B-124', 'GET', '/notifications'],
    ['A13-B-125', 'PATCH', `/notifications/${SOME_UUID}/read`],
    ['A13-B-126', 'DELETE', '/notifications/read'],
    ['A13-B-127', 'POST', '/reports', { targetUuid: SOME_UUID, gameId: SOME_UUID, reasonCode: 'ABUSE' }],
    ['A13-B-128', 'POST', '/inquiries', { category: 'BUG', title: '제목', body: '본문' }],
    ['A13-B-129', 'GET', '/inquiries/1'],
    // 친구 신청 취소·친구 끊기 (2026-11-16 새로 만듦)
    ['A13-B-533', 'GET', '/friends/requests/outgoing'],
    ['A13-B-534', 'PUT', '/friends/requests/1/cancel'],
    ['A13-B-535', 'DELETE', `/friends/${SOME_UUID}`],
];

// 이 길들이 건드릴 수 있는 표 줄 수
const TABLES = ['FriendRequest', 'Friendship', 'FriendFavorite', 'FriendBlock', 'GameInvite', 'Notification', 'Report', 'Inquiry'];
const rowCounts = async () => Object.fromEntries(await Promise.all(TABLES.map(async (name) => [name, await db[name].count()])));

for (const [no, method, path, body] of ROUTES) {
    test(`${no} 로그인 쿠키 없이 ${method} ${path} → 401, DB 줄 바뀜 0`, async (t) => {
        if (noDb(t)) return;
        const call = await W.startServer(t);
        const before = await rowCounts();
        const res = await call(method, path, { body });
        assert.equal(res.status, 401);
        assert.deepEqual(await rowCounts(), before);
    });
}
