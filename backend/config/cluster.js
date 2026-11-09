// Node 여러 개 설정 파일, REDIS_URL·SERVER_ID·하트비트·RPC 시간 등 환경값을 한 번에 읽어 정리
// cluster/index.js가 init 때 부름, 시작 때 DB 풀 합 경고도 여기서 계산
const os = require("os");
const { getServerId, SERVER_ID_PATTERN } = require("./serverId");

// 숫자 환경값: 정수이고 min 이상일 때만, 아니면 기본값
const readInt = (env, name, fallback, min = 1) => {
    const raw = env[name];
    if (raw === undefined || String(raw).trim() === "") return fallback;
    const n = Number(raw);
    return Number.isInteger(n) && n >= min ? n : fallback;
};

// 키 앞머리: 영문·숫자·_·-·.·: 만 (e2e는 e2e:<RUN_ID>), 틀리면 mmc
const PREFIX_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const readPrefix = (env) => {
    const raw = typeof env.REDIS_KEY_PREFIX === "string" ? env.REDIS_KEY_PREFIX.trim() : "";
    return PREFIX_PATTERN.test(raw) ? raw : "mmc";
};

// 설정 읽기 (부를 때 읽음, 시험이 env 바꿔 넣음)
// mode: REDIS_URL 비면 'off'(단일 Node, 지금과 같음), 있으면 'redis'
function readClusterConfig(env = process.env) {
    const redisUrl = typeof env.REDIS_URL === "string" ? env.REDIS_URL.trim() : "";
    const rawServerId = typeof env.SERVER_ID === "string" ? env.SERVER_ID.trim() : "";
    return Object.freeze({
        mode: redisUrl ? "redis" : "off",
        redisUrl,
        prefix: readPrefix(env),
        serverId: getServerId(env),
        // SERVER_ID를 직접 넣었는지 (안 넣었으면 로그 이름·줄 앞 표시를 예전 그대로 둠)
        serverIdExplicit: SERVER_ID_PATTERN.test(rawServerId),
        heartbeatMs: readInt(env, "CLUSTER_HEARTBEAT_MS", 3000),
        deadAfterMs: readInt(env, "NODE_DEAD_AFTER_MS", 10000),
        rpcTimeoutMs: readInt(env, "CLUSTER_RPC_TIMEOUT_MS", 1500),
        opsReloadIntervalMs: readInt(env, "OPS_RELOAD_INTERVAL_MS", 60000),
        presenceOfflineDelayMs: readInt(env, "PRESENCE_OFFLINE_DELAY_MS", 1500, 0),
        sessionCacheFallbackMs: readInt(env, "SESSION_CACHE_FALLBACK_MS", 0, 0),
        // Redis 상태 판정: 2초마다 확인, 1초 안에 답 없으면 실패, 2번 연달아 실패면 down
        healthIntervalMs: readInt(env, "CLUSTER_HEALTH_INTERVAL_MS", 2000),
        healthTimeoutMs: readInt(env, "CLUSTER_HEALTH_TIMEOUT_MS", 1000),
        // 켤 때 Redis 첫 연결을 기다리는 최대 시간 (넘으면 down으로 켬)
        connectWaitMs: readInt(env, "CLUSTER_CONNECT_WAIT_MS", 2000),
        version: String(env.npm_package_version || require("../package.json").version || ""),
    });
}

// DB 연결 풀 합 경고 (MN-138): Node 수 × 풀 최대가 MySQL 연결 한도의 80%를 넘으면 경고 글, 아니면 null
// Node 수는 NODE_COUNT, 없으면 코어 수 (배포 생성기와 같은 기본)
// 단일 모드면 Node 하나라 늘 null
function describePoolWarning({ env = process.env, mode, poolMax, cpuCount = os.cpus().length } = {}) {
    if (mode !== "redis") return null;
    const nodeCount = readInt(env, "NODE_COUNT", Math.max(1, cpuCount));
    const limit = readInt(env, "DB_MAX_CONNECTIONS", 151);
    const total = nodeCount * poolMax;
    const budget = Math.floor(limit * 0.8);
    if (total <= budget) return null;
    return `DB 연결 풀 합 ${total}(Node ${nodeCount} × 풀 ${poolMax})이 MySQL 한도 ${limit}의 80%(${budget})를 넘음 — DB_POOL_MAX를 줄이거나 max_connections를 늘리기`;
}

module.exports = { readClusterConfig, describePoolWarning, PREFIX_PATTERN };
