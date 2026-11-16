'use strict';

// 로비 입장 정리 시험 — 대기방 자리: 손님·방장이 로비에 오면 방에서 빠짐, 방장 넘김, 빈 방 지움, 빠진 뒤 다시 들어오기·만들기, 끊김·새 탭
// 목록 A10-B-111~140 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --env-file=.env.test --test tests/flow/a10-room-seat.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a10-world');

// 방 안 알림만 (공개 방 목록은 로비 사람도 받는 알림이라 뺌)
const roomNotices = (w, who, at) => w.since(who, at).length - w.since(who, at, 'public_rooms_updated').length;

const SIZES = [5, 6, 7, 8, 9, 10];

SIZES.forEach((n, i) => {
    const id = `A10-B-${String(111 + i).padStart(3, '0')}`;
    test(`${id} ${n}명 방 손님 1명 로비 입장 → room:true, 남은 사람 전원 player_left_room, 명단 ${n - 1}명, 방장 그대로`, async (t) => {
        const w = makeWorld(t);
        const r = await w.openRoom({ prefix: `${id}`, n });
        const guest = r.guests[r.guests.length - 1];
        const reply = await w.lobby(guest);
        assert.equal(reply.cleared.room, true);
        for (const u of r.uuids.filter((x) => x !== guest)) {
            assert.ok(w.received(u, 'player_left_room').some((p) => p.uuid === guest), `${u} 나감 알림 못 받음`);
        }
        const room = await w.currentRoom(r.host);
        assert.equal(room.players.length, n - 1);
        assert.equal(room.hostUuid, r.host);
    });
});

SIZES.forEach((n, i) => {
    const id = `A10-B-${String(117 + i).padStart(3, '0')}`;
    test(`${id} ${n}명 방 방장 로비 입장 → 남은 사람 전원 host_changed(두 번째로 들어온 사람) + player_left_room`, async (t) => {
        const w = makeWorld(t);
        const r = await w.openRoom({ prefix: `${id}`, n });
        const second = r.uuids[1];
        await w.lobby(r.host);
        for (const u of r.guests) {
            assert.equal(w.received(u, 'host_changed').at(-1)?.hostUuid, second, `${u} 새 방장 알림`);
            assert.ok(w.received(u, 'player_left_room').some((p) => p.uuid === r.host), `${u} 나감 알림 못 받음`);
        }
    });
});

test('A10-B-123 방장 혼자 공개 방 로비 입장 → 방 없어짐, public_rooms_updated 목록에 그 방 없음', async (t) => {
    const w = makeWorld(t);
    const watcher = await w.connect('b123-watch');
    const r = await w.openRoom({ prefix: 'b123', n: 1, accessType: 'open' });
    await w.tick(1_000);
    assert.ok(w.received(watcher, 'public_rooms_updated').at(-1).rooms.some((x) => x.id === r.roomId), '준비: 목록에 방이 안 보임');
    const reply = await w.lobby(r.host);
    assert.equal(reply.cleared.room, true);
    await w.tick(1_000);
    assert.ok(!w.received(watcher, 'public_rooms_updated').at(-1).rooms.some((x) => x.id === r.roomId), '목록에 방이 남음');
    assert.equal(await w.currentRoom(r.host), null);
});

test('A10-B-124 방장 혼자 코드 방 로비 입장 → 다른 사람이 그 코드로 입장하면 ROOM_CODE_MISMATCH(없는 코드와 같은 답)', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b124', n: 1 });
    await w.lobby(r.host);
    await w.connect('b124-x');
    const joined = await w.joinByCode('b124-x', r.roomCode);
    assert.equal(joined.event, 'room_join_failed');
    assert.equal(joined.code, 'ROOM_CODE_MISMATCH');
});

test('A10-B-125 2명 방 방장 로비 입장 → 손님이 방장, 방 남음', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b125', n: 2 });
    await w.lobby(r.host);
    const room = await w.currentRoom(r.guests[0]);
    assert.ok(room, '방이 없어짐');
    assert.equal(room.hostUuid, r.guests[0]);
    assert.deepEqual(room.players.map((p) => p.uuid), [r.guests[0]]);
});

const CAN_START = [
    ['A10-B-126', 6, true],
    ['A10-B-127', 5, false],
];
for (const [id, n, expected] of CAN_START) {
    test(`${id} 전원 준비한 ${n}명 방 손님 1명 로비 → player_left_room canStart:${expected} (${n - 1}명)`, async (t) => {
        const w = makeWorld(t);
        const r = await w.openRoom({ prefix: id, n, ready: true });
        const guest = r.guests[0];
        await w.lobby(guest);
        const left = w.received(r.host, 'player_left_room').find((p) => p.uuid === guest);
        assert.equal(left.canStart, expected);
    });
}

