'use strict';

// 친구 신청 받기·거절·목록 DB 시험 — 친구 한 쌍, 끝난 신청·정지 계정·동시 받기, 거절, 받은 신청 목록, 결과 다시 묻기는 내 것만
// 목록 A13-B-314~323 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-friend-accept.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');

const { db, createUser, login, nicknameOf } = W;
const noDb = W.useTestDb(test);

// 서버 + 받은 알림 + 민수→지유 대기 신청
async function setup(t) {
    const call = await W.startServer(t);
    const hub = W.eventHub(t);
    const minsu = await createUser('ms');
    const jiyu = await createUser('jy');
    hub.listen(minsu);
    const cookieM = await login(minsu);
    const cookieJ = await login(jiyu);
    assert.equal((await call('POST', '/friends/requests', { cookie: cookieM, body: { receiverId: jiyu } })).status, 200);
    const row = await db.FriendRequest.findOne({ where: { requester_id: minsu, receiver_id: jiyu }, raw: true });
    return { call, hub, minsu, jiyu, cookieM, cookieJ, id: row.id };
}
const friendshipCount = (a, b) => db.Friendship.count({ where: { requester_id: [a, b], receiver_id: [a, b] } });
const requestRow = (id) => db.FriendRequest.findByPk(id, { raw: true });
const friendIds = async (call, cookie) => (await call('GET', '/friends', { cookie })).body.data.map((f) => f.id);

test('A13-B-314 지유가 받음 → 신청 ACCEPTED·responded_at, friendships 1줄 ACCEPTED, 민수에게 friend_request_accepted { byUuid: 지유 }, 서로 목록에 보임', async (t) => {
    if (noDb(t)) return;
    const { call, hub, minsu, jiyu, cookieM, cookieJ, id } = await setup(t);
    const res = await call('PUT', `/friends/requests/${id}/accept`, { cookie: cookieJ });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const row = await requestRow(id);
    assert.equal(row.status, 'ACCEPTED');
    assert.ok(row.responded_at, 'responded_at 비어 있음');
    const pairs = await db.Friendship.findAll({ where: { requester_id: [minsu, jiyu], receiver_id: [minsu, jiyu] }, raw: true });
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].status, 'ACCEPTED');
    const accepted = hub.events(minsu, 'friend_request_accepted');
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].byUuid, jiyu);
    assert.ok((await friendIds(call, cookieM)).includes(jiyu));
    assert.ok((await friendIds(call, cookieJ)).includes(minsu));
});

// A13-B-315~317 끝난 신청은 받기 안 됨
for (const [no, label, endIt] of [
    ['A13-B-315', '이미 받은', (call, ctx) => call('PUT', `/friends/requests/${ctx.id}/accept`, { cookie: ctx.cookieJ })],
    ['A13-B-316', '거절된', (call, ctx) => call('PUT', `/friends/requests/${ctx.id}/decline`, { cookie: ctx.cookieJ })],
    ['A13-B-317', '차단으로 취소된', async (call, ctx) => {
        await call('POST', '/friends/blocks', { cookie: ctx.cookieJ, body: { targetId: ctx.minsu } });
        await call('DELETE', `/friends/blocks/${ctx.minsu}`, { cookie: ctx.cookieJ });
    }],
]) {
    test(`${no} ${label} 신청 받기 → 409 "이미 처리된 요청입니다.", 친구 줄 그대로`, async (t) => {
        if (noDb(t)) return;
        const ctx = await setup(t);
        await endIt(ctx.call, ctx);
        const before = await friendshipCount(ctx.minsu, ctx.jiyu);
        const res = await ctx.call('PUT', `/friends/requests/${ctx.id}/accept`, { cookie: ctx.cookieJ });
        assert.equal(res.status, 409);
        assert.equal(res.body.message, '이미 처리된 요청입니다.');
        assert.equal(await friendshipCount(ctx.minsu, ctx.jiyu), before);
    });
}

test('A13-B-318 보낸 사람이 그사이 정지됨 → 받기 403 "친구 요청을 수락할 수 없는 계정입니다.", 친구 줄 0, 신청 PENDING 그대로', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieJ, id } = await setup(t);
    await db.User.update({ status: 'SUSPENDED' }, { where: { uuid: minsu } });
    const res = await call('PUT', `/friends/requests/${id}/accept`, { cookie: cookieJ });
    assert.equal(res.status, 403);
    assert.equal(res.body.message, '친구 요청을 수락할 수 없는 계정입니다.');
    assert.equal(await friendshipCount(minsu, jiyu), 0);
    assert.equal((await requestRow(id)).status, 'PENDING');
});

