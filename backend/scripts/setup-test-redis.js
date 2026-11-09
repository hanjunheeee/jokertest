// 시험용 Redis 띄우기 파일, docker 컨테이너 mmc-redis-test(6380)가 없으면 만들고 PING까지 기다림
// npm run test:with-redis가 부름 (--test면 이어서 tests/cluster 통합 시험을 REDIS_URL_TEST로 돌림)
const { spawnSync } = require("child_process");
const path = require("path");

const CONTAINER = "mmc-redis-test";
const IMAGE = "redis:7.4-alpine";
const HOST_PORT = 6380;
const DEFAULT_URL = `redis://127.0.0.1:${HOST_PORT}`;

const docker = (args) => spawnSync("docker", args, { encoding: "utf8" });

// 컨테이너 상태: 'running' | 'exited' 등 | null(없음)
const containerState = () => {
    const result = docker(["inspect", "-f", "{{.State.Status}}", CONTAINER]);
    return result.status === 0 ? result.stdout.trim() : null;
};

// 있으면 켜고, 없으면 만듦 (다른 컨테이너·DB는 안 건드림)
function ensureContainer() {
    const state = containerState();
    if (state === "running") return "이미 켜져 있음";
    const result = state ? docker(["start", CONTAINER]) : docker(["run", "-d", "--name", CONTAINER, "-p", `${HOST_PORT}:6379`, IMAGE]);
    if (result.status !== 0) throw new Error(`docker 실패: ${(result.stderr || "").trim().split("\n")[0]}`);
    return state ? "다시 켬" : "새로 만듦";
}

// PING이 될 때까지 최대 20초
async function waitForPing() {
    for (let i = 0; i < 40; i += 1) {
        if (docker(["exec", CONTAINER, "redis-cli", "ping"]).stdout?.trim() === "PONG") return;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Redis PING 응답 없음");
}

async function main() {
    // REDIS_URL_TEST를 따로 줬으면 docker는 안 건드림 (CI 등 이미 있는 Redis)
    if (!process.env.REDIS_URL_TEST) {
        console.log(`[test-redis] ${CONTAINER} ${ensureContainer()}`);
        await waitForPing();
    }
    if (!process.argv.includes("--test")) return;
    const env = { ...process.env, REDIS_URL_TEST: process.env.REDIS_URL_TEST || DEFAULT_URL };
    const backendDir = path.join(__dirname, "..");
    const result = spawnSync(process.execPath, [
        "--env-file=.env.test", "--test", "--test-concurrency=1", "tests/cluster/**/*.test.js",
    ], { cwd: backendDir, env, stdio: "inherit" });
    process.exit(result.status ?? 1);
}

main().catch((error) => {
    console.error(`[test-redis] 실패 — ${error.message}`);
    process.exit(1);
});
