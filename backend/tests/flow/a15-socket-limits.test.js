'use strict';

// 소켓 길·메시지 크기·사건 수 제한 시험 — 진짜 소켓 서버(initSocket)를 잠깐 켜고 웹소켓으로 붙어 경계값을 봄
// 목록 A15-B-240~246 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/flow/a15-socket-limits.test.js
// 모델이 DB에 안 붙게 막힌 주소, Redis 없이 서버 한 대 모드 (맨 위에서 먼저)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
delete process.env.REDIS_URL;
// 시험 전용 서명 값 (시험 환경값에 없을 때만 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-socket-limits-test-only-secret-00';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { io: connectClient } = require('socket.io-client');

const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const concurrencyService = require('../../services/presence/concurrency');
const { initSocket } = require('../../socket/socket');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');

// 시험 전용 화면 주소 (진짜 주소 아님)
const FRONT = 'https://pc.a15-socket.test';
const LIMIT_MESSAGE = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
const WAIT_MS = 5_000;

// 시험 동안만 환경값·함수 바꾸기 → 끝나면 되돌림
const withEnv = (t, values) => {
    const saved = {};
    for (const [key, value] of Object.entries(values)) {
        saved[key] = process.env[key];
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
};
const swap = (t, target, name, impl) => {
    const original = target[name];
    target[name] = impl;
    t.after(() => { target[name] = original; });
};

// 진짜 소켓 서버 켜기: 세션은 늘 살아 있음(DB 안 감), 시험 사건 a15_echo는 답만 함 → { url, handled() }
const startServer = async (t, { nodeEnv = 'development' } = {}) => {
    withEnv(t, { NODE_ENV: nodeEnv, FRONTEND_URL: FRONT, FRONTEND_MOBILE_URL: undefined });
    swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    swap(t, concurrencyService, 'startConcurrentSnapshotScheduler', () => {});
    // 접속·끊김 때 접속 상태 DB 쓰기가 막힌 주소로 실패하는 로그만 조용히 (다른 오류 로그는 그대로)
    const loud = console.error;
    swap(t, console, 'error', (...args) => {
        if (args.some((a) => /SequelizeConnection|ECONNREFUSED/.test(String(a?.name ?? a)))) return;
        loud(...args);
    });
    const httpServer = http.createServer();
    const io = initSocket(httpServer, { corsOrigin: FRONT });
    let handled = 0;
    io.on('connection', (socket) => {
        socket.on('a15_echo', (payload, ack) => {
            handled += 1;
            if (typeof ack === 'function') ack({ ok: true, n: payload?.n });
        });
    });
    const { url } = await listenOnFetchablePort(httpServer);
    t.after(() => new Promise((resolve) => { io.close(() => resolve()); }));
    return { url, handled: () => handled };
};

// 시간 제한 걸고 사건 하나 기다리기 (안 오면 실패)
const waitFor = (emitter, event, label) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: ${WAIT_MS}ms 안에 ${event} 안 옴`)), WAIT_MS);
    timer.unref();
    emitter.once(event, (value) => { clearTimeout(timer); resolve(value); });
});

// 로그인 쿠키 실은 웹소켓 접속 → 붙으면 { ok: true }, 거절이면 { ok: false, err }
const connect = async (t, url, { origin } = {}) => {
    const token = jwt.sign({ uuid: `a15-sock-${Math.random().toString(36).slice(2)}`, sessionId: 'a15-sess' },
        process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: 900 });
    const client = connectClient(url, {
        transports: ['websocket'], reconnection: false, timeout: WAIT_MS,
        extraHeaders: { cookie: `accessToken=${token}`, ...(origin ? { origin } : {}) },
    });
    t.after(() => client.close());
    const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('접속 결과가 안 옴')), WAIT_MS);
        timer.unref();
        client.once('connect', () => { clearTimeout(timer); resolve({ ok: true }); });
        client.once('connect_error', (err) => { clearTimeout(timer); resolve({ ok: false, err }); });
    });
    return { client, ...result };
};

// 답 받는 시험 사건 하나 (시간 제한 있음)
const echo = (client, n) => client.timeout(WAIT_MS).emitWithAck('a15_echo', { n });

test('A15-B-240 polling 길로 접속 → 거절(400)', async (t) => {
    const { url } = await startServer(t);
    const res = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, { headers: { origin: FRONT, Connection: 'close' } });
    await res.text();
    assert.equal(res.status, 400);
});

test('A15-B-241 63KB 사건 하나 → 연결 그대로', async (t) => {
    const { url } = await startServer(t);
    const { client, ok } = await connect(t, url);
    assert.equal(ok, true, '시험 준비: 접속이 안 됨');
    const reply = await client.timeout(WAIT_MS).emitWithAck('a15_echo', { text: 'x'.repeat(63 * 1024) });
    assert.equal(reply.ok, true);
    assert.equal(client.connected, true);
});

test('A15-B-242 65KB 사건 → 연결 끊김', async (t) => {
    const { url } = await startServer(t);
    const { client, ok } = await connect(t, url);
    assert.equal(ok, true, '시험 준비: 접속이 안 됨');
    const closed = waitFor(client, 'disconnect', '65KB 보냄');
    client.emit('a15_echo', { text: 'x'.repeat(65 * 1024) });
    await closed;
    assert.equal(client.connected, false);
});

test('A15-B-243 10초 안 120번째 사건 → 처리됨', async (t) => {
    const { url, handled } = await startServer(t);
    const { client, ok } = await connect(t, url);
    assert.equal(ok, true, '시험 준비: 접속이 안 됨');
    for (let n = 1; n < 120; n += 1) await echo(client, n);
    const reply = await echo(client, 120);
    assert.deepEqual(reply, { ok: true, n: 120 });
    assert.equal(handled(), 120);
});

test('A15-B-244 10초 안 121번째 사건 → RATE_LIMITED 답, 처리 안 됨, 연결 그대로', async (t) => {
    const { url, handled } = await startServer(t);
    const { client, ok } = await connect(t, url);
    assert.equal(ok, true, '시험 준비: 접속이 안 됨');
    for (let n = 1; n <= 120; n += 1) await echo(client, n);
    const reply = await echo(client, 121);
    assert.deepEqual(reply, { ok: false, code: 'RATE_LIMITED', message: LIMIT_MESSAGE });
    assert.equal(handled(), 120, '121번째가 처리됨');
    assert.equal(client.connected, true);
});

test('A15-B-245 10초 안 361번째 사건 → 연결 끊김', async (t) => {
    const { url } = await startServer(t);
    const { client, ok } = await connect(t, url);
    assert.equal(ok, true, '시험 준비: 접속이 안 됨');
    for (let n = 1; n <= 359; n += 1) client.emit('a15_echo', { n });
    // 360번째는 답 받는 사건으로 → 막힘 답이 돌아오면 그때까진 연결 그대로
    const at360 = await echo(client, 360);
    assert.equal(at360.code, 'RATE_LIMITED', '시험 준비: 360번째가 막힘 답이 아님');
    assert.equal(client.connected, true, '361번째 전에 끊김');
    const closed = waitFor(client, 'disconnect', '361번째 보냄');
    client.emit('a15_echo', { n: 361 });
    await closed;
    assert.equal(client.connected, false);
});

test('A15-B-246 운영 서버에 Origin 없이 손잡기 → 접속 안 됨', async (t) => {
    const { url } = await startServer(t, { nodeEnv: 'production' });
    // 같은 서버에 허용 주소로는 붙는지 먼저 봄 (거절이 주소 탓임을 확인)
    const allowed = await connect(t, url, { origin: FRONT });
    assert.equal(allowed.ok, true, '시험 준비: 허용 주소도 안 붙음');
    allowed.client.close();
    const { ok, client } = await connect(t, url);
    assert.equal(ok, false);
    assert.equal(client.connected, false);
});
