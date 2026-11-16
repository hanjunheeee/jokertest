'use strict';

// 친구 신청 취소·보낸 신청 목록 DB 시험 — 보낸 사람만 기다리는 신청을 취소, 받은 쪽 목록에서 사라짐, 다시 신청, 끝난 신청·남의 신청·동시 수락과 취소, 조용히(소리·새 알림 없음)
// 목록 A13-B-501~521 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md "친구 신청 취소·친구 끊기" 장)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-friend-cancel.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');

const { db, createUser, login, nicknameOf, TEST_PASSWORD } = W;
const { withdrawAccount } = require('../../services/auth/account/withdraw');
const noDb = W.useTestDb(test);

// 서버 + 받은 사건 + 민수→지유 대기 신청 (요청으로 보내 알림 줄까지 생김)
async function setup(t) {
    const call = await W.startServer(t);
    const hub = W.eventHub(t);
    const minsu = await createUser('ms');
    const jiyu = await createUser('jy');
    hub.listen(minsu);
    hub.listen(jiyu);
    const cookieM = await login(minsu);
    const cookieJ = await login(jiyu);
    assert.equal((await call('POST', '/friends/requests', { cookie: cookieM, body: { receiverId: jiyu } })).status, 200);
    const row = await db.FriendRequest.findOne({ where: { requester_id: minsu, receiver_id: jiyu }, raw: true });
    return { call, hub, minsu, jiyu, cookieM, cookieJ, id: row.id };
}
const cancel = (call, cookie, id) => call('PUT', `/friends/requests/${id}/cancel`, { cookie });
const accept = (call, cookie, id) => call('PUT', `/friends/requests/${id}/accept`, { cookie });
const decline = (call, cookie, id) => call('PUT', `/friends/requests/${id}/decline`, { cookie });
const outgoing = async (call, cookie) => (await call('GET', '/friends/requests/outgoing', { cookie })).body.data;
const incomingIds = async (call, cookie) => (await call('GET', '/friends/requests/incoming', { cookie })).body.data.map((r) => r.request_id);
const requestRow = (id) => db.FriendRequest.findByPk(id, { raw: true });
const friendshipCount = (a, b) => db.Friendship.count({ where: { requester_id: [a, b], receiver_id: [a, b] } });
const reasons = (hub, uuid) => hub.events(uuid, 'friend_relation_invalidated').map((p) => p.reason);

test('A13-B-501 민수가 보낸 대기 신청 취소 → 200 "친구 신청을 취소했습니다." { request_id, status: CANCELLED }, 줄 CANCELLED·responded_at', async (t) => {
    if (noDb(t)) return;
    const { call, cookieM, id } = await setup(t);
    const res = await cancel(call, cookieM, id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(res.body.message, '친구 신청을 취소했습니다.');
    assert.deepEqual(res.body.data, { request_id: id, status: 'CANCELLED' });
    const row = await requestRow(id);
    assert.equal(row.status, 'CANCELLED');
    assert.ok(row.responded_at, 'responded_at 비어 있음');
});

test('A13-B-502 취소 뒤 지유의 받은 신청 목록에 그 신청 없음', async (t) => {
    if (noDb(t)) return;
    const { call, cookieM, cookieJ, id } = await setup(t);
    assert.deepEqual(await incomingIds(call, cookieJ), [id]);
    assert.equal((await cancel(call, cookieM, id)).status, 200);
    assert.deepEqual(await incomingIds(call, cookieJ), []);
});

test('A13-B-503 취소 뒤 민수의 보낸 신청 목록에 그 신청 없음', async (t) => {
    if (noDb(t)) return;
    const { call, cookieM, id } = await setup(t);
    assert.deepEqual((await outgoing(call, cookieM)).map((r) => r.request_id), [id]);
    assert.equal((await cancel(call, cookieM, id)).status, 200);
    assert.deepEqual(await outgoing(call, cookieM), []);
});

test('A13-B-504 취소 → 지유·민수에게 friend_relation_invalidated REQUEST_CANCELLED 1번씩, 소리 값·거절 사건 없음', async (t) => {
    if (noDb(t)) return;
    const { call, hub, minsu, jiyu, cookieM, id } = await setup(t);
    assert.equal((await cancel(call, cookieM, id)).status, 200);
    assert.deepEqual(reasons(hub, jiyu), ['REQUEST_CANCELLED']);
    assert.deepEqual(reasons(hub, minsu), ['REQUEST_CANCELLED']);
    for (const payload of hub.events(jiyu, 'friend_relation_invalidated')) {
        assert.equal(Object.hasOwn(payload, 'sfxEvent'), false, '취소 사건에 소리 값이 실림');
    }
    assert.equal(hub.events(minsu, 'friend_request_declined').length, 0);
    assert.equal(hub.events(jiyu, 'friend_request_declined').length, 0);
});

test('A13-B-505 취소 뒤 같은 사람에게 다시 신청 → 200, 새 PENDING 줄(다른 번호), 옛 줄은 CANCELLED 그대로', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, id } = await setup(t);
    assert.equal((await cancel(call, cookieM, id)).status, 200);
    const again = await call('POST', '/friends/requests', { cookie: cookieM, body: { receiverId: jiyu } });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const rows = await db.FriendRequest.findAll({ where: { requester_id: minsu, receiver_id: jiyu }, order: [['id', 'ASC']], raw: true });
    assert.deepEqual(rows.map((r) => r.status), ['CANCELLED', 'PENDING']);
    assert.notEqual(rows[1].id, id);
});

