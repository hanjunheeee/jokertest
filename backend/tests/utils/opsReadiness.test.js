'use strict';

// 2026-11-09 운영 준비 시험: 로그 파일(날짜 바뀜·정리·비밀값 가림) · 종료 처리 · /health · 부팅 연결
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test   = require('node:test');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { EventEmitter } = require('node:events');
const { spawnSync }    = require('node:child_process');

const {
    createLogFile, createLogFileFromEnv, maskSecrets, teeConsoleToLogFile, toDateKey,
} = require('../../utils/logFile');
const { createShutdown, installProcessHandlers, SHUTDOWN_EVENT } = require('../../utils/processLifecycle');

const ENTRYPOINT = path.join(__dirname, '..', '..', 'index.js');

const tmpDir = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-log-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
};

// ── 로그 파일 ──

test('로그 파일: 날짜가 바뀌면 새 파일에 이어 씀', (t) => {
    const dir = tmpDir(t);
    let clock = new Date(2026, 10, 9, 23, 59, 50);
    const log = createLogFile({ dir, now: () => new Date(clock) });
    log.write('첫날 줄');
    clock = new Date(2026, 10, 10, 0, 0, 5);
    log.write('다음날 줄');
    log.close();

    const day1 = fs.readFileSync(path.join(dir, 'app-2026-11-09.log'), 'utf8');
    const day2 = fs.readFileSync(path.join(dir, 'app-2026-11-10.log'), 'utf8');
    assert.match(day1, /첫날 줄\n$/);
    assert.doesNotMatch(day1, /다음날/);
    assert.match(day2, /다음날 줄\n$/);
});

test('로그 파일: 보관 일수 지난 파일만 지우고 다른 이름 파일은 안 건드림', (t) => {
    const dir = tmpDir(t);
    for (const name of ['app-2026-10-01.log', 'app-2026-11-02.log', 'app-2026-11-03.log', 'note.txt']) {
        fs.writeFileSync(path.join(dir, name), 'x');
    }
    const log = createLogFile({ dir, retentionDays: 7, now: () => new Date(2026, 10, 9, 12) });
    log.write('정리 계기');
    log.close();

    const left = fs.readdirSync(dir).sort();
    // 오늘 포함 7일 = 11-03 ~ 11-09 남김
    assert.deepEqual(left, ['app-2026-11-03.log', 'app-2026-11-09.log', 'note.txt']);
});

test('로그 파일: 비번·토큰·쿠키·키·접속 주소 비번은 가려서 남김', (t) => {
    const dir = tmpDir(t);
    const log = createLogFile({ dir, now: () => new Date(2026, 10, 9) });
    log.write('login password=hunter2 token: abc.def cookie=accessToken=xyz');
    log.write('Authorization: Bearer abc123 x-internal-key=kkkkkk');
    log.write('jwt eyJhbGciOiJIUzI1NiJ9.eyJ1dWlkIjoiMSJ9.sig_value-1');
    log.write('db mysql://joker:supersecret@db:3306/joker {"password":"pw1"}');
    log.write('\x1b[31m[에러]\x1b[0m 색 빼기');
    log.close();

    const text = fs.readFileSync(log.currentFile() ?? path.join(dir, `app-${toDateKey(new Date(2026, 10, 9))}.log`), 'utf8');
    for (const secret of ['hunter2', 'abc.def', 'xyz', 'abc123', 'kkkkkk', 'supersecret', 'pw1', 'eyJhbGci']) {
        assert.ok(!text.includes(secret), `가려지지 않음: ${secret}`);
    }
    assert.match(text, /\[REDACTED\]/);
    assert.match(text, /mysql:\/\/joker:\[REDACTED\]@db/);
    assert.match(text, /\[에러\] 색 빼기/);
    assert.equal(maskSecrets('GET /auth/me 401'), 'GET /auth/me 401');
});

