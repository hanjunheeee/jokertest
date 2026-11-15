'use strict';

// 차단·차단 풀기 DB 시험 — 차단 줄·알림, 기다리는 신청·초대 취소, 친구 줄은 남고 양쪽 목록에서 숨음, 차단 목록, 풀기, 차단 뒤 초대 수락
// 목록 A13-B-335~347 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-block.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, createUser, login, befriend, block, nicknameOf, insertInvite, flush } = W;
const noDb = W.useTestDb(test);

// 서버 + 받은 알림 + 민수·지유 (로그인)
async function setup(t, { friends = true } = {}) {
    const call = await W.startServer(t);
    const hub = W.eventHub(t);
    const minsu = await createUser('ms');
    const jiyu = await createUser('jy');
    if (friends) await befriend(minsu, jiyu);
    hub.listen(minsu);
    hub.listen(jiyu);
    return { call, hub, minsu, jiyu, cookieM: await login(minsu), cookieJ: await login(jiyu) };
}
const blockUser = (call, cookie, targetId) => call('POST', '/friends/blocks', { cookie, body: { targetId } });
const unblockUser = (call, cookie, targetId) => call('DELETE', `/friends/blocks/${targetId}`, { cookie });
const friendIds = async (call, cookie) => (await call('GET', '/friends', { cookie })).body.data.map((f) => f.id);
const blockRows = (owner, blocked) => db.FriendBlock.count({ where: { owner_id: owner, blocked_id: blocked } });
const reasons = (hub, uuid) => hub.events(uuid, 'friend_relation_invalidated').map((p) => p.reason);

test('A13-B-335 지유가 민수 차단 → friend_blocks 1줄, 답 { blockedId, cancelledInvites }, 두 사람에게 friend_relation_invalidated BLOCKED 1번씩', async (t) => {
    if (noDb(t)) return;
    const { call, hub, minsu, jiyu, cookieJ } = await setup(t);
    const res = await blockUser(call, cookieJ, minsu);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await blockRows(jiyu, minsu), 1);
    assert.deepEqual(Object.keys(res.body.data).sort(), ['blockedId', 'cancelledInvites']);
    assert.equal(res.body.data.blockedId, minsu);
    assert.deepEqual(reasons(hub, minsu), ['BLOCKED']);
    assert.deepEqual(reasons(hub, jiyu), ['BLOCKED']);
});

test('A13-B-336 두 번 차단해도 한 줄', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieJ } = await setup(t);
    assert.equal((await blockUser(call, cookieJ, minsu)).status, 200);
    assert.equal((await blockUser(call, cookieJ, minsu)).status, 200);
    assert.equal(await blockRows(jiyu, minsu), 1);
});

for (const [no, label, mineSent] of [['A13-B-337', '내가 보낸', true], ['A13-B-338', '내가 받은', false]]) {
    test(`${no} 차단하면 ${label} PENDING 신청 → CANCELLED·responded_at`, async (t) => {
        if (noDb(t)) return;
        const { call, minsu, jiyu, cookieM } = await setup(t, { friends: false });
        const row = await db.FriendRequest.create(mineSent
            ? { requester_id: minsu, receiver_id: jiyu, status: 'PENDING' }
            : { requester_id: jiyu, receiver_id: minsu, status: 'PENDING' });
        assert.equal((await blockUser(call, cookieM, jiyu)).status, 200);
        const after = await db.FriendRequest.findByPk(row.id, { raw: true });
        assert.equal(after.status, 'CANCELLED');
        assert.ok(after.responded_at, 'responded_at 비어 있음');
    });
}

test('A13-B-339 정원 6 · 지금 3명: 차단하면 민수→지유·지유→민수 PENDING 둘 CANCELLED·end_reason BLOCKED, 끝난 EXPIRED는 그대로', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    const out = await insertInvite(minsu, jiyu);
    const back = await insertInvite(jiyu, minsu);
    const old = await insertInvite(minsu, jiyu, { status: 'EXPIRED', end_reason: 'EXPIRED' });
    assert.equal((await blockUser(call, cookieM, jiyu)).status, 200);
    const read = async (row) => db.GameInvite.findByPk(row.id, { raw: true });
    for (const row of [out, back]) {
        const after = await read(row);
        assert.equal(after.status, 'CANCELLED');
        assert.equal(after.end_reason, 'BLOCKED');
    }
    const expired = await read(old);
    assert.equal(expired.status, 'EXPIRED');
    assert.equal(expired.end_reason, 'EXPIRED');
});

test('A13-B-340 친구 사이에서 차단 → friendships 1줄 그대로, 차단한 사람 친구 목록에서 상대 빠짐', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieJ } = await setup(t);
    assert.equal((await blockUser(call, cookieJ, minsu)).status, 200);
    assert.equal(await db.Friendship.count({ where: { requester_id: [minsu, jiyu], receiver_id: [minsu, jiyu] } }), 1);
    assert.equal((await friendIds(call, cookieJ)).includes(minsu), false);
});

test('A13-B-341 위 → 차단당한 민수 친구 목록에서도 지유 빠짐', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, cookieM, cookieJ } = await setup(t);
    assert.equal((await blockUser(call, cookieJ, minsu)).status, 200);
    const jiyuId = (await db.FriendBlock.findOne({ where: { blocked_id: minsu }, raw: true })).owner_id;
    assert.equal((await friendIds(call, cookieM)).includes(jiyuId), false);
});