test('A10-B-128 7명 방 손님 로비 → 뒤에 방장이 설정 바꿈 → 빠진 사람 소켓이 받은 방 알림 0개', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b128', n: 7 });
    const guest = r.guests[2];
    await w.lobby(guest);
    const at = w.mark(guest);
    const hostAt = w.mark(r.guests[0]);
    const changed = await w.changeSettings(r.host, 60);
    assert.equal(changed.ok, true, `설정 저장 실패: ${changed.message}`);
    assert.ok(w.since(r.guests[0], hostAt, 'room_settings_updated').length > 0, '준비: 남은 사람도 설정 알림을 못 받음');
    assert.equal(roomNotices(w, guest, at), 0);
});

test('A10-B-129 6명 방 방장 로비 → create_room ok, 새 방 코드 6자리, 방장 = 나', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b129', n: 6 });
    await w.lobby(r.host);
    const created = await w.createRoom(r.host);
    assert.equal(created.ok, true, `방 만들기 거절: ${created.message}`);
    assert.match(created.room.roomCode, /^[A-Za-z0-9]{6}$/);
    assert.equal(created.room.hostUuid, r.host);
});

test('A10-B-130 7명 방 손님 로비 → 같은 코드로 다시 입장 → room_joined, 명단 7명 (준비 안 됨)', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b130', n: 7, ready: true });
    const guest = r.guests[1];
    await w.lobby(guest);
    const joined = await w.joinByCode(guest, r.roomCode);
    assert.equal(joined.event, 'room_joined');
    assert.equal(joined.players.length, 7);
    assert.equal(joined.players.find((p) => p.uuid === guest).isReady, false);
});

test('A10-B-131 5명 방 손님 로비 → 다른 공개 방(6명) join_public_room → room_joined', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b131', n: 5 });
    const other = await w.openRoom({ prefix: 'b131o', n: 6, accessType: 'open' });
    const guest = r.guests[0];
    await w.lobby(guest);
    const at = w.mark(guest);
    await w.send(guest, 'join_public_room', { roomId: other.roomId });
    const joined = w.since(guest, at, 'room_joined');
    assert.equal(joined.length, 1, '공개 방 입장 안 됨');
    assert.equal(joined[0].roomId, other.roomId);
});

test('A10-B-132 8명 방 손님 로비 → 다른 방(5명) 초대 accept_game_invite → 들어감', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b132', n: 8 });
    const other = await w.openRoom({ prefix: 'b132o', n: 5 });
    const guest = r.guests[4];
    await w.lobby(guest);
    const inviteId = w.inviteService.add(guest, other.room);
    const accepted = await w.ask(guest, 'accept_game_invite', { inviteId });
    assert.equal(accepted.ok, true, `초대 입장 실패: ${accepted.code} ${accepted.message}`);
    assert.equal(accepted.room.roomId, other.roomId);
    assert.equal((await w.currentRoom(other.host)).players.length, 6);
});

test('A10-B-133 6명 방에서 2번 추방된 사람이 로비 → 같은 코드로 들어옴 → 한 번 더 추방 → 그 코드 입장 KICKED_TOO_MANY_TIMES', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b133', n: 6 });
    const victim = r.guests[3];
    for (let i = 0; i < 2; i += 1) {
        const k = await w.kick(r.host, victim);
        assert.equal(k.ok, true, `추방 실패: ${k.code} ${k.message}`);
        if (i === 0) assert.equal((await w.joinByCode(victim, r.roomCode)).event, 'room_joined');
    }
    await w.lobby(victim);
    assert.equal((await w.joinByCode(victim, r.roomCode)).event, 'room_joined');
    assert.equal((await w.kick(r.host, victim)).ok, true);
    const again = await w.joinByCode(victim, r.roomCode);
    assert.equal(again.event, 'room_join_failed');
    assert.equal(again.code, 'KICKED_TOO_MANY_TIMES');
});

test('A10-B-134 공개 9명 방 손님 로비 → public_rooms_updated에서 그 방 인원 8', async (t) => {
    const w = makeWorld(t);
    const watcher = await w.connect('b134-watch');
    const r = await w.openRoom({ prefix: 'b134', n: 9, accessType: 'open' });
    await w.tick(1_000);
    await w.lobby(r.guests[0]);
    await w.tick(1_000);
    const listed = w.received(watcher, 'public_rooms_updated').at(-1).rooms.find((x) => x.id === r.roomId);
    assert.equal(listed?.current, 8);
});

