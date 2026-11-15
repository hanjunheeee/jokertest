'use strict';

// 판 끝 뒤 다시 연 방이 언제 없어지나 시험 — 아무도 안 오면 판 끝 + 180초에 없어짐(코드 풀림), 한 명이라도 있으면 유지, 들어왔다 다 나가면 180초에, 180초 뒤 마지막 사람이 나가면 바로, 판이 지워져도 방·시계 남음, 전원 로비로여도 180초까지
// 목록 A08-B-139~146·153·154 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-room-lifetime.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { makeWorld } = require('./a08-world');

const RESULT_MS = 180_000;
// 방 코드 뽑기에 쓰는 글자 (코드 뽑기를 그 코드로 정해 둘 때만 씀)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bytesFor = (code) => Buffer.from([...code].map((ch) => CODE_CHARS.indexOf(ch)));

async function endedGame(t, prefix, n) {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n });
    await w.endGame(g);
    return { w, g };
}

// ── 아무도 안 오면 방이 없어지는 때 (6명 판) ──
[[179_000, true], [180_000, false], [181_000, false]].forEach(([at, exists], i) => {
    test(`A08-B-${String(139 + i).padStart(3, '0')} 6명 판 아무도 안 누름 → 판 끝 + ${at / 1000}초 그 코드 방 ${exists ? '있음' : '없음'}`, async (t) => {
        const { w, g } = await endedGame(t, `b${139 + i}`, 6);
        w.tickToSinceEnd(g, at);
        assert.equal(w.roomByCode(g.roomCode) !== null, exists);
    });
});

test('A08-B-142 5명 판 아무도 안 옴 → 180초 뒤 판 밖 사람 코드 입장 → ROOM_CODE_MISMATCH, "이미 시작된 방" 아님', async (t) => {
    const { w, g } = await endedGame(t, 'b142', 5);
    w.tickToSinceEnd(g, RESULT_MS);
    const outsider = 'b142-out';
    w.connect(outsider);
    const joined = await w.joinCode(outsider, g.roomCode);
    assert.equal(joined.ok, false);
    assert.notEqual(joined.code, 'ROOM_ALREADY_STARTED');
    assert.equal(joined.code, 'ROOM_CODE_MISMATCH');
});

test('A08-B-143 6명 판 방 없어진 뒤 코드 뽑기를 그 코드로 정해 두고 새 방 만들기 → 그 코드로 만들어짐', async (t) => {
    const { w, g } = await endedGame(t, 'b143', 6);
    w.tickToSinceEnd(g, RESULT_MS);
    assert.equal(w.roomByCode(g.roomCode), null, '방이 안 없어짐 (준비 잘못)');
    const other = 'b143-other';
    w.connect(other);
    const bytes = t.mock.method(crypto, 'randomBytes', () => bytesFor(g.roomCode));
    const created = await w.createRoom(other, w.roomPayload({ maxPlayers: 5 }));
    bytes.mock.restore();
    assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
    assert.equal(created.room.roomCode, g.roomCode);
});

test('A08-B-144 7명 판 C 들어감 → 181초·30분 뒤에도 방 있음, C 자리 그대로', async (t) => {
    const { w, g } = await endedGame(t, 'b144', 7);
    const c = g.uuids[2];
    assert.equal((await w.ret(c, g.gameId)).ok, true);
    w.tickToSinceEnd(g, 181_000);
    assert.ok(w.roomByCode(g.roomCode), '181초에 방 없음');
    assert.ok((await w.currentRoom(c))?.players.some((p) => p.uuid === c), '181초 C 자리 없음');
    w.tickToSinceEnd(g, 30 * 60_000);
    assert.ok(w.roomByCode(g.roomCode), '30분에 방 없음');
    assert.ok((await w.currentRoom(c))?.players.some((p) => p.uuid === c), '30분 C 자리 없음');
});

test('A08-B-145 5명 판 C 들어감 → 100초에 C 나감 → 179초 방 있음, 180초 없음', async (t) => {
    const { w, g } = await endedGame(t, 'b145', 5);
    const c = g.uuids[2];
    assert.equal((await w.ret(c, g.gameId)).ok, true);
    w.tickToSinceEnd(g, 100_000);
    await w.leaveRoom(c);
    w.tickToSinceEnd(g, 179_000);
    assert.ok(w.roomByCode(g.roomCode), '179초에 방 없음');
    w.tickToSinceEnd(g, RESULT_MS);
    assert.equal(w.roomByCode(g.roomCode), null);
});

test('A08-B-146 6명 판 C만 있음 → 200초에 C 나감 → 방 없음 [지금 동작]', async (t) => {
    const { w, g } = await endedGame(t, 'b146', 6);
    const c = g.uuids[2];
    assert.equal((await w.ret(c, g.gameId)).ok, true);
    w.tickToSinceEnd(g, 200_000);
    assert.ok(w.roomByCode(g.roomCode), '200초에 C가 있는데 방 없음 (준비 잘못)');
    await w.leaveRoom(c);
    assert.equal(w.roomByCode(g.roomCode), null);
});

test('A08-B-153 5명 판 원래 방장 포함 전원 대기방으로 → 끝난 판 지워짐 → 180초에 오류 없음, 방 그대로 5명', async (t) => {
    const { w, g } = await endedGame(t, 'b153', 5);
    for (const uuid of g.uuids) assert.equal((await w.ret(uuid, g.gameId)).ok, true, `${uuid} 실패`);
    assert.equal(w.session(g) ?? null, null, '끝난 판이 안 지워짐');
    const errors = t.mock.method(console, 'error', () => {});
    w.tickToSinceEnd(g, RESULT_MS);
    w.tick(1_000);
    assert.equal(errors.mock.callCount(), 0, `오류 기록: ${errors.mock.calls.map((c) => c.arguments[0]).join(' / ')}`);
    const room = await w.currentRoom(g.host);
    assert.equal(room.players.length, 5);
    assert.ok(w.roomByCode(g.roomCode));
});

test('A08-B-154 6명 판 전원 로비로 → 끝난 판 지워짐 → 179초 코드 방 있음, 180초 없음', async (t) => {
    const { w, g } = await endedGame(t, 'b154', 6);
    for (const uuid of g.uuids) assert.equal((await w.lobby(uuid, g.gameId)).ok, true, `${uuid} 실패`);
    assert.equal(w.session(g) ?? null, null, '끝난 판이 안 지워짐');
    w.tickToSinceEnd(g, 179_000);
    assert.ok(w.roomByCode(g.roomCode), '179초에 방 없음');
    w.tickToSinceEnd(g, RESULT_MS);
    assert.equal(w.roomByCode(g.roomCode), null);
});
