'use strict';

// [버그 6] 방장이 판 끝 → 대기방으로 → 방 지우기 → 새 방 만들기 시험 — 아무도 끌려가지 않음, 그 뒤 "대기방으로"는 방 없음, 로비 간 사람은 어디든
// 목록 A08-B-078~081 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-bug6-host-recreate.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a08-world');

const rosterOf = (room) => room.players.map((p) => p.uuid);

// 6명 판 끝 → 방장 A 대기방으로 → 방 지우기 → 새 방 만들기, 새 방 답
async function hostRecreates(w, g) {
    const back = await w.ret(g.host, g.gameId);
    assert.equal(back.ok, true, `방장 대기방으로 실패: ${back.code}`);
    const deleted = await w.deleteRoom(g.host);
    assert.equal(deleted.ok, true, `방 지우기 실패: ${deleted.code}`);
    const created = await w.createRoom(g.host, w.roomPayload({ maxPlayers: 6 }));
    assert.equal(created.ok, true, `새 방 만들기 실패: ${created.message}`);
    return created.room;
}

test('A08-B-078 [버그 6] 6명 판 방장 A 누름 → delete_room → create_room → 새 방 명단 A만, 나머지 누구에게도 방 입장 알림 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b078', n: 6 });
    await w.endGame(g);
    const room = await hostRecreates(w, g);
    w.tick(1_000);
    assert.deepEqual(rosterOf(room), [g.host]);
    assert.deepEqual(rosterOf(await w.currentRoom(g.host)), [g.host]);
    for (const uuid of g.uuids.filter((u) => u !== g.host)) {
        assert.equal(w.received(uuid, 'room_joined').filter((r) => r.roomId === room.roomId).length, 0, `${uuid} 새 방 입장 알림`);
        assert.equal(w.received(uuid, 'player_joined_room').filter((p) => p.player?.uuid === uuid).length, 0, `${uuid} 본인 입장 알림`);
        assert.equal(await w.currentRoom(uuid), null, `${uuid} 방 자리 있음`);
    }
});

test('A08-B-079 [버그 6] B-078 뒤 C 누름 → ROOM_NOT_FOUND "대기방이 없어졌습니다.", C는 A 새 방에 안 들어감 [지금 동작]', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b079', n: 6 });
    await w.endGame(g);
    await hostRecreates(w, g);
    const c = g.uuids[2];
    const r = await w.ret(c, g.gameId);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'ROOM_NOT_FOUND');
    assert.equal(r.message, '대기방이 없어졌습니다.');
    assert.deepEqual(rosterOf(await w.currentRoom(g.host)), [g.host]);
    assert.equal(await w.currentRoom(c), null);
});

test('A08-B-080 [버그 6] 6명 판 D 로비로 → A 새 방 코드 입장 됨 / 다른 방 코드 입장 됨', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b080', n: 6 });
    await w.endGame(g);
    const d = g.uuids[3];
    assert.equal((await w.lobby(d, g.gameId)).ok, true);
    const hostRoom = await hostRecreates(w, g);
    // A 새 방
    const intoHost = await w.joinCode(d, hostRoom.roomCode);
    assert.equal(intoHost.ok, true, `A 새 방 막힘: ${intoHost.code}`);
    await w.leaveRoom(d);
    // 다른 방
    const other = 'b080-other';
    w.connect(other);
    const created = await w.createRoom(other, w.roomPayload({ maxPlayers: 5 }));
    assert.equal(created.ok, true);
    const intoOther = await w.joinCode(d, created.room.roomCode);
    assert.equal(intoOther.ok, true, `다른 방 막힘: ${intoOther.code}`);
});

test('A08-B-081 [버그 6] 7명 판 B·C 먼저 들어감 → A 들어감(방장) → delete_room → B·C 방에서 빠짐 알림, A create_room → 새 방 명단 A만', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b081', n: 7 });
    await w.endGame(g);
    const [b, c] = [g.uuids[1], g.uuids[2]];
    assert.equal((await w.ret(b, g.gameId)).ok, true);
    assert.equal((await w.ret(c, g.gameId)).ok, true);
    const back = await w.ret(g.host, g.gameId);
    assert.equal(back.ok, true);
    assert.equal(back.room.hostUuid, g.host);
    assert.equal((await w.deleteRoom(g.host)).ok, true);
    for (const uuid of [b, c]) {
        assert.equal(w.received(uuid, 'room_deleted').length, 1, `${uuid} 방 지움 알림 없음`);
        assert.equal(await w.currentRoom(uuid), null, `${uuid} 아직 방 자리`);
    }
    const created = await w.createRoom(g.host, w.roomPayload({ maxPlayers: 7 }));
    assert.equal(created.ok, true);
    assert.deepEqual(rosterOf(created.room), [g.host]);
});