test('로그 파일: LOG_DIR=off면 끔, console 출력은 파일에도 같이 감', (t) => {
    assert.equal(createLogFileFromEnv({ LOG_DIR: 'off' }), null);

    const dir = tmpDir(t);
    const log = createLogFileFromEnv({ LOG_DIR: dir, LOG_RETENTION_DAYS: '3' });
    const printed = [];
    const fakeConsole = { log: (...a) => printed.push(a), info() {}, warn() {}, error: (...a) => printed.push(a) };
    const restore = teeConsoleToLogFile(log, fakeConsole);
    fakeConsole.error('[STARTUP] 실패', new Error('boom'));
    restore();
    fakeConsole.log('되돌린 뒤');
    log.close();

    const file = fs.readdirSync(dir).find((name) => name.startsWith('app-'));
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.match(text, /\[ERROR\] \[STARTUP\] 실패 Error: boom/);
    assert.doesNotMatch(text, /되돌린 뒤/);
    assert.equal(printed.length, 2, '원래 출력도 그대로 나감');
});

// ── 종료 처리 ──

const fakeTimers = () => {
    const pending = [];
    return {
        setTimeoutFn: (fn, ms) => { const timer = { fn, ms, cleared: false }; pending.push(timer); return timer; },
        clearTimeoutFn: (timer) => { if (timer) timer.cleared = true; },
        pending,
    };
};

const silentLog = () => {
    const lines = [];
    return { lines, warn: (...a) => lines.push(['warn', ...a]), error: (...a) => lines.push(['error', ...a]) };
};

test('종료: 새 연결 막기 → 점검 안내 → 소켓 닫기 → DB 닫기 → 종료 순서, 두 번 불러도 한 번', async () => {
    const order = [];
    const timers = fakeTimers();
    // 기다림 타이머는 바로 풀어 줌
    const setTimeoutFn = (fn, ms) => {
        const timer = timers.setTimeoutFn(fn, ms);
        if (ms === 5) setImmediate(fn);
        return timer;
    };
    const shutdown = createShutdown({
        server: { listening: true, close: () => order.push('server.close') },
        io: {
            emit: (event, payload) => order.push(`emit:${event}:${payload.code}`),
            close: (cb) => { order.push('io.close'); cb(); },
        },
        closeDb: async () => { order.push('db.close'); },
        logFile: { close: () => order.push('log.close') },
        exit: (code) => order.push(`exit:${code}`),
        log: silentLog(),
        graceMs: 5,
        forceMs: 10000,
        setTimeoutFn,
        clearTimeoutFn: timers.clearTimeoutFn,
    });

    const first = shutdown('SIGTERM', 0);
    const second = shutdown('SIGINT', 0);
    assert.equal(first, second);
    await first;

    assert.deepEqual(order, [
        'server.close', `emit:${SHUTDOWN_EVENT}:SERVER_SHUTDOWN`, 'io.close', 'db.close', 'log.close', 'exit:0',
    ]);
    assert.equal(timers.pending.find((timer) => timer.ms === 10000).cleared, true, '강제 종료 타이머는 꺼짐');
});

test('종료: DB 닫기가 실패해도 끝까지 가고, 시간 초과면 강제 종료(코드 1)', async () => {
    const exits = [];
    const timers = fakeTimers();
    const log = silentLog();
    const shutdown = createShutdown({
        server: { listening: false, close() { throw new Error('안 불려야 함'); } },
        io: null,
        closeDb: async () => { throw new Error('db down'); },
        exit: (code) => exits.push(code),
        log,
        graceMs: 0,
        setTimeoutFn: (fn, ms) => { const timer = timers.setTimeoutFn(fn, ms); if (ms === 0) setImmediate(fn); return timer; },
        clearTimeoutFn: timers.clearTimeoutFn,
    });
    await shutdown('uncaughtException', 1);
    assert.deepEqual(exits, [1]);
    assert.ok(log.lines.some((line) => String(line[1]).includes('DB 닫기 실패')));

    // 강제 종료 타이머 직접 터뜨림
    const force = timers.pending.find((timer) => timer.ms === 10000);
    force.fn();
    assert.deepEqual(exits, [1, 1]);
});