test('A13-B-506 취소해도 지유에게 간 "친구 신청" 알림 줄은 그대로(수락·거절 때와 같음), 새 알림 0', async (t) => {
    if (noDb(t)) return;
    const { call, hub, jiyu, cookieM, id } = await setup(t);
    const before = await db.Notification.count({ where: { user_id: jiyu } });
    assert.equal(before, 1);
    const createdBefore = hub.events(jiyu, 'notification_created').length;
    assert.equal((await cancel(call, cookieM, id)).status, 200);
    assert.equal(await db.Notification.count({ where: { user_id: jiyu } }), 1);
    assert.equal(hub.events(jiyu, 'notification_created').length, createdBefore);
});

test('A13-B-507 받은 사람(지유)이 취소 → 403 "권한이 없습니다.", 줄 PENDING 그대로', async (t) => {
    if (noDb(t)) return;
    const { call, cookieJ, id } = await setup(t);
    const res = await cancel(call, cookieJ, id);
    assert.equal(res.status, 403);
    assert.equal(res.body.message, '권한이 없습니다.');
    assert.equal((await requestRow(id)).status, 'PENDING');
});

test('A13-B-508 남(가람)이 민수의 신청 취소 → 403 "권한이 없습니다.", 줄 PENDING 그대로, 사건 0', async (t) => {
    if (noDb(t)) return;
    const { call, hub, jiyu, id } = await setup(t);
    const garam = await createUser('gr');
    const res = await cancel(call, await login(garam), id);
    assert.equal(res.status, 403);
    assert.equal(res.body.message, '권한이 없습니다.');
    assert.equal((await requestRow(id)).status, 'PENDING');
    assert.deepEqual(reasons(hub, jiyu), []);
});

// A13-B-509~511 끝난 신청은 취소 안 됨
for (const [no, label, endIt, expectStatus] of [
    ['A13-B-509', '이미 수락된', (ctx) => accept(ctx.call, ctx.cookieJ, ctx.id), 'ACCEPTED'],
    ['A13-B-510', '이미 거절된', (ctx) => decline(ctx.call, ctx.cookieJ, ctx.id), 'DECLINED'],
    ['A13-B-511', '차단으로 취소된', (ctx) => ctx.call('POST', '/friends/blocks', { cookie: ctx.cookieJ, body: { targetId: ctx.minsu } }), 'CANCELLED'],
]) {
    test(`${no} ${label} 신청 취소 → 409 "이미 처리된 요청입니다.", 줄 ${expectStatus} 그대로·친구 줄 그대로`, async (t) => {
        if (noDb(t)) return;
        const ctx = await setup(t);
        assert.equal((await endIt(ctx)).status, 200);
        const friendsBefore = await friendshipCount(ctx.minsu, ctx.jiyu);
        const res = await cancel(ctx.call, ctx.cookieM, ctx.id);
        assert.equal(res.status, 409);
        assert.equal(res.body.message, '이미 처리된 요청입니다.');
        assert.equal((await requestRow(ctx.id)).status, expectStatus);
        assert.equal(await friendshipCount(ctx.minsu, ctx.jiyu), friendsBefore);
    });
}

test('A13-B-512 취소한 신청 또 취소 → 409 "이미 처리된 요청입니다.", 사건은 처음 1번뿐', async (t) => {
    if (noDb(t)) return;
    const { call, hub, jiyu, cookieM, id } = await setup(t);
    assert.equal((await cancel(call, cookieM, id)).status, 200);
    const res = await cancel(call, cookieM, id);
    assert.equal(res.status, 409);
    assert.equal(res.body.message, '이미 처리된 요청입니다.');
    assert.deepEqual(reasons(hub, jiyu), ['REQUEST_CANCELLED']);
});

test('A13-B-513 같은 취소를 동시에 두 번 → 하나 200·하나 409, 줄 CANCELLED, 사건 1번', async (t) => {
    if (noDb(t)) return;
    const { call, hub, jiyu, cookieM, id } = await setup(t);
    const answers = await Promise.all([1, 2].map(() => cancel(call, cookieM, id)));
    assert.deepEqual(answers.map((a) => a.status).sort(), [200, 409]);
    assert.equal((await requestRow(id)).status, 'CANCELLED');
    assert.deepEqual(reasons(hub, jiyu), ['REQUEST_CANCELLED']);
});

test('A13-B-514 수락과 취소가 동시에 → 하나만 200·다른 하나 409, 줄과 친구 줄이 이긴 쪽대로 맞음', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ, id } = await setup(t);
    const [accepted, cancelled] = await Promise.all([accept(call, cookieJ, id), cancel(call, cookieM, id)]);
    assert.deepEqual([accepted.status, cancelled.status].sort(), [200, 409]);
    const row = await requestRow(id);
    const friends = await friendshipCount(minsu, jiyu);
    if (accepted.status === 200) {
        assert.equal(row.status, 'ACCEPTED');
        assert.equal(friends, 1);
    } else {
        assert.equal(row.status, 'CANCELLED');
        assert.equal(friends, 0);
    }
});

