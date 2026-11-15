'use strict';

// 결과 화면 "로비로"·로비 주소 시험 — 로비로면 끝난 판 묶임이 풀려 방 만들기·코드 입장 됨, 로비 입장 정리는 몇 번 해도 같음, 결과 화면에서 주소로 로비에 가도 풀림, "대기방으로" 답 기다리는 중 로비 입장이면 자리 안 남음, 대기방에서 로비로 가면 빠지고 방장 넘어감
// 목록 A08-B-206~210 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-lobby-exit.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a08-world');

async function endedGame(t, prefix, n) {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n });
    await w.endGame(g);
    return { w, g };
}

test('A08-B-206 6명 판 leave_game_session → create_room 성공·다른 방 코드 입장 성공', async (t) => {
    const { w, g } = await endedGame(t, 'b206', 6);
    const b = g.uuids[1];
    assert.equal((await w.lobby(b, g.gameId)).ok, true);
    const created = await w.createRoom(b, w.roomPayload({ maxPlayers: 5 }));
    assert.equal(created.ok, true, `방 만들기 실패: ${created.code} ${created.message}`);
    await w.leaveRoom(b);
    const other = 'b206-other';
    w.connect(other);
    const otherRoom = await w.createRoom(other, w.roomPayload({ maxPlayers: 5 }));
    assert.equal(otherRoom.ok, true);
    const joined = await w.joinCode(b, otherRoom.room.roomCode);
    assert.equal(joined.ok, true, `코드 입장 막힘: ${joined.code}`);
});

test('A08-B-207 5명 판 로비로 → enter_lobby 두 번 → 오류 없음, 방 자리 없음', async (t) => {
    const { w, g } = await endedGame(t, 'b207', 5);
    const b = g.uuids[1];
    assert.equal((await w.lobby(b, g.gameId)).ok, true);
    const errors = t.mock.method(console, 'error', () => {});
    const first = await w.enterLobby(b);
    const second = await w.enterLobby(b);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.deepEqual(second, first);
    assert.equal(errors.mock.callCount(), 0);
    assert.equal(await w.currentRoom(b), null);
});

test('A08-B-208 6명 판 결과 화면 사람 enter_lobby → 끝난 판에서 빠짐, create_room 성공', async (t) => {
    const { w, g } = await endedGame(t, 'b208', 6);
    const b = g.uuids[1];
    const lobby = await w.enterLobby(b);
    assert.equal(lobby.ok, true);
    assert.equal((await w.snapshot(b, g.gameId)).ok, false, '끝난 판에 아직 묶임');
    assert.equal((await w.ret(b, g.gameId)).code, 'SESSION_ENDED');
    const created = await w.createRoom(b, w.roomPayload({ maxPlayers: 5 }));
    assert.equal(created.ok, true, `방 만들기 실패: ${created.code} ${created.message}`);
});

test('A08-B-209 7명 판 return_to_room 보낸 직후(답 전) enter_lobby → 끝에 방 자리 없음, 대기방 명단에 없음', async (t) => {
    const { w, g } = await endedGame(t, 'b209', 7);
    const c = g.uuids[2];
    // 채널 넣기를 시험이 풀 때까지 붙잡는 새 탭 소켓 (답이 늦게 옴)
    let openGate;
    const gate = new Promise((resolve) => { openGate = resolve; });
    w.connect(c, { joinGate: gate });
    const pending = w.ret(c, g.gameId);
    await w.flush();
    const lobby = await w.enterLobby(c);
    assert.equal(lobby.ok, true);
    openGate();
    await pending;
    await w.flush();
    assert.equal(await w.currentRoom(c), null, '로비에 왔는데 방 자리 생김');
    // 다른 사람이 들어가 본 명단에도 없음
    const other = await w.ret(g.uuids[1], g.gameId);
    assert.equal(other.ok, true);
    assert.equal(other.room.players.some((p) => p.uuid === c), false);
});

test('A08-B-210 6명 판 B 방장으로 들어감 + C → B enter_lobby → B 방에서 빠짐, C 방장', async (t) => {
    const { w, g } = await endedGame(t, 'b210', 6);
    const [b, c] = [g.uuids[1], g.uuids[2]];
    // 원래 방장이 로비로 가서 방장 자리가 비고, 처음 들어온 B가 방장
    assert.equal((await w.lobby(g.host, g.gameId)).ok, true);
    const rb = await w.ret(b, g.gameId);
    assert.equal(rb.room.hostUuid, b, 'B가 방장이 아님 (준비 잘못)');
    assert.equal((await w.ret(c, g.gameId)).ok, true);
    assert.equal((await w.enterLobby(b)).ok, true);
    assert.equal(await w.currentRoom(b), null);
    const room = await w.currentRoom(c);
    assert.equal(room.hostUuid, c);
    assert.deepEqual(room.players.map((p) => p.uuid), [c]);
});