test('프로세스 사건: 거절은 기록만, 예상 못 한 오류는 종료 코드 1, SIGTERM·SIGINT는 0', () => {
    const proc = new EventEmitter();
    const calls = [];
    const log = silentLog();
    installProcessHandlers({ shutdown: (reason, code) => calls.push([reason, code]), proc, log });

    proc.emit('unhandledRejection', new Error('나중 실패'));
    assert.deepEqual(calls, []);
    assert.ok(log.lines.some((line) => String(line[1]).includes('처리 안 된 Promise')));

    proc.emit('uncaughtException', new Error('터짐'));
    proc.emit('SIGTERM');
    proc.emit('SIGINT');
    assert.deepEqual(calls, [['uncaughtException', 1], ['SIGTERM', 0], ['SIGINT', 0]]);
});

// ── /health ──

const startHealthApp = async (t, { dbOk }) => {
    const models = require('../../models');
    const original = models.sequelize.query;
    models.sequelize.query = async () => { if (!dbOk) throw new Error('down'); return [[{ 1: 1 }]]; };
    t.after(() => { models.sequelize.query = original; });

    const express = require('express');
    const app = express();
    app.use('/health', require('../../routes/health.routes'));
    const server = require('node:http').createServer(app);
    await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}/health`;
};

test('/health: DB 되면 200 ok, 안 되면 503, 열쇠 없으면 서버 숫자 안 실음', async (t) => {
    const saved = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = 'k'.repeat(40);
    t.after(() => { if (saved === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = saved; });

    const url = await startHealthApp(t, { dbOk: true });
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { ok: true });

    const wrong = await fetch(url, { headers: { 'x-internal-key': 'nope' } });
    assert.deepEqual(await wrong.json(), { ok: true });

    const withKey = await fetch(url, { headers: { 'x-internal-key': 'k'.repeat(40) } });
    const body = await withKey.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.server.memoryMb.rss, 'number');
    assert.equal(typeof body.server.eventLoopDelayMs.p95, 'number');
    assert.equal(typeof body.server.connections.onlineUsers, 'number');
});

test('/health: DB 안 되면 503 DB_UNAVAILABLE, 열쇠 정한 게 짧으면 서버 숫자 안 줌', async (t) => {
    const saved = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = 'short';
    t.after(() => { if (saved === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = saved; });

    const url = await startHealthApp(t, { dbOk: false });
    const res = await fetch(url, { headers: { 'x-internal-key': 'short' } });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false, code: 'DB_UNAVAILABLE' });
});

// ── 부팅 연결 (index.js를 따로 켜 봄) ──

test('부팅: 운영에서 필수 환경값이 비면 환경값 실패 한 줄로 종료 코드 1', () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
        env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: ' ', LOG_DIR: 'off' },
        encoding: 'utf8',
        timeout: 20000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[STARTUP\] 실패 — 환경값: 필수 환경값이 없습니다: JWT_SECRET/);
});

test('부팅: 개발에서 필수 환경값이 비면 경고만 하고 계속 감 (DB 실패로 끝나는 것까지)', () => {
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
        env: {
            ...process.env, NODE_ENV: 'development', JWT_SECRET: ' ', LOG_DIR: 'off',
            DATABASE_URL: 'mysql://bad:bad@127.0.0.1:1/nonexistent_db', DB_POOL_ACQUIRE: '2000',
        },
        encoding: 'utf8',
        timeout: 60000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[STARTUP\] 경고 — 필수 환경값이 없습니다: JWT_SECRET/);
    assert.match(result.stderr, /\[STARTUP\] 실패 — DB 연결/);
});

test('부팅: 직접 켜면 LOG_DIR에 그날 파일이 생기고 접속 주소 비번은 가려짐', (t) => {
    const dir = tmpDir(t);
    const result = spawnSync(process.execPath, [ENTRYPOINT], {
        env: {
            ...process.env, LOG_DIR: dir,
            DATABASE_URL: 'mysql://bad:topsecretpw@127.0.0.1:1/nonexistent_db', DB_POOL_ACQUIRE: '2000',
        },
        encoding: 'utf8',
        timeout: 60000,
    });
    assert.equal(result.status, 1);
    const files = fs.readdirSync(dir);
    assert.equal(files.length, 1);
    assert.match(files[0], /^app-\d{4}-\d{2}-\d{2}\.log$/);
    const text = fs.readFileSync(path.join(dir, files[0]), 'utf8');
    assert.match(text, /\[ERROR\] \[STARTUP\] 실패/);
    assert.ok(!text.includes('topsecretpw'));
});
