'use strict';

// 보안 시험: 소켓 (사건 퍼붓기 제한 · 메시지 크기 제한 · Origin 검사 · 로그인 없는 접속 거절)
// DB 안 씀 (세션 확인은 가짜, 진짜 socket.io 서버를 127.0.0.1에 잠깐 켬)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'security-socket-secret-0123456789abcdef';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');

const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const socketAuth = require('../../socket/connection/auth');
const { checkSocketOrigin } = require('../../socket/connection/originCheck');
const { swap } = require('./authFakes');

const { createEventRateLimiter, wrapSocketWithSessionGuard } = socketAuth;

// 가짜 소켓: on으로 붙인 처리기를 직접 부르고 끊김만 기록
const fakeSocket = () => {
    const handlers = new Map();
    const socket = {
        data: { user: { uuid: 'u-1', sessionId: 's-1' } },
        disconnected: false,
        emitted: [],
        on(event, listener) { handlers.set(event, listener); return socket; },
        emit(event, payload) { socket.emitted.push({ event, payload }); },
        disconnect() { socket.disconnected = true; },
    };
    return { socket, fire: (event, ...args) => handlers.get(event)(...args), handlers };
};

test('사건 수 세기: 창 안 max까지 ok, 넘으면 drop, disconnectAt 넘으면 disconnect', () => {
    let now = 0;
    const count = createEventRateLimiter({ windowMs: 1000, max: 3, disconnectAt: 5, now: () => now });
    assert.deepEqual([count(), count(), count(), count(), count(), count()], ['ok', 'ok', 'ok', 'drop', 'drop', 'disconnect']);
    now = 1000;
    assert.equal(count(), 'ok', '창 지나면 다시 셈');
});

test('사건 수 기본값: 10초 120번·360번 넘으면 끊음 (보통 판보다 넉넉)', () => {
    assert.equal(socketAuth.EVENT_RATE_WINDOW_MS, 10_000);
    assert.equal(socketAuth.EVENT_RATE_MAX, 120);
    assert.equal(socketAuth.EVENT_RATE_DISCONNECT_AT, 360);
    const count = createEventRateLimiter({ now: () => 0 });
    for (let i = 0; i < 120; i += 1) assert.equal(count(), 'ok');
    assert.equal(count(), 'drop');
});

test('소켓 감싸기: 한도 넘은 사건은 처리기 안 부르고 답 함수에 RATE_LIMITED', async (t) => {
    swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const { socket, fire } = fakeSocket();
    wrapSocketWithSessionGuard(socket, { countEvent: createEventRateLimiter({ max: 2, disconnectAt: 10, now: () => 0 }) });
    let handled = 0;
    socket.on('send_chat', () => { handled += 1; });
    const replies = [];
    for (let i = 0; i < 4; i += 1) await fire('send_chat', { text: 'hi' }, (reply) => replies.push(reply));
    assert.equal(handled, 2);
    assert.deepEqual(replies.map((r) => r.code), ['RATE_LIMITED', 'RATE_LIMITED']);
    assert.equal(socket.disconnected, false);
});

test('소켓 감싸기: 계속 퍼부으면 연결 끊음', async (t) => {
    swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const { socket, fire } = fakeSocket();
    wrapSocketWithSessionGuard(socket, { countEvent: createEventRateLimiter({ max: 2, disconnectAt: 3, now: () => 0 }) });
    socket.on('spam', () => {});
    for (let i = 0; i < 4; i += 1) await fire('spam');
    assert.equal(socket.disconnected, true);
});

test('소켓 감싸기: 버린 사건은 세션 확인(DB)도 안 함', async (t) => {
    let checks = 0;
    swap(t, sessionLifecycle, 'resolveSession', async () => { checks += 1; return { ok: true }; });
    const { socket, fire } = fakeSocket();
    wrapSocketWithSessionGuard(socket, { countEvent: () => 'drop' });
    socket.on('spam', () => {});
    for (let i = 0; i < 5; i += 1) await fire('spam', () => {});
    assert.equal(checks, 0);
});

test('소켓 감싸기: disconnect 처리기는 세지도 막지도 않음 (정리는 늘 돎)', async (t) => {
    swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const { socket, fire } = fakeSocket();
    wrapSocketWithSessionGuard(socket, { countEvent: () => 'disconnect' });
    let cleaned = false;
    socket.on('disconnect', () => { cleaned = true; });
    fire('disconnect');
    assert.equal(cleaned, true);
    assert.equal(socket.disconnected, false);
});

