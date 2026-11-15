'use strict';

// 판 끝 뒤 정원이 차도 원래 방장 칸은 남는지 시험 — 코드 입장·초대 수락·공개 목록 입장 모두 1칸 덜, 공개 목록 "가득", 180초·로비로면 칸 풀림
// 목록 A08-B-114~122·124 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-host-seat-full.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, MM } = require('./a08-world');
const { BOOT_EPOCH } = require('../../socket/matchmaking/core/constants');

// 판 끝 → 방장 빼고 전원(또는 count명) 대기방으로
async function allButHostReturn(t, prefix, n, { maxPlayers = n, accessType = 'code', count = n - 1 } = {}) {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n, maxPlayers, accessType });
    await w.endGame(g);
    for (const uuid of g.uuids.slice(1, 1 + count)) {
        const r = await w.ret(uuid, g.gameId);
        assert.equal(r.ok, true, `${uuid} 대기방으로 실패: ${r.code}`);
    }
    return { w, g };
}

// 판 밖 새 사람 코드 입장
async function newcomerJoins(w, g, label) {
    const uuid = `${label}-new`;
    w.connect(uuid);
    return w.joinCode(uuid, g.roomCode);
}

// ── 정원 6 ──
test('A08-B-114 6명 판(정원 6) A 빼고 5명 들어감 → 새 사람 코드 입장 ROOM_FULL', async (t) => {
    const { w, g } = await allButHostReturn(t, 'b114', 6);
    const joined = await newcomerJoins(w, g, 'b114');
    assert.equal(joined.ok, false);
    assert.equal(joined.code, 'ROOM_FULL');
});

test('A08-B-115 6명 판(정원 6) A 빼고 5명 → 새 사람 막힌 뒤 A 누름 → 들어감 6/6', async (t) => {
    const { w, g } = await allButHostReturn(t, 'b115', 6);
    assert.equal((await newcomerJoins(w, g, 'b115')).code, 'ROOM_FULL');
    const r = await w.ret(g.host, g.gameId);
    assert.equal(r.ok, true, `A 막힘: ${r.code}`);
    assert.equal(r.room.players.length, 6);
});

// ── 정원 5 ──
test('A08-B-116 5명 판(정원 5) A 빼고 4명 → 새 사람 ROOM_FULL', async (t) => {
    const { w, g } = await allButHostReturn(t, 'b116', 5);
    const joined = await newcomerJoins(w, g, 'b116');
    assert.equal(joined.ok, false);
    assert.equal(joined.code, 'ROOM_FULL');
});

test('A08-B-117 5명 판(정원 5) A 빼고 4명 → A 들어감 5/5', async (t) => {
    const { w, g } = await allButHostReturn(t, 'b117', 5);
    const r = await w.ret(g.host, g.gameId);
    assert.equal(r.ok, true, `A 막힘: ${r.code}`);
    assert.equal(r.room.players.length, 5);
});

test('A08-B-118 정원 10·7명 판 A 빼고 6명 + 새 사람 3명 = 9 → 새 사람 하나 더 ROOM_FULL', async (t) => {
    const { w, g } = await allButHostReturn(t, 'b118', 7, { maxPlayers: 10 });
    for (let i = 0; i < 3; i += 1) {
        const joined = await newcomerJoins(w, g, `b118-${i}`);
        assert.equal(joined.ok, true, `새 사람 ${i} 막힘: ${joined.code}`);
    }
    assert.equal((await w.currentRoom(g.uuids[1])).players.length, 9);
    const extra = await newcomerJoins(w, g, 'b118-x');
    assert.equal(extra.ok, false);
    assert.equal(extra.code, 'ROOM_FULL');
});

test('A08-B-119 6명 판 A 빼고 5명 → 가짜 시계 180초 → 새 사람 들어옴 6/6', async (t) => {
    const { w, g } = await allButHostReturn(t, 'b119', 6);
    w.tickToSinceEnd(g, 180_000);
    const joined = await newcomerJoins(w, g, 'b119');
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
    assert.equal(joined.room.players.length, 6);
});

test('A08-B-120 5명 판 A 빼고 4명 → A 로비로 → 새 사람 들어옴 5/5', async (t) => {
    const { w, g } = await allButHostReturn(t, 'b120', 5);
    assert.equal((await w.lobby(g.host, g.gameId)).ok, true);
    const joined = await newcomerJoins(w, g, 'b120');
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
    assert.equal(joined.room.players.length, 5);
});

test('A08-B-121 정원 6·6명 판 A 빼고 5명 → 안에 있는 사람이 친구 초대 → 친구 수락 → ROOM_FULL', async (t) => {
    const { w, g } = await allButHostReturn(t, 'b121', 6);
    const room = await w.currentRoom(g.uuids[1]);
    const friend = 'b121-friend';
    w.connect(friend);
    // 안에 있는 사람이 보낸 초대 (초대 기록은 가짜 서비스가 들고 있음)
    w.invites.set('inv-b121', { known: true, roomId: room.roomId, roomInstanceId: room.roomInstanceId, bootEpoch: BOOT_EPOCH });
    const reply = await w.ask(MM.handleAcceptGameInvite, friend, { inviteId: 'inv-b121' });
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'ROOM_FULL');
});

test('A08-B-122 공개·정원 6·6명 판 A 빼고 5명 → 공개 목록 그 방 status full', async (t) => {
    const { w, g } = await allButHostReturn(t, 'b122', 6, { accessType: 'open' });
    const room = await w.currentRoom(g.uuids[1]);
    const listed = (await w.publicRooms()).find((r) => r.id === room.roomId);
    assert.ok(listed, '목록에 그 방 없음');
    assert.equal(listed.current, 5);
    assert.equal(listed.status, 'full');
});

test('A08-B-124 공개·정원 5·5명 판 A 빼고 4명 → 새 사람 join_public_room → 가득 참 거절', async (t) => {
    const { w, g } = await allButHostReturn(t, 'b124', 5, { accessType: 'open' });
    const room = await w.currentRoom(g.uuids[1]);
    const outsider = 'b124-new';
    w.connect(outsider);
    const joined = await w.joinPublic(outsider, room.roomId);
    assert.equal(joined.ok, false);
    assert.equal(joined.code, 'ROOM_FULL');
});
