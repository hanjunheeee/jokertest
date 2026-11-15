'use strict';

// 방장 넘김·방 삭제·나가기·끊김 15초·대기방 채팅 흐름 시험 — 먼저 들어온 사람이 방장, 마지막 사람이 나가면 방 없어짐, 삭제는 방장만, 끊기면 15초 뒤 빠짐, 대기방엔 채팅 없음
// 목록 A01-B-671~690 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "방장 넘김·방 삭제·나가기·끊김 15초·대기방 채팅"), 돌리기: node --env-file=.env.test --test tests/flow/a01b-host-leave.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, MSG, assertFailed } = require('./a01b-world');

// 방 하나 (방장 = 첫 사람), n명
async function room(w, prefix, n, maxPlayers, extra = {}) {
    const [host, ...guests] = w.names(prefix, n);
    return w.openRoom({ host, guests, maxPlayers, ...extra });
}

// A01-B-671~673 방장이 나가면 먼저 들어온 사람이 방장 (host_changed 다음 player_left_room)
for (const [no, n] of [['A01-B-671', 2], ['A01-B-672', 5], ['A01-B-673', 10]]) {
    test(`${no} 지금 ${n}명 방(A방장·B·C…)에서 A leave_room → 남은 사람 host_changed { hostUuid: B } 다음 player_left_room 순서`, async (t) => {
        const w = makeWorld(t);
        const r = await room(w, no.slice(6), n, 10);
        const [a, b] = r.uuids;
        await w.leave(a);
        for (const uuid of r.uuids.slice(1)) {
            const events = w.sock(uuid).received.map((e) => e.event);
            const hostAt = events.lastIndexOf('host_changed');
            const leftAt = events.lastIndexOf('player_left_room');
            assert.ok(hostAt >= 0, `${uuid} host_changed 없음`);
            assert.equal(w.last(uuid, 'host_changed').hostUuid, b);
            assert.ok(leftAt > hostAt, `${uuid} 순서 다름: ${events.join(',')}`);
            assert.equal(w.last(uuid, 'player_left_room').uuid, a);
        }
    });
}

test('A01-B-674 정원 6, 손님이 나감 → host_changed 0번, player_left_room 1번', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b674', 3, 6);
    await w.leave(r.uuids[2]);
    for (const uuid of r.uuids.slice(0, 2)) {
        assert.equal(w.count(uuid, 'host_changed'), 0, uuid);
        assert.equal(w.count(uuid, 'player_left_room'), 1, uuid);
    }
});

test('A01-B-675 정원 6 · A방장 B C, B 나갔다 코드로 다시 → 순서 A C B → A 나감 → C가 방장', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ host: 'b675-a', guests: ['b675-b', 'b675-c'], maxPlayers: 6 });
    await w.leave('b675-b');
    await w.joinByCode('b675-b', r.roomCode);
    assert.deepEqual(await w.roster('b675-a'), ['b675-a', 'b675-c', 'b675-b']);
    await w.leave('b675-a');
    assert.equal(w.last('b675-b', 'host_changed')?.hostUuid, 'b675-c');
    assert.equal((await w.currentRoom('b675-b')).hostUuid, 'b675-c');
});

test('A01-B-676 정원 5 · 1명, 방장 혼자 나감 → 그 코드로 입장 → ROOM_CODE_MISMATCH, 목록에 없음', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b676', 1, 5, { accessType: 'open' });
    await w.leave(r.host);
    w.connect('x');
    await w.joinByCode('x', r.roomCode);
    assertFailed(w, 'x', 'ROOM_CODE_MISMATCH', MSG.ROOM_CODE_MISMATCH);
    const list = await w.send('x', 'get_public_rooms', {});
    assert.equal(list.rooms.some((room_) => room_.id === r.roomId), false);
});

test('A01-B-677 정원 6 · 2명, 손님 나감 → 방 남음, 코드 입장 됨', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b677', 2, 6);
    await w.leave(r.uuids[1]);
    assert.deepEqual(await w.roster(r.host), [r.host]);
    w.connect('x');
    await w.joinByCode('x', r.roomCode);
    assert.equal(w.lastJoined('x')?.roomId, r.roomId, JSON.stringify(w.lastFailed('x')));
});

test('A01-B-678 정원 8 · 6명, 방장 delete_room → 손님 5명 전원 room_deleted, 방장 답 { ok: true }, 그 코드로 입장 → 코드 틀림', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b678', 6, 8);
    const reply = await w.send(r.host, 'delete_room', {});
    assert.equal(reply.ok, true);
    for (const uuid of r.uuids.slice(1)) assert.equal(w.count(uuid, 'room_deleted'), 1, uuid);
    w.connect('x');
    await w.joinByCode('x', r.roomCode);
    assertFailed(w, 'x', 'ROOM_CODE_MISMATCH');
});

test('A01-B-679 정원 6, 손님 delete_room → NOT_HOST "방장만 방을 삭제할 수 있습니다.", 방 그대로', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b679', 3, 6);
    const reply = await w.send(r.uuids[1], 'delete_room', {});
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'NOT_HOST');
    assert.equal(reply.message, '방장만 방을 삭제할 수 있습니다.');
    assert.deepEqual(await w.roster(r.host), r.uuids);
});

