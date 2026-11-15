'use strict';

// 판 끝 뒤 공개 방 목록 시험 — 0명 다시 연 방은 목록에 없음, 첫 사람이 들어오면 나타남(인원 1), 목록으로 들어옴
// 목록 A08-B-180~182 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-public-list.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a08-world');

async function endedOpenGame(t, prefix, n) {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n, accessType: 'open' });
    await w.endGame(g);
    return { w, g };
}

// 그 사람이 마지막으로 받은 목록 방송
const lastListOf = (w, uuid) => w.received(uuid, 'public_rooms_updated').at(-1)?.rooms;

test('A08-B-180 공개·6명 판 끝 직후 아무도 안 들어감 → get_public_rooms 답·목록 방송 둘 다 그 방 없음', async (t) => {
    const { w, g } = await endedOpenGame(t, 'b180', 6);
    const reopened = w.roomByCode(g.roomCode);
    assert.ok(reopened, '다시 연 방 없음 (준비 잘못)');
    w.tick(1_000);
    w.flushList();
    const answered = await w.publicRooms();
    assert.equal(answered.some((r) => r.id === reopened.id), false, '답에 있음');
    const broadcast = lastListOf(w, g.uuids[1]);
    assert.ok(Array.isArray(broadcast), '목록 방송을 못 받음');
    assert.equal(broadcast.some((r) => r.id === reopened.id), false, '방송에 있음');
});

test('A08-B-181 공개·7명 판 C 대기방으로 → 목록 방송에 그 방, 인원 1', async (t) => {
    const { w, g } = await endedOpenGame(t, 'b181', 7);
    const c = g.uuids[2];
    const r = await w.ret(c, g.gameId);
    assert.equal(r.ok, true);
    w.tick(1_000);
    w.flushList();
    const listed = lastListOf(w, g.uuids[3])?.find((room) => room.id === r.room.roomId);
    assert.ok(listed, '목록 방송에 그 방 없음');
    assert.equal(listed.current, 1);
});

test('A08-B-182 공개·5명 판 C 들어간 뒤 판 밖 사람 join_public_room → 들어감', async (t) => {
    const { w, g } = await endedOpenGame(t, 'b182', 5);
    const r = await w.ret(g.uuids[2], g.gameId);
    assert.equal(r.ok, true);
    const outsider = 'b182-out';
    w.connect(outsider);
    const joined = await w.joinPublic(outsider, r.room.roomId);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
    assert.equal(joined.room.players.length, 2);
});
