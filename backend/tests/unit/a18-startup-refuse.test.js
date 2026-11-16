'use strict';

// 운영 값이 틀리면 서버가 안 켜지는 시험 — 시험 손잡이 값·서명 키 없음·짧은 서명 키·운영 주소인데 개발 값이면 DB 붙기 전에 종료 1, 출력에 이름만·넣은 값 글자 없음
// 목록 A18-B-201~203·221~222 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/unit/a18-startup-refuse.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { listenOnFetchablePort } = require('../helpers/fetchablePort');

const INDEX = path.resolve(__dirname, '..', '..', 'index.js');
// 자식에게 넘길 운영체제 기본 값만 (시험 환경값·개발 값은 안 넘김)
const OS_KEYS = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'WINDIR', 'ComSpec', 'TEMP', 'TMP'];

// 누가 봐도 가짜인 값 (fake로 시작 + 무작위)
const fakeText = (length) => `fake${crypto.randomBytes(length).toString('hex')}`.slice(0, length);

// 빈 임시 폴더 (index.js 맨 앞 dotenv가 작업 폴더 .env를 읽음 → 빈 폴더라 아무것도 안 읽음), 끝에 지움
function tempFolder(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b-a18-startup-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

// 가짜 DB 자리: 붙는 연결 수만 셈 (붙으면 바로 끊음) → 서버가 DB 붙기 전에 멈췄는지 봄
async function fakeDb(t) {
    const seen = { connections: 0 };
    const server = net.createServer((socket) => { seen.connections += 1; socket.destroy(); });
    const { port } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return { url: `mysql://fakeuser:${fakeText(16)}@127.0.0.1:${port}/fake_a18_db`, seen };
}

// 서버 시작 파일을 따로 띄움 → { code, out }, 20초 안에 안 끝나면 끊고 실패
function runIndex(env, cwd) {
    const base = Object.fromEntries(OS_KEYS.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [INDEX], { cwd, env: { ...base, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { out += d; });
        const timer = setTimeout(() => { child.kill(); reject(new Error(`20초 안에 안 끝남: ${out.slice(-500)}`)); }, 20_000);
        child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }); });
    });
}

// 운영 값 묶음 (시험 전용 값 없음, 서명 키 48자)
const prodEnv = (dbUrl) => ({
    NODE_ENV: 'production',
    DATABASE_URL: dbUrl,
    JWT_SECRET: fakeText(48),
    FRONTEND_URL: 'https://front-a18.example.test',
    LOG_DIR: 'off',
    PORT: '1',
});

[
    ['201', 'E2E_HOOKS=1 있음', (env) => { env.E2E_HOOKS = '1'; }, 'E2E_HOOKS'],
    ['202', 'JWT_SECRET 없음', (env) => { delete env.JWT_SECRET; }, 'JWT_SECRET'],
    ['203', 'JWT_SECRET 무작위 20자', (env) => { env.JWT_SECRET = fakeText(20); }, 'JWT_SECRET'],
].forEach(([no, label, change, name]) => {
    test(`A18-B-${no} 운영 값 + ${label} → 종료 1, "[STARTUP] 실패 — 환경값"과 ${name}, 넣은 값 글자 없음, DB 안 붙음`, async (t) => {
        const cwd = tempFolder(t);
        const db = await fakeDb(t);
        const env = prodEnv(db.url);
        change(env);
        const r = await runIndex(env, cwd);
        assert.equal(r.code, 1, r.out);
        assert.match(r.out, /\[STARTUP\] 실패 — 환경값/);
        assert.match(r.out, new RegExp(name));
        // 넣은 값 글자: 서명 키·DB 주소·프런트 주소 (E2E_HOOKS의 1은 어디에나 있는 글자라 뺌)
        for (const key of ['JWT_SECRET', 'DATABASE_URL', 'FRONTEND_URL']) {
            if (env[key]) assert.equal(r.out.includes(env[key]), false, `출력에 ${key} 값이 샘`);
        }
        assert.equal(db.seen.connections, 0, 'DB에 붙음');
    });
});

// ── 221~222: 운영 주소인데 개발 값이면 안 켜짐 (결정 2026-11-16 아침 17번) ──
// 나머지 값은 다 맞음 → 거절 까닭이 NODE_ENV 하나뿐
[
    ['221', 'NODE_ENV=development', (env) => { env.NODE_ENV = 'development'; }],
    ['222', 'NODE_ENV 없음', (env) => { delete env.NODE_ENV; }],
].forEach(([no, label, change]) => {
    test(`A18-B-${no} 운영 주소(https 도메인) + ${label} → 종료 1, "[STARTUP] 실패 — 환경값"과 NODE_ENV, 넣은 값 글자 없음, DB 안 붙음`, async (t) => {
        const cwd = tempFolder(t);
        const db = await fakeDb(t);
        const env = { ...prodEnv(db.url), FRONTEND_URL: 'https://play.example.com' };
        change(env);
        const r = await runIndex(env, cwd);
        assert.equal(r.code, 1, r.out);
        assert.match(r.out, /\[STARTUP\] 실패 — 환경값/);
        assert.match(r.out, /NODE_ENV/);
        for (const key of ['JWT_SECRET', 'DATABASE_URL', 'FRONTEND_URL']) {
            assert.equal(r.out.includes(env[key]), false, `출력에 ${key} 값이 샘`);
        }
        assert.equal(db.seen.connections, 0, 'DB에 붙음');
    });
});