test('A13-B-319 같은 신청을 동시에 두 번 받음 → 하나 성공·하나 409, 친구 줄 1', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieJ, id } = await setup(t);
    const answers = await Promise.all([1, 2].map(() => call('PUT', `/friends/requests/${id}/accept`, { cookie: cookieJ })));
    assert.deepEqual(answers.map((a) => a.status).sort(), [200, 409]);
    assert.equal(await friendshipCount(minsu, jiyu), 1);
});

test('A13-B-320 거절 → 신청 DECLINED·responded_at, 친구 줄 0, 민수에게 friend_request_declined { byUuid: 지유 }', async (t) => {
    if (noDb(t)) return;
    const { call, hub, minsu, jiyu, cookieJ, id } = await setup(t);
    const res = await call('PUT', `/friends/requests/${id}/decline`, { cookie: cookieJ });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const row = await requestRow(id);
    assert.equal(row.status, 'DECLINED');
    assert.ok(row.responded_at, 'responded_at 비어 있음');
    assert.equal(await friendshipCount(minsu, jiyu), 0);
    const declined = hub.events(minsu, 'friend_request_declined');
    assert.equal(declined.length, 1);
    assert.equal(declined[0].byUuid, jiyu);
});

test('A13-B-321 거절한 신청 또 거절 → 409 "이미 처리된 요청입니다."', async (t) => {
    if (noDb(t)) return;
    const { call, cookieJ, id } = await setup(t);
    assert.equal((await call('PUT', `/friends/requests/${id}/decline`, { cookie: cookieJ })).status, 200);
    const res = await call('PUT', `/friends/requests/${id}/decline`, { cookie: cookieJ });
    assert.equal(res.status, 409);
    assert.equal(res.body.message, '이미 처리된 요청입니다.');
});

test('A13-B-322 받은 신청 목록: 나에게 온 PENDING 2 + 거절·받음·취소 각 1 + 내가 보낸 PENDING 1 → 2줄만(보낸 사람 닉네임)', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const me = await createUser('me');
    const senders = [];
    for (const status of ['PENDING', 'PENDING', 'DECLINED', 'ACCEPTED', 'CANCELLED']) {
        const s = await createUser('s');
        senders.push({ uuid: s, status });
        await db.FriendRequest.create({ requester_id: s, receiver_id: me, status });
    }
    const outTo = await createUser('out');
    await db.FriendRequest.create({ requester_id: me, receiver_id: outTo, status: 'PENDING' });
    const res = await call('GET', '/friends/requests/incoming', { cookie: await login(me) });
    assert.equal(res.status, 200);
    const pending = senders.filter((s) => s.status === 'PENDING');
    assert.deepEqual(res.body.data.map((r) => r.id).sort(), pending.map((s) => s.uuid).sort());
    for (const s of pending) {
        assert.equal(res.body.data.find((r) => r.id === s.uuid).name, await nicknameOf(s.uuid));
    }
});

test('A13-B-323 결과 다시 묻기: 내가 보낸 id 1 + 받은 id 1 + 남끼리 id 1 → 2줄(상태·responded_at), 남의 것 없음', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const me = await createUser('me');
    const [a, b, c, d] = [await createUser('a'), await createUser('b'), await createUser('c'), await createUser('d')];
    const sent = await db.FriendRequest.create({ requester_id: me, receiver_id: a, status: 'PENDING' });
    const got = await db.FriendRequest.create({ requester_id: b, receiver_id: me, status: 'DECLINED', responded_at: new Date() });
    const others = await db.FriendRequest.create({ requester_id: c, receiver_id: d, status: 'PENDING' });
    const res = await call('GET', `/friends/requests/results?ids=${sent.id},${got.id},${others.id}`, { cookie: await login(me) });
    assert.equal(res.status, 200);
    const rows = res.body.data;
    assert.deepEqual(rows.map((r) => r.request_id).sort((x, y) => x - y), [sent.id, got.id].sort((x, y) => x - y));
    assert.equal(rows.find((r) => r.request_id === sent.id).status, 'PENDING');
    assert.equal(rows.find((r) => r.request_id === got.id).status, 'DECLINED');
    assert.ok(rows.find((r) => r.request_id === got.id).responded_at, 'responded_at 없음');
    assert.equal(rows.some((r) => r.request_id === others.id), false);
});
