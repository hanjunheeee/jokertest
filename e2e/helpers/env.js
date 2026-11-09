'use strict';

// 시험 환경 값 한곳 파일, 포트·주소·실행 폴더·비밀값 읽기 (비밀값은 .env.e2e에서만, 화면·로그에 안 찍음)
// playwright.config.js·scripts·모든 도우미가 씀, Node 여러 개(E2E_NODES=2)면 Node 목록·Redis·앞단 값도
const fs = require('node:fs');
const path = require('node:path');
const { planNodes } = require('../../deploy/scripts/gen-nodes');

const E2E_DIR = path.join(__dirname, '..');
const RUNTIME_DIR = path.join(E2E_DIR, '.runtime');
const MAIL_DIR = path.join(RUNTIME_DIR, 'mail');
const SHUTDOWN_FLAG = path.join(RUNTIME_DIR, 'shutdown.flag');
const BACKEND_LOG = path.join(RUNTIME_DIR, 'backend.log');
const ENV_FILE = path.join(E2E_DIR, '.env.e2e');
const BACKEND_DIR = path.join(E2E_DIR, '..', 'backend');

// Node 수: 1(기본, 예전과 똑같이 4100에 백엔드 하나) / 2~8 (4100은 앞단, 4101.. 에 e2e-n1..)
const readNodeCount = (raw) => {
    const n = Number(String(raw ?? '').trim() || 1);
    if (!Number.isInteger(n) || n < 1 || n > 8) throw new Error('E2E_NODES는 1~8');
    return n;
};
const NODE_COUNT = readNodeCount(process.env.E2E_NODES);
const MULTI_NODE = NODE_COUNT > 1;

// Node 목록 [{ id, port, url }] — 1개면 지금 그대로 (SERVER_ID e2e, 4100), 여러 개는 deploy/scripts/gen-nodes.js e2e 규칙
const NODES = Object.freeze((MULTI_NODE
    ? planNodes({ count: NODE_COUNT, target: 'e2e' }).map((n) => ({ id: n.id, port: n.port }))
    : [{ id: 'e2e', port: 4100 }]
).map((n) => Object.freeze({ ...n, url: `http://localhost:${n.port}` })));

// 개발 서버(4000·5173·5174)와 안 겹치는 시험 전용 포트
const E2E = Object.freeze({
    backendPort: 4100,
    desktopPort: 5273,
    mobilePort: 5274,
    apiUrl: 'http://localhost:4100',
    desktopUrl: 'http://localhost:5273',
    mobileUrl: 'http://localhost:5274',
    // Node 여러 개 (계획 4-1): 나누기 rr(일부러 번갈아)·least, 앞단 node(작은 프록시)·nginx(docker), 시험 Redis
    nodeCount: NODE_COUNT,
    multiNode: MULTI_NODE,
    nodes: NODES,
    lb: (process.env.E2E_LB || 'rr').toLowerCase(),
    proxy: (process.env.E2E_PROXY || 'node').toLowerCase(),
    redisUrl: process.env.E2E_REDIS_URL || 'redis://127.0.0.1:6380',
    redisUrlGiven: Boolean(process.env.E2E_REDIS_URL),
});

// Node마다 따로인 꺼짐 깃발·로그 (1개면 예전 이름 그대로)
const shutdownFlagFor = (id) => (MULTI_NODE ? path.join(RUNTIME_DIR, `shutdown-${id}.flag`) : SHUTDOWN_FLAG);
const backendLogFor = (id) => (MULTI_NODE ? path.join(RUNTIME_DIR, `backend-${id}.log`) : BACKEND_LOG);
// Redis 키 앞머리 (실행마다 따로, 계획 4-1)
const redisPrefix = (runId = process.env.E2E_RUN_ID || 'local') => `e2e:${runId}`;

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

module.exports = {
    E2E, E2E_DIR, RUNTIME_DIR, MAIL_DIR, SHUTDOWN_FLAG, BACKEND_LOG, ENV_FILE, BACKEND_DIR, readSecrets,
    shutdownFlagFor, backendLogFor, redisPrefix,
};
