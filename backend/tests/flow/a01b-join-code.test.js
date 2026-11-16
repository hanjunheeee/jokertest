'use strict';

// 방 코드로 들어오기 흐름 시험 — 정원마다 마지막 자리·명단 순서·빈 코드·없는 코드·시작된 방·끝난 방·가득 참·다른 방·판 중·쫓겨난 횟수·탈주·처리 중·시도 횟수
// 목록 A01-B-531~560 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "방 코드로 들어오기"), 돌리기: node --env-file=.env.test --test tests/flow/a01b-join-code.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, MSG, kickTimes, assertFailed } = require('./a01b-world');
const byId = require('../../game-core/queries/byId');

// A01-B-531~536 정원마다 정원−1명 방에 코드 입장 → 마지막 자리
for (const [no, max] of [['A01-B-531', 5], ['A01-B-532', 6], ['A01-B-533', 7], ['A01-B-534', 8], ['A01-B-535', 9], ['A01-B-536', 10]]) {
    test(`${no} 정원 ${max} · 지금 ${max - 1}명 방에 코드 입장 → 나에게 room_joined, 나 뺀 전원 player_joined_room(준비 안 됨), 명단 ${max}`, async (t) => {
        const w = makeWorld(t);
        const [host, ...guests] = w.names(`j${max}`, max - 1);
        const room = await w.openRoom({ host, guests, maxPlayers: max });
        const before = new Map(room.uuids.map((u) => [u, w.count(u, 'player_joined_room')]));
        w.connect('newbie');
        await w.joinByCode('newbie', room.roomCode);

        const joined = w.lastJoined('newbie');
        assert.equal(joined?.roomId, room.roomId);
        assert.equal(joined.players.length, max);
        for (const uuid of room.uuids) {
            assert.equal(w.count(uuid, 'player_joined_room') - before.get(uuid), 1, uuid);
            const got = w.last(uuid, 'player_joined_room');
            assert.equal(got.player.uuid, 'newbie');
            assert.equal(got.player.isReady, false);
        }
        assert.equal(w.count('newbie', 'player_joined_room'), 0);
        assert.equal((await w.roster(host)).length, max);
    });
}

test('A01-B-537 정원 7 · 지금 3명 방에 코드 입장 → room_joined 명단 4번째가 나', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b537-a', guests: ['b537-b', 'b537-c'], maxPlayers: 7 });
    w.connect('b537-d');
    await w.joinByCode('b537-d', room.roomCode);
    assert.deepEqual(w.lastJoined('b537-d').players.map((p) => p.uuid), ['b537-a', 'b537-b', 'b537-c', 'b537-d']);
});

// A01-B-538~539 빈 코드
for (const [no, code, label] of [['A01-B-538', '', "''"], ['A01-B-539', '   ', "'   '"]]) {
    test(`${no} 코드 ${label} → CODE_REQUIRED "${MSG.CODE_REQUIRED}", 명단 그대로`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ host: `${no}-h`, guests: [`${no}-g`], maxPlayers: 6 });
        w.connect('x');
        await w.joinByCode('x', code);
        assertFailed(w, 'x', 'CODE_REQUIRED', MSG.CODE_REQUIRED);
        assert.deepEqual(await w.roster(room.host), room.uuids);
    });
}

test('A01-B-540 아무 방에도 없는 코드 → ROOM_CODE_MISMATCH "입장 코드와 일치하는 방이 없습니다."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b540-h', maxPlayers: 6 });
    w.connect('x');
    // 있는 방 코드와 다른 6자리
    const other = room.roomCode === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    await w.joinByCode('x', other);
    assertFailed(w, 'x', 'ROOM_CODE_MISMATCH', MSG.ROOM_CODE_MISMATCH);
});

