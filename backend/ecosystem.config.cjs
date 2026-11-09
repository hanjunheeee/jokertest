// pm2 설정 파일, Docker 없이 서버에 바로 Node로 띄울 때 죽으면 다시 켜기 (pm2는 따로 설치: npm i -g pm2)
// 쓰는 법: backend 폴더에서 pm2 start ecosystem.config.cjs → pm2 save → pm2 startup (docs/운영_준비_2026-11-09.md, Node 여러 개는 docs/배포_설정.md 7장)
const fs = require("fs");
const os = require("os");
const path = require("path");

// backend/.env 값 (앱도 dotenv로 같은 파일을 읽음), 셸 값이 먼저
const readDotenv = () => {
    try {
        return require("dotenv").parse(fs.readFileSync(path.join(__dirname, ".env")));
    } catch {
        return {};
    }
};

// Node 수: REDIS_URL 없으면 1 (Redis 없이 여러 개면 방·판이 프로세스마다 갈림)
// 있으면 NODE_COUNT(1~64), 없으면 코어 수 — deploy/scripts/gen-nodes.js와 같은 규칙 (시험이 맞춰 봄)
const nodeCount = (env, fileEnv, cpuCount) => {
    const redisUrl = String(env.REDIS_URL ?? fileEnv.REDIS_URL ?? "").trim();
    if (!redisUrl) return 1;
    const raw = String(env.NODE_COUNT ?? fileEnv.NODE_COUNT ?? "").trim();
    const n = Number(raw);
    if (raw !== "" && Number.isInteger(n) && n >= 1 && n <= 64) return n;
    return Math.min(64, Math.max(1, cpuCount));
};

// 앱 하나 공통 칸 (Node 수와 상관없이 같음)
const baseApp = () => ({
    script: "index.js",
    cwd: __dirname,
    // 앱 하나 = 프로세스 하나 (cluster 모드는 포트를 같이 써서 nginx가 ?node=로 고를 수 없음)
    instances: 1,
    exec_mode: "fork",
    // 죽으면 다시 켬: 1초 기다렸다 켜고, 10초 못 버티고 죽는 게 10번 이어지면 멈춤 (고장 난 채 무한 재시작 막기)
    autorestart: true,
    restart_delay: 1000,
    min_uptime: "10s",
    max_restarts: 10,
    // 메모리 1GB 넘으면 다시 켬 (새는 것 막기, 서버 사양에 맞게 조절)
    max_memory_restart: "1G",
    // 종료 신호 뒤 정리(점검 안내·소켓·DB 닫기)까지 기다림, 앱 강제 종료(10초)보다 길게
    kill_timeout: 15000,
    // 앱이 logs/app-날짜.log(Node 여러 개면 app-<SERVER_ID>-날짜.log)를 따로 남김, pm2 자체 로그는 시각만 붙임
    time: true,
});

// 앱 목록: 1개면 예전과 똑같음 (PORT·SERVER_ID는 .env 그대로)
// 여러 개면 mmc-backend-n1.. · PORT 4001.. · SERVER_ID n1.. (nginx upstream은 gen-nodes.js --target pm2)
function buildConfig({ env = process.env, fileEnv = readDotenv(), cpuCount = os.cpus().length } = {}) {
    const count = nodeCount(env, fileEnv, cpuCount);
    if (count === 1) return { apps: [{ name: "mmc-backend", ...baseApp(), env: { NODE_ENV: "production" } }] };
    const apps = [];
    for (let i = 1; i <= count; i += 1) {
        apps.push({ name: `mmc-backend-n${i}`, ...baseApp(), env: { NODE_ENV: "production", PORT: String(4000 + i), SERVER_ID: `n${i}` } });
    }
    return { apps };
}

module.exports = buildConfig();
// 시험용 (pm2는 apps만 읽음)
Object.defineProperty(module.exports, "buildConfig", { value: buildConfig, enumerable: false });