test('A01-B-680 정원 6, 삭제 직후 손님이 다른 방 코드 입장 → room_joined', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b680', 3, 6);
    const other = await room(w, 'b680o', 1, 6);
    assert.equal((await w.send(r.host, 'delete_room', {})).ok, true);
    await w.joinByCode(r.uuids[1], other.roomCode);
    assert.equal(w.lastJoined(r.uuids[1])?.roomId, other.roomId, JSON.stringify(w.lastFailed(r.uuids[1])));
});

test('A01-B-681 정원 6, 초대 보낸 뒤 방 삭제 → 그 초대 수락 거절', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b681', 2, 6);
    w.connect('friend');
    const inviteId = await w.invite(r.host, 'friend');
    assert.equal((await w.send(r.host, 'delete_room', {})).ok, true);
    const reply = await w.accept('friend', inviteId);
    assert.equal(reply.ok, false);
    assert.equal(await w.currentRoom('friend'), null);
});

test('A01-B-682 정원 7 · 5명, 손님 소켓 끊김 → 가짜 시계 14.9초엔 명단에 있음·알림 0번', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b682', 5, 7);
    const gone = r.uuids[4];
    w.disconnect(gone);
    w.tick(14_900);
    await w.flush();
    assert.ok((await w.roster(r.host)).includes(gone));
    for (const uuid of r.uuids.slice(0, 4)) assert.equal(w.count(uuid, 'player_left_room'), 0, uuid);
});

test('A01-B-683 정원 7 · 5명, 손님 소켓 끊김 → 15초엔 player_left_room', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b683', 5, 7);
    const gone = r.uuids[4];
    w.disconnect(gone);
    w.tick(14_900);
    w.tick(100);
    await w.flush();
    for (const uuid of r.uuids.slice(0, 4)) assert.equal(w.last(uuid, 'player_left_room')?.uuid, gone, uuid);
    assert.equal((await w.roster(r.host)).includes(gone), false);
});

test('A01-B-684 정원 7, 끊긴 뒤 10초에 새 소켓 get_current_room → 방 내용 받음, 15초 뒤에도 명단에 있음', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b684', 4, 7);
    const back = r.uuids[3];
    w.disconnect(back);
    w.tick(10_000);
    w.connect(back);
    const mine = await w.currentRoom(back);
    assert.equal(mine?.roomId, r.roomId);
    w.tick(10_000);
    await w.flush();
    assert.ok((await w.roster(r.host)).includes(back));
    assert.equal(w.count(r.host, 'player_left_room'), 0);
});

test('A01-B-685 정원 6 · 4명, 방장 끊김 15초 → host_changed(두 번째 사람)', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b685', 4, 6);
    w.disconnect(r.host);
    w.tick(15_000);
    await w.flush();
    for (const uuid of r.uuids.slice(1)) assert.equal(w.last(uuid, 'host_changed')?.hostUuid, r.uuids[1], uuid);
});

test('A01-B-686 정원 5 · 1명, 방장 혼자 끊김 15초 → 방 없음', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b686', 1, 5);
    w.disconnect(r.host);
    w.tick(15_000);
    await w.flush();
    w.connect('x');
    await w.joinByCode('x', r.roomCode);
    assertFailed(w, 'x', 'ROOM_CODE_MISMATCH');
});

test('A01-B-687 정원 6, 손님 leave_room → 그 자리에서 player_left_room (가짜 시계 안 감)', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b687', 3, 6);
    await w.leave(r.uuids[2]);
    assert.equal(w.last(r.host, 'player_left_room')?.uuid, r.uuids[2]);
    assert.equal((await w.roster(r.host)).includes(r.uuids[2]), false);
});

// A01-B-688~689 대기방 채팅 없음
const CHATS = [
    ['A01-B-688', '낮 채팅 사건 submit_game_chat_message', 'handleSubmitGameChatMessage'],
    ['A01-B-689', '직업 채팅 사건 submit_joker_chat_message', 'handleSubmitJokerChatMessage'],
];
for (const [no, label, handler] of CHATS) {
    test(`${no} 정원 6 대기방 손님이 ${label} → 거절, 방 누구에게도 채팅 알림 0번`, async (t) => {
        const w = makeWorld(t);
        const r = await room(w, no.slice(6), 3, 6);
        const guest = r.uuids[1];
        const before = r.uuids.map((u) => w.sock(u).received.length);
        const reply = await new Promise((resolve) => w.G[handler](w.io, w.sock(guest), guest, { gameId: r.roomId, text: '안녕하세요' }, resolve));
        await w.flush();
        assert.equal(reply.ok, false);
        r.uuids.forEach((u, i) => assert.equal(w.sock(u).received.length, before[i], u));
    });
}

test('A01-B-690 방 없는 사람 leave_room → 아무 알림 없음, 오류 없음, 다른 방 그대로', async (t) => {
    const w = makeWorld(t);
    const r = await room(w, 'b690', 3, 6);
    w.connect('lonely');
    const before = [...r.uuids, 'lonely'].map((u) => w.sock(u).received.length);
    await w.leave('lonely');
    [...r.uuids, 'lonely'].forEach((u, i) => assert.equal(w.sock(u).received.length, before[i], u));
    assert.deepEqual(await w.roster(r.host), r.uuids);
});
