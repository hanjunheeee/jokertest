'use strict';

// 친구 끊기 DB 시험 — 친구 줄 지움·양쪽 목록에서 사라짐·즐겨찾기 풀림·기다리는 초대 취소·다시 신청, 친구 아닌 사람·두 번·동시에, 차단·정지·탈퇴와 얽힌 것, 조용히(알림 줄·소리 없음)
// 목록 A13-B-541~557 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md "친구 신청 취소·친구 끊기" 장)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-unfriend.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');

const { db, createUser, login, befriend, block, insertInvite, nicknameOf, TEST_PASSWORD } = W;
const { withdrawAccount } = require('../../services/auth/account/withdraw');
const noDb = W.useTestDb(test);

// 서버 + 받은 사건 + 친구인 민수·지유 (민수가 처음 신청한 쪽)
async function setup(t, { jiyuFirst = false } = {}) {
    const call = await W.startServer(t);
    const hub = W.eventHub(t);
    const minsu = await createUser('ms');
    const jiyu = await createUser('jy');
    if (jiyuFirst) await befriend(jiyu, minsu); else await befriend(minsu, jiyu);
    hub.listen(minsu);
    hub.listen(jiyu);
    return { call, hub, minsu, jiyu, cookieM: await login(minsu), cookieJ: await login(jiyu) };
}
const unfriend = (call, cookie, friendId) => call('DELETE', `/friends/${friendId}`, { cookie });
const friendIds = async (call, cookie) => (await call('GET', '/friends', { cookie })).body.data.map((f) => f.id);
const friendshipCount = (a, b) => db.Friendship.count({ where: { requester_id: [a, b], receiver_id: [a, b] } });
const favoriteCount = (owner, friend) => db.FriendFavorite.count({ where: { owner_id: owner, friend_id: friend } });
const reasons = (hub, uuid) => hub.events(uuid, 'friend_relation_invalidated').map((p) => p.reason);

test('A13-B-541 민수가 지유와 친구 끊기 → 200 { unfriendedId: 지유, cancelledInvites: [] }, friendships 0줄', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    const res = await unfriend(call, cookieM, jiyu);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data, { unfriendedId: jiyu, cancelledInvites: [] });
    assert.equal(await friendshipCount(minsu, jiyu), 0);
});

test('A13-B-542 끊은 뒤 두 사람 친구 목록 어디에도 상대 없음', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ } = await setup(t);
    assert.ok((await friendIds(call, cookieJ)).includes(minsu));
    assert.equal((await unfriend(call, cookieM, jiyu)).status, 200);
    assert.equal((await friendIds(call, cookieM)).includes(jiyu), false);
    assert.equal((await friendIds(call, cookieJ)).includes(minsu), false);
});

test('A13-B-543 친구 줄이 지유→민수 방향(지유가 처음 신청)이어도 민수가 끊을 수 있음 → 200, 0줄', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t, { jiyuFirst: true });
    assert.equal((await unfriend(call, cookieM, jiyu)).status, 200);
    assert.equal(await friendshipCount(minsu, jiyu), 0);
});

test('A13-B-544 끊으면 서로 건 즐겨찾기 둘 다 풀림, 다른 친구(가람) 즐겨찾기·친구 줄은 그대로', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    const garam = await createUser('gr');
    await befriend(minsu, garam);
    await db.FriendFavorite.create({ owner_id: minsu, friend_id: jiyu });
    await db.FriendFavorite.create({ owner_id: jiyu, friend_id: minsu });
    await db.FriendFavorite.create({ owner_id: minsu, friend_id: garam });
    assert.equal((await unfriend(call, cookieM, jiyu)).status, 200);
    assert.equal(await favoriteCount(minsu, jiyu), 0);
    assert.equal(await favoriteCount(jiyu, minsu), 0);
    assert.equal(await favoriteCount(minsu, garam), 1);
    assert.equal(await friendshipCount(minsu, garam), 1);
    assert.deepEqual((await call('GET', '/friends/favorites', { cookie: cookieM })).body.data, [garam]);
});

