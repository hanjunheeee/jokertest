'use strict';

// 서버 다루기 파일, 시험 백엔드(4100) 꺼짐 시키기·다시 켜질 때까지 기다리기 + 시험 하나만 쓰는 백엔드 따로 띄우기
// 서버 꺼짐 시험(@shutdown, serial 프로젝트)·요청 수 제한·시작 거부 시험(security)이 씀, Node 여러 개면 Node 하나만 끄기·죽이기도
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { E2E, RUNTIME_DIR, BACKEND_DIR, readSecrets, shutdownFlagFor } = require('./env');
const { backendEnv } = require('./backendEnv');
const { sleep, waitUntil } = require('./wait');

async function isUp(apiUrl = E2E.apiUrl) {
    try {
        const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(1500) });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * 끌 Node 고르기: Node 하나면 늘 그 하나(4100)
 * 여러 개면 node(SERVER_ID) → 그 Node, uuid → 그 사람 판 Node(/e2e/users/:uuid/game의 node), 둘 다 없으면 전부
 * (판 Node를 못 찾으면 전부 → 한 서버일 때와 같은 뜻)
 */
async function targetNodes({ node, uuid } = {}) {
    if (!E2E.multiNode) return E2E.nodes;
    if (node) {
        const found = E2E.nodes.filter((n) => n.id === node);
        if (found.length === 0) throw new Error(`모르는 Node: ${node} (있는 것: ${E2E.nodes.map((n) => n.id).join(', ')})`);
        return found;
    }
    if (uuid) {
        const game = await require('./internal').e2e.gameOf(uuid).catch(() => null);
        const found = E2E.nodes.filter((n) => n.id === game?.node);
        if (found.length > 0) return found;
    }
    return E2E.nodes;
}

// Node들이 다 꺼질 때까지 (Node 여러 개면 앞단 말고 Node 주소를 바로 봄)
const waitNodesDown = (nodes, timeoutMs) =>
    waitUntil(async () => (await Promise.all(nodes.map((n) => isUp(n.url)))).every((up) => !up), { timeoutMs, label: '백엔드가 안 꺼짐' });

/**
 * 시험 백엔드(4100)에 종료 신호(SIGTERM) 보내기 — 서버가 접속자에게 server_shutdown 안내 → 소켓·DB 닫고 꺼짐
 * scripts/start-backend.js가 곧 다시 켬. @shutdown 태그 시험(serial 프로젝트, 한 번에 하나)에서만 쓸 것
 * @param {object} [o]
 * @param {boolean} [o.waitDown=true] 꺼질 때까지 기다림
 * @param {string} [o.node] Node 여러 개: 끌 Node (SERVER_ID)
 * @param {string} [o.uuid] Node 여러 개: 이 사람 판 Node를 끔
 * @param {boolean} [o.kill=false] 정리 없이 바로 죽임 (SIGKILL 흉내, 안내 없음)
 * @returns {Promise<string[]>} 끈 Node id
 */
async function triggerShutdown({ waitDown = true, timeoutMs = 20000, node, uuid, kill = false } = {}) {
    const nodes = await targetNodes({ node, uuid });
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    for (const n of nodes) fs.writeFileSync(`${shutdownFlagFor(n.id)}${kill ? '.kill' : ''}`, String(Date.now()));
    if (waitDown) await waitNodesDown(nodes, timeoutMs);
    return nodes.map((n) => n.id);
}

/** 시험 백엔드가 다시 켜질 때까지 (다음 시험 전에 꼭 부르기), Node 여러 개면 전부 */
async function waitBackendUp({ timeoutMs = 60000 } = {}) {
    await waitUntil(async () => (await Promise.all(E2E.nodes.map((n) => isUp(n.url)))).every(Boolean), { timeoutMs, label: '백엔드가 다시 안 켜짐' });
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
        if (code === 'TIMEOUT') { child.kill(); await exited; throw new Error('따로 띄운 백엔드가 안 꺼짐 (시작 거부 안 됨)'); }
        return { code, output: redact(output) };
    }
    const url = `http://localhost:${usePort}`;
    const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited; } };
    // 시험 프로세스가 먼저 끝나도 남지 않게
    const killOnExit = () => { try { child.kill(); } catch { /* 이미 꺼짐 */ } };
    process.once('exit', killOnExit);
    exited.then(() => process.off('exit', killOnExit));
    try {
        await Promise.race([
            waitUntil(() => isUp(url), { timeoutMs, label: `따로 띄운 백엔드 ${usePort} 안 켜짐` }),
            exited.then((code) => { throw new Error(`따로 띄운 백엔드가 바로 꺼짐 code=${code}: ${redact(output).slice(-500)}`); }),
        ]);
    } catch (error) {
        // 시간 초과여도 띄운 node는 꼭 끔 (늦게 켜져 포트를 잡고 남지 않게 — 문제목록 security S-02)
        await stop().catch(() => {});
        throw error;
    }
    return { url, port: usePort, output: () => redact(output), stop };
}

module.exports = { isUp, triggerShutdown, waitBackendUp, startExtraBackend, targetNodes };
