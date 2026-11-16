'use strict';

// 요청 수 제한 시험(시험 DB 씀) — 친구 신청 10분 20번, 신고 1분 5번, 시간 지나면 다시 됨, 다른 계정은 따로 셈
// 목록 A13-B-130~137·536~537 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/flow/a13-rate-limit.test.js
const W = require('../db/a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, createUser, login } = W;
const noDb = W.useTestDb(test);

const FRIEND_LIMIT_MESSAGE = '친구 신청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
const REPORT_LIMIT_MESSAGE = '신고가 너무 많습니다. 잠시 후 다시 시도해주세요.';
const ROUTE_FILES = ['../../routes/friend.routes', '../../routes/report.routes'].map((p) => require.resolve(p));

// 가짜 시계(Date만)를 켠 뒤 경로를 새로 불러 셈판을 새로 받음 (경로가 불릴 때 시계를 잡기 때문)
async function freshServer(t) {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    for (const file of ROUTE_FILES) delete require.cache[file];
    return W.startServer(t);
}

// 한 계정이 친구 신청을 n번 보냄 → 마지막 답
async function sendRequests(call, cookie, receiverId, n) {
    let last = null;
    for (let i = 0; i < n; i += 1) last = await call('POST', '/friends/requests', { cookie, body: { receiverId } });
    return last;
}
// 한 계정이 신고를 n번 보냄 (같이 한 판 없음 → 답은 404, 셈만 봄) → 마지막 답
async function sendReports(call, cookie, n) {
    let last = null;
    for (let i = 0; i < n; i += 1) {
        last = await call('POST', '/reports', {
            cookie, body: { targetUuid: crypto.randomUUID(), gameId: crypto.randomUUID(), reasonCode: 'ABUSE' },
        });
    }
    return last;
}

// 사람 둘(보내는 사람·받는 사람) + 로그인
async function pair() {
    const me = await createUser('rl');
    const other = await createUser('rlt');
    return { me, other, cookie: await login(me) };
}

test('A13-B-130 한 계정이 10분 안 20번째 친구 신청 → 통과(답은 신청 결과대로, 429 아님)', async (t) => {
    if (noDb(t)) return;
    const call = await freshServer(t);
    const { other, cookie } = await pair();
    const last = await sendRequests(call, cookie, other, 20);
    assert.notEqual(last.status, 429);
});

test('A13-B-131 21번째 친구 신청 → 429 "친구 신청이 너무 많습니다. 잠시 후 다시 시도해주세요."', async (t) => {
    if (noDb(t)) return;
    const call = await freshServer(t);
    const { other, cookie } = await pair();
    const last = await sendRequests(call, cookie, other, 21);
    assert.equal(last.status, 429);
    assert.equal(last.body.message, FRIEND_LIMIT_MESSAGE);
});

test('A13-B-132 첫 친구 신청에서 10분 뒤(가짜 시계) → 다시 됨', async (t) => {
    if (noDb(t)) return;
    const call = await freshServer(t);
    const { other, cookie } = await pair();
    assert.equal((await sendRequests(call, cookie, other, 21)).status, 429);
    t.mock.timers.tick(10 * 60_000);
    const again = await sendRequests(call, cookie, other, 1);
    assert.notEqual(again.status, 429);
});

test('A13-B-133 한 계정이 막힌 뒤 다른 계정 첫 친구 신청 → 됨', async (t) => {
    if (noDb(t)) return;
    const call = await freshServer(t);
    const { other, cookie } = await pair();
    assert.equal((await sendRequests(call, cookie, other, 21)).status, 429);
    const second = await createUser('rl2');
    const first = await sendRequests(call, await login(second), other, 1);
    assert.equal(first.status, 200, JSON.stringify(first.body));
});

test('A13-B-134 한 계정이 1분 안 5번째 신고 → 통과(429 아님)', async (t) => {
    if (noDb(t)) return;
    const call = await freshServer(t);
    const { cookie } = await pair();
    assert.notEqual((await sendReports(call, cookie, 5)).status, 429);
});

test('A13-B-135 6번째 신고 → 429 "신고가 너무 많습니다. 잠시 후 다시 시도해주세요."', async (t) => {
    if (noDb(t)) return;
    const call = await freshServer(t);
    const { cookie } = await pair();
    const last = await sendReports(call, cookie, 6);
    assert.equal(last.status, 429);
    assert.equal(last.body.message, REPORT_LIMIT_MESSAGE);
});

test('A13-B-136 신고 막힌 뒤 60초 지나면 → 됨', async (t) => {
    if (noDb(t)) return;
    const call = await freshServer(t);
    const { cookie } = await pair();
    assert.equal((await sendReports(call, cookie, 6)).status, 429);
    t.mock.timers.tick(60_000);
    assert.notEqual((await sendReports(call, cookie, 1)).status, 429);
});

test('A13-B-137 한 계정 신고가 막힌 뒤 다른 계정 → 됨', async (t) => {
    if (noDb(t)) return;
    const call = await freshServer(t);
    const { cookie } = await pair();
    assert.equal((await sendReports(call, cookie, 6)).status, 429);
    const second = await createUser('rl2');
    assert.notEqual((await sendReports(call, await login(second), 1)).status, 429);
});

// 친구 신청 취소 (2026-11-16 새로 만듦) — 취소로 신청 제한을 못 피함
// 신청 → 취소를 n번 되풀이 → 신청 답 목록
async function sendAndCancel(call, cookie, me, receiverId, n) {
    const answers = [];
    for (let i = 0; i < n; i += 1) {
        const sent = await call('POST', '/friends/requests', { cookie, body: { receiverId } });
        answers.push(sent.status);
        if (sent.status !== 200) continue;
        const row = await db.FriendRequest.findOne({ where: { requester_id: me, receiver_id: receiverId, status: 'PENDING' }, raw: true });
        assert.equal((await call('PUT', `/friends/requests/${row.id}/cancel`, { cookie })).status, 200);
    }
    return answers;
}

test('A13-B-536 신청→취소를 20번 되풀이(전부 200) 한 뒤 21번째 신청 → 429 (취소해도 신청 셈은 안 줄어듦)', async (t) => {
    if (noDb(t)) return;
    const call = await freshServer(t);
    const { me, other, cookie } = await pair();
    const answers = await sendAndCancel(call, cookie, me, other, 20);
    assert.deepEqual([...new Set(answers)], [200]);
    const last = await call('POST', '/friends/requests', { cookie, body: { receiverId: other } });
    assert.equal(last.status, 429);
    assert.equal(last.body.message, FRIEND_LIMIT_MESSAGE);
});

test('A13-B-537 신청이 429로 막힌 동안에도 남아 있는 대기 신청 취소는 됨 → 200', async (t) => {
    if (noDb(t)) return;
    const call = await freshServer(t);
    const { me, other, cookie } = await pair();
    assert.equal((await sendRequests(call, cookie, other, 21)).status, 429);
    const row = await db.FriendRequest.findOne({ where: { requester_id: me, receiver_id: other, status: 'PENDING' }, raw: true });
    const res = await call('PUT', `/friends/requests/${row.id}/cancel`, { cookie });
    assert.equal(res.status, 200, JSON.stringify(res.body));
});