test('A10-B-135 6명 방 방장이 leave_room 없이 같은 소켓으로 로비 입장(뒤로 가기) → 방에서 빠짐, 다음 사람 방장', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b135', n: 6 });
    const socket = w.sock(r.host);
    await w.lobby(socket);
    assert.equal(await w.currentRoom(r.host), null);
    const room = await w.currentRoom(r.uuids[1]);
    assert.equal(room.hostUuid, r.uuids[1]);
    assert.equal(room.players.length, 5);
});

test('A10-B-136 5명 방 손님 로비 → 가짜 시계 0초에 이미 명단 4명 (15초 기다림 없음)', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b136', n: 5 });
    const startedAt = Date.now();
    await w.lobby(r.guests[2]);
    assert.equal(Date.now(), startedAt, '시계가 움직임');
    assert.equal((await w.currentRoom(r.host)).players.length, 4);
});

test('A10-B-137 7명 방 손님 끊김 → 5초 뒤 새 소켓 + 로비 → 바로 빠짐, 15초 지나도 player_left_room 1번뿐', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b137', n: 7 });
    const guest = r.guests[1];
    w.closeSocket(w.sock(guest));
    await w.tickBy(5_000);
    assert.equal((await w.currentRoom(r.host)).players.length, 7, '준비: 15초 전에 빠짐');
    await w.connect(guest);
    await w.lobby(guest);
    assert.equal((await w.currentRoom(r.host)).players.length, 6);
    await w.tickBy(16_000);
    assert.equal(w.received(r.host, 'player_left_room').filter((p) => p.uuid === guest).length, 1);
});

test('A10-B-138 다시 연 방에 원래 방장 + 2명 앉음 → 원래 방장 로비 → 먼저 들어온 사람이 방장(host_changed)', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b138', n: 5 });
    await w.playToCitizenWin(g);
    const [b, c] = g.uuids.filter((u) => u !== g.host).slice(0, 2);
    for (const u of [g.host, b, c]) {
        const r = await w.returnToRoom(u, g.gameId);
        assert.equal(r.ok, true, `${u} 대기방으로 실패: ${r.code}`);
    }
    await w.lobby(g.host);
    for (const u of [b, c]) assert.equal(w.received(u, 'host_changed').at(-1)?.hostUuid, b, `${u} 새 방장 알림`);
});

test('A10-B-139 6명 판 끝 → 1명 "대기방으로" → 그 사람 로비 → 빈 방은 180초까지 남음, 공개 목록엔 안 보임, 180초 지나면 없어짐', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b139', n: 6, accessType: 'open' });
    await w.playToCitizenWin(g);
    const endedAt = Date.now();
    const a = g.uuids[1];
    assert.equal((await w.returnToRoom(a, g.gameId)).ok, true);
    await w.lobby(a);
    await w.tick(1_000);
    const outsider = await w.connect('b139-x');
    assert.ok(!(await w.publicRooms(outsider)).some((x) => x.current === 0), '빈 방이 목록에 보임');
    // 180초 안: 코드로 들어오면 방이 있음 (보고 나서 다시 나가 빈 방으로 돌려 둠)
    const hold = await w.joinByCode(outsider, g.roomCode);
    assert.equal(hold.event, 'room_joined', '180초 안인데 방이 없음');
    await w.send(outsider, 'leave_room');
    // 180초 지나면 없어짐
    await w.tickBy(180_000 - (Date.now() - endedAt) + 1_000);
    const late = await w.connect('b139-y');
    const gone = await w.joinByCode(late, g.roomCode);
    assert.equal(gone.event, 'room_join_failed', '180초 지났는데 방이 남음');
});

test('A10-B-140 8명 방 손님, 같은 계정 새 소켓 접속(옛 소켓 밀림) → 새 소켓 로비 → 방장이 설정 바꿈 → 두 소켓 모두 방 알림 0개', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b140', n: 8 });
    const guest = r.guests[5];
    const oldSocket = w.sock(guest);
    const newSocket = await w.connect(guest);
    assert.equal(oldSocket.connected, false, '준비: 옛 소켓이 안 밀림');
    await w.lobby(newSocket);
    const oldAt = w.mark(oldSocket);
    const newAt = w.mark(newSocket);
    assert.equal((await w.changeSettings(r.host, 60)).ok, true);
    assert.equal(roomNotices(w, oldSocket, oldAt), 0, '옛 소켓이 방 알림 받음');
    assert.equal(roomNotices(w, newSocket, newAt), 0, '새 소켓이 방 알림 받음');
});