test('A13-B-545 끊기 → 두 사람에게 friend_relation_invalidated UNFRIENDED 1번씩, 지유 알림 줄 0·notification_created 0·소리 값 없음(조용히)', async (t) => {
    if (noDb(t)) return;
    const { call, hub, minsu, jiyu, cookieM } = await setup(t);
    assert.equal((await unfriend(call, cookieM, jiyu)).status, 200);
    assert.deepEqual(reasons(hub, jiyu), ['UNFRIENDED']);
    assert.deepEqual(reasons(hub, minsu), ['UNFRIENDED']);
    assert.equal(await db.Notification.count({ where: { user_id: jiyu } }), 0);
    assert.equal(hub.events(jiyu, 'notification_created').length, 0);
    for (const payload of hub.events(jiyu, 'friend_relation_invalidated')) {
        assert.equal(Object.hasOwn(payload, 'sfxEvent'), false, '끊기 사건에 소리 값이 실림');
    }
});

test('A13-B-546 끊은 뒤 다시 신청 → 200, 지유가 수락 → 다시 친구(friendships 1줄, 서로 목록에 보임)', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ } = await setup(t);
    assert.equal((await unfriend(call, cookieM, jiyu)).status, 200);
    const sent = await call('POST', '/friends/requests', { cookie: cookieM, body: { receiverId: jiyu } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const row = await db.FriendRequest.findOne({ where: { requester_id: minsu, receiver_id: jiyu, status: 'PENDING' }, raw: true });
    assert.equal((await call('PUT', `/friends/requests/${row.id}/accept`, { cookie: cookieJ })).status, 200);
    assert.equal(await friendshipCount(minsu, jiyu), 1);
    assert.ok((await friendIds(call, cookieM)).includes(jiyu));
    assert.ok((await friendIds(call, cookieJ)).includes(minsu));
});

test('A13-B-547 친구 아닌 사람 끊기 → 404 "친구가 아닌 사용자입니다.", 사건 0', async (t) => {
    if (noDb(t)) return;
    const { call, hub, cookieM } = await setup(t);
    const stranger = await createUser('st');
    hub.listen(stranger);
    const res = await unfriend(call, cookieM, stranger);
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '친구가 아닌 사용자입니다.');
    assert.deepEqual(reasons(hub, stranger), []);
});

test('A13-B-548 끊은 친구 또 끊기 → 404 "친구가 아닌 사용자입니다.", 사건은 처음 1번뿐', async (t) => {
    if (noDb(t)) return;
    const { call, hub, jiyu, cookieM } = await setup(t);
    assert.equal((await unfriend(call, cookieM, jiyu)).status, 200);
    const res = await unfriend(call, cookieM, jiyu);
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '친구가 아닌 사용자입니다.');
    assert.deepEqual(reasons(hub, jiyu), ['UNFRIENDED']);
});

test('A13-B-549 같은 끊기를 동시에 두 번 → 하나 200·하나 404, 줄 0', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    const answers = await Promise.all([1, 2].map(() => unfriend(call, cookieM, jiyu)));
    assert.deepEqual(answers.map((a) => a.status).sort(), [200, 404]);
    assert.equal(await friendshipCount(minsu, jiyu), 0);
});

test('A13-B-550 두 사람이 동시에 서로 끊기 → 하나 200·하나 404, 줄 0', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ } = await setup(t);
    const answers = await Promise.all([unfriend(call, cookieM, jiyu), unfriend(call, cookieJ, minsu)]);
    assert.deepEqual(answers.map((a) => a.status).sort(), [200, 404]);
    assert.equal(await friendshipCount(minsu, jiyu), 0);
});

