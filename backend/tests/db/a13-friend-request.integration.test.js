'use strict';

// 친구 신청 보내기 DB 시험 — 신청 줄·알림 줄·받는 사람 사건, 활성 아님·이미 친구·이미 신청·동시 신청·차단, 거절·취소 뒤 다시
// 목록 A13-B-301~313 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-friend-request.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');

const { db, createUser, login, befriend, block, nicknameOf } = W;
const noDb = W.useTestDb(test);

const BLOCKED_MESSAGE = '차단된 사용자와는 친구 신청·게임 초대를 주고받을 수 없습니다.';

// 서버 + 받은 알림 모으기 + 민수(보냄)·지유(받음)
async function setup(t) {
    const call = await W.startServer(t);
    const hub = W.eventHub(t);
    const minsu = await createUser('ms');
    const jiyu = await createUser('jy');
    hub.listen(minsu);
    hub.listen(jiyu);
    return { call, hub, minsu, jiyu, cookieM: await login(minsu), cookieJ: await login(jiyu) };
}
const sendRequest = (call, cookie, receiverId) => call('POST', '/friends/requests', { cookie, body: { receiverId } });
const requestsBetween = (a, b) => db.FriendRequest.findAll({
    where: { requester_id: [a, b], receiver_id: [a, b] }, order: [['id', 'ASC']], raw: true,
});
const notificationsOf = (uuid) => db.Notification.findAll({ where: { user_id: uuid }, order: [['created_at', 'ASC']], raw: true });

test('A13-B-301 민수가 지유에게 신청 → friend_requests PENDING 1줄, 지유 notifications 1줄(type·제목·본문·target·source_key)', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    const res = await sendRequest(call, cookieM, jiyu);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const rows = await requestsBetween(minsu, jiyu);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'PENDING');
    const notes = await notificationsOf(jiyu);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].type, 'friend-request');
    assert.equal(notes[0].title, '새 친구 요청');
    assert.equal(notes[0].body, `${await nicknameOf(minsu)} 님이 친구 요청을 보냈습니다.`);
    const target = typeof notes[0].target === 'string' ? JSON.parse(notes[0].target) : notes[0].target;
    assert.deepEqual(target, { kind: 'friend-request', requestId: rows[0].id });
    assert.equal(notes[0].source_key, `friend-request:${rows[0].id}:received`);
});

test('A13-B-302 신청 → 지유에게 notification_created 1번 + friend_request_received 1번(효과음 id = 알림 출처 키)', async (t) => {
    if (noDb(t)) return;
    const { call, hub, minsu, jiyu, cookieM } = await setup(t);
    assert.equal((await sendRequest(call, cookieM, jiyu)).status, 200);
    const [row] = await requestsBetween(minsu, jiyu);
    const created = hub.events(jiyu, 'notification_created');
    const received = hub.events(jiyu, 'friend_request_received');
    assert.equal(created.length, 1);
    assert.equal(received.length, 1);
    assert.equal(received[0].sfxEvent.eventId, `friend-request:${row.id}:received`);
    assert.equal(received[0].sfxEvent.eventId, created[0].notification.sourceKey);
});

test('A13-B-303 받는 사람이 정지 계정 → 403 "친구 신청을 보낼 수 없는 계정입니다.", 신청·알림 0', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, cookieM } = await setup(t);
    const banned = await createUser('ban', { status: 'SUSPENDED' });
    const res = await sendRequest(call, cookieM, banned);
    assert.equal(res.status, 403);
    assert.equal(res.body.message, '친구 신청을 보낼 수 없는 계정입니다.');
    assert.equal((await requestsBetween(minsu, banned)).length, 0);
    assert.equal((await notificationsOf(banned)).length, 0);
});

// 탈퇴한 계정은 지운 표시가 붙어 계정 찾기에서 안 나옴 → 정지(403)와 달리 "없는 사람"(404)으로 막힘 (막히기는 같음, 상태 숫자만 지금 값으로)
test('A13-B-304 받는 사람이 탈퇴 계정 → 404 "사용자를 찾을 수 없습니다.", 신청·알림 0', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, cookieM } = await setup(t);
    const gone = await createUser('gone');
    // 탈퇴한 계정 모양: 상태 WITHDRAWN + 지운 표시
    await db.User.update({ status: 'WITHDRAWN' }, { where: { uuid: gone } });
    await db.User.destroy({ where: { uuid: gone } });
    const res = await sendRequest(call, cookieM, gone);
    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body.message, '사용자를 찾을 수 없습니다.');
    assert.equal((await requestsBetween(minsu, gone)).length, 0);
    assert.equal((await notificationsOf(gone)).length, 0);
});

