'use strict';

// 공개 목록으로 들어오기 흐름 시험 — 목록에 공개·코드 방, 고르면 들어감, 코드 방·없는 방·시작된 방·가득 참·다른 방·판 중·쫓겨남·탈주·요청 모양·고른 사이 바뀜·시도 횟수·목록 인원
// 목록 A01-B-561~580 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "공개 목록으로 들어오기"), 돌리기: node --env-file=.env.test --test tests/flow/a01b-join-public.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, MSG, kickTimes, assertFailed } = require('./a01b-world');
const byId = require('../../game-core/queries/byId');

const NOT_FOUND = '공개 방을 찾을 수 없습니다.';

test('A01-B-561 정원 5 공개 방 · 정원 10 코드 방 → get_public_rooms 두 방 다 목록에, 공개 방식 open·code', async (t) => {
    const w = makeWorld(t);
    const open = await w.openRoom({ host: 'b561-o', maxPlayers: 5, accessType: 'open' });
    const code = await w.openRoom({ host: 'b561-c', maxPlayers: 10, accessType: 'code' });
    w.connect('x');
    const reply = await w.send('x', 'get_public_rooms', {});
    assert.equal(reply.ok, true);
    const byRoom = new Map(reply.rooms.map((r) => [r.id, r]));
    assert.equal(byRoom.get(open.roomId)?.accessType, 'open');
    assert.equal(byRoom.get(code.roomId)?.accessType, 'code');
});

test('A01-B-562 정원 6 · 지금 3명 공개 방 join_public_room → room_joined, 방 사람에게 player_joined_room 준비 안 됨', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b562-h', guests: ['b562-a', 'b562-b'], maxPlayers: 6, accessType: 'open' });
    w.connect('x');
    await w.joinPublic('x', room.roomId);
    assert.equal(w.lastJoined('x')?.roomId, room.roomId, JSON.stringify(w.lastFailed('x')));
    for (const uuid of room.uuids) {
        const got = w.last(uuid, 'player_joined_room');
        assert.equal(got?.player.uuid, 'x', uuid);
        assert.equal(got.player.isReady, false);
    }
});

test('A01-B-563 정원 8 코드 방 roomId로 join_public_room → ROOM_CODE_MISMATCH "이 방은 입장 코드가 필요합니다."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b563-h', maxPlayers: 8, accessType: 'code' });
    w.connect('x');
    await w.joinPublic('x', room.roomId);
    assertFailed(w, 'x', 'ROOM_CODE_MISMATCH', '이 방은 입장 코드가 필요합니다.');
    assert.equal(w.count('x', 'room_joined'), 0);
});

test('A01-B-564 없는 roomId → ROOM_NOT_FOUND "공개 방을 찾을 수 없습니다."', async (t) => {
    const w = makeWorld(t);
    await w.openRoom({ host: 'b564-h', maxPlayers: 6, accessType: 'open' });
    w.connect('x');
    await w.joinPublic('x', 'no-such-room');
    assertFailed(w, 'x', 'ROOM_NOT_FOUND', NOT_FOUND);
});

test('A01-B-565 판 5명 진행 중인 방 roomId → ROOM_ALREADY_STARTED', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b565-0', guests: w.names('b565', 5).slice(1), maxPlayers: 5, accessType: 'open' });
    await w.startRoom(room);
    w.gf.toDay(byId.getSessionById(byId.getPlayerGameId(room.host)));
    w.connect('x');
    await w.joinPublic('x', room.roomId);
    assertFailed(w, 'x', 'ROOM_ALREADY_STARTED', MSG.ROOM_ALREADY_STARTED);
});

test('A01-B-566 정원 7 꽉 찬 공개 방 → ROOM_FULL "방이 가득 찼습니다."', async (t) => {
    const w = makeWorld(t);
    const [host, ...guests] = w.names('b566', 7);
    const room = await w.openRoom({ host, guests, maxPlayers: 7, accessType: 'open' });
    w.connect('x');
    await w.joinPublic('x', room.roomId);
    assertFailed(w, 'x', 'ROOM_FULL', MSG.ROOM_FULL);
    assert.deepEqual(await w.roster(host), room.uuids);
});

