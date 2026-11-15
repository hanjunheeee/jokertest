'use strict';

// 판 중 끊김·돌아옴 알림 흐름 시험 — 판 전원에게 한 번, 새 탭이 먼저 붙었으면 안 감, 남의 스냅샷 연결 표시, 죽은 사람도 알림
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-156~161, 돌리기: node --env-file=.env.test --test tests/flow/a09-connection-notice.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a09-grace-harness');

const EVENT = 'session_player_connection_changed';

// 그 사람이 받은 x의 연결 알림 중 isConnected가 그 값인 것 수
const noticesAbout = (w, uuid, x, isConnected) =>
    w.got(uuid, EVENT).filter((p) => p.uuid === x && p.isConnected === isConnected && p.gameId === w.gameId).length;

// 재판 유죄로 처형 (붙어 있는 산 사람 전원), 밤까지
async function execute(w, x) {
    await w.toTribunal(x);
    await w.castAll('GUILTY');
    w.advanceUntil(() => w.session.phase === 'NIGHT');
    assert.equal(w.isAlive(x), false);
}

test('A09-B-156 6명 판 1명 끊김 → 나머지 5명 각자 isConnected false 알림 한 번', async (t) => {
    const w = H.setup(t, { id: 'a09cn156', n: 6 });
    w.toDay();
    const x = w.nonJokers()[0];
    await w.disconnect(x);
    for (const u of w.others(x)) assert.equal(noticesAbout(w, u, x, false), 1, u);
});

test('A09-B-157 7명 판 끊긴 사람 다시 붙음 → 판 전원 isConnected true 알림 한 번', async (t) => {
    const w = H.setup(t, { id: 'a09cn157', n: 7 });
    w.toDay();
    const x = w.nonJokers()[0];
    await w.disconnect(x);
    w.advance(10_000);
    assert.equal((await w.reconnect(x)).ok, true);
    for (const u of w.others(x)) assert.equal(noticesAbout(w, u, x, true), 1, u);
});

test('A09-B-158 8명 판 새 탭 붙음 → 옛 탭 끊김 → 끊김 알림 0번', async (t) => {
    const w = H.setup(t, { id: 'a09cn158', n: 8 });
    w.toDay();
    const x = w.nonJokers()[0];
    const oldSocket = w.sock(x);
    const fresh = w.attachSocket(x);
    await H.gs.resyncSessionRouting(fresh, x, w.io);
    oldSocket.connected = false;
    await H.gs.onDisconnect(w.io, oldSocket, x);
    for (const u of w.others(x)) assert.equal(noticesAbout(w, u, x, false), 0, u);
});

test('A09-B-159 5명 판 1명 끊긴 동안 다른 사람 스냅샷 → 그 사람 isConnected false·alive true', async (t) => {
    const w = H.setup(t, { id: 'a09cn159', n: 5 });
    w.toDay();
    const [x, viewer] = w.nonJokers();
    await w.disconnect(x);
    const snap = await w.snapshot(viewer);
    assert.equal(snap.ok, true);
    const row = snap.players.find((p) => p.uuid === x);
    assert.equal(row.isConnected, false);
    assert.equal(row.isAlive, true);
});

test('A09-B-160 10명 판 처형된 사람 끊김 → 판 전원 isConnected false 알림', async (t) => {
    const w = H.setup(t, { id: 'a09cn160', n: 10 });
    w.toDay();
    const x = w.nonJokers()[0];
    await execute(w, x);
    await w.disconnect(x);
    for (const u of w.others(x)) assert.equal(noticesAbout(w, u, x, false), 1, u);
});

test('A09-B-161 6명 판 처형된 사람 끊김 → 붙음 → isConnected true 알림', async (t) => {
    const w = H.setup(t, { id: 'a09cn161', n: 6 });
    w.toDay();
    const x = w.nonJokers()[0];
    await execute(w, x);
    await w.disconnect(x);
    w.advance(5_000);
    assert.equal((await w.reconnect(x)).ok, true);
    for (const u of w.others(x)) assert.equal(noticesAbout(w, u, x, true), 1, u);
});
