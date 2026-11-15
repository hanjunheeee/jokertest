'use strict';

// 로비 입장 정리 시험 — 같은 계정 새 접속·밀린 옛 창 (받은 버그 4): 새 탭이 로비에 오면 옛 탭이 남긴 방 자리 정리, 옛 창 요청은 무시
// 목록 A10-B-211~223 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --env-file=.env.test --test tests/flow/a10-duplicate-login.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a10-world');

// 광대 아닌 사람
const citizens = (g) => g.uuids.filter((u) => !g.jokers.includes(u));

// 같은 브라우저 새 탭 (같은 로그인 세션) 접속 → { oldSocket, fresh }
async function newTab(w, uuid) {
    const oldSocket = w.sock(uuid);
    const fresh = await w.connect(uuid);
    return { oldSocket, fresh };
}

test('A10-B-211 [버그 4] 방장 혼자, 같은 브라우저 새 탭이 로비 → 옛 탭 REPLACED_BY_SAME_SESSION, 방 없어짐, 새 탭 create_room ok', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b211', n: 1 });
    const { oldSocket, fresh } = await newTab(w, r.host);
    assert.equal(w.received(oldSocket, 'force_disconnect').at(-1)?.code, 'REPLACED_BY_SAME_SESSION');
    await w.lobby(fresh);
    await w.connect('b211-x');
    assert.equal((await w.joinByCode('b211-x', r.roomCode)).event, 'room_join_failed', '옛 방이 남음');
    const created = await w.createRoom(r.host);
    assert.equal(created.ok, true, `새 탭 방 만들기 거절: ${created.message}`);
});

test('A10-B-212 [버그 4] 방장 + 4명 (5명 방) 새 탭 로비 → 새 방장 = 먼저 들어온 사람, 남은 4명 host_changed·player_left_room', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b212', n: 5 });
    const { fresh } = await newTab(w, r.host);
    await w.lobby(fresh);
    for (const u of r.guests) {
        assert.equal(w.received(u, 'host_changed').at(-1)?.hostUuid, r.uuids[1], `${u} 새 방장 알림`);
        assert.ok(w.received(u, 'player_left_room').some((p) => p.uuid === r.host), `${u} 나감 알림`);
    }
});

test('A10-B-213 [버그 4] 6명 방 방장 다른 기기 로그인 → 옛 소켓 REPLACED_BY_OTHER_LOGIN → 새 소켓 로비 → 방장 넘어감, 새 소켓 create_room ok', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b213', n: 6 });
    const oldSocket = w.sock(r.host);
    const fresh = await w.connect(r.host, { sessionId: 'sess-b213-other' });
    assert.equal(w.received(oldSocket, 'force_disconnect').at(-1)?.code, 'REPLACED_BY_OTHER_LOGIN');
    await w.lobby(fresh);
    assert.equal((await w.currentRoom(r.uuids[1])).hostUuid, r.uuids[1]);
    assert.equal((await w.createRoom(r.host)).ok, true);
});

test('A10-B-214 [버그 4] 7명 방 손님 새 탭 로비 → 명단 6명', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b214', n: 7 });
    const { fresh } = await newTab(w, r.guests[2]);
    await w.lobby(fresh);
    assert.equal((await w.currentRoom(r.host)).players.length, 6);
});

test('A10-B-215 [버그 4] 방장 혼자 공개 방 → 새 탭 로비 → public_rooms_updated에 그 방 없음', async (t) => {
    const w = makeWorld(t);
    const watcher = await w.connect('b215-watch');
    const r = await w.openRoom({ prefix: 'b215', n: 1, accessType: 'open' });
    await w.tick(1_000);
    assert.ok(w.received(watcher, 'public_rooms_updated').at(-1).rooms.some((x) => x.id === r.roomId), '준비: 목록에 안 보임');
    const { fresh } = await newTab(w, r.host);
    await w.lobby(fresh);
    await w.tick(1_000);
    assert.ok(!w.received(watcher, 'public_rooms_updated').at(-1).rooms.some((x) => x.id === r.roomId), '목록에 방이 남음');
});

