'use strict';

// 씨앗 스크립트 운영 거부 시험 — 시험 계정·시험 상품 넣는 스크립트를 NODE_ENV=production으로 띄우면 종료 코드 0 아님·거부 글·DB 안 붙음
// 목록 A18-B-215~216 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/unit/a18-seed-refuse.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { listenOnFetchablePort } = require('../helpers/fetchablePort');

const BACKEND = path.resolve(__dirname, '..', '..');
const OS_KEYS = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'WINDIR', 'ComSpec', 'TEMP', 'TMP'];

// 임시 폴더 + 미리 읽을 파일: dotenv 읽기를 비움 (시험 계정 스크립트는 backend/.env를 절대 경로로 읽어서, 진짜 .env를 안 읽게)
function tempFolder(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b-a18-seed-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const dotenvPath = require.resolve('dotenv', { paths: [BACKEND] });
    const preload = path.join(dir, 'no-dotenv.js');
    fs.writeFileSync(preload, `require(${JSON.stringify(dotenvPath)}).config = () => ({ parsed: {} });\n`);
    return { dir, preload };
}

// 가짜 DB 자리: 붙는 연결 수만 셈
async function fakeDb(t) {
    const seen = { connections: 0 };
    const server = net.createServer((socket) => { seen.connections += 1; socket.destroy(); });
    const { port } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return { url: `mysql://fakeuser:fake${crypto.randomBytes(8).toString('hex')}@127.0.0.1:${port}/fake_a18_seed`, seen };
}

// 스크립트 따로 띄움 → { code, out }
function runScript(script, { preload, cwd, env }) {
    const base = Object.fromEntries(OS_KEYS.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-r', preload, path.join(BACKEND, 'scripts', script)], {
            cwd, env: { ...base, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { out += d; });
        const timer = setTimeout(() => { child.kill(); reject(new Error(`20초 안에 안 끝남: ${out.slice(-500)}`)); }, 20_000);
        child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }); });
    });
}

[
    ['215', 'seed-dev-testers.js'],
    ['216', 'seed-test-currency-products.js'],
].forEach(([no, script]) => {
    test(`A18-B-${no} NODE_ENV=production으로 ${script} → 종료 코드 0 아님, 거부 글, DB 안 붙음`, async (t) => {
        const { dir, preload } = tempFolder(t);
        const db = await fakeDb(t);
        const r = await runScript(script, { preload, cwd: dir, env: { NODE_ENV: 'production', DATABASE_URL: db.url } });
        assert.notEqual(r.code, 0, r.out);
        assert.match(r.out, /운영/);
        assert.match(r.out, /NODE_ENV=production/);
        assert.equal(db.seen.connections, 0, 'DB에 붙음');
    });
});
