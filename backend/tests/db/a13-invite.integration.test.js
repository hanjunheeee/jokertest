'use strict';

// 게임 초대 보내기 DB 시험 — 초대 알림 줄 모양, 받는 사람 사건 둘(소리 하나), 같은 만들기 키, 거절되면 알림·사건 없음, 두 방에서 같은 친구
// 목록 A13-B-348~356 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md)
// 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a13-invite.integration.test.js
const W = require('./a13-world'); // 맨 위, 모델보다 먼저 시험 DB 주소로
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { db, createUser, login, befriend, nicknameOf } = W;
const mf = require('../helpers/matchmakingFixtures');
const gameCore = require('../../game-core/gameSession');
const noDb = W.useTestDb(test);

const guestNames = (n) => Array.from({ length: n }, () => `a13-guest-${crypto.randomUUID().slice(0, 8)}`);

// 서버 + 대기방 세상 + 민수(방장, 정원 cap) · 친구 지유(방 밖, 접속)
async function setup(t, { cap = 6, guests = 1 } = {}) {
    const call = await W.startServer(t);
    const w = W.roomWorld(t);
    const minsu = await createUser('ms');
    const jiyu = await createUser('jy');
    await befriend(minsu, jiyu);
    const room = await w.openRoom(minsu, guestNames(guests), cap);
    w.connect(jiyu);
    return { call, w, minsu, jiyu, room, cookieM: await login(minsu) };
}
const sendInvite = (call, cookie, receiverId, creationKey = `k-${crypto.randomUUID()}`) =>
    call('POST', '/friends/invites', { cookie, body: { receiverId, creationKey } });
const notificationsOf = (uuid) => db.Notification.findAll({ where: { user_id: uuid }, raw: true });
const inviteRowsTo = (uuid) => db.GameInvite.findAll({ where: { receiver_id: uuid }, raw: true });
const targetOf = (row) => (typeof row.target === 'string' ? JSON.parse(row.target) : row.target);

test('A13-B-348 정원 6: 민수가 지유 초대 → 지유 알림 1줄 game-invite, 제목 "게임 초대", 본문 "민수 님이 대기방으로 초대했습니다.", target·source_key', async (t) => {
    if (noDb(t)) return;
    const { call, minsu, jiyu, cookieM } = await setup(t);
    const res = await sendInvite(call, cookieM, jiyu);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const inviteId = res.body.data.inviteId;
    const notes = await notificationsOf(jiyu);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].type, 'game-invite');
    assert.equal(notes[0].title, '게임 초대');
    assert.equal(notes[0].body, `${await nicknameOf(minsu)} 님이 대기방으로 초대했습니다.`);
    assert.deepEqual(targetOf(notes[0]), { kind: 'game-invite', inviteId });
    assert.equal(notes[0].source_key, `game-invite:${inviteId}:received`);
});

test('A13-B-349 정원 6: 초대 → 지유에게 game_invite_received 1번(효과음 id = 알림 출처 키) + notification_created 1번', async (t) => {
    if (noDb(t)) return;
    const { call, w, jiyu, cookieM } = await setup(t);
    assert.equal((await sendInvite(call, cookieM, jiyu)).status, 201);
    const received = w.events(jiyu, 'game_invite_received');
    const created = w.events(jiyu, 'notification_created');
    assert.equal(received.length, 1);
    assert.equal(created.length, 1);
    assert.equal(received[0].sfxEvent.eventId, created[0].notification.sourceKey);
});

test('A13-B-350 정원 6: 같은 만들기 키로 두 번 → 알림 1줄 그대로, 두 번째엔 사건 0번', async (t) => {
    if (noDb(t)) return;
    const { call, w, jiyu, cookieM } = await setup(t);
    const key = `k-${crypto.randomUUID()}`;
    assert.equal((await sendInvite(call, cookieM, jiyu, key)).status, 201);
    const before = { received: w.events(jiyu, 'game_invite_received').length, created: w.events(jiyu, 'notification_created').length };
    const second = await sendInvite(call, cookieM, jiyu, key);
    assert.ok(second.status < 400, JSON.stringify(second.body));
    assert.equal((await notificationsOf(jiyu)).length, 1);
    assert.equal(w.events(jiyu, 'game_invite_received').length, before.received);
    assert.equal(w.events(jiyu, 'notification_created').length, before.created);
});