test('A01-B-541 판 6명 진행 중인 방 코드 → ROOM_ALREADY_STARTED "이미 게임이 시작된 방입니다.", 판 명단 그대로', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b541-0', guests: w.names('b541', 6).slice(1), maxPlayers: 6 });
    await w.startRoom(room);
    // 판 낮으로
    const session = byId.getSessionById(byId.getPlayerGameId(room.host));
    w.gf.toDay(session);
    w.connect('x');
    await w.joinByCode('x', room.roomCode);
    assertFailed(w, 'x', 'ROOM_ALREADY_STARTED', MSG.ROOM_ALREADY_STARTED);
    assert.equal(w.count('x', 'room_joined'), 0);
    assert.deepEqual([...session.players.keys()].sort(), [...room.uuids].sort());
});

// 다시 연 방까지 없어지면 "시작된 방" 표시도 지워져 있어 없는 코드와 같은 답 (join/startedMarks.js 주석대로, 모음 글 "목록을 지금 값으로")
test('A01-B-542 판 5명 끝 + 180초 동안 아무도 "대기방으로"를 안 눌러 다시 연 방도 없어짐 → 그 코드 ROOM_CODE_MISMATCH "입장 코드와 일치하는 방이 없습니다."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b542-0', guests: w.names('b542', 5).slice(1), maxPlayers: 5 });
    await w.startRoom(room);
    const session = byId.getSessionById(byId.getPlayerGameId(room.host));
    w.gf.toDay(session);
    // 광대가 판에서 나감 → 광대 0 → 시민 승, 판 끝
    const joker = w.gf.firstOf(session, 'JOKER');
    const left = await w.leaveGame(joker, session.id);
    assert.equal(left.ok, true, `판 나가기 실패: ${left.code}`);
    assert.equal(session.phase, 'ENDED');
    // 결과 화면 180초 (1초씩, 시각 경계 넘김)
    for (let i = 0; i < 181; i += 1) w.tick(1_000);
    await w.flush();
    w.connect('x');
    await w.joinByCode('x', room.roomCode);
    assertFailed(w, 'x', 'ROOM_CODE_MISMATCH', MSG.ROOM_CODE_MISMATCH);
});

// A01-B-543~548 가득 찬 방
for (const [no, max] of [['A01-B-543', 5], ['A01-B-544', 6], ['A01-B-545', 7], ['A01-B-546', 8], ['A01-B-547', 9], ['A01-B-548', 10]]) {
    test(`${no} 정원 ${max} 꽉 찬 방에 코드 입장 → ROOM_FULL "${MSG.ROOM_FULL}", 명단 그대로, 방 사람 알림 0번`, async (t) => {
        const w = makeWorld(t);
        const [host, ...guests] = w.names(`f${max}`, max);
        const room = await w.openRoom({ host, guests, maxPlayers: max });
        const before = room.uuids.map((u) => w.sock(u).received.length);
        w.connect('x');
        await w.joinByCode('x', room.roomCode);
        assertFailed(w, 'x', 'ROOM_FULL', MSG.ROOM_FULL);
        // 방 사람이 받은 알림 수 그대로 (공개 목록 알림 포함 0번)
        room.uuids.forEach((u, i) => assert.equal(w.sock(u).received.length, before[i], u));
        assert.deepEqual(await w.roster(host), room.uuids);
    });
}

test('A01-B-549 정원 8 · 지금 7명, 친구가 초대 수락 처리 중(자리 잡음)일 때 다른 사람 코드 입장 → ROOM_FULL, 초대한 친구는 들어감', async (t) => {
    const w = makeWorld(t);
    const [host, ...guests] = w.names('b549', 7);
    const room = await w.openRoom({ host, guests, maxPlayers: 8 });
    w.connect('friend');
    const inviteId = await w.invite(host, 'friend');
    // 수락 기록 단계에서 멈춤 (자리는 이미 잡음)
    const gate = w.gates.pause('decision');
    const answer = w.sendLater('friend', 'accept_game_invite', { inviteId });
    await gate.reached;
    w.connect('x');
    await w.joinByCode('x', room.roomCode);
    assertFailed(w, 'x', 'ROOM_FULL', MSG.ROOM_FULL);
    gate.release();
    const reply = await answer;
    assert.equal(reply.ok, true, `수락 실패: ${reply.code}`);
    await w.flush();
    assert.deepEqual(await w.roster(host), [...room.uuids, 'friend']);
});

