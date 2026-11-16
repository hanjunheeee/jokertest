'use strict';

// 친구 신청 잘못된 요청 답 시험(시험 DB 씀) — 자기 자신·칸 없음·없는 사람·없는 신청·남의 신청·결과 다시 묻기 id 수·취소 번호 모양
// 목록 A13-B-148~158·531~532 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/flow/a13-friend-request-answers.test.js
const W = require('../db/a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, createUser, login } = W;
const noDb = W.useTestDb(test);

// 서버 + 로그인한 나
async function setup(t) {
    const call = await W.startServer(t);
    const me = await createUser('me');
    return { call, me, cookie: await login(me) };
}
const requestStatus = async (id) => (await db.FriendRequest.findByPk(id, { raw: true })).status;

test('A13-B-148 자기 자신에게 친구 신청 → 400 "자기 자신에게 친구 신청할 수 없습니다."', async (t) => {
    if (noDb(t)) return;
    const { call, me, cookie } = await setup(t);
    const res = await call('POST', '/friends/requests', { cookie, body: { receiverId: me } });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, '자기 자신에게 친구 신청할 수 없습니다.');
});

for (const [no, label, body] of [['A13-B-149', '{}', {}], ['A13-B-150', "{ receiverId: '' }", { receiverId: '' }]]) {
    test(`${no} 받는 사람 칸 없음 ${label} → 400 "receiverId가 필요합니다."`, async (t) => {
        if (noDb(t)) return;
        const { call, cookie } = await setup(t);
        const res = await call('POST', '/friends/requests', { cookie, body });
        assert.equal(res.status, 400);
        assert.equal(res.body.message, 'receiverId가 필요합니다.');
    });
}

test('A13-B-151 없는 사람에게 신청 → 404 "사용자를 찾을 수 없습니다."', async (t) => {
    if (noDb(t)) return;
    const { call, cookie } = await setup(t);
    const res = await call('POST', '/friends/requests', { cookie, body: { receiverId: crypto.randomUUID() } });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '사용자를 찾을 수 없습니다.');
});

for (const [no, action] of [['A13-B-152', 'accept'], ['A13-B-153', 'decline']]) {
    test(`${no} 없는 신청 번호로 ${action === 'accept' ? '받기' : '거절'} → 404 "친구 요청을 찾을 수 없습니다."`, async (t) => {
        if (noDb(t)) return;
        const { call, cookie } = await setup(t);
        const res = await call('PUT', `/friends/requests/987654321/${action}`, { cookie });
        assert.equal(res.status, 404);
        assert.equal(res.body.message, '친구 요청을 찾을 수 없습니다.');
    });
}

// 민수 → 지유 대기 신청 하나
async function pendingRequest() {
    const sender = await createUser('snd');
    const receiver = await createUser('rcv');
    const row = await db.FriendRequest.create({ requester_id: sender, receiver_id: receiver, status: 'PENDING' });
    return { sender, receiver, id: row.id };
}

test('A13-B-154 신청 보낸 사람 자신이 받기 → 403 "권한이 없습니다.", 신청 그대로 PENDING', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const { sender, id } = await pendingRequest();
    const res = await call('PUT', `/friends/requests/${id}/accept`, { cookie: await login(sender) });
    assert.equal(res.status, 403);
    assert.equal(res.body.message, '권한이 없습니다.');
    assert.equal(await requestStatus(id), 'PENDING');
});

test('A13-B-155 제3자가 받기 → 403 "권한이 없습니다.", 신청 그대로 PENDING', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const { id } = await pendingRequest();
    const third = await createUser('trd');
    const res = await call('PUT', `/friends/requests/${id}/accept`, { cookie: await login(third) });
    assert.equal(res.status, 403);
    assert.equal(res.body.message, '권한이 없습니다.');
    assert.equal(await requestStatus(id), 'PENDING');
});

test('A13-B-156 제3자가 거절 → 403, 그대로 PENDING', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const { id } = await pendingRequest();
    const third = await createUser('trd');
    const res = await call('PUT', `/friends/requests/${id}/decline`, { cookie: await login(third) });
    assert.equal(res.status, 403);
    assert.equal(await requestStatus(id), 'PENDING');
});

const idsOf = (n) => Array.from({ length: n }, (_, i) => String(i + 1)).join(',');

test('A13-B-157 신청 결과 다시 묻기 id 101개 → 400 "요청 id는 한 번에 100개까지 받을 수 있습니다."', async (t) => {
    if (noDb(t)) return;
    const { call, cookie } = await setup(t);
    const res = await call('GET', `/friends/requests/results?ids=${idsOf(101)}`, { cookie });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, '요청 id는 한 번에 100개까지 받을 수 있습니다.');
});

test('A13-B-158 신청 결과 다시 묻기 id 100개 → 200', async (t) => {
    if (noDb(t)) return;
    const { call, cookie } = await setup(t);
    const res = await call('GET', `/friends/requests/results?ids=${idsOf(100)}`, { cookie });
    assert.equal(res.status, 200);
});

// 친구 신청 취소 (2026-11-16 새로 만듦)
test('A13-B-531 없는 신청 번호로 취소 → 404 "친구 요청을 찾을 수 없습니다."', async (t) => {
    if (noDb(t)) return;
    const { call, cookie } = await setup(t);
    const res = await call('PUT', '/friends/requests/987654321/cancel', { cookie });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '친구 요청을 찾을 수 없습니다.');
});

test('A13-B-532 숫자 아닌 신청 번호(abc)로 취소 → 400 "유효하지 않은 요청 id입니다.", 신청 그대로 PENDING', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const { sender, id } = await pendingRequest();
    const res = await call('PUT', '/friends/requests/abc/cancel', { cookie: await login(sender) });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, '유효하지 않은 요청 id입니다.');
    assert.equal(await requestStatus(id), 'PENDING');
});
