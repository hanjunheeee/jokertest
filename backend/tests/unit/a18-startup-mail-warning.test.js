'use strict';

// 서버 켤 때 재설정 메일 설정 경고 시험 — 운영 값인데 메일 설정이 빠지면 경고 한 줄(이름만), 설정이 다 있거나 개발 값이면 없음, 경고가 켜기를 안 막음
// 목록 A18-B-223~225 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/unit/a18-startup-mail-warning.test.js
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b-a18-mail-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

// 가짜 DB 자리: 붙는 연결 수만 셈 (붙으면 바로 끊음) → 서버가 경고 뒤에도 DB 붙기까지 갔는지 봄
async function fakeDb(t) {
    const seen = { connections: 0 };
    const server = net.createServer((socket) => { seen.connections += 1; socket.destroy(); });
    const { port } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return { url: `mysql://fakeuser:${fakeText(16)}@127.0.0.1:${port}/fake_a18_db`, seen };
}

// 서버 시작 파일을 따로 띄움 → { code, out }, 30초 안에 안 끝나면 끊고 실패 (가짜 DB라 DB 붙기에서 스스로 끝남)
function runIndex(env, cwd) {
    const base = Object.fromEntries(OS_KEYS.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [INDEX], { cwd, env: { ...base, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { out += d; });
        const timer = setTimeout(() => { child.kill(); reject(new Error(`30초 안에 안 끝남: ${out.slice(-500)}`)); }, 30_000);
        child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }); });
    });
}

// 켜기 값 묶음 (메일 설정은 하나도 없음, 서명 키 48자), 개발 값이면 프런트 주소는 내 PC 주소 (운영 주소 + 개발 값은 켜기 거절이라)
const baseEnv = (dbUrl, mode) => ({
    NODE_ENV: mode,
    DATABASE_URL: dbUrl,
    JWT_SECRET: fakeText(48),
    FRONTEND_URL: mode === 'production' ? 'https://front-a18.example.test' : 'http://localhost:5173',
    LOG_DIR: 'off',
    PORT: '1',
});

// 다 맞는 메일 설정 (시험 전용 값, 진짜 값 아님)
const MAIL_OK = {
    PASSWORD_RESET_APP_URL: 'https://app.example.test',
    MAIL_SMTP_HOST: 'smtp.example.test',
    MAIL_SMTP_USER: 'sender@example.test',
    MAIL_SMTP_PASS: 'test-only-mail-pass',
    PASSWORD_RESET_MAIL_FROM: 'noreply@example.test',
};

// 출력에서 메일 경고 줄만
const mailWarningLines = (out) => out.split(/\r?\n/).filter((line) => line.includes('비밀번호 재설정 메일이 안 나감'));

test('A18-B-223 운영 값 + 메일 설정 하나도 없음 → "[STARTUP] 경고 — 비밀번호 재설정 메일이 안 나감 — 빠진 설정: …" 한 줄, 그 뒤 DB 붙기까지 감', async (t) => {
    const cwd = tempFolder(t);
    const db = await fakeDb(t);
    const r = await runIndex(baseEnv(db.url, 'production'), cwd);
    const lines = mailWarningLines(r.out);
    assert.equal(lines.length, 1, r.out);
    assert.equal(
        lines[0].trim(),
        '[STARTUP] 경고 — 비밀번호 재설정 메일이 안 나감 — 빠진 설정: PASSWORD_RESET_APP_URL, PASSWORD_RESET_MAIL_GATEWAY_URL, PASSWORD_RESET_MAIL_GATEWAY_TOKEN, PASSWORD_RESET_MAIL_FROM',
    );
    // 경고는 켜기를 안 막음: 환경값 거절이 아니라 가짜 DB에 붙다가 끝남
    assert.equal(/\[STARTUP\] 실패 — 환경값/.test(r.out), false, r.out);
    assert.match(r.out, /\[STARTUP\] 실패 — DB 연결/);
    assert.ok(db.seen.connections >= 1, 'DB 붙기까지 안 감');
});

test('A18-B-224 개발 값 + 메일 설정 하나도 없음 → 메일 경고 줄 없음, DB 붙기까지 감', async (t) => {
    const cwd = tempFolder(t);
    const db = await fakeDb(t);
    const r = await runIndex(baseEnv(db.url, 'development'), cwd);
    assert.equal(mailWarningLines(r.out).length, 0, r.out);
    assert.match(r.out, /\[STARTUP\] 실패 — DB 연결/);
    assert.ok(db.seen.connections >= 1, 'DB 붙기까지 안 감');
});

test('A18-B-225 운영 값 + 메일 설정 다 있음(SMTP) → 메일 경고 줄 없음, 출력에 메일 설정 값 글자 없음', async (t) => {
    const cwd = tempFolder(t);
    const db = await fakeDb(t);
    const r = await runIndex({ ...baseEnv(db.url, 'production'), ...MAIL_OK }, cwd);
    assert.equal(mailWarningLines(r.out).length, 0, r.out);
    for (const [name, value] of Object.entries(MAIL_OK)) assert.equal(r.out.includes(value), false, `출력에 ${name} 값이 샘`);
    assert.match(r.out, /\[STARTUP\] 실패 — DB 연결/);
});
