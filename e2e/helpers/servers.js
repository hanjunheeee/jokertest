'use strict';

// 서버 다루기 파일, 시험 백엔드(4100) 꺼짐 시키기·다시 켜질 때까지 기다리기 + 시험 하나만 쓰는 백엔드 따로 띄우기
// 서버 꺼짐 시험(@shutdown, serial 프로젝트)·요청 수 제한·시작 거부 시험(security)이 씀
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { E2E, RUNTIME_DIR, SHUTDOWN_FLAG, BACKEND_DIR, readSecrets } = require('./env');
const { backendEnv } = require('./backendEnv');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isUp(apiUrl = E2E.apiUrl) {
    try {
        const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(1500) });
        return res.ok;
    } catch {
        return false;
    }
}

async function waitUntil(fn, { timeoutMs, label }) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await fn()) return;
        await sleep(200);
    }
    throw new Error(`${label} (${timeoutMs}ms)`);
}

/**
 * 시험 백엔드(4100)에 종료 신호(SIGTERM) 보내기 — 서버가 접속자에게 server_shutdown 안내 → 소켓·DB 닫고 꺼짐
 * scripts/start-backend.js가 곧 다시 켬. @shutdown 태그 시험(serial 프로젝트, 한 번에 하나)에서만 쓸 것
 * @param {object} [o]
 * @param {boolean} [o.waitDown=true] 꺼질 때까지 기다림
 */
async function triggerShutdown({ waitDown = true, timeoutMs = 20000 } = {}) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(SHUTDOWN_FLAG, String(Date.now()));
    if (waitDown) await waitUntil(async () => !(await isUp()), { timeoutMs, label: '백엔드가 안 꺼짐' });
}

/** 시험 백엔드가 다시 켜질 때까지 (다음 시험 전에 꼭 부르기) */
async function waitBackendUp({ timeoutMs = 60000 } = {}) {
    await waitUntil(() => isUp(), { timeoutMs, label: '백엔드가 다시 안 켜짐' });
}

/**
 * 시험 하나만 쓰는 백엔드 따로 띄우기 (같은 시험 DB, 다른 포트, 화면 없음 — API·소켓만)
 * 요청 수 제한(운영 기본 ip 제한) 시험, 운영 설정으로 시작 거부되는지 시험에 씀
 * @param {object} [o]
 * @param {number} [o.port] 안 주면 4150 + 작업자 번호
 * @param {boolean} [o.defaultIpLimits=true] ip 제한을 운영 기본값으로
 * @param {object} [o.overrides] 환경값 덮어쓰기 (undefined면 뺌) 예: { NODE_ENV: 'production', JWT_SECRET: 'short' }
 * @param {boolean} [o.expectExit=false] true면 켜지길 안 기다리고 꺼질 때까지 기다려 { code, output } 돌려줌
 * @returns {Promise<{ url:string, port:number, stop:()=>Promise<void>, output:()=>string } | { code:number, output:string }>}
 */
async function startExtraBackend({ port, defaultIpLimits = true, overrides = {}, expectExit = false, timeoutMs = 60000 } = {}) {
    const workerIndex = Number(process.env.TEST_PARALLEL_INDEX ?? 0);
    const usePort = port ?? 4150 + workerIndex;
    // 서버 이름을 따로 (시작 때 "내 서버 접속자 OFFLINE으로" 정리가 본 서버(e2e) 접속자를 안 건드리게)
    const env = backendEnv(readSecrets(), { port: usePort, defaultIpLimits, overrides: { SERVER_ID: `e2e-extra-${usePort}`, ...overrides } });
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    const child = spawn(process.execPath, [path.join(BACKEND_DIR, 'index.js')], { cwd: RUNTIME_DIR, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.on('data', (c) => { output += c.toString('utf8'); });
    child.stderr.on('data', (c) => { output += c.toString('utf8'); });
    const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));

    // 비밀값이 출력에 섞여 시험 보고서에 남지 않게 가림
    const secrets = Object.values(readSecrets()).filter((v) => v && v.length >= 8);
    const redact = (text) => secrets.reduce((acc, value) => acc.split(value).join('[가림]'), text);

    if (expectExit) {
        const code = await Promise.race([exited, sleep(timeoutMs).then(() => 'TIMEOUT')]);
        if (code === 'TIMEOUT') { child.kill(); throw new Error('따로 띄운 백엔드가 안 꺼짐 (시작 거부 안 됨)'); }
        return { code, output: redact(output) };
    }
    const url = `http://localhost:${usePort}`;
    await Promise.race([
        waitUntil(() => isUp(url), { timeoutMs, label: `따로 띄운 백엔드 ${usePort} 안 켜짐` }),
        exited.then((code) => { throw new Error(`따로 띄운 백엔드가 바로 꺼짐 code=${code}: ${redact(output).slice(-500)}`); }),
    ]);
    return {
        url,
        port: usePort,
        output: () => redact(output),
        stop: async () => { if (child.exitCode === null) { child.kill(); await exited; } },
    };
}

module.exports = { isUp, triggerShutdown, waitBackendUp, startExtraBackend };
