'use strict';

// DP-034 소켓 Origin 검사 시험: 허용 주소 OK · 다른 주소 거절 · Origin 없음 운영 거절/개발 허용 · 부하 도구 Origin 붙이기
// DB 안 씀 (진짜 socket.io 서버를 127.0.0.1에 잠깐 켜고 websocket으로만 붙음)
const test   = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');

const { checkSocketOrigin, createOriginGuard } = require('../../socket/connection/originCheck');
const { resolveOriginHeader } = require('../../scripts/loadtest/target');
const { Bot } = require('../../scripts/loadtest/bot');

const DESKTOP = 'https://mmc.example.test';
const MOBILE  = 'https://m.mmc.example.test';
const ENVS = Object.freeze({
    production:  { NODE_ENV: 'production', FRONTEND_URL: `${DESKTOP}/`, FRONTEND_MOBILE_URL: MOBILE },
    development: { NODE_ENV: 'development', FRONTEND_URL: DESKTOP, FRONTEND_MOBILE_URL: MOBILE },
    test:        { NODE_ENV: 'test', FRONTEND_URL: DESKTOP },
    unset:       { FRONTEND_URL: DESKTOP },
});
const origins = (env) => [env.FRONTEND_URL, env.FRONTEND_MOBILE_URL].filter(Boolean).map((v) => v.replace(/\/+$/, ''));

test('Origin 판단: 허용 목록(데스크톱·모바일)이면 받고, 다른 주소는 개발에서도 거절', () => {
    for (const [name, env] of Object.entries(ENVS)) {
        const allowedOrigins = origins(env);
        assert.equal(checkSocketOrigin(DESKTOP, { env, allowedOrigins }).ok, true, name);
        assert.equal(checkSocketOrigin('HTTPS://MMC.example.test/', { env, allowedOrigins }).ok, true, `${name} 대문자·끝 슬래시`);
        for (const bad of ['https://evil.example.test', 'http://mmc.example.test', 'https://mmc.example.test:8443', 'null']) {
            assert.deepEqual(checkSocketOrigin(bad, { env, allowedOrigins }), { ok: false, reason: 'ORIGIN_NOT_ALLOWED' }, `${name} ${bad}`);
        }
    }
    assert.equal(checkSocketOrigin(MOBILE, { env: ENVS.production, allowedOrigins: origins(ENVS.production) }).ok, true);
    // 모바일 주소 안 넣은 서버는 모바일 Origin 거절
    assert.equal(checkSocketOrigin(MOBILE, { env: ENVS.test, allowedOrigins: origins(ENVS.test) }).ok, false);
});

test('Origin 없음: 운영은 거절, 개발·시험·NODE_ENV 없음은 허용', () => {
    for (const missing of [undefined, '', '   ']) {
        assert.deepEqual(checkSocketOrigin(missing, { env: ENVS.production, allowedOrigins: [DESKTOP] }), { ok: false, reason: 'ORIGIN_REQUIRED' });
        for (const name of ['development', 'test', 'unset']) {
            assert.equal(checkSocketOrigin(missing, { env: ENVS[name], allowedOrigins: [DESKTOP] }).ok, true, name);
        }
    }
});

test('socket.js initSocket이 Origin 검사를 allowRequest로 건다', async (t) => {
    const concurrency = require('../../services/presence/concurrency');
    const original = concurrency.startConcurrentSnapshotScheduler;
    concurrency.startConcurrentSnapshotScheduler = () => {};
    t.after(() => { concurrency.startConcurrentSnapshotScheduler = original; });

    const { initSocket } = require('../../socket/socket');
    const httpServer = http.createServer();
    const io = initSocket(httpServer, { corsOrigin: DESKTOP });
    t.after(() => io.close());

    const allowRequest = io.engine.opts.allowRequest;
    assert.equal(typeof allowRequest, 'function');
    // 시험 실행은 NODE_ENV=test → Origin 없음 허용, 목록 밖 Origin 거절
    const ask = (headers) => new Promise((resolve) => allowRequest({ headers }, (message, ok) => resolve({ message, ok })));
    assert.equal(process.env.NODE_ENV === 'production', false);
    assert.equal((await ask({})).ok, true);
    assert.deepEqual(await ask({ origin: 'https://evil.example.test' }), { message: 'ORIGIN_NOT_ALLOWED', ok: false });
});

