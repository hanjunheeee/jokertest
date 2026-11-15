'use strict';

// 로비 입장 정리 시험 — 처리 중 입장·매칭 줄: 답 전에 로비에 오면 그 입장(만들기·코드·공개 방·초대·대기방으로)이 되돌려짐, 로비 뒤에 보낸 요청은 안 막힘
// 목록 A10-B-197~210 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --env-file=.env.test --test tests/flow/a10-pending.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, matchmaking } = require('./a10-world');

// 답 받는 사건을 보내 두고 (아직 안 기다림) 답 약속 돌려줌
function askLater(w, who, event, payload = {}) {
    let reply;
    const done = new Promise((resolve) => { reply = resolve; });
    w.sock(who).trigger(event, payload, reply);
    return done;
}

// 그 소켓 채널 넣기를 붙잡아 둠 (방 넣기 답 전 상태 만들기) → 풀기 함수
function holdJoin(socket) {
    const original = socket.join;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    socket.join = async (room) => { await gate; return original(room); };
    return () => { socket.join = original; release(); };
}

test('A10-B-197 create_room 답 전에 enter_lobby → 방 확정 안 됨, 이 사람 방 없음, 공개 목록에 안 뜸', async (t) => {
    const w = makeWorld(t);
    await w.connect('b197-a');
    const release = w.userGates.hold('b197-a');
    const pending = askLater(w, 'b197-a', 'create_room', { accessType: 'open', maxPlayers: 6, jokerCount: 1, dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 15, nightActionTime: 30 });
    await w.settle();
    await w.lobby('b197-a');
    release();
    const created = await pending;
    await w.settle();
    assert.equal(created.ok, false);
    assert.equal(await w.currentRoom('b197-a'), null);
    await w.tick(1_000);
    assert.deepEqual(await w.publicRooms('b197-a'), []);
});

test('A10-B-198 6명 방에 join_room_by_code 기다리는 사이 enter_lobby → 명단 6명 그대로, 방 사람들 player_joined_room 0개', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b198', n: 6 });
    await w.connect('b198-x');
    const marks = r.uuids.map((u) => [u, w.mark(u)]);
    const release = w.userGates.hold('b198-x');
    w.sock('b198-x').trigger('join_room_by_code', { roomCode: r.roomCode });
    await w.settle();
    await w.lobby('b198-x');
    release();
    await w.settle();
    assert.equal((await w.currentRoom(r.host)).players.length, 6);
    for (const [u, at] of marks) assert.equal(w.since(u, at, 'player_joined_room').length, 0, `${u} 입장 알림 받음`);
});

test('A10-B-199 7명 공개 방 join_public_room 사이 enter_lobby → 명단 7명 그대로', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b199', n: 7, accessType: 'open' });
    await w.connect('b199-x');
    const release = w.userGates.hold('b199-x');
    w.sock('b199-x').trigger('join_public_room', { roomId: r.roomId });
    await w.settle();
    await w.lobby('b199-x');
    release();
    await w.settle();
    assert.equal((await w.currentRoom(r.host)).players.length, 7);
    assert.equal(await w.currentRoom('b199-x'), null);
});

test('A10-B-200 5명 방 초대 accept_game_invite 확정 전 enter_lobby → 방장 방 명단 5명 그대로, get_game_invite_result 실패', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b200', n: 5 });
    await w.connect('b200-x');
    const inviteId = w.inviteService.add('b200-x', r.room);
    const release = w.decisionGates.hold('b200-x');
    const accepting = askLater(w, 'b200-x', 'accept_game_invite', { inviteId });
    await w.settle();
    await w.lobby('b200-x');
    release();
    const accepted = await accepting;
    await w.settle();
    assert.equal(accepted.ok, false);
    assert.equal((await w.currentRoom(r.host)).players.length, 5);
    const result = await w.ask('b200-x', 'get_game_invite_result', { inviteId });
    assert.equal(result.entered, false, '들어간 것으로 답함');
});

test('A10-B-201 8명 판 끝, return_to_room 기다리는 사이 enter_lobby → return_to_room 거절, 다시 연 방 명단에 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b201', n: 8 });
    await w.playToCitizenWin(g);
    const [a, b] = g.uuids.slice(1, 3);
    const release = holdJoin(w.sock(a));
    const returning = askLater(w, a, 'return_to_room', { gameId: g.gameId });
    await w.settle();
    await w.lobby(a);
    release();
    const back = await returning;
    await w.settle();
    assert.equal(back.ok, false);
    const other = await w.returnToRoom(b, g.gameId);
    assert.equal(other.ok, true);
    assert.ok(!other.room.players.some((p) => p.uuid === a), '로비 간 사람이 명단에 있음');
});

test('A10-B-202 join_matchmaking 뒤 enter_lobby → 그 뒤 다른 사람이 줄에 들어와 묶여도 이 사람은 안 들어감', async (t) => {
    const w = makeWorld(t);
    matchmaking.__setRandomMatchmakingEnabledForTests(true);
    t.after(() => matchmaking.__setRandomMatchmakingEnabledForTests(null));
    await w.connect('b202-a');
    await w.send('b202-a', 'join_matchmaking');
    assert.equal(w.count('b202-a', 'matchmaking_queued'), 1, '준비: 줄에 안 들어감');
    await w.lobby('b202-a');
    const others = ['b202-1', 'b202-2', 'b202-3', 'b202-4', 'b202-5'];
    for (const u of others) {
        await w.connect(u);
        await w.send(u, 'join_matchmaking');
    }
    assert.ok(others.every((u) => w.count(u, 'match_found') === 1), '준비: 다른 사람들이 안 묶임');
    assert.equal(w.count('b202-a', 'match_found'), 0);
    assert.ok(!w.received(others[0], 'match_found')[0].players.some((p) => p.uuid === 'b202-a'));
});

