'use strict';

// 같은 계정이 다른 기기·다른 창으로 판 중에 붙을 때 흐름 시험 — 옛 소켓 밀어냄(까닭 코드), 새 기기로 이어짐, 옛 소켓 끊김은 판에서 무시
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-304~308, 돌리기: node --env-file=.env.test --test tests/flow/a09-replace-device.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a09-grace-harness');
// 접속 처리(옛 소켓 밀어내기)는 socket.js 연결 처리기가 부르는 것 그대로 씀
const presence = require('../../socket/connection/presence');
const presenceService = require('../../services/presence/status');
const emitter = require('../../socket/emitter');

// 판 차리기 + 접속 목록을 서버 진짜 목록(emitter)으로 바꿈 (접속 처리가 이 목록을 고치니까)
// 접속 상태 저장·친구 알림은 DB를 써서 아무것도 안 하는 함수로 바꿔 끼움
function setupDevices(t, spec) {
    const w = H.setup(t, spec);
    t.mock.method(presenceService, 'setPresence', async () => {});
    t.mock.method(presenceService, 'getAcceptedFriendUuids', async () => []);
    emitter.onlineUsers.clear();
    for (const [uuid, socketId] of w.world.registry) emitter.onlineUsers.set(uuid, socketId);
    for (const [uuid, socket] of w.world.sockets) socket.data.user = { uuid, sessionId: `sess-${uuid}-a` };
    H.gs.setOnlineUsersRegistry(emitter.onlineUsers);
    H.matchmaking.setOnlineUsersRegistry(emitter.onlineUsers);
    t.after(() => emitter.onlineUsers.clear());
    return w;
}

// 새 기기(또는 같은 브라우저 다른 창) 소켓이 접속함: 서버 접속 처리 → 판 채널 다시 넣기 (socket.js 연결 처리기 차례)
let seq = 0;
async function connectDevice(w, uuid, sessionId) {
    seq += 1;
    const socket = H.gf.createFakeSocket(uuid, { id: `sock-${uuid}-dev${seq}` });
    socket.disconnect = () => { socket.connected = false; };
    socket.data.user = { uuid, sessionId };
    w.io.sockets.sockets.set(socket.id, socket);
    w.world.sockets.set(uuid, socket);
    w.world.history.get(uuid).push(socket);
    await presence.handleConnection(w.io, socket, uuid);
    await H.gs.resyncSessionRouting(socket, uuid, w.io);
    return socket;
}

// 밀려난 옛 소켓의 끊김 (진짜 socket.io가 disconnect 뒤 부르는 끊김 처리)
const dropOld = (w, socket, uuid) => H.gs.onDisconnect(w.io, socket, uuid);

test('A09-B-304 6명 판 같은 계정 다른 기기 소켓 → 옛 소켓 force_disconnect 까닭 REPLACED_BY_OTHER_LOGIN, 새 기기 스냅샷 산 채', async (t) => {
    const w = setupDevices(t, { id: 'a09rd304', n: 6 });
    w.toDay();
    const x = w.nonJokers()[0];
    const old = w.sock(x);
    await connectDevice(w, x, 'sess-other-device');
    const kicked = old.received.filter((e) => e.event === 'force_disconnect');
    assert.equal(kicked.length, 1);
    assert.equal(kicked[0].payload.code, 'REPLACED_BY_OTHER_LOGIN');
    await dropOld(w, old, x);
    const snap = await w.snapshot(x);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.players.find((p) => p.uuid === x).isAlive, true);
});

test('A09-B-305 7명 판 같은 브라우저 다른 창 → 옛 소켓 force_disconnect 까닭 REPLACED_BY_SAME_SESSION', async (t) => {
    const w = setupDevices(t, { id: 'a09rd305', n: 7 });
    w.toDay();
    const x = w.nonJokers()[0];
    const old = w.sock(x);
    await connectDevice(w, x, old.data.user.sessionId);
    const kicked = old.received.filter((e) => e.event === 'force_disconnect');
    assert.equal(kicked.length, 1);
    assert.equal(kicked[0].payload.code, 'REPLACED_BY_SAME_SESSION');
});

test('A09-B-306 8명 판 밀려난 옛 소켓 끊김 → 기다림 안 걸림, 60초 뒤에도 산 채', async (t) => {
    const w = setupDevices(t, { id: 'a09rd306', n: 8 });
    w.toDay();
    const x = w.nonJokers()[0];
    const old = w.sock(x);
    await connectDevice(w, x, 'sess-other-device');
    await dropOld(w, old, x);
    w.advance(61_000);
    assert.equal(w.isAlive(x), true);
    assert.equal(w.ids.filter((u) => w.got(u, 'player_eliminated').length > 0).length, 0);
});

test('A09-B-307 10명 판 끊긴 지 45초에 다른 기기로 붙음 → 기다림 풀림, 60초 뒤에도 산 채', async (t) => {
    const w = setupDevices(t, { id: 'a09rd307', n: 10 });
    w.toDay();
    const x = w.nonJokers()[0];
    const at = w.now();
    await w.disconnect(x);
    w.advanceTo(at + 45_000);
    await connectDevice(w, x, 'sess-other-device');
    w.advanceTo(at + 61_000);
    assert.equal(w.isAlive(x), true);
    assert.equal(w.ids.filter((u) => w.got(u, 'player_eliminated').length > 0).length, 0);
    const snap = await w.snapshot(x);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
});

test('A09-B-308 5명 판 다른 기기 접속 → 판 사람들 끊김 알림 0번', async (t) => {
    const w = setupDevices(t, { id: 'a09rd308', n: 5 });
    w.toDay();
    const x = w.nonJokers()[0];
    const old = w.sock(x);
    await connectDevice(w, x, 'sess-other-device');
    await dropOld(w, old, x);
    for (const u of w.others(x)) {
        const notices = w.got(u, 'session_player_connection_changed').filter((p) => p.uuid === x && p.isConnected === false);
        assert.equal(notices.length, 0, u);
    }
});
