'use strict';

// 시험 환경 값 한곳 파일, 포트·주소·실행 폴더·비밀값 읽기 (비밀값은 .env.e2e에서만, 화면·로그에 안 찍음)
// playwright.config.js·scripts·모든 도우미가 씀
const fs = require('node:fs');
const path = require('node:path');

const E2E_DIR = path.join(__dirname, '..');
const RUNTIME_DIR = path.join(E2E_DIR, '.runtime');
const MAIL_DIR = path.join(RUNTIME_DIR, 'mail');
const SHUTDOWN_FLAG = path.join(RUNTIME_DIR, 'shutdown.flag');
const BACKEND_LOG = path.join(RUNTIME_DIR, 'backend.log');
const ENV_FILE = path.join(E2E_DIR, '.env.e2e');
const BACKEND_DIR = path.join(E2E_DIR, '..', 'backend');

// 개발 서버(4000·5173·5174)와 안 겹치는 시험 전용 포트
const E2E = Object.freeze({
    backendPort: 4100,
    desktopPort: 5273,
    mobilePort: 5274,
    apiUrl: 'http://localhost:4100',
    desktopUrl: 'http://localhost:5273',
    mobileUrl: 'http://localhost:5274',
});

let cached = null;

// .env.e2e 읽기 (없으면 npm run db:setup 먼저)
function readSecrets() {
    if (cached) return cached;
    if (!fs.existsSync(ENV_FILE)) throw new Error('e2e/.env.e2e가 없음 → e2e 폴더에서 npm run db:setup 먼저');
    const out = {};
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].trim();
    }
    cached = out;
    return out;
}

module.exports = { E2E, E2E_DIR, RUNTIME_DIR, MAIL_DIR, SHUTDOWN_FLAG, BACKEND_LOG, ENV_FILE, BACKEND_DIR, readSecrets };