test('A01-B-567 다른 대기방에 있는 사람이 공개 방 입장 → ALREADY_IN_ROOM', async (t) => {
    const w = makeWorld(t);
    const mine = await w.openRoom({ host: 'b567-mh', guests: ['b567-me'], maxPlayers: 6 });
    const room = await w.openRoom({ host: 'b567-h', maxPlayers: 6, accessType: 'open' });
    await w.joinPublic('b567-me', room.roomId);
    assertFailed(w, 'b567-me', 'ALREADY_IN_ROOM', MSG.ALREADY_IN_ROOM);
    assert.deepEqual(await w.roster(mine.host), mine.uuids);
});

test('A01-B-568 판 6명 중인 사람 → ALREADY_IN_GAME + gameId (요청 모양 검사보다 먼저, 모양 틀린 요청에도)', async (t) => {
    const w = makeWorld(t);
    await w.openRoom({ host: 'b568-h', maxPlayers: 6, accessType: 'open' });
    const session = w.seedGame({ id: 'b568', n: 6 });
    const player = [...session.players.keys()][1];
    await w.send(player, 'join_public_room', null);
    const failed = assertFailed(w, player, 'ALREADY_IN_GAME', MSG.ALREADY_IN_GAME);
    assert.equal(failed.gameId, session.id);
});

test('A01-B-569 정원 9 공개 방에서 3번 쫓겨난 사람 → KICKED_TOO_MANY_TIMES', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b569-h', guests: ['b569-x'], maxPlayers: 9, accessType: 'open' });
    await kickTimes(w, room, 'b569-x', 3);
    await w.joinPublic('b569-x', room.roomId);
    assertFailed(w, 'b569-x', 'KICKED_TOO_MANY_TIMES', MSG.KICKED_TOO_MANY_TIMES);
});

test('A01-B-570 정원 5, 탈주 대기 중 공개 방 입장 → DESERTION_COOLDOWN + 탈주 글 + retryAfterMs', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b570-h', maxPlayers: 5, accessType: 'open' });
    w.connect('x');
    await w.desert('x', 120_000);
    await w.joinPublic('x', room.roomId);
    const failed = assertFailed(w, 'x', 'DESERTION_COOLDOWN', '탈주로 2분 0초 뒤에 참여할 수 있습니다.');
    assert.ok(Math.abs(failed.retryAfterMs - 120_000) <= 1_000, `retryAfterMs ${failed.retryAfterMs}`);
    assert.deepEqual(await w.roster(room.host), room.uuids);
});

// A01-B-571~573 공개 입장 요청 모양
for (const [no, label, payload] of [['A01-B-571', 'null', null], ['A01-B-572', '배열', []], ['A01-B-573', "{ roomId: '' }", { roomId: '' }]]) {
    test(`${no} 공개 입장 보내는 값 ${label} → INVALID_REQUEST "잘못된 요청입니다."`, async (t) => {
        const w = makeWorld(t);
        await w.openRoom({ host: `${no}-h`, maxPlayers: 6, accessType: 'open' });
        w.connect('x');
        await w.send('x', 'join_public_room', payload);
        assertFailed(w, 'x', 'INVALID_REQUEST', '잘못된 요청입니다.');
    });
}

test('A01-B-574 정원 6, 공개 입장 처리 중 방장이 공개 방식을 code로 저장 → "공개 방을 찾을 수 없습니다.", 명단에 안 들어감', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b574-h', guests: ['b574-g'], maxPlayers: 6, accessType: 'open' });
    w.connect('x');
    // 입장이 계정 읽기에서 멈춤 (방 고른 뒤)
    const gate = w.gates.pause('user:x');
    w.sock('x').trigger('join_public_room', { roomId: room.roomId });
    await gate.reached;
    const saved = await w.saveSettings(room.host, { accessType: 'code' });
    assert.equal(saved.ok, true, `설정 저장 실패: ${saved.message}`);
    gate.release();
    await w.flush();
    const failed = w.lastFailed('x');
    assert.equal(failed?.message, NOT_FOUND);
    assert.equal(w.count('x', 'room_joined'), 0);
    assert.deepEqual(await w.roster(room.host), room.uuids);
});

