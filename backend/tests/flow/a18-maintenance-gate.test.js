'use strict';

// 점검 문 시험 — 점검 중엔 새 판·새 방으로 가는 사건 5개가 MAINTENANCE로 막힘, 시작 시각 경계, 끄면 다시 됨, 방·판 안 행동은 그대로
// 목록 A18-B-101~110 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/flow/a18-maintenance-gate.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// 가짜 소켓·진짜 사건 처리기 세상 (A10 시험 도우미, 읽기만)
const { makeWorld, maintenance } = require('./a10-world');

// 점검 기본 안내 글 (services/ops/maintenance.js 사용자 문구)
const DEFAULT_MESSAGE = '서버 점검 중입니다. 점검이 끝난 뒤 다시 시도해주세요.';
const MINUTE = 60_000;

// 점검 켜기 (시작 시각 없음 = 바로 점검 중), 끝 예정은 1시간 뒤 → 답에 실릴 끝 시각 글자
function turnOn({ startsAt = null } = {}) {
    const endsAt = new Date(Date.now() + 60 * MINUTE);
    maintenance.__setStateForTests({ enabled: true, startsAt, endsAt });
    return endsAt.toISOString();
}

// 거절 답 모양 확인
function assertBlocked(reply, endsAt) {
    assert.equal(reply?.ok, false, `거절이 아님: ${JSON.stringify(reply)}`);
    assert.equal(reply.code, 'MAINTENANCE');
    assert.equal(reply.message, DEFAULT_MESSAGE);
    assert.equal(reply.endsAt, endsAt);
}

// 같은 점검 줄을 DB에서 읽은 것처럼 (가짜 저장소), 시험 끝에 꺼짐으로
const fakeDb = (row) => ({ MaintenanceState: { findOne: async () => row } });

// ── 101~105: 막히는 사건 다섯 ──
test('A18-B-101 점검 켜짐 + create_room → MAINTENANCE·기본 글·endsAt, 방 안 생김', async (t) => {
    const w = makeWorld(t);
    await w.connect('b101-host');
    const endsAt = turnOn();
    assertBlocked(await w.createRoom('b101-host'), endsAt);
    assert.equal(await w.currentRoom('b101-host'), null);
});

test('A18-B-102 점검 켜짐 + start_game(6명 방) → MAINTENANCE, 판 안 생김', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b102', n: 6, maxPlayers: 6, ready: true });
    const endsAt = turnOn();
    assertBlocked(await w.start(room.room, room.host), endsAt);
    for (const uuid of room.uuids) assert.equal(w.count(uuid, 'game_started'), 0, `${uuid} 판 시작 받음`);
    assert.equal((await w.currentRoom(room.host))?.roomId, room.roomId, '방이 사라짐');
});

test('A18-B-103 점검 켜짐 + join_room_by_code → 입장 실패 알림 MAINTENANCE, 방 명단에 없음', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b103', n: 5 });
    await w.connect('b103-late');
    const endsAt = turnOn();
    const joined = await w.joinByCode('b103-late', room.roomCode);
    assert.equal(joined?.event, 'room_join_failed');
    assertBlocked({ ok: false, ...joined }, endsAt);
    const roster = (await w.currentRoom(room.host)).players.map((p) => p.uuid);
    assert.equal(roster.includes('b103-late'), false);
});

test('A18-B-104 점검 켜짐 + join_matchmaking → 입장 실패 알림 MAINTENANCE, 방 안 생김', async (t) => {
    const w = makeWorld(t);
    await w.connect('b104-a');
    const endsAt = turnOn();
    await w.send('b104-a', 'join_matchmaking');
    const failed = w.received('b104-a', 'room_join_failed');
    assert.equal(failed.length, 1);
    assertBlocked({ ok: false, ...failed[0] }, endsAt);
    assert.equal(await w.currentRoom('b104-a'), null);
});

test('A18-B-105 점검 켜짐 + return_to_room(5명 판 끝 뒤) → MAINTENANCE, 대기방 안 생김', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b105', n: 5 });
    await w.playToCitizenWin(g);
    const someone = g.uuids.find((u) => u !== g.joker);
    const endsAt = turnOn();
    assertBlocked(await w.returnToRoom(someone, g.gameId), endsAt);
    assert.equal(await w.currentRoom(someone), null);
});

// ── 106~108: 시작 시각 경계 (가짜 시계 = 세상의 Date) ──
[
    ['106', 1_000, true, '지금 +1초'],
    ['107', 0, false, '딱 지금'],
    ['108', -1_000, false, '1초 전'],
].forEach(([no, offset, allowed, label]) => {
    test(`A18-B-${no} 점검 시작 시각 = ${label} → 방 만들기 ${allowed ? '됨' : '거절'}`, async (t) => {
        const w = makeWorld(t);
        await w.connect(`b${no}-host`);
        const endsAt = turnOn({ startsAt: new Date(Date.now() + offset) });
        const reply = await w.createRoom(`b${no}-host`);
        if (allowed) assert.equal(reply.ok, true, reply.message);
        else assertBlocked(reply, endsAt);
    });
});

test('A18-B-109 점검 켜짐 → 방 만들기 거절 → 꺼짐으로 다시 읽기 → 같은 사람 방 만들기 됨', async (t) => {
    const w = makeWorld(t);
    await w.connect('b109-host');
    const endsAt = turnOn();
    assertBlocked(await w.createRoom('b109-host'), endsAt);
    await maintenance.reloadMaintenance({ db: fakeDb({ id: 1, is_enabled: false, message: null, starts_at: null, ends_at: null }) });
    const reply = await w.createRoom('b109-host');
    assert.equal(reply.ok, true, reply.message);
});

test('A18-B-110 시작 시각 없이 켠 점검 중: 6명 방 준비 됨, 진행 중 7명 판 낮 투표 표 받음', async (t) => {
    const w = makeWorld(t);
    // 진행 중 7명 판: 첫 낮 투표까지 (점검 켜기 전)
    const g = await w.openGame({ prefix: 'b110g', n: 7 });
    await w.toDay(g);
    const alive = w.aliveOf(g.gameId);
    for (const uuid of alive) await w.ask(uuid, 'ready_for_day_vote', { gameId: g.gameId });
    await w.advanceUntil(g.gameId, (s) => s.dayPhase === 'DAY_VOTE');
    // 6명 대기방 (아직 준비 안 함)
    const room = await w.openRoom({ prefix: 'b110r', n: 6, maxPlayers: 6 });
    turnOn();
    const ready = await w.ask(room.guests[0], 'set_ready', { roomId: room.roomId, isReady: true, expectedSettingsVersion: room.room.settingsVersion });
    assert.equal(ready.ok, true, ready.message);
    const vote = await w.ask(alive[0], 'cast_day_vote', { gameId: g.gameId, targetId: alive[1] });
    assert.equal(vote.ok, true, `표 거절: ${vote.code}`);
});
