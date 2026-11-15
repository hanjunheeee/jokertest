'use strict';

// [버그 3] "로비로"와 "대기방으로"가 섞인 판 끝 시험 — 로비 간 사람은 묶이지 않고 어디든 들어감, 남은 사람 + 새 사람으로 시작, 결과 화면에 머무는 사람은 시작을 안 막음
// 목록 A08-B-073~077 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-bug3-mixed.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a08-world');

const rosterOf = (room) => room.players.map((p) => p.uuid);

// 판 끝 → B(둘째 사람) 로비로 → 나머지(returners, 방장 먼저) 대기방으로
async function bLobbyRestReturn(t, prefix, n, returners = null) {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n });
    await w.endGame(g);
    const b = g.uuids[1];
    assert.equal((await w.lobby(b, g.gameId)).ok, true, 'B 로비로 실패');
    const back = returners ?? g.uuids.filter((u) => u !== b);
    let room = null;
    for (const uuid of back) {
        const r = await w.ret(uuid, g.gameId);
        assert.equal(r.ok, true, `${uuid} 대기방으로 실패: ${r.code}`);
        room = r.room;
    }
    return { w, g, b, room };
}

test('A08-B-073 [버그 3] 5명 판 B 로비로 → A·C·D·E 누름 → 명단 4명, B는 create_room 성공("이미 참여 중인 방" 아님)', async (t) => {
    const { w, g, b, room } = await bLobbyRestReturn(t, 'b073', 5);
    assert.deepEqual(rosterOf(room).sort(), g.uuids.filter((u) => u !== b).sort());
    const created = await w.createRoom(b, w.roomPayload({ maxPlayers: 5 }));
    assert.equal(created.ok, true, `B 방 만들기 실패: ${created.code} ${created.message}`);
    assert.notEqual(created.code, 'ALREADY_IN_ROOM');
});

test('A08-B-074 [버그 3] 5명 판 B 로비로 → 다른 대기방 코드 입장 → 들어감', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b074', n: 5 });
    await w.endGame(g);
    const b = g.uuids[1];
    assert.equal((await w.lobby(b, g.gameId)).ok, true);
    const other = 'b074-other';
    w.connect(other);
    const created = await w.createRoom(other, w.roomPayload({ maxPlayers: 6 }));
    assert.equal(created.ok, true);
    const joined = await w.joinCode(b, created.room.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
    assert.ok(rosterOf(joined.room).includes(b));
});

test('A08-B-075 [버그 3] 6명 판 B 로비로 → 나머지 대기방으로 → B 같은 코드 입장 → 들어감, 준비 안 됨', async (t) => {
    const { w, g, b } = await bLobbyRestReturn(t, 'b075', 6);
    const joined = await w.joinCode(b, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
    assert.equal(joined.room.players.find((p) => p.uuid === b).isReady, false);
    assert.equal(joined.room.players.length, 6);
});

test('A08-B-076 [버그 3] 5명 판 B 로비로, 4명 대기방으로 → 새 사람 코드 입장 → 5명 준비 → 시작 성공, 새 판 5명에 B 없음', async (t) => {
    const { w, g, b } = await bLobbyRestReturn(t, 'b076', 5);
    const newcomer = 'b076-new';
    w.connect(newcomer);
    assert.equal((await w.joinCode(newcomer, g.roomCode)).ok, true);
    const people = [...g.uuids.filter((u) => u !== b), newcomer];
    for (const uuid of people) assert.equal((await w.ready(uuid)).ok, true, `${uuid} 준비 실패`);
    const reply = await w.start(g.host);
    assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`);
    const started = w.received(g.host, 'game_started').find((p) => p.gameId === reply.gameId);
    const players = started.state.players.map((p) => p.uuid);
    assert.deepEqual(players.sort(), people.sort());
    assert.equal(players.includes(b), false);
    assert.equal(w.received(b, 'game_started').some((p) => p.gameId === reply.gameId), false, 'B가 새 판 시작 알림 받음');
});

test('A08-B-077 6명 판 5명 대기방으로·준비, F는 아무것도 안 누름 → 시작 성공, F는 새 판에 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b077', n: 6 });
    await w.endGame(g);
    const f = g.uuids[5];
    const back = g.uuids.filter((u) => u !== f);
    for (const uuid of back) assert.equal((await w.ret(uuid, g.gameId)).ok, true, `${uuid} 대기방으로 실패`);
    for (const uuid of back) assert.equal((await w.ready(uuid)).ok, true, `${uuid} 준비 실패`);
    const reply = await w.start(g.host);
    assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`);
    const started = w.received(g.host, 'game_started').find((p) => p.gameId === reply.gameId);
    assert.equal(started.state.players.some((p) => p.uuid === f), false);
    assert.equal(w.received(f, 'game_started').some((p) => p.gameId === reply.gameId), false);
});