test('A13-B-305 이미 친구(내가 처음 신청한 쪽) → 409 "이미 친구인 유저입니다.", 신청·알림 0', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    await befriend(minsu, jiyu);
    const res = await sendRequest(call, cookieM, jiyu);
    assert.equal(res.status, 409);
    assert.equal(res.body.message, '이미 친구인 유저입니다.');
    assert.equal((await requestsBetween(minsu, jiyu)).length, 0);
    assert.equal((await notificationsOf(jiyu)).length, 0);
});

test('A13-B-306 이미 친구(상대가 처음 신청한 쪽, 줄 방향 반대) → 409 "이미 친구인 유저입니다."', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    await befriend(jiyu, minsu);
    const res = await sendRequest(call, cookieM, jiyu);
    assert.equal(res.status, 409);
    assert.equal(res.body.message, '이미 친구인 유저입니다.');
});

test('A13-B-307 내가 보낸 대기 신청이 있는데 또 보냄 → 409 "이미 친구 신청 중입니다.", PENDING 1줄·알림 1줄 그대로', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    assert.equal((await sendRequest(call, cookieM, jiyu)).status, 200);
    const res = await sendRequest(call, cookieM, jiyu);
    assert.equal(res.status, 409);
    assert.equal(res.body.message, '이미 친구 신청 중입니다.');
    assert.equal((await requestsBetween(minsu, jiyu)).filter((r) => r.status === 'PENDING').length, 1);
    assert.equal((await notificationsOf(jiyu)).length, 1);
});

test('A13-B-308 지유→민수 대기 신청이 있는데 민수→지유 → 409 "이미 친구 신청 중입니다.", PENDING 1줄', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ } = await setup(t);
    assert.equal((await sendRequest(call, cookieJ, minsu)).status, 200);
    const res = await sendRequest(call, cookieM, jiyu);
    assert.equal(res.status, 409);
    assert.equal(res.body.message, '이미 친구 신청 중입니다.');
    assert.equal((await requestsBetween(minsu, jiyu)).filter((r) => r.status === 'PENDING').length, 1);
});

test('A13-B-309 민수→지유·지유→민수 동시에 → 하나 성공·하나 409 "이미 친구 신청 중입니다.", PENDING 1줄, 알림 1줄', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ } = await setup(t);
    const answers = await Promise.all([sendRequest(call, cookieM, jiyu), sendRequest(call, cookieJ, minsu)]);
    assert.deepEqual(answers.map((a) => a.status).sort(), [200, 409]);
    assert.equal(answers.find((a) => a.status === 409).body.message, '이미 친구 신청 중입니다.');
    assert.equal((await requestsBetween(minsu, jiyu)).filter((r) => r.status === 'PENDING').length, 1);
    const notes = (await notificationsOf(minsu)).length + (await notificationsOf(jiyu)).length;
    assert.equal(notes, 1);
});

for (const [no, label, owner] of [['A13-B-310', '내가 차단한 사람에게', 'me'], ['A13-B-311', '나를 차단한 사람에게', 'them']]) {
    test(`${no} ${label} 신청 → 403 "${BLOCKED_MESSAGE}", 신청 0`, async (t) => {
        if (noDb(t)) return;
        const { call, minsu, jiyu, cookieM } = await setup(t);
        if (owner === 'me') await block(minsu, jiyu);
        else await block(jiyu, minsu);
        const res = await sendRequest(call, cookieM, jiyu);
        assert.equal(res.status, 403);
        assert.equal(res.body.message, BLOCKED_MESSAGE);
        assert.equal((await requestsBetween(minsu, jiyu)).length, 0);
    });
}

test('A13-B-312 거절(DECLINED) 뒤 같은 방향 다시 → 새 PENDING 줄, 옛 DECLINED 줄 남음, 알림 새로 1줄', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ } = await setup(t);
    assert.equal((await sendRequest(call, cookieM, jiyu)).status, 200);
    const [first] = await requestsBetween(minsu, jiyu);
    assert.equal((await call('PUT', `/friends/requests/${first.id}/decline`, { cookie: cookieJ })).status, 200);
    const again = await sendRequest(call, cookieM, jiyu);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const rows = await requestsBetween(minsu, jiyu);
    assert.deepEqual(rows.map((r) => r.status), ['DECLINED', 'PENDING']);
    assert.equal((await notificationsOf(jiyu)).length, 2);
});

test('A13-B-313 차단으로 취소(CANCELLED)된 뒤 풀고 다시 신청 → 새 PENDING, CANCELLED 줄 남음', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ } = await setup(t);
    assert.equal((await sendRequest(call, cookieM, jiyu)).status, 200);
    assert.equal((await call('POST', '/friends/blocks', { cookie: cookieJ, body: { targetId: minsu } })).status, 200);
    assert.equal((await call('DELETE', `/friends/blocks/${minsu}`, { cookie: cookieJ })).status, 200);
    const again = await sendRequest(call, cookieM, jiyu);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.deepEqual((await requestsBetween(minsu, jiyu)).map((r) => r.status), ['CANCELLED', 'PENDING']);
});