test('A13-B-342 차단 목록: 2명 차례로 차단 + 상대가 나를 차단 1 → 내 목록 2줄(최근 차단 먼저, 닉네임), 나를 막은 사람 없음', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const me = await createUser('me');
    const [first, second, hater] = [await createUser('b1'), await createUser('b2'), await createUser('h')];
    // 차단 시각을 1분 띄워 차례를 분명히
    const base = Math.floor(Date.now() / 1000) * 1000;
    await db.FriendBlock.create({ owner_id: me, blocked_id: first, created_at: new Date(base - 60_000) });
    await db.FriendBlock.create({ owner_id: me, blocked_id: second, created_at: new Date(base) });
    await block(hater, me);
    const res = await call('GET', '/friends/blocks', { cookie: await login(me) });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((r) => r.id), [second, first]);
    assert.deepEqual(res.body.data.map((r) => r.name), [await nicknameOf(second), await nicknameOf(first)]);
});

test('A13-B-343 풀기 → 내 차단 줄만 지움, 친구 목록에 다시 보임, 나에게만 friend_relation_invalidated UNBLOCKED', async (t) => {
    if (noDb(t)) return;
    const { call, hub, minsu, jiyu, cookieM } = await setup(t);
    assert.equal((await blockUser(call, cookieM, jiyu)).status, 200);
    const res = await unblockUser(call, cookieM, jiyu);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await blockRows(minsu, jiyu), 0);
    assert.ok((await friendIds(call, cookieM)).includes(jiyu), '풀었는데 목록에 없음');
    assert.deepEqual(reasons(hub, minsu).filter((r) => r === 'UNBLOCKED'), ['UNBLOCKED']);
    assert.deepEqual(reasons(hub, jiyu).filter((r) => r === 'UNBLOCKED'), []);
});

test('A13-B-344 서로 차단 중 내가 풀기 → 상대 줄 남음, 내 친구 목록에 여전히 안 보임, 내가 신청 → 403', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ } = await setup(t);
    assert.equal((await blockUser(call, cookieM, jiyu)).status, 200);
    assert.equal((await blockUser(call, cookieJ, minsu)).status, 200);
    assert.equal((await unblockUser(call, cookieM, jiyu)).status, 200);
    assert.equal(await blockRows(jiyu, minsu), 1);
    assert.equal((await friendIds(call, cookieM)).includes(jiyu), false);
    const res = await call('POST', '/friends/requests', { cookie: cookieM, body: { receiverId: jiyu } });
    assert.equal(res.status, 403);
});

test('A13-B-345 차단으로 CANCELLED된 신청·초대 → 풀기 뒤에도 CANCELLED', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t, { friends: false });
    const request = await db.FriendRequest.create({ requester_id: minsu, receiver_id: jiyu, status: 'PENDING' });
    const invite = await insertInvite(minsu, jiyu);
    assert.equal((await blockUser(call, cookieM, jiyu)).status, 200);
    assert.equal((await unblockUser(call, cookieM, jiyu)).status, 200);
    assert.equal((await db.FriendRequest.findByPk(request.id, { raw: true })).status, 'CANCELLED');
    assert.equal((await db.GameInvite.findByPk(invite.id, { raw: true })).status, 'CANCELLED');
});

// 초대 보내기 (HTTP) → 초대 id
async function sendInvite(call, cookie, receiverId) {
    const res = await call('POST', '/friends/invites', { cookie, body: { receiverId, creationKey: `k-${crypto.randomUUID()}` } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data.inviteId;
}
const guestNames = (n) => Array.from({ length: n }, () => `a13-guest-${crypto.randomUUID().slice(0, 8)}`);

test('A13-B-346 정원 6 · 지금 3명: 초대 받음 → 보낸 사람이 나를 차단 → accept_game_invite → { ok: false } "이미 처리된 초대입니다."(CANCELLED), 방 명단 그대로', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    const w = W.roomWorld(t);
    const room = await w.openRoom(minsu, guestNames(2), 6);
    w.connect(jiyu);
    const inviteId = await sendInvite(call, cookieM, jiyu);
    assert.equal((await blockUser(call, cookieM, jiyu)).status, 200);
    const reply = await w.send(jiyu, 'accept_game_invite', { inviteId });
    assert.equal(reply.ok, false);
    assert.equal(reply.message, '이미 처리된 초대입니다.');
    assert.equal(reply.code, 'CANCELLED');
    const now = await w.currentRoom(minsu);
    assert.equal(now.roomId, room.roomId);
    assert.equal(now.players.length, 3);
    assert.equal(now.players.some((p) => p.uuid === jiyu), false);
});

test('A13-B-347 정원 7 · 지금 4명: 수락 기록 뒤·방에 넣기 전에 차단 → 초대 ACCEPTED·입장 결과 INTERRUPTED·end_reason BLOCKED_BEFORE_ENTRY, 방 명단에 없음', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    const w = W.roomWorld(t);
    await w.openRoom(minsu, guestNames(3), 7);
    w.connect(jiyu);
    const inviteId = await sendInvite(call, cookieM, jiyu);
    // 수락 기록과 방에 넣기 사이에서 보낸 사람이 차단 (진짜 초대 서비스 앞에 끼움)
    const real = w.inviteService;
    w.matchmaking.__setGameInviteServiceForTests({
        ...real,
        finalizeAcceptedEntry: async (args) => {
            assert.equal((await blockUser(call, cookieM, jiyu)).status, 200);
            return real.finalizeAcceptedEntry(args);
        },
    });
    await w.send(jiyu, 'accept_game_invite', { inviteId });
    await flush();
    const row = await db.GameInvite.findByPk(inviteId, { raw: true });
    assert.equal(row.status, 'ACCEPTED');
    assert.equal(row.entry_outcome, 'INTERRUPTED');
    assert.equal(row.end_reason, 'BLOCKED_BEFORE_ENTRY');
    assert.equal((await w.currentRoom(minsu)).players.some((p) => p.uuid === jiyu), false);
});
