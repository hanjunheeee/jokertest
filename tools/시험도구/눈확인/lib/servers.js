'use strict';

// 시험 서버 켜고 끄기 파일, e2e와 같은 스크립트(start-backend·serve-front)로 4100·5273·5274·5275를 켬
// 이미 떠 있으면 그대로 씀(안 끔), 4000번(사용자 개발 서버)은 보지도 않음 — run.js가 부름
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { E2E_DIR, RUN_DIR, PIDS_FILE, fromE2e } = require('./paths');

const { E2E } = fromE2e('helpers/env');

// 화면 서버 공통 값: 빌드본, 화면 코드가 안 바뀌었으면 다시 안 빌드함 (once.sh와 같은 값)
const FRONT_ENV = { E2E_FRONT: 'build', E2E_FRONT_REBUILD: '0', VITE_API_BASE_URL: E2E.apiUrl };
const SERVERS = Object.freeze({
    backend: { args: ['scripts/start-backend.js'], url: `${E2E.apiUrl}/health`, timeoutMs: 150_000, env: {} },
    desktop: { args: ['scripts/serve-front.js', 'desktop'], url: E2E.desktopUrl, timeoutMs: 420_000, env: FRONT_ENV },
    mobile: { args: ['scripts/serve-front.js', 'mobile'], url: E2E.mobileUrl, timeoutMs: 420_000, env: FRONT_ENV },
    admin: { args: ['scripts/serve-front.js', 'admin'], url: E2E.adminUrl, timeoutMs: 420_000, env: { E2E_FRONT_REBUILD: '0' } },
});

// 밖에서 넘어온 e2e 값 중 서버 여러 대·켜 둔 것 쓰기 값은 뺌 (늘 서버 1대)
const DROP_ENV = ['E2E_NODES', 'E2E_REDIS_URL', 'E2E_REUSE', 'E2E_KEEP_ACCOUNTS', 'E2E_LB', 'E2E_PROXY', 'E2E_FRONT_PORT'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 주소가 답하나 (1.5초 안)
async function isUp(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
        return res.status < 500;
    } catch {
        return false;
    }
}

// PID 묶음 통째로 끔 (윈도우는 자식까지 taskkill /T, 그 밖은 -pid로 묶음째 — start()가 detached로 띄워 PID가 묶음 번호임)
function killTree(pid) {
    try {
        if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
        else process.kill(-pid, 'SIGTERM');
    } catch { /* 이미 꺼짐 */ }
}

// 그 PID가 지금도 e2e 서버 스크립트인지 (남의 프로세스를 끄지 않게) — 맥·리눅스는 ps, 윈도우는 PowerShell로 명령 줄을 읽음
function isOurServer(pid) {
    try {
        const out = process.platform === 'win32'
            ? execFileSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`], { encoding: 'utf8' })
            : execFileSync('ps', ['-o', 'command=', '-p', String(Number(pid))], { encoding: 'utf8' });
        return /e2e[\/]scripts[\/](start-backend|serve-front)\.js|scripts[\/](start-backend|serve-front)\.js/.test(out);
    } catch {
        return false;
    }
}

class Servers {
    constructor({ runId, log }) {
        this.runId = runId;
        this.log = log;
        this.started = new Map(); // 이름 → { child, pid }
        this.external = new Set(); // 이미 떠 있던 것 (안 끔)
        this.pending = new Map();
    }

    // 지난번에 죽은 도구가 남긴 서버 끄기 (pids.json에 적힌 것 중 지금도 e2e 서버인 것만)
    static cleanStale(log) {
        let rows = [];
        try { rows = JSON.parse(fs.readFileSync(PIDS_FILE, 'utf8')); } catch { return; }
        for (const row of rows) {
            if (isOurServer(row.pid)) { log(`지난번에 남은 서버 끔: ${row.name} PID ${row.pid}`); killTree(row.pid); }
        }
        fs.rmSync(PIDS_FILE, { force: true });
    }

    writePids() {
        const rows = [...this.started].map(([name, s]) => ({ name, pid: s.pid }));
        fs.writeFileSync(PIDS_FILE, JSON.stringify(rows, null, 1));
    }

    // 하나 켜기 (켜는 중이면 그 약속을 같이 기다림)
    ensure(name) {
        if (this.started.has(name) || this.external.has(name)) return Promise.resolve();
        if (!this.pending.has(name)) this.pending.set(name, this.start(name).finally(() => this.pending.delete(name)));
        return this.pending.get(name);
    }

    async start(name) {
        const def = SERVERS[name];
        if (!def) throw new Error(`모르는 서버: ${name}`);
        // 화면 서버는 백엔드가 먼저 (화면이 4100을 부름)
        if (name !== 'backend') await this.ensure('backend');
        if (await isUp(def.url)) {
            this.external.add(name);
            this.log(`${name}: 이미 떠 있어 그대로 씀 (${def.url}, 끝나도 안 끔)`);
            return;
        }
        const env = { ...process.env, ...def.env, E2E_RUN_ID: this.runId };
        for (const key of DROP_ENV) delete env[key];
        const logPath = path.join(RUN_DIR, `server-${name}.log`);
        const out = fs.openSync(logPath, 'a');
        // 맥·리눅스는 따로 뗀 묶음(detached)으로 띄움 → 끌 때 -pid로 자식 백엔드·vite까지 같이 꺼짐
        const child = spawn(process.execPath, def.args, { cwd: E2E_DIR, env, stdio: ['ignore', out, out], windowsHide: true, detached: process.platform !== 'win32' });
        this.started.set(name, { child, pid: child.pid });
        this.writePids();
        this.log(`${name}: 켜는 중 (PID ${child.pid}, 기록 ${path.relative(RUN_DIR, logPath)})`);
        const t0 = Date.now();
        let exited = null;
        child.once('exit', (code) => { exited = code; });
        while (!(await isUp(def.url))) {
            if (exited !== null) throw new Error(`${name} 서버가 켜지다 꺼짐 (code ${exited}) → ${logPath}`);
            if (Date.now() - t0 > def.timeoutMs) throw new Error(`${name} 서버가 ${def.timeoutMs / 1000}초 안에 안 켜짐 → ${logPath}`);
            await sleep(700);
        }
        this.log(`${name}: 켜짐 (${Math.round((Date.now() - t0) / 1000)}초)`);
    }

    // 내가 켠 것만 끔
    stopAll() {
        for (const [name, s] of this.started) {
            this.log(`${name}: 끔 (PID ${s.pid})`);
            killTree(s.pid);
        }
        this.started.clear();
        fs.rmSync(PIDS_FILE, { force: true });
    }
}

module.exports = { Servers, SERVERS, isUp };