test('A01-B-550 정원 5 · 지금 4명 마지막 한 자리에 두 사람이 같은 틱에 코드 입장 → 한 명만 room_joined, 다른 한 명 ROOM_FULL, 명단 5', async (t) => {
    const w = makeWorld(t);
    const [host, ...guests] = w.names('b550', 4);
    const room = await w.openRoom({ host, guests, maxPlayers: 5 });
    w.connect('p');
    w.connect('q');
    // 둘 다 답을 안 기다리고 같은 틱에 보냄
    w.sock('p').trigger('join_room_by_code', { roomCode: room.roomCode });
    w.sock('q').trigger('join_room_by_code', { roomCode: room.roomCode });
    await w.flush();
    const joined = ['p', 'q'].filter((u) => w.count(u, 'room_joined') === 1);
    const full = ['p', 'q'].filter((u) => w.lastFailed(u)?.code === 'ROOM_FULL');
    assert.equal(joined.length, 1);
    assert.equal(full.length, 1);
    assert.equal((await w.roster(host)).length, 5);
});

test('A01-B-551 정원 6 두 방, A방 손님이 B방 코드 입장 → ALREADY_IN_ROOM "이미 참여 중인 방이 있습니다.", A방 자리 그대로', async (t) => {
    const w = makeWorld(t);
    const a = await w.openRoom({ host: 'b551-ah', guests: ['b551-ag'], maxPlayers: 6 });
    const b = await w.openRoom({ host: 'b551-bh', maxPlayers: 6 });
    await w.joinByCode('b551-ag', b.roomCode);
    assertFailed(w, 'b551-ag', 'ALREADY_IN_ROOM', MSG.ALREADY_IN_ROOM);
    assert.deepEqual(await w.roster(a.host), a.uuids);
    assert.deepEqual(await w.roster(b.host), b.uuids);
});

test('A01-B-552 판 7명 중인 산 사람이 대기방 코드 입장 → ALREADY_IN_GAME + gameId', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b552-h', maxPlayers: 6 });
    const session = w.seedGame({ id: 'b552', n: 7 });
    const player = [...session.players.keys()][2];
    await w.joinByCode(player, room.roomCode);
    const failed = assertFailed(w, player, 'ALREADY_IN_GAME', MSG.ALREADY_IN_GAME);
    assert.equal(failed.gameId, session.id);
});

test('A01-B-553 판 8명에서 밤에 죽고 판을 나간 사람이 다른 대기방 코드 입장 → room_joined', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b553-h', maxPlayers: 6 });
    const session = w.seedGame({ id: 'b553', n: 8 });
    w.gf.toDay(session);
    w.gf.toNight(session);
    const joker = w.gf.firstOf(session, 'JOKER');
    const victim = w.gf.nonJokers(session)[0];
    w.killAtNight(session, joker, victim);
    const left = await w.leaveGame(victim, session.id);
    assert.equal(left.ok, true, `판 나가기 실패: ${left.code}`);
    await w.joinByCode(victim, room.roomCode);
    assert.equal(w.lastJoined(victim)?.roomId, room.roomId, JSON.stringify(w.lastFailed(victim)));
});

test('A01-B-554 정원 6, 그 방에서 3번 쫓겨난 사람이 코드 입장 → KICKED_TOO_MANY_TIMES "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b554-h', guests: ['b554-g', 'b554-x'], maxPlayers: 6 });
    await kickTimes(w, room, 'b554-x', 3);
    await w.joinByCode('b554-x', room.roomCode);
    assertFailed(w, 'b554-x', 'KICKED_TOO_MANY_TIMES', MSG.KICKED_TOO_MANY_TIMES);
});