test('A10-B-216 8명 방 손님, 새 탭이 enter_lobby 없이 get_current_room → 그 방 답, 명단 8명 그대로', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b216', n: 8 });
    const guest = r.guests[4];
    await newTab(w, guest);
    const room = await w.currentRoom(guest);
    assert.equal(room?.roomId, r.roomId);
    assert.equal(room.players.length, 8);
});

test('A10-B-217 5명 방 손님, 새 소켓 접속 뒤 옛 소켓이 enter_lobby → NOT_CURRENT_SOCKET, 명단 5명 그대로', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b217', n: 5 });
    const { oldSocket } = await newTab(w, r.guests[1]);
    const reply = await w.lobby(oldSocket);
    assert.deepEqual(reply, { ok: false, code: 'NOT_CURRENT_SOCKET' });
    assert.equal((await w.currentRoom(r.host)).players.length, 5);
});

test('A10-B-218 새 소켓 로비 → 새 방 만듦 → 옛 소켓 enter_lobby → NOT_CURRENT_SOCKET, 새 방 그대로', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b218', n: 1 });
    const { oldSocket, fresh } = await newTab(w, r.host);
    await w.lobby(fresh);
    const created = await w.createRoom(r.host);
    assert.equal(created.ok, true);
    const reply = await w.lobby(oldSocket);
    assert.deepEqual(reply, { ok: false, code: 'NOT_CURRENT_SOCKET' });
    assert.equal((await w.currentRoom(r.host))?.roomId, created.room.roomId);
});

test('A10-B-219 6명 판 산 A, 같은 세션 새 탭 → 로비 → INGAME 같은 판, 판 그대로', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b219', n: 6 });
    await w.toDay(g);
    const a = citizens(g)[1];
    const before = await w.snapshot(citizens(g)[2], g.gameId);
    const { fresh } = await newTab(w, a);
    assert.deepEqual(await w.lobby(fresh), { ok: true, redirect: 'INGAME', gameId: g.gameId });
    const after = await w.snapshot(citizens(g)[2], g.gameId);
    assert.equal(after.phase, before.phase);
    assert.equal(after.dayPhaseDeadline, before.dayPhaseDeadline);
    assert.equal(after.players.find((p) => p.uuid === a).isAlive, true);
});

test('A10-B-220 7명 판 죽은 A, 새 탭 로비 → liveGame:true', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b220', n: 7 });
    const a = citizens(g)[1];
    await w.voteOut(g, a);
    const { fresh } = await newTab(w, a);
    assert.equal((await w.lobby(fresh)).cleared.liveGame, true);
});

test('A10-B-221 8명 판 끝, A 새 탭 로비 → endedGame:true', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b221', n: 8 });
    await w.playToCitizenWin(g);
    const { fresh } = await newTab(w, citizens(g)[2]);
    assert.equal((await w.lobby(fresh)).cleared.endedGame, true);
});

test('A10-B-222 6명 방 방장, 새 소켓 접속만 (로비 안 보냄) → 15초 뒤에도 명단 6명 (빼기 예약 없음)', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b222', n: 6 });
    await newTab(w, r.host);
    await w.tickBy(16_000);
    assert.equal((await w.currentRoom(r.uuids[1])).players.length, 6);
});

test('A10-B-223 5명 방 손님, 새 소켓 로비 → 옛 소켓 끊김 처리 → 15초 → player_left_room 1번뿐', async (t) => {
    const w = makeWorld(t);
    const r = await w.openRoom({ prefix: 'b223', n: 5 });
    const guest = r.guests[0];
    const oldSocket = w.sock(guest);
    // 옛 소켓 끊김이 로비 입장 뒤에 오게 (밀어낼 때 바로 안 끊고 아래에서 끊음)
    oldSocket.disconnect = () => {};
    const fresh = await w.connect(guest);
    await w.lobby(fresh);
    w.closeSocket(oldSocket);
    await w.tickBy(16_000);
    assert.equal(w.received(r.host, 'player_left_room').filter((p) => p.uuid === guest).length, 1);
});
