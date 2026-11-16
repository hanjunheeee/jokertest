'use strict';

// 점검 시계 시험 — 시작 시각에 이 Node 진행 판·대기방 끝냄(전원 알림), 같은 상태 다시 읽어도 두 번 안 끝냄, 예약 취소면 안 끝냄, 시작 시각 없이 켜면 안 끝냄
// 목록 A18-B-111~113·123 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/flow/a18-maintenance-clock.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// 가짜 소켓·진짜 사건 처리기 세상 (A10 시험 도우미, 읽기만), 세상이 가짜 시계(setTimeout·Date)를 켬
const { makeWorld, maintenance } = require('./a10-world');
const { createMaintenanceClock } = require('../../services/ops/maintenanceClock');

// 점검 줄을 DB에서 읽은 것처럼 (가짜 저장소)
const fakeDb = (row) => ({ MaintenanceState: { findOne: async () => row } });
const row = ({ enabled, startsAt }) => ({ id: 1, is_enabled: enabled, message: null, starts_at: startsAt, ends_at: null });

// 이 세상에 붙은 점검 시계 하나: 다시 읽을 때마다 맞춤 (서버의 startMaintenanceClock과 같은 연결), 시험 끝에 멈춤
function attachClock(t, w) {
    const clock = createMaintenanceClock({ getIo: () => w.io, nodeId: () => 'n1' });
    const off = maintenance.onMaintenanceChange((current) => clock.sync(current));
    t.after(() => { off(); clock.stop(); });
    return clock;
}

// 점검 이유로 끝난 판 알림 수 (그 판 것만)
const maintenanceEnds = (w, uuid, gameId) => w.received(uuid, 'game_ended').filter((p) => p.gameId === gameId && p.reason === 'MAINTENANCE').length;
const maintenanceRoomCloses = (w, uuid) => w.received(uuid, 'room_deleted').filter((p) => p.code === 'MAINTENANCE').length;

test('A18-B-111 시작 시각 30초 뒤 예약, 7명 판 + 6명 대기방 → 29.9초엔 그대로, 30초에 판 7명 game_ended MAINTENANCE·방 6명 room_deleted MAINTENANCE', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b111g', n: 7 });
    const room = await w.openRoom({ prefix: 'b111r', n: 6, maxPlayers: 6 });
    attachClock(t, w);
    await maintenance.reloadMaintenance({ db: fakeDb(row({ enabled: true, startsAt: new Date(Date.now() + 30_000) })) });

    await w.tickBy(29_900, 100);
    for (const uuid of g.uuids) assert.equal(maintenanceEnds(w, uuid, g.gameId), 0, `${uuid} 시작 시각 전에 판 끝남`);
    for (const uuid of room.uuids) assert.equal(maintenanceRoomCloses(w, uuid), 0, `${uuid} 시작 시각 전에 방 닫힘`);
    assert.notEqual(w.phaseOf(g.gameId), null, '판이 사라짐');

    await w.tickBy(100, 100);
    for (const uuid of g.uuids) assert.equal(maintenanceEnds(w, uuid, g.gameId), 1, `${uuid} 판 끝 알림 없음`);
    for (const uuid of room.uuids) assert.equal(maintenanceRoomCloses(w, uuid), 1, `${uuid} 방 닫힘 알림 없음`);
});

test('A18-B-112 [지금 동작] 시작 시각 지나 판 끝낸 뒤 같은 점검 상태로 다시 읽기 → 새로 시작한 8명 판 그대로, 판 끝 알림 다시 없음', async (t) => {
    const w = makeWorld(t);
    const first = await w.openGame({ prefix: 'b112a', n: 5 });
    attachClock(t, w);
    const sameRow = row({ enabled: true, startsAt: new Date(Date.now() + 5_000) });
    await maintenance.reloadMaintenance({ db: fakeDb(sameRow) });
    await w.tickBy(5_000, 500);
    assert.equal(maintenanceEnds(w, first.uuids[0], first.gameId), 1, '첫 판이 안 끝남');

    // 8명 판 새로 시작: 점검 문은 잠깐 열고(알림 없이) 판을 차린 뒤 같은 줄로 다시 읽음 (60초 안전망과 같은 읽기)
    maintenance.__setStateForTests({ enabled: false });
    const second = await w.openGame({ prefix: 'b112b', n: 8 });
    await maintenance.reloadMaintenance({ db: fakeDb(sameRow) });
    await w.tickBy(3_000, 500);
    for (const uuid of second.uuids) assert.equal(maintenanceEnds(w, uuid, second.gameId), 0, `${uuid} 판이 또 끝남`);
    assert.notEqual(w.phaseOf(second.gameId), null, '8명 판이 사라짐');
});

test('A18-B-113 시작 시각 30초 뒤 예약 → 10초에 점검 끔 → 30초 지나도 5명 판 그대로, 알림 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b113', n: 5 });
    attachClock(t, w);
    await maintenance.reloadMaintenance({ db: fakeDb(row({ enabled: true, startsAt: new Date(Date.now() + 30_000) })) });
    await w.tickBy(10_000, 500);
    await maintenance.reloadMaintenance({ db: fakeDb(row({ enabled: false, startsAt: null })) });
    await w.tickBy(25_000, 500);
    for (const uuid of g.uuids) assert.equal(maintenanceEnds(w, uuid, g.gameId), 0, `${uuid} 판 끝 알림 받음`);
    assert.notEqual(w.phaseOf(g.gameId), null, '판이 사라짐');
});

test('A18-B-123 시작 시각 없이 켠 점검(시계 붙음) → 60초 지나도 5명 판·6명 대기방 그대로(끝 알림 없음), 새 방 만들기만 MAINTENANCE로 거절', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b123g', n: 5 });
    const room = await w.openRoom({ prefix: 'b123r', n: 6, maxPlayers: 6 });
    await w.connect('b123-new');
    attachClock(t, w);
    // 시작 시각 빈 채로 켬 = 바로 점검 중 (결정 2026-11-16 아침 15번: 도는 판은 안 끝내고 새 판만 막음)
    await maintenance.reloadMaintenance({ db: fakeDb(row({ enabled: true, startsAt: null })) });

    await w.tickBy(60_000, 1_000);
    for (const uuid of g.uuids) assert.equal(maintenanceEnds(w, uuid, g.gameId), 0, `${uuid} 판 끝 알림 받음`);
    for (const uuid of room.uuids) assert.equal(maintenanceRoomCloses(w, uuid), 0, `${uuid} 방 닫힘 알림 받음`);
    assert.notEqual(w.phaseOf(g.gameId), null, '판이 사라짐');
    assert.equal((await w.currentRoom(room.host))?.roomId, room.roomId, '대기방이 사라짐');

    const reply = await w.createRoom('b123-new');
    assert.equal(reply?.ok, false, `새 방이 만들어짐: ${JSON.stringify(reply)}`);
    assert.equal(reply.code, 'MAINTENANCE');
});
