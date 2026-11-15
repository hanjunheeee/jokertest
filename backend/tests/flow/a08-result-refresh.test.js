'use strict';

// 결과 화면 새로고침·끊김 시험 — 끊기면 60초 안 기다리고 바로 끝난 판에서 빠짐, 다시 붙어도 대기방으로·결과는 안 됨, 코드로는 들어옴, 마지막 결과 화면 사람이 끊겨도 방은 남음, 대기방 들어간 뒤 새로고침은 보통 대기방 규칙(15초)
// 목록 A08-B-200~205 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-result-refresh.test.js
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

test('A08-B-200 6명 판 끝 뒤 C 연결 끊김 → 그 자리에서 끝난 판에서 빠짐(시계 안 넘기고 다시 붙어 스냅샷 거절)', async (t) => {
    const { w, g } = await endedGame(t, 'b200', 6);
    const c = g.uuids[2];
    await w.disconnect(c);
    await w.reconnect(c);
    assert.equal(Date.now(), g.endedAt, '시계가 넘어감');
    const snap = await w.snapshot(c, g.gameId);
    assert.equal(snap.ok, false, '끝난 판에 아직 묶임');
});

test('A08-B-201 6명 판 B-200 뒤 C 다시 접속 → return_to_room → SESSION_ENDED', async (t) => {
    const { w, g } = await endedGame(t, 'b201', 6);
    const c = g.uuids[2];
    await w.disconnect(c);
    await w.reconnect(c);
    const r = await w.ret(c, g.gameId);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SESSION_ENDED');
});

test('A08-B-202 5명 판 다시 접속 뒤 스냅샷 → 끝난 판 없음 답', async (t) => {
    const { w, g } = await endedGame(t, 'b202', 5);
    const c = g.uuids[2];
    await w.disconnect(c);
    w.tick(5_000);
    await w.reconnect(c);
    const snap = await w.snapshot(c, g.gameId);
    assert.equal(snap.ok, false);
    assert.equal(snap.phase, undefined, '끝난 판 내용이 옴');
});

test('A08-B-203 7명 판 다시 접속 뒤 코드 입장 → 들어감', async (t) => {
    const { w, g } = await endedGame(t, 'b203', 7);
    const c = g.uuids[2];
    await w.disconnect(c);
    await w.reconnect(c);
    const joined = await w.joinCode(c, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
});

test('A08-B-204 5명 판 4명 대기방으로, 남은 1명 끊김 → 끝난 판 지워짐, 방 4명 그대로', async (t) => {
    const { w, g } = await endedGame(t, 'b204', 5);
    const last = g.uuids[4];
    for (const uuid of g.uuids.slice(0, 4)) assert.equal((await w.ret(uuid, g.gameId)).ok, true);
    await w.disconnect(last);
    assert.equal(w.session(g) ?? null, null, '끝난 판이 안 지워짐');
    const room = await w.currentRoom(g.host);
    assert.deepEqual(room.players.map((p) => p.uuid).sort(), g.uuids.slice(0, 4).sort());
});

test('A08-B-205 5명 판 전원 대기방으로(마지막으로 판에서 빠진 사람 포함) → 그 사람 끊김 → 15초 안 다시 붙음 → 대기방 자리 그대로', async (t) => {
    const { w, g } = await endedGame(t, 'b205', 5);
    for (const uuid of g.uuids) assert.equal((await w.ret(uuid, g.gameId)).ok, true);
    const last = g.uuids[4];
    assert.equal(w.session(g) ?? null, null, '마지막 사람이 들어가도 판이 남음 (준비 잘못)');
    await w.disconnect(last);
    w.tick(10_000);
    await w.reconnect(last);
    const room = await w.currentRoom(last);
    assert.ok(room?.players.some((p) => p.uuid === last), '다시 붙었는데 자리 없음');
    // 15초가 지나도 그대로
    w.tick(20_000);
    const later = await w.currentRoom(g.host);
    assert.equal(later.players.length, 5);
});
