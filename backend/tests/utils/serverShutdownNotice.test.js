'use strict';

// 서버 꺼질 때 안내: 진짜 socket.io 서버·화면 소켓으로 안내 받음 → 자동 재접속 살아 있는 끊김 → 새 서버에 다시 붙음
// DB 안 씀 (closeDb 없음), 포트는 0번으로 받아 같은 번호로 새 서버 띄움

const test   = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');

const { createShutdown, SHUTDOWN_EVENT, SHUTDOWN_NOTICE } = require('../../utils/processLifecycle');

const quietLog = { warn() {}, error() {} };

const listen = (server, port = 0) => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
});

const once = (emitter, event) => new Promise((resolve) => emitter.once(event, (...args) => resolve(args)));

test('서버 꺼질 때: 화면이 server_shutdown 안내 받고, 끊김 이유는 자동 재접속되는 transport close, 새 서버에 다시 붙음', async (t) => {
    const server1 = http.createServer();
    const io1 = new Server(server1);
    const port = await listen(server1);

    const client = connectClient(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        reconnectionDelay: 50,
        reconnectionDelayMax: 100,
    });
    t.after(() => client.close());
    await once(client, 'connect');

    const notice = once(client, SHUTDOWN_EVENT);
    const disconnected = once(client, 'disconnect');
    let exitCode = null;
    const shutdown = createShutdown({
        server: server1, io: io1, exit: (code) => { exitCode = code; }, log: quietLog, graceMs: 20,
    });
    await shutdown('SIGTERM', 0);

    const [payload] = await notice;
    assert.deepEqual(payload, { ...SHUTDOWN_NOTICE });
    assert.equal(payload.code, 'SERVER_SHUTDOWN');
    assert.match(payload.message, /자동으로 다시 연결/);

    const [reason] = await disconnected;
    // io server disconnect면 socket.io 화면이 자동 재접속을 안 함 → 이 이유가 아니어야 함
    assert.notEqual(reason, 'io server disconnect');
    assert.equal(client.active, true, '자동 재접속 살아 있음');
    assert.equal(exitCode, 0);

    // 같은 포트로 새 서버(재시작 흉내) → 화면이 스스로 다시 붙음
    const server2 = http.createServer();
    const io2 = new Server(server2);
    t.after(() => new Promise((resolve) => io2.close(() => resolve())));
    await listen(server2, port);
    const reconnected = once(io2, 'connection');
    await once(client, 'connect');
    await reconnected;
    assert.equal(client.connected, true);
});
