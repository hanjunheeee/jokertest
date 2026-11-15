'use strict';

// 초대 받는 사람·보낸 사람 방 판정 흐름 시험 — 줄·입장 중·판 중·결과 화면·탈주 대기·로비, 방이 가득 찼나(남긴 방장 칸·입장 중 자리)
// 목록 A13-B-138~147 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --env-file=.env.test --test tests/flow/a13-invite-readers.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

// 대기방 → 시작 → 판 끝 → 대기방으로 세상은 A08 것을 읽기만 해서 씀
const { makeWorld, MM } = require('./a08-world');
const matchmaking = require('../../socket/matchmaking');
const { inviteRoomReaders } = require('../../socket/matchmaking/admission/inviteRoomReaders');
const { BOOT_EPOCH } = require('../../socket/matchmaking/core/constants');

const availability = (uuid) => inviteRoomReaders.describeReceiverAvailability(uuid);
// 그 사람이 있는 방의 초대 보내기 판정 (가득 찼나)
const roomOf = (uuid) => inviteRoomReaders.describeRoomForInvite(inviteRoomReaders.getRoomIdForUser(uuid));

// 판 끝 → 방장 빼고 count명 대기방으로
async function endedAndReturned(t, prefix, n, count, { maxPlayers = n } = {}) {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n, maxPlayers });
    await w.endGame(g);
    for (const uuid of g.uuids.slice(1, 1 + count)) {
        const r = await w.ret(uuid, g.gameId);
        assert.equal(r.ok, true, `${uuid} 대기방으로 실패: ${r.code}`);
    }
    return { w, g };
}

test('A13-B-138 받는 사람이 매칭 줄에 있음 → 못 받음 RECEIVER_IN_QUEUE', async (t) => {
    const w = makeWorld(t);
    w.connect('b138-r');
    matchmaking.__seedMatchmakingQueueForTests('b138-r', { uuid: 'b138-r', joinedAt: Date.now() });
    assert.deepEqual(availability('b138-r'), { available: false, code: 'RECEIVER_IN_QUEUE' });
});

test('A13-B-139 받는 사람이 다른 초대 수락 처리 중(정원 6) → 못 받음 RECEIVER_TRANSITIONING', async (t) => {
    const w = makeWorld(t);
    for (const uuid of ['b139-h', 'b139-r']) w.connect(uuid);
    const created = await w.createRoom('b139-h', w.roomPayload({ maxPlayers: 6 }));
    assert.equal(created.ok, true);
    const room = await w.currentRoom('b139-h');
    w.invites.set('inv-b139', { known: true, roomId: room.roomId, roomInstanceId: room.roomInstanceId, bootEpoch: BOOT_EPOCH });
    // 수락 기록에서 멈춰 있음 (입장 처리 중)
    void w.ask(MM.handleAcceptGameInvite, 'b139-r', { inviteId: 'inv-b139' });
    await w.flush();
    assert.equal(w.inviteGates.length, 1, '수락 처리가 시작 안 됨 (준비 잘못)');
    assert.deepEqual(availability('b139-r'), { available: false, code: 'RECEIVER_TRANSITIONING' });
});

test('A13-B-140 6명 판에서 산 채 나간 사람(탈주 대기 중) → 나간 직후 받을 수 있음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b140', n: 6 });
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    const x = g.uuids[1];
    assert.equal((await w.lobby(x, g.gameId)).ok, true);
    assert.equal(availability(x).available, true, `못 받음: ${availability(x).code}`);
});

test('A13-B-141 5명 판 끝 결과 화면에 있는 사람(끝난 지 30초) → 못 받음 RECEIVER_IN_GAME', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b141', n: 5 });
    await w.endGame(g);
    w.tickToSinceEnd(g, 30_000);
    assert.deepEqual(availability(g.uuids[1]), { available: false, code: 'RECEIVER_IN_GAME' });
});

test('A13-B-142 로비에만 있는 사람 → 받을 수 있음', async (t) => {
    const w = makeWorld(t);
    w.connect('b142-r');
    assert.deepEqual(availability('b142-r'), { available: true, code: null });
});

test('A13-B-143 7명 판 끊겨 60초 넘어 빠진 사람(탈주 대기 중) → 받을 수 있음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b143', n: 7 });
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    const x = g.uuids[1];
    await w.disconnect(x);
    w.tick(61_000);
    await w.flush();
    assert.equal(w.session(g).players.get(x).isParticipating, false, '60초 뒤에도 판에서 안 빠짐 (준비 잘못)');
    assert.equal(availability(x).available, true, `못 받음: ${availability(x).code}`);
});

test('A13-B-144 정원 6 · 명단 5 + 판 끝 뒤 남긴 방장 칸 → 가득', async (t) => {
    const { g } = await endedAndReturned(t, 'b144', 6, 5);
    assert.equal(roomOf(g.uuids[1]).isFull, true);
});

test('A13-B-145 정원 6 · 명단 4 + 방장 칸 → 안 가득', async (t) => {
    const { g } = await endedAndReturned(t, 'b145', 6, 4);
    assert.equal(roomOf(g.uuids[1]).isFull, false);
});

test('A13-B-146 정원 6 · 명단 5 + 초대 수락 처리 중 1 → 가득', async (t) => {
    const w = makeWorld(t);
    const people = ['b146-0', 'b146-1', 'b146-2', 'b146-3', 'b146-4'];
    for (const uuid of [...people, 'b146-f']) w.connect(uuid);
    const created = await w.createRoom(people[0], w.roomPayload({ maxPlayers: 6 }));
    assert.equal(created.ok, true);
    for (const uuid of people.slice(1)) assert.equal((await w.joinCode(uuid, created.room.roomCode)).ok, true);
    const room = await w.currentRoom(people[0]);
    assert.equal(room.players.length, 5);
    w.invites.set('inv-b146', { known: true, roomId: room.roomId, roomInstanceId: room.roomInstanceId, bootEpoch: BOOT_EPOCH });
    void w.ask(MM.handleAcceptGameInvite, 'b146-f', { inviteId: 'inv-b146' });
    await w.flush();
    assert.equal(w.inviteGates.length, 1, '수락 처리가 시작 안 됨 (준비 잘못)');
    assert.equal(roomOf(people[0]).isFull, true);
});

test('A13-B-147 정원 10 · 명단 9 → 안 가득', async (t) => {
    const w = makeWorld(t);
    const people = Array.from({ length: 9 }, (_, i) => `b147-${i}`);
    for (const uuid of people) w.connect(uuid);
    const created = await w.createRoom(people[0], w.roomPayload({ maxPlayers: 10 }));
    assert.equal(created.ok, true);
    for (const uuid of people.slice(1)) assert.equal((await w.joinCode(uuid, created.room.roomCode)).ok, true);
    assert.equal((await w.currentRoom(people[0])).players.length, 9);
    assert.equal(roomOf(people[0]).isFull, false);
});