test('socket.js: 메시지 하나 최대 64KB로 서버를 켬 (기본 1MB 아님)', (t) => {
    const concurrency = require('../../services/presence/concurrency');
    swap(t, concurrency, 'startConcurrentSnapshotScheduler', () => {});
    const { initSocket, MAX_SOCKET_MESSAGE_BYTES } = require('../../socket/socket');
    assert.equal(MAX_SOCKET_MESSAGE_BYTES, 64 * 1024);
    const io = initSocket(http.createServer(), { corsOrigin: 'https://mmc.example.test' });
    t.after(() => io.close());
    assert.equal(io.engine.opts.maxHttpBufferSize, 64 * 1024);
});

// 진짜 서버: 감싸기 + 64KB 제한, echo 사건에 답
const startServer = async (t, { countEvent } = {}) => {
    const { MAX_SOCKET_MESSAGE_BYTES } = require('../../socket/socket');
    swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const httpServer = http.createServer();
    const io = new Server(httpServer, { maxHttpBufferSize: MAX_SOCKET_MESSAGE_BYTES });
    io.on('connection', (socket) => {
        socket.data.user = { uuid: 'u-1', sessionId: 's-1' };
        wrapSocketWithSessionGuard(socket, countEvent ? { countEvent } : undefined);
        socket.on('echo', (payload, ack) => ack({ ok: true, size: JSON.stringify(payload).length }));
    });
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => { io.close(); httpServer.close(() => resolve()); }));
    return `http://127.0.0.1:${httpServer.address().port}`;
};
const connect = (url) => new Promise((resolve, reject) => {
    const client = connectClient(url, { transports: ['websocket'], reconnection: false, timeout: 3000 });
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
});

test('진짜 소켓: 64KB 넘는 메시지를 보내면 서버가 연결을 끊음, 작은 메시지는 답 받음', async (t) => {
    const url = await startServer(t);
    const client = await connect(url);
    t.after(() => client.close());
    const small = await client.timeout(2000).emitWithAck('echo', { text: 'x'.repeat(1000) });
    assert.equal(small.ok, true);
    const closed = new Promise((resolve) => client.once('disconnect', (reason) => resolve(reason)));
    client.emit('echo', { text: 'x'.repeat(70 * 1024) });
    assert.match(await closed, /transport close|transport error/);
});

test('진짜 소켓: 한도 넘은 사건은 RATE_LIMITED 답을 받음', async (t) => {
    const url = await startServer(t, { countEvent: createEventRateLimiter({ max: 3, disconnectAt: 100 }) });
    const client = await connect(url);
    t.after(() => client.close());
    const replies = [];
    for (let i = 0; i < 5; i += 1) replies.push(await client.timeout(2000).emitWithAck('echo', { i }));
    assert.deepEqual(replies.map((r) => r.ok), [true, true, true, false, false]);
    assert.equal(replies[4].code, 'RATE_LIMITED');
});

test('Origin 검사: 운영은 Origin 없거나 목록 밖이면 거절 (다른 사이트에서 로그인 쿠키로 소켓 붙기 막기)', () => {
    const env = { NODE_ENV: 'production' };
    const allowedOrigins = ['https://mmc.example.test'];
    assert.equal(checkSocketOrigin(undefined, { env, allowedOrigins }).ok, false);
    assert.equal(checkSocketOrigin('https://evil.example', { env, allowedOrigins }).ok, false);
    assert.equal(checkSocketOrigin('https://mmc.example.test.evil.example', { env, allowedOrigins }).ok, false);
    assert.equal(checkSocketOrigin('https://mmc.example.test', { env, allowedOrigins }).ok, true);
});

test('소켓 접속 인증: 쿠키 없음·깨진 토큰·끊긴 세션은 전부 같은 UNAUTHORIZED', async (t) => {
    swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: false, status: 401 }));
    const jwt = require('jsonwebtoken');
    const reasons = [];
    for (const cookie of [undefined, 'accessToken=broken', `accessToken=${jwt.sign({ uuid: 'u', sessionId: 's' }, process.env.JWT_SECRET)}`]) {
        await socketAuth.authenticateSocket({ handshake: { headers: { cookie } }, data: {} }, (err) => reasons.push(err?.message));
    }
    assert.deepEqual(reasons, ['UNAUTHORIZED', 'UNAUTHORIZED', 'UNAUTHORIZED']);
});
