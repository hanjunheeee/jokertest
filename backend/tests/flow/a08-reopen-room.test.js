'use strict';

// 판 끝 순간 다시 열린 대기방 모양 시험 — 방 id 새로·코드 같음, 빈 방·방장 칸 비움·원래 방장 남김, 지운 설정 없음, 어떻게 끝나도 열림, 한 판에 방 하나, 판 중엔 그 방 없음, 점검 종료 판은 안 엶, 지운 사건 둘(party_matching_room_ready·get_party_matching_room) 없음
// 목록 A08-B-045~055 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-reopen-room.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { makeWorld, matchmaking } = require('./a08-world');
const { scheduleEndedSweep } = require('../../socket/gameSession/departure/end');
const { reopenRoomAfterGame } = require('../../socket/matchmaking/room/returnRoom');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');

// 방 코드 뽑기에 쓰는 글자 (코드 뽑기를 그 코드로 정해 둘 때만 씀)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bytesFor = (code) => Buffer.from([...code].map((ch) => CODE_CHARS.indexOf(ch)));

// 장부에 있는 방 전부 수
const roomCount = () => matchmaking.__getStateSnapshotForTests().gameRooms.length;

test('A08-B-045 7명 판 끝 → 다시 연 방 id ≠ 판 시작 전 방 id, 코드 같음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b045', n: 7 });
    await w.endGame(g);
    const room = w.roomByCode(g.roomCode);
    assert.ok(room, '다시 연 방 없음');
    assert.notEqual(room.id, g.roomBefore.id);
    assert.equal(room.code, g.roomBefore.code);
});

test('A08-B-046 6명 판 끝 직후 → 명단 0명, hostUuid 없음, reservedHostUuid = 판 끝 때 방장', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b046', n: 6 });
    await w.endGame(g);
    const room = w.roomByCode(g.roomCode);
    assert.ok(room, '다시 연 방 없음');
    assert.equal(room.players.size, 0);
    assert.equal(room.hostUuid ?? null, null);
    assert.equal(room.returnHold?.reservedHostUuid, g.host);
});

test('A08-B-047 5명 판(옛 화면이 지운 설정 3칸을 실어 만든 방) → 다시 연 방 설정에 lightsOut·soulBetting·voteReveal 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b047', n: 5, extra: { lightsOut: true, soulBetting: true, voteReveal: true } });
    await w.endGame(g);
    const room = w.roomByCode(g.roomCode);
    const r = await w.ret(g.uuids[1], g.gameId);
    assert.equal(r.ok, true, `대기방으로 실패: ${r.code}`);
    for (const key of ['lightsOut', 'soulBetting', 'voteReveal']) {
        assert.equal(Object.hasOwn(room.settings, key), false, `장부 설정에 ${key}`);
        assert.equal(Object.hasOwn(r.room.settings, key), false, `방 내용 설정에 ${key}`);
    }
});

// ── 판이 어떻게 끝나도 다시 열림 ──
const ENDINGS = [
    { label: '밤 암살로 광대 승 (5명 판)', n: 5, how: 'jokerNightWin', winner: 'JOKER', event: 'night_result_applied' },
    { label: '재판 처형으로 시민 승 (7명 판)', n: 7, how: 'citizenWin', winner: 'CITIZEN', event: 'tribunal_vote_resolved' },
    { label: '광대가 산 채로 나가 시민 승 (6명 판)', n: 6, how: 'jokerLeaves', winner: 'CITIZEN', event: 'player_eliminated' },
];
ENDINGS.forEach((e, i) => {
    test(`A08-B-${String(48 + i).padStart(3, '0')} ${e.label} → 같은 코드 대기방`, async (t) => {
        const w = makeWorld(t);
        const g = await w.openAndStart({ prefix: `b${48 + i}`, n: e.n });
        await w.endGame(g, e.how);
        // 준비가 맞게 끝났는지 (끝을 알린 알림의 승자)
        const last = w.received(g.host, e.event).at(-1);
        assert.equal(last?.winResult?.winner, e.winner, '판이 원하는 길로 안 끝남 (준비 잘못)');
        const room = w.roomByCode(g.roomCode);
        assert.ok(room, '같은 코드 대기방이 안 열림');
        assert.equal(room.players.size, 0);
    });
});