test('A13-B-551 정원 6 · 지금 3명: 끊으면 둘 사이 기다리는 게임 초대 둘 CANCELLED·end_reason UNFRIENDED(답 cancelledInvites에 번호), 끝난 EXPIRED는 그대로', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    const out = await insertInvite(minsu, jiyu);
    const back = await insertInvite(jiyu, minsu);
    const old = await insertInvite(minsu, jiyu, { status: 'EXPIRED', end_reason: 'EXPIRED' });
    const res = await unfriend(call, cookieM, jiyu);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual([...res.body.data.cancelledInvites].sort(), [out.id, back.id].sort());
    for (const row of [out, back]) {
        const after = await db.GameInvite.findByPk(row.id, { raw: true });
        assert.equal(after.status, 'CANCELLED');
        assert.equal(after.end_reason, 'UNFRIENDED');
    }
    const expired = await db.GameInvite.findByPk(old.id, { raw: true });
    assert.equal(expired.status, 'EXPIRED');
    assert.equal(expired.end_reason, 'EXPIRED');
});

test('A13-B-552 차단해 목록에서 숨은 친구도 끊을 수 있음 → 200, 차단 줄 그대로, 차단을 풀어도 친구 목록에 없음', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    await block(minsu, jiyu);
    assert.equal((await unfriend(call, cookieM, jiyu)).status, 200);
    assert.equal(await db.FriendBlock.count({ where: { owner_id: minsu, blocked_id: jiyu } }), 1);
    assert.equal((await call('DELETE', `/friends/blocks/${jiyu}`, { cookie: cookieM })).status, 200);
    assert.equal((await friendIds(call, cookieM)).includes(jiyu), false);
});

test('A13-B-553 정지된 친구도 끊을 수 있음 → 200, 0줄', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    await db.User.update({ status: 'SUSPENDED' }, { where: { uuid: jiyu } });
    assert.equal((await unfriend(call, cookieM, jiyu)).status, 200);
    assert.equal(await friendshipCount(minsu, jiyu), 0);
});

test('A13-B-554 탈퇴한 친구는 친구 줄이 이미 지워짐 → 끊기 404 "친구가 아닌 사용자입니다."', async (t) => {
    if (noDb(t)) return;
    const call = await W.startServer(t);
    const minsu = await createUser('ms');
    const leaver = await createUser('lv', { withPassword: true });
    await befriend(minsu, leaver);
    assert.equal((await withdrawAccount({ uuid: leaver, password: TEST_PASSWORD })).ok, true);
    const res = await unfriend(call, await login(minsu), leaver);
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '친구가 아닌 사용자입니다.');
});

test('A13-B-555 끊은 뒤 즐겨찾기 켜기 → 404 "친구가 아닌 사용자는 즐겨찾기할 수 없습니다."', async (t) => {
    if (noDb(t)) return;
    const { call, jiyu, cookieM } = await setup(t);
    assert.equal((await unfriend(call, cookieM, jiyu)).status, 200);
    const res = await call('PUT', `/friends/favorites/${jiyu}`, { cookie: cookieM, body: { favorite: true } });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '친구가 아닌 사용자는 즐겨찾기할 수 없습니다.');
});

test('A13-B-556 끊은 뒤 친구 찾기에 지유가 다시 나옴 (친구일 땐 안 나옴)', async (t) => {
    if (noDb(t)) return;
    const { call, jiyu, cookieM } = await setup(t);
    const q = encodeURIComponent(await nicknameOf(jiyu));
    const found = async () => (await call('GET', `/friends/search?q=${q}`, { cookie: cookieM })).body.data.map((u) => u.id);
    assert.equal((await found()).includes(jiyu), false);
    assert.equal((await unfriend(call, cookieM, jiyu)).status, 200);
    assert.equal((await found()).includes(jiyu), true);
});

test('A13-B-557 끊기와 지유의 신청 수락이 겹쳐도(끊은 직후 옛 신청 수락 시도) 끝난 신청이라 409, 친구 줄 0', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM, cookieJ } = await setup(t);
    // 친구가 될 때 쓴 옛 신청 줄 (이미 ACCEPTED)
    const old = await db.FriendRequest.create({ requester_id: minsu, receiver_id: jiyu, status: 'ACCEPTED', responded_at: new Date() });
    assert.equal((await unfriend(call, cookieM, jiyu)).status, 200);
    const res = await call('PUT', `/friends/requests/${old.id}/accept`, { cookie: cookieJ });
    assert.equal(res.status, 409);
    assert.equal(await friendshipCount(minsu, jiyu), 0);
});
