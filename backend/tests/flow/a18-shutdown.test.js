'use strict';

// 서버 끄기 시험 — 끄기 신호면 접속자에게 안내 뒤 끊고 종료 0, 끄기 시작하면 새 손님 안 받음, Promise 거절은 안 끔, 정리 10초 넘으면 1, 예상 못 한 오류면 안내 뒤 1
// 목록 A18-B-117~121 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/flow/a18-shutdown.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');

const { createShutdown, installProcessHandlers } = require('../../utils/processLifecycle');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');

// 화면에 보이는 안내 글 (processLifecycle.js 사용자 문구)
const NOTICE = { code: 'SERVER_SHUTDOWN', message: '서버 점검·업데이트로 잠시 연결이 끊깁니다. 잠시 뒤 자동으로 다시 연결돼요.' };

// 기록은 모으기만 (시험 출력 안 어지럽히게)
const quietLog = () => ({ lines: [], warn(...a) { this.lines.push(a.join(' ')); }, error(...a) { this.lines.push(a.join(' ')); } });

// 사건 하나 기다리기 (최대 ms, 넘으면 실패)
const waitFor = (emitter, event, ms = 5_000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} 안 옴 (${ms}ms)`)), ms);
    emitter.once(event, (...args) => { clearTimeout(timer); resolve(args); });
});

// 손님이 끊김을 받을 때까지 (서버는 닫기 끝내자마자 종료를 부르고, 끊김은 그 뒤 손님 쪽에 닿음, 최대 3초)
const disconnected = (c) => (c.client.connected ? waitFor(c.client, 'disconnect', 3_000) : Promise.resolve());

// 진짜 http 서버 + socket.io + /ping(200), 끄기 도구를 가짜 프로세스(신호 흉내)에 붙임 → 종료 코드는 exits에 모음
async function startServer(t, { closeDb = async () => {} } = {}) {
    const server = http.createServer((req, res) => { res.writeHead(200); res.end('pong'); });
    const io = new Server(server, { transports: ['websocket'] });
    const { url } = await listenOnFetchablePort(server);
    const exits = [];
    const exited = new EventEmitter();
    const proc = new EventEmitter();
    const log = quietLog();
    const shutdown = createShutdown({ server, io, closeDb, exit: (code) => { exits.push(code); exited.emit('exit', code); }, log });
    installProcessHandlers({ shutdown, proc, log });
    const clients = [];
    t.after(async () => {
        for (const c of clients) c.close();
        io.close();
        if (server.listening) await new Promise((resolve) => server.close(resolve));
    });
    // 손님 하나 붙이기 → 받은 사건 차례 기록 ({ name, payload })
    const join = async () => {
        const client = connectClient(url, { transports: ['websocket'], reconnection: false, timeout: 3_000 });
        const seen = [];
        client.on('server_shutdown', (payload) => seen.push({ name: 'server_shutdown', payload }));
        client.on('disconnect', (reason) => seen.push({ name: 'disconnect', payload: reason }));
        clients.push(client);
        await waitFor(client, 'connect');
        return { client, seen };
    };
    return { url, io, proc, exits, exited, join, log };
}

test('A18-B-117 손님 2개, 끄기 신호 → 둘 다 server_shutdown 받은 뒤에 끊김, 종료 코드 0', async (t) => {
    const s = await startServer(t);
    const a = await s.join();
    const b = await s.join();
    const done = waitFor(s.exited, 'exit', 10_000);
    s.proc.emit('SIGTERM');
    await done;
    assert.deepEqual(s.exits, [0]);
    await Promise.all([a, b].map(disconnected));
    for (const c of [a, b]) {
        assert.deepEqual(c.seen.map((e) => e.name), ['server_shutdown', 'disconnect']);
        assert.deepEqual(c.seen[0].payload, NOTICE);
    }
});

test('A18-B-118 끄기 시작 직후 새 HTTP 요청 → 연결 거절, 새 소켓 접속 → 안 붙음', async (t) => {
    const s = await startServer(t);
    await s.join();
    const done = waitFor(s.exited, 'exit', 10_000);
    s.proc.emit('SIGTERM');
    // 안내 뒤 1.5초 기다리는 사이 (아직 종료 전)
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.deepEqual(s.exits, [], '벌써 종료됨 (확인 시점이 늦음)');
    await assert.rejects(fetch(`${s.url}/ping`), '새 요청이 받아짐');
    const late = connectClient(s.url, { transports: ['websocket'], reconnection: false, timeout: 2_000 });
    t.after(() => late.close());
    const result = await Promise.race([
        waitFor(late, 'connect', 3_000).then(() => 'connect'),
        waitFor(late, 'connect_error', 3_000).then(() => 'connect_error'),
    ]);
    assert.equal(result, 'connect_error');
    await done;
});

test('A18-B-119 처리 안 된 Promise 거절 → 종료 안 함, 손님 연결 그대로, 새 요청 200', async (t) => {
    const s = await startServer(t);
    const a = await s.join();
    s.proc.emit('unhandledRejection', new Error('a18 시험 거절'));
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    assert.deepEqual(s.exits, []);
    assert.equal(a.client.connected, true);
    assert.deepEqual(a.seen, []);
    const res = await fetch(`${s.url}/ping`);
    assert.equal(res.status, 200);
});

test('A18-B-120 DB 닫기가 안 끝남, 가짜 시계 10초 → 종료 코드 1', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const exits = [];
    const log = quietLog();
    // 서버·소켓 없이 DB 닫기만 끝나지 않는 끄기 (안내·소켓 닫기는 할 것 없음)
    const shutdown = createShutdown({ server: null, io: null, closeDb: () => new Promise(() => {}), exit: (code) => exits.push(code), log });
    const proc = new EventEmitter();
    installProcessHandlers({ shutdown, proc, log });
    proc.emit('SIGTERM');
    // 1초씩 넘기며 약속 처리 (가짜 시계는 넘긴 끝 시각으로 타이머를 부름)
    const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
    for (let ms = 1_000; ms < 10_000; ms += 1_000) {
        t.mock.timers.tick(1_000);
        await flush();
        assert.deepEqual(exits, [], `${ms}ms에 벌써 종료`);
    }
    t.mock.timers.tick(1_000);
    await flush();
    assert.deepEqual(exits, [1]);
});

test('A18-B-121 예상 못 한 오류 → 손님 server_shutdown 안내 → 끊김 → 종료 코드 1', async (t) => {
    const s = await startServer(t);
    const a = await s.join();
    const done = waitFor(s.exited, 'exit', 10_000);
    s.proc.emit('uncaughtException', new Error('a18 시험 오류'));
    await done;
    assert.deepEqual(s.exits, [1]);
    await disconnected(a);
    assert.deepEqual(a.seen.map((e) => e.name), ['server_shutdown', 'disconnect']);
    assert.deepEqual(a.seen[0].payload, NOTICE);
});