test('A01-B-575 정원 6, 1분 안 코드 입장 20번 뒤 공개 입장 → TOO_MANY_JOIN_ATTEMPTS', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b575-h', maxPlayers: 6, accessType: 'open' });
    w.connect('x');
    const wrong = room.roomCode === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    for (let i = 0; i < 20; i += 1) await w.joinByCode('x', wrong);
    await w.joinPublic('x', room.roomId);
    assertFailed(w, 'x', 'TOO_MANY_JOIN_ATTEMPTS', MSG.TOO_MANY_JOIN_ATTEMPTS);
});

test('A01-B-576 정원 8 · 지금 4명 공개 방에 공개 입장 → 접속자 전원 public_rooms_updated의 그 방 인원 5', async (t) => {
    const w = makeWorld(t);
    const [host, ...guests] = w.names('b576', 4);
    const room = await w.openRoom({ host, guests, maxPlayers: 8, accessType: 'open' });
    w.connect('watcher');
    w.connect('x');
    await w.joinPublic('x', room.roomId);
    w.tick(500);
    w.flushList();
    for (const uuid of [...room.uuids, 'watcher', 'x']) assert.equal(w.publicRoomOf(uuid, room.roomId)?.current, 5, uuid);
});

test('A01-B-577 정원 8 · 지금 5명, 손님 leave_room → 목록 인원 4', async (t) => {
    const w = makeWorld(t);
    const [host, ...guests] = w.names('b577', 5);
    const room = await w.openRoom({ host, guests, maxPlayers: 8, accessType: 'open' });
    w.connect('watcher');
    await w.leave(guests[0]);
    w.tick(500);
    w.flushList();
    assert.equal(w.publicRoomOf('watcher', room.roomId)?.current, 4);
});

test('A01-B-578 정원 5 · 지금 1명, 방장 leave_room → 목록에 그 방 없음', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b578-h', maxPlayers: 5, accessType: 'open' });
    w.connect('watcher');
    await w.leave(room.host);
    w.tick(500);
    w.flushList();
    const rooms = w.last('watcher', 'public_rooms_updated')?.rooms;
    assert.ok(Array.isArray(rooms), '목록 알림 없음');
    assert.equal(rooms.some((r) => r.id === room.roomId), false);
});

test('A01-B-579 정원 10 · 지금 6명, delete_room → 목록에 그 방 없음', async (t) => {
    const w = makeWorld(t);
    const [host, ...guests] = w.names('b579', 6);
    const room = await w.openRoom({ host, guests, maxPlayers: 10, accessType: 'open' });
    w.connect('watcher');
    const deleted = await w.send(host, 'delete_room', {});
    assert.equal(deleted.ok, true);
    w.tick(500);
    w.flushList();
    const rooms = w.last('watcher', 'public_rooms_updated')?.rooms;
    assert.ok(Array.isArray(rooms), '목록 알림 없음');
    assert.equal(rooms.some((r) => r.id === room.roomId), false);
});

test('A01-B-580 정원 10, 0.2초 사이 세 사람 입장 → 0.5초 안 public_rooms_updated 2번 이하, 마지막 알림 인원 = 실제 인원', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'b580-h', maxPlayers: 10, accessType: 'open' });
    w.connect('watcher');
    for (const u of ['p', 'q', 'r']) w.connect(u);
    // 앞 알림 간격 비우기
    w.tick(1_000);
    const before = w.count('watcher', 'public_rooms_updated');
    await w.joinPublic('p', room.roomId);
    w.tick(100);
    await w.joinPublic('q', room.roomId);
    w.tick(100);
    await w.joinPublic('r', room.roomId);
    w.tick(300);
    assert.ok(w.count('watcher', 'public_rooms_updated') - before <= 2, `알림 ${w.count('watcher', 'public_rooms_updated') - before}번`);
    assert.equal(w.publicRoomOf('watcher', room.roomId)?.current, (await w.roster(room.host)).length);
    assert.equal((await w.roster(room.host)).length, 4);
});