test('A01-B-555 정원 6, 2번 쫓겨난 사람이 코드 입장 → room_joined', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b555-h', guests: ['b555-x'], maxPlayers: 6 });
    await kickTimes(w, room, 'b555-x', 2);
    const joinedBefore = w.count('b555-x', 'room_joined');
    await w.joinByCode('b555-x', room.roomCode);
    assert.equal(w.count('b555-x', 'room_joined'), joinedBefore + 1, JSON.stringify(w.lastFailed('b555-x')));
    assert.equal(w.lastJoined('b555-x').roomId, room.roomId);
});

test('A01-B-556 정원 5 두 방, A방에서 3번 쫓겨난 사람이 B방 코드 입장 → room_joined', async (t) => {
    const w = makeWorld(t);
    const a = await w.openRoom({ host: 'b556-ah', guests: ['b556-x'], maxPlayers: 5 });
    const b = await w.openRoom({ host: 'b556-bh', maxPlayers: 5 });
    await kickTimes(w, a, 'b556-x', 3);
    await w.joinByCode('b556-x', b.roomCode);
    assert.equal(w.lastJoined('b556-x')?.roomId, b.roomId, JSON.stringify(w.lastFailed('b556-x')));
});

test('A01-B-557 정원 7, 탈주 대기 남은 299초인 사람 코드 입장 → DESERTION_COOLDOWN "탈주로 4분 59초 뒤에 참여할 수 있습니다." + retryAfterMs 299000 근처, 명단 그대로', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b557-h', guests: ['b557-g'], maxPlayers: 7 });
    w.connect('x');
    await w.desert('x', 299_000);
    await w.joinByCode('x', room.roomCode);
    const failed = assertFailed(w, 'x', 'DESERTION_COOLDOWN', '탈주로 4분 59초 뒤에 참여할 수 있습니다.');
    assert.ok(Math.abs(failed.retryAfterMs - 299_000) <= 1_000, `retryAfterMs ${failed.retryAfterMs}`);
    assert.deepEqual(await w.roster(room.host), room.uuids);
});

test('A01-B-558 정원 6, 방 만들기 처리 중(아직 답 전)에 코드 입장 → REQUEST_IN_PROGRESS "이미 처리 중인 요청이 있습니다."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b558-h', maxPlayers: 6 });
    w.connect('x');
    // 방 만들기가 계정 읽기에서 멈춤 (답 전)
    const gate = w.gates.pause('user:x');
    const creating = w.sendLater('x', 'create_room', { accessType: 'code', maxPlayers: 6, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60 });
    await gate.reached;
    await w.joinByCode('x', room.roomCode);
    assertFailed(w, 'x', 'REQUEST_IN_PROGRESS', MSG.REQUEST_IN_PROGRESS);
    gate.release();
    await creating;
});

test('A01-B-559 정원 6, 1분 안 20번 시도 뒤 맞는 코드 → TOO_MANY_JOIN_ATTEMPTS "입장 시도가 너무 많습니다. 잠시 후 다시 시도해주세요."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b559-h', maxPlayers: 6 });
    w.connect('x');
    const wrong = room.roomCode === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    for (let i = 0; i < 20; i += 1) await w.joinByCode('x', wrong);
    await w.joinByCode('x', room.roomCode);
    assertFailed(w, 'x', 'TOO_MANY_JOIN_ATTEMPTS', MSG.TOO_MANY_JOIN_ATTEMPTS);
    assert.equal(w.count('x', 'room_joined'), 0);
});

test('A01-B-560 정원 6, 틀린 코드 20번 뒤 맞는 코드 → 거절, 가짜 시계 60초 뒤 맞는 코드 → room_joined', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b560-h', maxPlayers: 6 });
    w.connect('x');
    const wrong = room.roomCode === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    for (let i = 0; i < 20; i += 1) await w.joinByCode('x', wrong);
    await w.joinByCode('x', room.roomCode);
    assertFailed(w, 'x', 'TOO_MANY_JOIN_ATTEMPTS');
    w.tick(60_000);
    await w.joinByCode('x', room.roomCode);
    assert.equal(w.lastJoined('x')?.roomId, room.roomId, JSON.stringify(w.lastFailed('x')));
});