test('A13-B-515 취소한 신청을 지유가 수락 → 409 "이미 처리된 요청입니다.", 친구 줄 0', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ, id } = await setup(t);
    assert.equal((await cancel(call, cookieM, id)).status, 200);
    const res = await accept(call, cookieJ, id);
    assert.equal(res.status, 409);
    assert.equal(res.body.message, '이미 처리된 요청입니다.');
    assert.equal(await friendshipCount(minsu, jiyu), 0);
});

test('A13-B-516 받는 사람이 그사이 정지돼도 취소 됨 → 200, 줄 CANCELLED', async (t) => {
    if (noDb(t)) return;
    const { call, jiyu, cookieM, id } = await setup(t);
    await db.User.update({ status: 'SUSPENDED' }, { where: { uuid: jiyu } });
    const res = await cancel(call, cookieM, id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await requestRow(id)).status, 'CANCELLED');
});

test('A13-B-517 보낸 신청 목록: 대기 2개 → 최근 것 먼저, 줄마다 { request_id, id, name, profile, created_at, 프로필 꾸미기 2칸 }', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const me = await createUser('me');
    const [first, second] = [await createUser('a'), await createUser('b')];
    const older = await db.FriendRequest.create({ requester_id: me, receiver_id: first, status: 'PENDING', created_at: new Date('2026-11-16T01:00:00Z') });
    const newer = await db.FriendRequest.create({ requester_id: me, receiver_id: second, status: 'PENDING', created_at: new Date('2026-11-16T02:00:00Z') });
    const res = await call('GET', '/friends/requests/outgoing', { cookie: await login(me) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.map((r) => r.request_id), [newer.id, older.id]);
    const row = res.body.data[0];
    assert.deepEqual(Object.keys(row).sort(), ['accountProfileBorderId', 'accountProfilePhotoId', 'created_at', 'id', 'name', 'profile', 'request_id']);
    assert.equal(row.id, second);
    assert.equal(row.name, await nicknameOf(second));
});

test('A13-B-518 보낸 신청 목록엔 내가 보낸 대기만: 수락·거절·취소된 것, 내가 받은 것, 남끼리 것은 없음', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const me = await createUser('me');
    const targets = [];
    for (const status of ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED']) {
        const target = await createUser('t');
        targets.push({ uuid: target, status });
        await db.FriendRequest.create({ requester_id: me, receiver_id: target, status });
    }
    const [sender, x, y] = [await createUser('s'), await createUser('x'), await createUser('y')];
    await db.FriendRequest.create({ requester_id: sender, receiver_id: me, status: 'PENDING' });
    await db.FriendRequest.create({ requester_id: x, receiver_id: y, status: 'PENDING' });
    const rows = await outgoing(call, await login(me));
    assert.deepEqual(rows.map((r) => r.id), [targets[0].uuid]);
});

test('A13-B-519 취소 뒤 친구 찾기에 지유가 다시 나옴 (대기 중엔 안 나옴)', async (t) => {
    if (noDb(t)) return;
    const { call, jiyu, cookieM, id } = await setup(t);
    const q = encodeURIComponent(await nicknameOf(jiyu));
    const found = async () => (await call('GET', `/friends/search?q=${q}`, { cookie: cookieM })).body.data.map((u) => u.id);
    assert.equal((await found()).includes(jiyu), false);
    assert.equal((await cancel(call, cookieM, id)).status, 200);
    assert.equal((await found()).includes(jiyu), true);
});

test('A13-B-520 취소한 신청 결과 다시 묻기 → 두 사람 모두 status CANCELLED·responded_at', async (t) => {
    if (noDb(t)) return;
    const { call, cookieM, cookieJ, id } = await setup(t);
    assert.equal((await cancel(call, cookieM, id)).status, 200);
    for (const cookie of [cookieM, cookieJ]) {
        const res = await call('GET', `/friends/requests/results?ids=${id}`, { cookie });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.length, 1);
        assert.equal(res.body.data[0].status, 'CANCELLED');
        assert.ok(res.body.data[0].responded_at, 'responded_at 없음');
    }
});

test('A13-B-521 받는 사람이 탈퇴하면 신청 줄이 지워짐 → 취소 404 "친구 요청을 찾을 수 없습니다.", 보낸 신청 목록 0', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const minsu = await createUser('ms');
    const leaver = await createUser('lv', { withPassword: true });
    const row = await db.FriendRequest.create({ requester_id: minsu, receiver_id: leaver, status: 'PENDING' });
    assert.equal((await withdrawAccount({ uuid: leaver, password: TEST_PASSWORD })).ok, true);
    const cookieM = await login(minsu);
    const res = await cancel(call, cookieM, row.id);
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '친구 요청을 찾을 수 없습니다.');
    assert.deepEqual(await outgoing(call, cookieM), []);
});