test('A08-B-051 6명 판 끝 칸이 두 번 붙는 길(판 끝 정리·다시 열기를 또 부름) → 같은 코드 방 1개', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b051', n: 6 });
    await w.endGame(g, 'jokerNightWin');
    // 탈락 알림 쪽 판 끝 정리가 밤 결과와 같은 때 한 번 더 붙은 것처럼
    scheduleEndedSweep(w.io, w.session(g));
    reopenRoomAfterGame(w.io, w.session(g));
    assert.equal(w.countRoomsWithCode(g.roomCode), 1);
});

test('A08-B-052 5명 판 시작 직후 ~ 판 끝 직전 → 방 장부에 그 코드 방 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b052', n: 5 });
    assert.equal(w.countRoomsWithCode(g.roomCode), 0, '시작 직후');
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    assert.equal(w.countRoomsWithCode(g.roomCode), 0, '낮');
    await w.day(g, null);
    assert.equal(w.session(g).phase, 'NIGHT');
    assert.equal(w.countRoomsWithCode(g.roomCode), 0, '밤');
    await w.night(g, null);
    assert.equal(w.session(g).phase, 'DAY');
    assert.equal(w.countRoomsWithCode(g.roomCode), 0, '둘째 낮 (판 끝 직전)');
    await w.endGame(g);
    assert.equal(w.countRoomsWithCode(g.roomCode), 1, '판 끝');
});

test('A08-B-053 6명 판 점검 강제 종료 → 다시 연 방 없음, 코드 풀림(그 코드로 새 방 만들어짐) [지금 동작]', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b053', n: 6 });
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    assert.equal(abortGamesForMaintenance(w.io), 1, '점검 종료가 판을 안 끝냄 (준비 잘못)');
    await w.flush();
    assert.equal(w.countRoomsWithCode(g.roomCode), 0);
    const other = 'b053-other';
    w.connect(other);
    const bytes = t.mock.method(crypto, 'randomBytes', () => bytesFor(g.roomCode));
    const created = await w.createRoom(other, w.roomPayload({ maxPlayers: 5 }));
    bytes.mock.restore();
    assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
    assert.equal(created.room.roomCode, g.roomCode);
});

test('A08-B-054 7명 판 끝 ~ 180초 → 판 사람 누구도 party_matching_room_ready 못 받음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b054', n: 7 });
    await w.endGame(g);
    await w.ret(g.uuids[1], g.gameId);
    await w.ret(g.host, g.gameId);
    await w.lobby(g.uuids[2], g.gameId);
    w.tickToSinceEnd(g, 181_000);
    for (const uuid of g.uuids) {
        assert.equal(w.received(uuid, 'party_matching_room_ready').length, 0, uuid);
    }
});

test('A08-B-055 5명 판 끝 뒤 get_party_matching_room 보냄 → 답 없음, 방 안 생김, 서버 안 죽음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b055', n: 5 });
    await w.endGame(g);
    const before = roomCount();
    const asker = w.sock(g.uuids[1]);
    assert.equal(asker.listenerCount('get_party_matching_room'), 0, '받는 곳이 있음');
    let answered = 0;
    assert.doesNotThrow(() => asker.trigger('get_party_matching_room', { gameId: g.gameId }, () => { answered += 1; }));
    await w.flush();
    w.tick(1_000);
    await w.flush();
    assert.equal(answered, 0);
    assert.equal(roomCount(), before);
    assert.equal(w.countRoomsWithCode(g.roomCode), 1);
});