test('A10-B-203 enter_lobby 직후 같은 소켓 create_room → ok', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b203', n: 5 });
    const guest = r.guests[0];
    const entered = askLater(w, guest, 'enter_lobby');
    const creating = askLater(w, guest, 'create_room', { accessType: 'code', maxPlayers: 6, jokerCount: 1, dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 15, nightActionTime: 30 });
    assert.equal((await entered).ok, true);
    const created = await creating;
    assert.equal(created.ok, true, `방 만들기 거절: ${created.message}`);
});

test('A10-B-204 enter_lobby 직후 join_room_by_code(6명 방) → room_joined', async (t) => {
    const w = makeWorld(t);
    const mine = await w.openRoom({ prefix: 'b204m', n: 5 });
    const other = await w.openRoom({ prefix: 'b204o', n: 6 });
    const guest = mine.guests[1];
    const at = w.mark(guest);
    const entered = askLater(w, guest, 'enter_lobby');
    w.sock(guest).trigger('join_room_by_code', { roomCode: other.roomCode });
    assert.equal((await entered).ok, true);
    await w.settle();
    const joined = w.since(guest, at, 'room_joined');
    assert.equal(joined.length, 1, '입장 안 됨');
    assert.equal(joined[0].roomId, other.roomId);
});

test('A10-B-205 아무 요청 없이 로비 → cleared.pending:false', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b205', n: 5 });
    const reply = await w.lobby(r.guests[0]);
    assert.equal(reply.cleared.pending, false);
});

test('A10-B-206 코드 입장 기다리는 중 로비 → cleared.pending:true', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b206', n: 6 });
    await w.connect('b206-x');
    const release = w.userGates.hold('b206-x');
    w.sock('b206-x').trigger('join_room_by_code', { roomCode: r.roomCode });
    await w.settle();
    const reply = await w.lobby('b206-x');
    release();
    await w.settle();
    assert.equal(reply.cleared.pending, true);
});

test('A10-B-207 create_room 두 번(둘째는 처리 중 거절) 사이 enter_lobby → 방 0개', async (t) => {
    const w = makeWorld(t);
    await w.connect('b207-a');
    const payload = { accessType: 'open', maxPlayers: 6, jokerCount: 1, dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 15, nightActionTime: 30 };
    const release = w.userGates.hold('b207-a');
    const first = askLater(w, 'b207-a', 'create_room', payload);
    await w.settle();
    const second = await w.ask('b207-a', 'create_room', payload);
    assert.equal(second.ok, false, '준비: 둘째 누름이 받아짐');
    await w.lobby('b207-a');
    release();
    await first;
    await w.settle();
    await w.tick(1_000);
    assert.equal(await w.currentRoom('b207-a'), null);
    assert.deepEqual(await w.publicRooms('b207-a'), []);
});

test('A10-B-208 B가 6명 방 코드 입장 중, A(다른 방 손님) 로비 → B 들어감', async (t) => {
    const w = makeWorld(t);
    const target = await w.openRoom({ prefix: 'b208t', n: 6 });
    const mine = await w.openRoom({ prefix: 'b208m', n: 5 });
    await w.connect('b208-b');
    const at = w.mark('b208-b');
    const release = w.userGates.hold('b208-b');
    w.sock('b208-b').trigger('join_room_by_code', { roomCode: target.roomCode });
    await w.settle();
    await w.lobby(mine.guests[0]);
    release();
    await w.settle();
    assert.equal(w.since('b208-b', at, 'room_joined').length, 1, 'B가 못 들어감');
    assert.equal((await w.currentRoom(target.host)).players.length, 7);
});

test('A10-B-209 7명 판 끝, return_to_room ok 받은 뒤 로비 → 방에서 빠짐 (자리 안 남음)', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b209', n: 7 });
    await w.playToCitizenWin(g);
    const [a, b] = g.uuids.slice(1, 3);
    assert.equal((await w.returnToRoom(a, g.gameId)).ok, true);
    assert.equal((await w.returnToRoom(b, g.gameId)).ok, true);
    const reply = await w.lobby(a);
    assert.equal(reply.cleared.room, true);
    const room = await w.currentRoom(b);
    assert.ok(!room.players.some((p) => p.uuid === a), '자리가 남음');
});

test('A10-B-210 줄 → 로비 → join_matchmaking → 줄에 들어감 (막힘 없음)', async (t) => {
    const w = makeWorld(t);
    matchmaking.__setRandomMatchmakingEnabledForTests(true);
    t.after(() => matchmaking.__setRandomMatchmakingEnabledForTests(null));
    await w.connect('b210-a');
    await w.send('b210-a', 'join_matchmaking');
    await w.lobby('b210-a');
    const at = w.mark('b210-a');
    await w.send('b210-a', 'join_matchmaking');
    assert.equal(w.since('b210-a', at, 'matchmaking_queued').length, 1);
});
