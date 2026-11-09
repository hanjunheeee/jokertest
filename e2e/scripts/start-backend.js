#!/usr/bin/env node
'use strict';

// 시험 전용 백엔드 띄우기 파일, 시험 DB 준비 → backend/index.js를 4100 포트로 켜고 꺼지면 다시 켬 (서버 꺼짐 시험 뒤 다음 시험 위해)
// playwright.config.js의 webServer가 부름, 개발 서버(4000)·개발 DB와 안 겹침, 서버 출력은 .runtime/backend.log에만
// E2E_NODES=2: 시험 Redis 켬 → 4101·4102에 Node 둘(Node마다 다시 켜기·로그·꺼짐 깃발 따로) → 4100에 앞단(lb-proxy.js)
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const setupDb = require('./setup-db');
const { E2E, RUNTIME_DIR, MAIL_DIR, BACKEND_LOG, backendLogFor, redisPrefix } = require('../helpers/env');
const { backendEnv } = require('../helpers/backendEnv');

const BACKEND_DIR = path.join(__dirname, '..', '..', 'backend');
// 너무 자주 죽으면(시작 실패) 그만 — 무한 반복 막기
const MAX_RESTARTS = 50;

let stopping = false;
const supervisors = [];
let proxy = null;

/**
 * 백엔드 하나 띄우고 꺼지면 다시 켬
 * @param {{ env:object, logPath:string, tag:string }} o tag는 화면 줄 앞 ([e2e-backend] 또는 [e2e-backend e2e-n1])
 */
function superviseNode({ env, logPath, tag }) {
    const s = { child: null, restarts: 0 };
    const start = () => {
        const log = fs.openSync(logPath, 'a');
        fs.writeSync(log, `\n===== ${new Date().toISOString()} 백엔드 켬 (다시 켠 횟수 ${s.restarts}) =====\n`);
        const child = spawn(process.execPath, ['--require', path.join(__dirname, 'shutdown-trigger.cjs'), path.join(BACKEND_DIR, 'index.js')], {
            cwd: RUNTIME_DIR, // backend/.env를 안 읽게 (dotenv는 cwd의 .env를 읽음)
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        s.child = child;
        // 시작 줄만 화면에 (Playwright가 기다리는 동안 보임), 나머지는 파일에
        const forward = (chunk) => {
            fs.writeSync(log, chunk);
            for (const line of chunk.toString('utf8').split(/\r?\n/)) {
                if (/\[STARTUP\]|\[SHUTDOWN\]|\[e2e\]/.test(line)) process.stdout.write(`${tag} ${line}\n`);
            }
        };
        child.stdout.on('data', forward);
        child.stderr.on('data', forward);
        child.on('exit', (code, signal) => {
            try { fs.writeSync(log, `===== 백엔드 꺼짐 code=${code} signal=${signal} =====\n`); fs.closeSync(log); } catch { /* 닫힘 */ }
            s.child = null;
            if (stopping) return;
            s.restarts += 1;
            if (s.restarts > MAX_RESTARTS) {
                console.error(`${tag} ${MAX_RESTARTS}번 넘게 꺼져서 다시 안 켬`);
                process.exit(1);
            }
            process.stdout.write(`${tag} 꺼짐(code=${code}) → 다시 켬\n`);
            setTimeout(start, 300);
        });
    };
    start();
    s.kill = () => { if (s.child) s.child.kill(); };
    return s;
}

// 모든 Node가 /health 200 될 때까지 (Node 여러 개: 앞단은 그 뒤에 켬 → Playwright가 4100을 볼 때 둘 다 켜져 있음)
async function waitNodesUp(nodes, timeoutMs = 150_000) {
    const until = Date.now() + timeoutMs;
    for (const node of nodes) {
        for (;;) {
            try {
                const res = await fetch(`${node.url}/health`, { signal: AbortSignal.timeout(1500) });
                if (res.ok) break;
            } catch { /* 아직 안 켜짐 */ }
            if (Date.now() > until) throw new Error(`${node.id}(${node.port})가 ${timeoutMs / 1000}초 안에 안 켜짐 → .runtime/backend-${node.id}.log`);
            await new Promise((r) => setTimeout(r, 500));
        }
    }
}

// Node 여러 개: Redis 켜고 이번 실행 앞머리 비움 → Node들 → 앞단
async function startMultiNode(secrets) {
    const redis = require('../helpers/redis');
    await redis.ensureRedis();
    await redis.deletePrefix(redisPrefix());
    for (const node of E2E.nodes) {
        supervisors.push(superviseNode({ env: backendEnv(secrets, { node }), logPath: backendLogFor(node.id), tag: `[e2e-backend ${node.id}]` }));
    }
    await waitNodesUp(E2E.nodes);
    proxy = await require('./lb-proxy').startProxy();
    process.stdout.write(`[e2e-backend] Node ${E2E.nodeCount}개 켜짐, ${E2E.proxy} 앞단 ${E2E.backendPort} (${E2E.lb}) → ${E2E.nodes.map((n) => `${n.id}:${n.port}`).join(', ')}\n`);
}

function stop() {
    stopping = true;
    for (const s of supervisors) s.kill();
    proxy?.close().catch(() => {});
    setTimeout(() => process.exit(0), 300).unref();
}

async function main() {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.mkdirSync(MAIL_DIR, { recursive: true });
    const secrets = await setupDb.main({ quiet: true });
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    process.on('exit', () => { stopping = true; for (const s of supervisors) s.kill(); proxy?.close().catch(() => {}); });
    if (!E2E.multiNode) {
        supervisors.push(superviseNode({ env: backendEnv(secrets), logPath: BACKEND_LOG, tag: '[e2e-backend]' }));
        return;
    }
    await startMultiNode(secrets);
}

main().catch((error) => {
    console.error(`[e2e-backend] 시작 실패: ${error.message}`);
    stopping = true;
    for (const s of supervisors) s.kill();
    proxy?.close().catch(() => {});
    process.exit(1);
});