// 거절되면 초대·알림·받는 사람 사건이 하나도 없어야 함
async function assertNothingFor(w, uuid) {
    assert.equal((await inviteRowsTo(uuid)).length, 0);
    assert.equal((await notificationsOf(uuid)).length, 0);
    assert.equal(w.events(uuid, 'game_invite_received').length, 0);
    assert.equal(w.events(uuid, 'notification_created').length, 0);
}

test('A13-B-351 받는 사람 정지 → 초대 0줄·알림 0줄·받는 사람 사건 0번', async (t) => {
    if (noDb(t)) return;
    const { call, w, jiyu, cookieM } = await setup(t);
    await db.User.update({ status: 'SUSPENDED' }, { where: { uuid: jiyu } });
    const res = await sendInvite(call, cookieM, jiyu);
    assert.ok(res.status >= 400, `초대가 만들어짐: ${res.status}`);
    await assertNothingFor(w, jiyu);
});

test('A13-B-352 받는 사람 판 중(6명 판) → 초대 0줄·알림 0줄·받는 사람 사건 0번', async (t) => {
    if (noDb(t)) return;
    const { call, w, jiyu, cookieM } = await setup(t);
    gameCore.__resetStateForTests();
    t.after(() => gameCore.__resetStateForTests());
    mf.seedActiveGameForAccount([jiyu, ...guestNames(5)], { roomId: `a13-game-${crypto.randomUUID().slice(0, 8)}` });
    const res = await sendInvite(call, cookieM, jiyu);
    assert.ok(res.status >= 400, `초대가 만들어짐: ${res.status}`);
    await assertNothingFor(w, jiyu);
});

test('A13-B-353 받는 사람 다른 대기방 → 초대 0줄·알림 0줄·받는 사람 사건 0번', async (t) => {
    if (noDb(t)) return;
    const { call, w, jiyu, cookieM } = await setup(t);
    const created = await w.send(jiyu, 'create_room', {
        accessType: 'code', maxPlayers: 6, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60,
    });
    assert.equal(created.ok, true);
    const res = await sendInvite(call, cookieM, jiyu);
    assert.ok(res.status >= 400, `초대가 만들어짐: ${res.status}`);
    await assertNothingFor(w, jiyu);
});

test('A13-B-354 보낸 사람 방 가득 참(정원 5 꽉 참) → 초대 0줄·알림 0줄·받는 사람 사건 0번', async (t) => {
    if (noDb(t)) return;
    const { call, w, jiyu, cookieM } = await setup(t, { cap: 5, guests: 4 });
    const res = await sendInvite(call, cookieM, jiyu);
    assert.ok(res.status >= 400, `초대가 만들어짐: ${res.status}`);
    await assertNothingFor(w, jiyu);
});

test('A13-B-355 정원 6: 키 K로 지유 초대 → 키 K로 하늘 초대 → 409 "같은 생성 키로 다른 초대를 보낼 수 없습니다.", 초대 1줄', async (t) => {
    if (noDb(t)) return;
    const { call, w, minsu, jiyu, cookieM } = await setup(t);
    const haneul = await createUser('hn');
    await befriend(minsu, haneul);
    w.connect(haneul);
    const key = `k-${crypto.randomUUID()}`;
    assert.equal((await sendInvite(call, cookieM, jiyu, key)).status, 201);
    const res = await sendInvite(call, cookieM, haneul, key);
    assert.equal(res.status, 409);
    assert.equal(res.body.message, '같은 생성 키로 다른 초대를 보낼 수 없습니다.');
    assert.equal(await db.GameInvite.count({ where: { sender_id: minsu } }), 1);
});

test('A13-B-356 민수 방(정원 6)·하늘 방(정원 8)에서 지유 초대 → 초대 2줄·알림 2줄, 지유 받은 목록 2개', async (t) => {
    if (noDb(t)) return;
    const { call, w, jiyu, cookieM } = await setup(t);
    const haneul = await createUser('hn');
    await befriend(haneul, jiyu);
    await w.openRoom(haneul, [], 8);
    assert.equal((await sendInvite(call, cookieM, jiyu)).status, 201);
    assert.equal((await sendInvite(call, await login(haneul), jiyu)).status, 201);
    assert.equal((await inviteRowsTo(jiyu)).length, 2);
    assert.equal((await notificationsOf(jiyu)).length, 2);
    const list = await call('GET', '/friends/invites', { cookie: await login(jiyu) });
    assert.equal(list.status, 200);
    assert.equal(list.body.data.invites.length, 2);
});
