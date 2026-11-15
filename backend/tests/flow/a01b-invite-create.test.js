'use strict';

// 초대 만들기 요청 시험 (HTTP 컨트롤러 길) — 가득 찬 방·대기방 없음·받는 사람이 판·다른 방·입장 처리 중·판에서 죽고 나감·자기 자신·같은 친구 다시
// 목록 A01-B-601~608 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "친구 초대로 들어오기"), 돌리기: node --env-file=.env.test --test tests/flow/a01b-invite-create.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a01b-world');

const CANNOT_INVITE = '지금은 상대를 초대할 수 없습니다.';

test('A01-B-601 정원 5 꽉 찬 방에서 초대 만들기 → 409 "방이 가득 차 초대를 보낼 수 없습니다."', async (t) => {
    const w = makeWorld(t);
    const [host, ...guests] = w.names('b601', 5);
    await w.openRoom({ host, guests, maxPlayers: 5 });
    w.connect('friend');
    w.store.befriend(host, 'friend');
    const made = await w.createInvite(host, 'friend');
    assert.equal(made.status, 409);
    assert.equal(made.error.message, '방이 가득 차 초대를 보낼 수 없습니다.');
    assert.equal(w.count('friend', 'game_invite_received'), 0);
});

test('A01-B-602 대기방 없는 사람이 초대 → 409 "초대를 보낼 대기방이 없습니다."', async (t) => {
    const w = makeWorld(t);
    w.connect('lonely');
    w.connect('friend');
    w.store.befriend('lonely', 'friend');
    const made = await w.createInvite('lonely', 'friend');
    assert.equal(made.status, 409);
    assert.equal(made.error.message, '초대를 보낼 대기방이 없습니다.');
});

test('A01-B-603 받는 사람이 판 7명 중 → 409 "지금은 상대를 초대할 수 없습니다." 코드 RECEIVER_IN_GAME', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b603-h', maxPlayers: 6 });
    const session = w.seedGame({ id: 'b603', n: 7 });
    const friend = [...session.players.keys()][3];
    w.store.befriend(room.host, friend);
    const made = await w.createInvite(room.host, friend);
    assert.equal(made.status, 409);
    assert.equal(made.error.message, CANNOT_INVITE);
    assert.equal(made.error.code, 'RECEIVER_IN_GAME');
});

test('A01-B-604 받는 사람이 다른 대기방 → 409 코드 RECEIVER_IN_ROOM', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b604-h', maxPlayers: 6 });
    await w.openRoom({ host: 'b604-oh', guests: ['friend'], maxPlayers: 6 });
    w.store.befriend(room.host, 'friend');
    const made = await w.createInvite(room.host, 'friend');
    assert.equal(made.status, 409);
    assert.equal(made.error.code, 'RECEIVER_IN_ROOM');
});

test('A01-B-605 받는 사람이 입장 처리 중(방 만들기 답 전) → 409 코드 RECEIVER_TRANSITIONING', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b605-h', maxPlayers: 6 });
    w.connect('friend');
    w.store.befriend(room.host, 'friend');
    const gate = w.gates.pause('user:friend');
    const creating = w.sendLater('friend', 'create_room', { accessType: 'code', maxPlayers: 6, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60 });
    await gate.reached;
    const made = await w.createInvite(room.host, 'friend');
    assert.equal(made.status, 409);
    assert.equal(made.error.code, 'RECEIVER_TRANSITIONING');
    gate.release();
    await creating;
});

test('A01-B-606 받는 사람이 판 8명에서 죽고 나감 → 초대 만들어짐', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b606-h', maxPlayers: 6 });
    const session = w.seedGame({ id: 'b606', n: 8 });
    w.gf.toDay(session);
    w.gf.toNight(session);
    const joker = w.gf.firstOf(session, 'JOKER');
    const victim = w.gf.nonJokers(session)[0];
    w.killAtNight(session, joker, victim);
    const left = await w.leaveGame(victim, session.id);
    assert.equal(left.ok, true, `판 나가기 실패: ${left.code}`);
    w.store.befriend(room.host, victim);
    const made = await w.createInvite(room.host, victim);
    assert.equal(made.status, 201, made.error?.message);
    assert.equal(made.invite.status, 'PENDING');
});

test('A01-B-607 자기 자신 초대 → 400 "자기 자신을 초대할 수 없습니다."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b607-h', maxPlayers: 6 });
    const made = await w.createInvite(room.host, room.host);
    assert.equal(made.status, 400);
    assert.equal(made.error.message, '자기 자신을 초대할 수 없습니다.');
});

test('A01-B-608 정원 6, 대기 초대가 살아 있는데 같은 방·같은 친구 다시 초대 → 같은 초대 그대로, 받는 사람 알림 1번', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b608-h', maxPlayers: 6 });
    w.connect('friend');
    w.store.befriend(room.host, 'friend');
    const first = await w.createInvite(room.host, 'friend');
    assert.equal(first.status, 201, first.error?.message);
    w.tick(30_000);
    const second = await w.createInvite(room.host, 'friend');
    assert.ok(second.invite, second.error?.message);
    assert.equal(second.invite.inviteId, first.invite.inviteId);
    assert.equal(w.count('friend', 'game_invite_received'), 1);
});
