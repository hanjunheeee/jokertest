#!/usr/bin/env node
'use strict';

// 시험 전용 백엔드 띄우기 파일, 시험 DB 준비 → backend/index.js를 4100 포트로 켜고 꺼지면 다시 켬 (서버 꺼짐 시험 뒤 다음 시험 위해)
// playwright.config.js의 webServer가 부름, 개발 서버(4000)·개발 DB와 안 겹침, 서버 출력은 .runtime/backend.log에만
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const setupDb = require('./setup-db');
const { RUNTIME_DIR, MAIL_DIR, BACKEND_LOG } = require('../helpers/env');
const { backendEnv } = require('../helpers/backendEnv');

const BACKEND_DIR = path.join(__dirname, '..', '..', 'backend');
const LOG_STREAM_PATH = BACKEND_LOG;


let child = null;
let stopping = false;
let restarts = 0;

function startChild(env) {
    const log = fs.openSync(LOG_STREAM_PATH, 'a');
    fs.writeSync(log, `\n===== ${new Date().toISOString()} 백엔드 켬 (다시 켠 횟수 ${restarts}) =====\n`);
    child = spawn(process.execPath, ['--require', path.join(__dirname, 'shutdown-trigger.cjs'), path.join(BACKEND_DIR, 'index.js')], {
        cwd: RUNTIME_DIR, // backend/.env를 안 읽게 (dotenv는 cwd의 .env를 읽음)
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    // 시작 줄만 화면에 (Playwright가 기다리는 동안 보임), 나머지는 파일에
    const forward = (chunk) => {
        fs.writeSync(log, chunk);
        for (const line of chunk.toString('utf8').split(/\r?\n/)) {
            if (/\[STARTUP\]|\[SHUTDOWN\]|\[e2e\]/.test(line)) process.stdout.write(`[e2e-backend] ${line}\n`);
        }
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('exit', (code, signal) => {
        try { fs.writeSync(log, `===== 백엔드 꺼짐 code=${code} signal=${signal} =====\n`); fs.closeSync(log); } catch { /* 닫힘 */ }
        child = null;
        if (stopping) return;
        restarts += 1;
        // 너무 자주 죽으면(시작 실패) 그만 — 무한 반복 막기
        if (restarts > 50) {
            console.error('[e2e-backend] 50번 넘게 꺼져서 다시 안 켬');
            process.exit(1);
        }
        process.stdout.write(`[e2e-backend] 꺼짐(code=${code}) → 다시 켬\n`);
        setTimeout(() => startChild(env), 300);
    });
}

function stop() {
    stopping = true;
    if (child) child.kill();
    setTimeout(() => process.exit(0), 300).unref();
}

async function main() {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.mkdirSync(MAIL_DIR, { recursive: true });
    const secrets = await setupDb.main({ quiet: true });
    startChild(backendEnv(secrets));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    process.on('exit', () => { stopping = true; if (child) child.kill(); });
}

main().catch((error) => {
    console.error(`[e2e-backend] 시작 실패: ${error.message}`);
    process.exit(1);
});
