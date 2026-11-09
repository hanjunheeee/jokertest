'use strict';

// 점검 시계·큰 안내 시험 (AD-132·133·139·140), 시작 시각에 판 끝내기·취소·접속자 안내·Node 둘
// 가짜 시계로 타이머를 직접 넘김, Node 둘은 메모리 받침 cluster (Redis·DB 없이 npm test에서 돎)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const maintenance = require('../../services/ops/maintenance');
const reloadSync = require('../../services/ops/reloadSync');
const { createMaintenanceClock } = require('../../services/ops/maintenanceClock');
const notice = require('../../services/ops/maintenanceNotice');
const { startPair } = require('../cluster/helpers/slice2');

const T0 = Date.parse('2026-11-10T03:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

// 가짜 시계: setTimeout 대신 걸어 두고 advance로 시간 넘김
const fakeTimers = (start = T0) => {
    let now = start;
    let seq = 0;
    const timers = new Map();
    return {
        nowFn: () => now,
        setTimeoutFn: (fn, ms) => { seq += 1; timers.set(seq, { fn, at: now + ms }); return seq; },
        clearTimeoutFn: (id) => { timers.delete(id); },
        advance(ms) {
            const target = now + ms;
            for (;;) {
                const due = [...timers.entries()].filter(([, x]) => x.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                timers.delete(due[0]);
                now = due[1].at;
                due[1].fn();
            }
            now = target;
        },
        pending: () => timers.size,
    };
};

// 점검 상태 (getMaintenanceState 모양)
const stateOf = ({ enabled = true, startsAt = null, message = '서버 점검', endsAt = null } = {}) => ({
    enabled, active: false, message, startsAt: startsAt === null ? null : iso(startsAt), endsAt: endsAt === null ? null : iso(endsAt),
});

// 시계 하나 + 끝낸 횟수 셈
const makeClock = (timers, { node = 'n1', games = 2, rooms = 1 } = {}) => {
    const calls = { abort: 0, active: 0, forceEnds: [] };
    const clock = createMaintenanceClock({
        setTimeoutFn: timers.setTimeoutFn,
        clearTimeoutFn: timers.clearTimeoutFn,
        nowFn: timers.nowFn,
        getIo: () => ({ id: node }),
        abortAll: () => { calls.abort += 1; return { games, rooms }; },
        sendActive: () => { calls.active += 1; },
        nodeId: () => node,
    });
    clock.onForceEnd((report) => calls.forceEnds.push(report));
    return { clock, calls };
};

// ── AD-132: 시작 시각에 진행 판 끝냄 ──

test('AD-132: 시작 시각이 되면 판·방 끝내고 큰 안내(active)·Node 결과 알림 한 번', () => {
    const timers = fakeTimers();
    const { clock, calls } = makeClock(timers);
    clock.sync(stateOf({ startsAt: T0 + 10_000 }));
    timers.advance(9_999);
    assert.equal(calls.abort, 0);
    timers.advance(1);
    assert.equal(calls.abort, 1);
    assert.equal(calls.active, 1);
    assert.deepEqual(calls.forceEnds, [{ node: 'n1', games: 2, rooms: 1, startsAt: iso(T0 + 10_000) }]);
});

test('AD-132: 이미 지난 시각이면 바로 끝냄', () => {
    const timers = fakeTimers();
    const { clock, calls } = makeClock(timers);
    clock.sync(stateOf({ startsAt: T0 - 60_000 }));
    timers.advance(0);
    assert.equal(calls.abort, 1);
});

test('AD-132: 같은 시작 시각으로 다시 읽어도(60초 안전망) 두 번 안 끝냄', () => {
    const timers = fakeTimers();
    const { clock, calls } = makeClock(timers);
    clock.sync(stateOf({ startsAt: T0 + 1_000 }));
    timers.advance(1_000);
    clock.sync(stateOf({ startsAt: T0 + 1_000 }));
    timers.advance(60_000);
    assert.equal(calls.abort, 1);
    assert.equal(timers.pending(), 0);
});

test('AD-132: io가 아직 없으면(소켓 켜기 전) 안 끝내고 다음 맞추기 때 다시', () => {
    const timers = fakeTimers();
    let io = null;
    let aborts = 0;
    const clock = createMaintenanceClock({
        ...timers, getIo: () => io, abortAll: () => { aborts += 1; return { games: 0, rooms: 0 }; }, sendActive: () => {}, nodeId: () => 'n1',
    });
    clock.sync(stateOf({ startsAt: T0 - 1 }));
    timers.advance(0);
    assert.equal(aborts, 0);
    io = {};
    clock.sync(stateOf({ startsAt: T0 - 1 }));
    timers.advance(0);
    assert.equal(aborts, 1);
});

test('AD-132: 시작 시각 없는 켜짐(옛 내부 통로)은 타이머 안 걺', () => {
    const timers = fakeTimers();
    const { clock, calls } = makeClock(timers);
    clock.sync(stateOf({ startsAt: null }));
    timers.advance(60_000);
    assert.equal(calls.abort, 0);
    assert.equal(timers.pending(), 0);
});

// ── AD-133: 취소 ──

test('AD-133: 시작 전에 끄면 타이머 지워져 안 끝남', () => {
    const timers = fakeTimers();
    const { clock, calls } = makeClock(timers);
    clock.sync(stateOf({ startsAt: T0 + 5_000 }));
    clock.sync(stateOf({ enabled: false }));
    timers.advance(10_000);
    assert.equal(calls.abort, 0);
    assert.equal(timers.pending(), 0);
});

test('AD-133: 시각을 미루면 옛 시각엔 안 끝나고 새 시각에 끝남', () => {
    const timers = fakeTimers();
    const { clock, calls } = makeClock(timers);
    clock.sync(stateOf({ startsAt: T0 + 5_000 }));
    clock.sync(stateOf({ startsAt: T0 + 20_000 }));
    timers.advance(5_000);
    assert.equal(calls.abort, 0);
    timers.advance(15_000);
    assert.equal(calls.abort, 1);
});

test('AD-133: 끝낸 뒤 껐다가 새 시각으로 다시 켜면 또 끝냄', () => {
    const timers = fakeTimers();
    const { clock, calls } = makeClock(timers);
    clock.sync(stateOf({ startsAt: T0 + 1_000 }));
    timers.advance(1_000);
    clock.sync(stateOf({ enabled: false }));
    clock.sync(stateOf({ startsAt: T0 + 100_000 }));
    timers.advance(100_000);
    assert.equal(calls.abort, 2);
});

// ── AD-139: 큰 안내 신호 ──

// 이 Node 접속자만 받는 io 흉내 (io.local로 보낸 것만 셈)
const fakeLocalIo = () => {
    const local = [];
    const everywhere = [];
    return {
        local: { emit: (event, payload) => local.push({ event, payload }) },
        emit: (event, payload) => everywhere.push({ event, payload }),
        sentLocal: local,
        sentEverywhere: everywhere,
    };
};

test('AD-139: 큰 안내 모양 — 예약됨(scheduled)·점검 중(active)·꺼짐(cleared)', () => {
    const scheduled = notice.buildNotice(stateOf({ startsAt: T0 + 60_000, endsAt: T0 + 3_600_000 }), T0);
    assert.deepEqual(scheduled, {
        state: 'scheduled', message: '서버 점검', startsAt: iso(T0 + 60_000), endsAt: iso(T0 + 3_600_000), serverNow: iso(T0), forceEndAtStart: true,
    });
    assert.equal(notice.buildNotice(stateOf({ startsAt: T0 }), T0).state, 'active');
    assert.equal(notice.buildNotice(stateOf({ startsAt: null }), T0).state, 'active');
    assert.deepEqual(notice.buildNotice(stateOf({ enabled: false }), T0), {
        state: 'cleared', message: null, startsAt: null, endsAt: null, serverNow: iso(T0), forceEndAtStart: true,
    });
    assert.equal(typeof notice.buildNotice(stateOf({ message: null, startsAt: T0 + 1 }), T0).message, 'string');
});

test('AD-139: 접속할 때 켜짐이면 받음, 꺼짐이면 안 받음', (t) => {
    t.after(() => maintenance.__setStateForTests({ enabled: false }));
    const got = [];
    const socket = { emit: (event, payload) => got.push({ event, payload }) };
    maintenance.__setStateForTests({ enabled: false });
    notice.sendOnConnect(socket);
    assert.equal(got.length, 0);
    maintenance.__setStateForTests({ enabled: true, message: '곧 점검', startsAt: new Date(Date.now() + 60_000) });
    notice.sendOnConnect(socket);
    assert.equal(got.length, 1);
    assert.equal(got[0].event, 'maintenance_notice');
    assert.equal(got[0].payload.state, 'scheduled');
    assert.equal(got[0].payload.message, '곧 점검');
});

test('AD-139: 바뀌면 이 Node 접속자에게(io.local) 한 번, 같은 상태 다시 읽으면 안 보냄, 끄면 cleared', (t) => {
    notice.__resetForTests();
    t.after(() => notice.__resetForTests());
    const io = fakeLocalIo();
    const scheduled = stateOf({ startsAt: T0 + 60_000 });
    assert.equal(notice.broadcastState(io, scheduled, T0), true);
    assert.equal(notice.broadcastState(io, scheduled, T0 + 1_000), false);
    assert.equal(notice.broadcastState(io, stateOf({ enabled: false }), T0 + 2_000), true);
    assert.equal(notice.broadcastState(io, stateOf({ enabled: false }), T0 + 3_000), false);
    assert.deepEqual(io.sentLocal.map((e) => [e.event, e.payload.state]), [
        ['maintenance_notice', 'scheduled'], ['maintenance_notice', 'cleared'],
    ]);
    assert.equal(io.sentEverywhere.length, 0, 'io.emit(어댑터로 전 Node)로 보내면 같은 안내가 두 번 감');
});

test('AD-139: 시각 지나 점검 중이 되면 active 한 번 (바뀜 알림과 시계가 겹쳐도 한 번)', (t) => {
    notice.__resetForTests();
    t.after(() => notice.__resetForTests());
    const io = fakeLocalIo();
    const state = stateOf({ startsAt: T0 });
    notice.broadcastState(io, state, T0 - 1);
    notice.broadcastState(io, state, T0);
    notice.broadcastState(io, state, T0 + 5);
    assert.deepEqual(io.sentLocal.map((e) => e.payload.state), ['scheduled', 'active']);
});

test('AD-139: 점검 다시 읽으면 바뀜 알림이 (지금, 앞) 상태로 불림', async (t) => {
    const seen = [];
    const off = maintenance.onMaintenanceChange((current, previous) => seen.push([previous.enabled, current.enabled, current.message]));
    t.after(() => { off(); maintenance.__setStateForTests({ enabled: false }); });
    maintenance.__setStateForTests({ enabled: false });
    const db = { MaintenanceState: { findOne: async () => ({ is_enabled: 1, message: '알림 시험', starts_at: null, ends_at: null }) } };
    await maintenance.reloadMaintenance({ db });
    assert.deepEqual(seen, [[false, true, '알림 시험']]);
});

test('AD-139: 바뀜 알림 하나가 던져도 다시 읽기는 성공', async (t) => {
    t.mock.method(console, 'error', () => {});
    const off = maintenance.onMaintenanceChange(() => { throw new Error('알림 실패'); });
    t.after(() => { off(); maintenance.__setStateForTests({ enabled: false }); });
    const db = { MaintenanceState: { findOne: async () => null } };
    const state = await maintenance.reloadMaintenance({ db });
    assert.equal(state.enabled, false);
});

// ── AD-140: Node 둘 ──

// Node 하나 흉내: 자기 점검 상태 + 자기 시계 (다시 읽기 = DB 상태를 자기 시계에 맞춤)
const nodeWith = (timers, node, readDb) => {
    const { clock, calls } = makeClock(timers, { node });
    return { calls, reload: async () => { clock.sync(await readDb()); return { ok: true }; } };
};

test('AD-140: 저장 → 두 Node 다 다시 읽고 시작 시각에 둘 다 끝냄', async (t) => {
    t.after(() => reloadSync.__testables.stopSafetyNet());
    const timers = fakeTimers();
    let dbState = stateOf({ enabled: false });
    const n1 = nodeWith(timers, 'n1', async () => dbState);
    const n2Node = nodeWith(timers, 'n2', async () => dbState);
    t.mock.method(maintenance, 'reloadMaintenance', n1.reload);
    const { n2 } = await startPair(t);
    n2.rpc.register('ops.reloadNow', () => n2Node.reload());

    dbState = stateOf({ startsAt: T0 + 30_000 });
    const saved = await reloadSync.reloadEverywhere('maintenance');
    assert.equal(saved.partial, false);
    timers.advance(30_000);
    assert.deepEqual([n1.calls.abort, n2Node.calls.abort], [1, 1]);
    assert.deepEqual(n2Node.calls.forceEnds.map((r) => r.node), ['n2']);
});

test('AD-140: n2 못 받음 → 응답 n2 ok:false, 안전망 다시 읽기 뒤 n2도 끝냄', async (t) => {
    t.after(() => reloadSync.__testables.stopSafetyNet());
    const timers = fakeTimers();
    let dbState = stateOf({ enabled: false });
    const n1 = nodeWith(timers, 'n1', async () => dbState);
    const n2Node = nodeWith(timers, 'n2', async () => dbState);
    t.mock.method(maintenance, 'reloadMaintenance', n1.reload);
    const { n2 } = await startPair(t);
    n2.rpc.register('ops.reloadNow', () => ({ ok: false, code: 'RELOAD_FAILED' }));

    dbState = stateOf({ startsAt: T0 + 30_000 });
    const saved = await reloadSync.reloadEverywhere('maintenance');
    assert.equal(saved.partial, true);
    assert.deepEqual(saved.nodes.find((n) => n.node === 'n2'), { node: 'n2', ok: false, code: 'RELOAD_FAILED' });
    timers.advance(30_000);
    assert.deepEqual([n1.calls.abort, n2Node.calls.abort], [1, 0]);

    // 60초 안전망: n2가 DB를 다시 읽음 → 이미 지난 시각이라 바로 끝냄
    timers.advance(60_000);
    await n2Node.reload();
    timers.advance(0);
    assert.equal(n2Node.calls.abort, 1);
});
