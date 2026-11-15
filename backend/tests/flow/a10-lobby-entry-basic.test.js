'use strict';

// 로비 입장 정리 시험 — 답 모양·점검: 정리할 것 없으면 그냥 ok, 보내는 값 모양 상관없음, 답 함수 없어도 정리, 두 번 같은 결과, 점검 중에도 정리
// 목록 A10-B-101~110 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --env-file=.env.test --test tests/flow/a10-lobby-entry-basic.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, maintenance, NOTHING } = require('./a10-world');

// 로비 입장을 보내는 모양대로 (값 없음·{}·답 함수만·이상한 값)
function enterWith(w, uuid, shape) {
    const socket = w.sock(uuid);
    return new Promise((resolve) => {
        if (shape.kind === 'none') socket.trigger('enter_lobby', undefined, resolve);
        else if (shape.kind === 'cbOnly') socket.trigger('enter_lobby', resolve);
        else socket.trigger('enter_lobby', shape.value, resolve);
    }).then(async (reply) => { await w.settle(); return reply; });
}

test('A10-B-101 정리할 것 없는 사람 로비 입장 → 그냥 ok, 누구에게도 방송 0개', async (t) => {
    const w = makeWorld(t);
    await w.openRoom({ prefix: 'b101r', n: 5 });
    const a = await w.connect('b101-a');
    // 방 차릴 때 걸린 공개 목록 묶음 방송(0.5초)은 먼저 보내 둠
    await w.tick(1_000);
    const before = w.io.broadcasts.length;
    const marks = ['b101r-0', 'b101r-1', 'b101r-4'].map((u) => [u, w.mark(u)]);
    const reply = await w.lobby(a);
    assert.deepEqual(reply, { ok: true, redirect: null, gameId: null, cleared: { ...NOTHING } });
    await w.tick(1_000);
    assert.equal(w.io.broadcasts.length, before, '정리할 것 없는데 방송이 나감');
    for (const [u, at] of marks) assert.equal(w.since(u, at).length, 0, `${u}가 알림 받음`);
});

const SHAPES = [
    ['A10-B-102', '값 없음', { kind: 'none' }],
    ['A10-B-103', '{}', { kind: 'value', value: {} }],
    ['A10-B-104', '답 함수만 첫 자리', { kind: 'cbOnly' }],
];
for (const [id, label, shape] of SHAPES) {
    test(`${id} 6명 방 손님이 로비 입장 (${label}) → 같은 답, 대기방 자리 정리`, async (t) => {
        const w = makeWorld(t);
        const r = await w.openRoom({ prefix: `${id}-r`, n: 6 });
        const guest = r.guests[2];
        const reply = await enterWith(w, guest, shape);
        assert.deepEqual(reply, { ok: true, redirect: null, gameId: null, cleared: { ...NOTHING, room: true } });
        const room = await w.currentRoom(r.host);
        assert.equal(room.players.length, 5);
        assert.ok(!room.players.some((p) => p.uuid === guest), '빠진 사람이 명단에 남음');
        assert.ok(w.received(r.host, 'player_left_room').some((p) => p.uuid === guest));
    });
}

const ODD_VALUES = [
    ['A10-B-105', '7', () => 7],
    ['A10-B-106', "'abc'", () => 'abc'],
    ['A10-B-107', '{ roomId: 남의 방 id }', (other) => ({ roomId: other.roomId })],
];
for (const [id, label, makeValue] of ODD_VALUES) {
    test(`${id} 이상한 값(${label})을 실어도 내 자리만 정리, 남의 방(7명) 명단 그대로`, async (t) => {
        const w = makeWorld(t);
        const mine = await w.openRoom({ prefix: `${id}-m`, n: 5 });
        const other = await w.openRoom({ prefix: `${id}-o`, n: 7 });
        const otherMarks = other.uuids.map((u) => [u, w.mark(u)]);
        const guest = mine.guests[0];
        const reply = await enterWith(w, guest, { kind: 'value', value: makeValue(other) });
        assert.equal(reply.ok, true);
        assert.equal(reply.cleared.room, true);
        assert.equal((await w.currentRoom(mine.host)).players.length, 4, '내 자리 정리 안 됨');
        const otherRoom = await w.currentRoom(other.host);
        assert.equal(otherRoom.players.length, 7);
        assert.equal(otherRoom.hostUuid, other.host);
        for (const [u, at] of otherMarks) assert.equal(w.since(u, at, 'player_left_room').length, 0, `${u} 방에 나감 알림`);
    });
}

test('A10-B-108 5명 방 손님이 답 함수 없이 로비 입장 → 오류 없음, 명단 4명, 남은 사람에게 player_left_room', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b108', n: 5 });
    const guest = r.guests[1];
    assert.doesNotThrow(() => w.sock(guest).trigger('enter_lobby'));
    await w.settle();
    assert.equal((await w.currentRoom(r.host)).players.length, 4);
    for (const u of r.uuids.filter((x) => x !== guest)) {
        assert.ok(w.received(u, 'player_left_room').some((p) => p.uuid === guest), `${u} 나감 알림 못 받음`);
    }
});

test('A10-B-109 8명 방 손님이 로비 입장 두 번 → 첫 답 room:true, 둘째 답 전부 false, player_left_room 1번', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b109', n: 8 });
    const guest = r.guests[3];
    const first = await w.lobby(guest);
    const second = await w.lobby(guest);
    assert.deepEqual(first.cleared, { ...NOTHING, room: true });
    assert.deepEqual(second, { ok: true, redirect: null, gameId: null, cleared: { ...NOTHING } });
    for (const u of r.uuids.filter((x) => x !== guest)) {
        assert.equal(w.received(u, 'player_left_room').filter((p) => p.uuid === guest).length, 1, `${u} 나감 알림 수`);
    }
});

test('A10-B-110 점검 중 6명 방 손님 로비 입장 → room:true, 명단 5명, 같은 때 방 만들기는 점검 거절', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b110', n: 6 });
    maintenance.__setStateForTests({ enabled: true });
    const guest = r.guests[0];
    const reply = await w.lobby(guest);
    assert.equal(reply.ok, true);
    assert.equal(reply.cleared.room, true);
    assert.equal((await w.currentRoom(r.host)).players.length, 5);
    const created = await w.createRoom(guest);
    assert.equal(created.ok, false);
    assert.equal(created.code, 'MAINTENANCE');
});