// 진짜 서버: 붙기만 하면 'hello' 보냄
async function startServer(t, env) {
    const httpServer = http.createServer();
    const io = new Server(httpServer, {
        allowRequest: createOriginGuard({ getEnv: () => env, getOrigins: () => origins(env) }),
    });
    io.on('connection', (socket) => socket.emit('hello', 'ok'));
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => { io.close(); httpServer.close(() => resolve()); }));
    return `http://127.0.0.1:${httpServer.address().port}`;
}

// websocket으로만 붙어 보고 결과 ('connected' 또는 'rejected')
function tryConnect(url, headers) {
    return new Promise((resolve) => {
        const client = connectClient(url, { transports: ['websocket'], extraHeaders: headers, reconnection: false, timeout: 3000 });
        client.once('hello', () => { client.close(); resolve('connected'); });
        client.once('connect_error', () => { client.close(); resolve('rejected'); });
    });
}

test('진짜 websocket 접속: 운영 서버는 허용 Origin만, Origin 없음·다른 주소 거절', async (t) => {
    const url = await startServer(t, ENVS.production);
    assert.equal(await tryConnect(url, { origin: DESKTOP }), 'connected');
    assert.equal(await tryConnect(url, { origin: MOBILE }), 'connected');
    assert.equal(await tryConnect(url, { origin: 'https://evil.example.test' }), 'rejected');
    assert.equal(await tryConnect(url, {}), 'rejected');
});

test('진짜 websocket 접속: 개발 서버는 Origin 없음 허용, 다른 주소는 거절', async (t) => {
    const url = await startServer(t, ENVS.development);
    assert.equal(await tryConnect(url, {}), 'connected');
    assert.equal(await tryConnect(url, { origin: DESKTOP }), 'connected');
    assert.equal(await tryConnect(url, { origin: 'https://evil.example.test' }), 'rejected');
});

test('부하 도구: 로컬은 Origin 안 붙임, 로컬 아니면 대상 주소, --frontend-origin 주면 그 origin', () => {
    assert.equal(resolveOriginHeader({ targetOrigin: 'http://127.0.0.1:4000', local: true }), null);
    assert.equal(resolveOriginHeader({ targetOrigin: 'https://staging.example.test', local: false }), 'https://staging.example.test');
    assert.equal(resolveOriginHeader({ frontendOrigin: `${DESKTOP}/lobby`, targetOrigin: 'https://api.example.test', local: false }), DESKTOP);
    assert.throws(() => resolveOriginHeader({ frontendOrigin: 'ftp://x', targetOrigin: 'https://api.example.test', local: false }), /http/);
});

test('부하 도구 Bot: originHeader 있으면 운영 서버에 붙고, 없으면 거절됨', async (t) => {
    const url = await startServer(t, ENVS.production);
    const stats = { connectOk: 0, connectFail: 0, disconnects: 0, latency() {}, error() {}, rejection() {} };

    const withOrigin = new Bot({ origin: url, account: {}, index: 1, stats, timeoutMs: 3000, originHeader: DESKTOP });
    withOrigin.cookie = 'accessToken=x';
    await withOrigin.connect();
    assert.equal(stats.connectOk, 1);
    withOrigin.closing = true;
    withOrigin.socket.close();

    const without = new Bot({ origin: url, account: {}, index: 2, stats, timeoutMs: 3000 });
    without.cookie = 'accessToken=x';
    await assert.rejects(() => without.connect(), /소켓 접속 실패/);
    assert.equal(stats.connectFail, 1);
});
