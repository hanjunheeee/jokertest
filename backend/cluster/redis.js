// Redis 연결 파일, 연결 4개(명령·구독·어댑터 보내기·어댑터 받기) + 상태 판정(up/down) + 명령 묶음
// cluster/index.js가 REDIS_URL 있을 때만 만듦, 시험용 가짜는 testing/memoryCluster.js (같은 모양)
const { CODES, clusterError, createQuietLog } = require("./errors");
const { SCRIPTS } = require("./scripts");

// 연결 옵션: 명령 쪽은 오프라인 줄 끔 + 1초 시간 초과 (줄 쌓임·무한 대기 막기, 실측은 README)
// 구독 쪽은 줄 켬 (끊긴 동안 subscribe가 거절로 새지 않고, 다시 붙을 때 자동 재구독)
// 명령 쪽 답 못 받은 명령 다시 보내기 끔: Redis는 이미 처리했는데 답만 잃은 명령을 다시 붙을 때 또 보내 RPC·셈·알림이 두 번 됨
// → 그 명령은 1초 시간 초과로 거절되고 부른 쪽은 down 때와 같은 대체 동작
const retryStrategy = (times) => Math.min(times * 200, 2000);
const commandOptions = (config, role) => ({
    lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, autoResendUnfulfilledCommands: false,
    commandTimeout: config.healthTimeoutMs, retryStrategy,
    connectionName: `${config.prefix}:${config.serverId}:${role}`,
});
const subscriberOptions = (config, role) => ({
    lazyConnect: true, enableOfflineQueue: true, maxRetriesPerRequest: null, autoResubscribe: true,
    retryStrategy, connectionName: `${config.prefix}:${config.serverId}:${role}`,
});

// 연결 4개 만들기 (lazyConnect라 connect() 부를 때 붙음)
function openConnections(config, RedisClass, quietWarn) {
    const make = (role, options) => {
        const client = new RedisClass(config.redisUrl, options);
        for (const [name, lua] of Object.entries(SCRIPTS)) client.defineCommand(name, { lua });
        // error 사건에 처리기가 없으면 프로세스가 죽음 → 이유 낱말만 남김 (주소·비번 안 찍음)
        client.on("error", (error) => quietWarn(`[CLUSTER] Redis ${role} 연결 오류 — ${error?.code ?? error?.name ?? "Error"}`));
        return client;
    };
    return {
        cmd: make("cmd", commandOptions(config, "cmd")),
        sub: make("sub", subscriberOptions(config, "sub")),
        adapterPub: make("apub", commandOptions(config, "apub")),
        adapterSub: make("asub", subscriberOptions(config, "asub")),
    };
}

// 확인 한 번: 쓰기 성공이면 up, 실패면 실패 수 +1 (2번이면 down, 1번이면 0.5초 뒤 바로 다시)
// h: { state, failures, probing, retryTimer, conns, probeKey, pxMs, setState }
async function probeOnce(h) {
    if (h.probing) return;
    h.probing = true;
    try {
        if (h.conns.cmd.status !== "ready" || h.conns.sub.status !== "ready") throw new Error("not ready");
        await h.conns.cmd.set(h.probeKey, "1", "PX", h.pxMs);
        h.failures = 0;
        h.setState("up");
    } catch {
        h.failures += 1;
        if (h.failures >= 2) {
            h.setState("down");
        } else {
            // 2초 주기만 기다리면 멈춤 판정이 늦음
            clearTimeout(h.retryTimer);
            h.retryTimer = setTimeout(() => probeOnce(h), 500);
            h.retryTimer.unref?.();
        }
    } finally {
        h.probing = false;
    }
}

// 상태 판정: 2초마다 쓰기 확인(1초 시간 초과), 2번 연달아 실패면 down, 연결 끊김은 바로 down
// up 조건: 명령·구독 연결 둘 다 ready + 확인 성공
function createHealth({ conns, config, onChange }) {
    const h = {
        state: "down", failures: 0, probing: false, retryTimer: null, timer: null, conns,
        probeKey: `${config.prefix}:probe:${config.serverId}`, pxMs: config.healthIntervalMs * 5,
        setState(next) {
            if (h.state === next) return;
            const prev = h.state;
            h.state = next;
            onChange(next, prev);
        },
    };
    const lost = () => { h.failures = 2; h.setState("down"); };
    for (const client of [conns.cmd, conns.sub]) {
        client.on("close", lost);
        client.on("ready", () => { probeOnce(h); });
    }
    return {
        state: () => h.state,
        probe: () => probeOnce(h),
        start() {
            h.timer = setInterval(() => probeOnce(h), config.healthIntervalMs);
            h.timer.unref?.();
        },
        stop() { clearInterval(h.timer); clearTimeout(h.retryTimer); },
    };
}

// 붙기: 첫 연결을 connectWaitMs까지만 기다림 (못 붙어도 down으로 켜고 뒤에서 계속 다시 붙음)
async function connectAndWait(conns, health, config) {
    for (const client of Object.values(conns)) client.connect().catch(() => {});
    health.start();
    const until = Date.now() + config.connectWaitMs;
    while (health.state() !== "up" && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (health.state() !== "up") await health.probe();
    }
    return health.state();
}

// 닫기: quit을 0.5초까지 기다리고 끊음
const closeAll = (conns) => Promise.all(Object.values(conns).map(async (client) => {
    try { await Promise.race([client.quit(), new Promise((r) => setTimeout(r, 500))]); } catch { /* 이미 끊김 */ }
    client.disconnect();
}));

// Redis 쪽 받침 만들기: index.js가 쓰는 모양 { kind, state, onStateChange, publish, subscribe, ops, connections, connect, close }
function createRedisBackend(config, { RedisClass = require("ioredis"), log = console } = {}) {
    const quietWarn = createQuietLog(log);
    const conns = openConnections(config, RedisClass, quietWarn);
    const listeners = new Set();
    const health = createHealth({ conns, config, onChange: (next, prev) => { for (const fn of listeners) fn(next, prev); } });
    const isUp = () => health.state() === "up";
    const channelHandlers = new Map();
    conns.sub.on("message", (channel, message) => channelHandlers.get(channel)?.(message));
    return {
        kind: "redis",
        state: health.state,
        onStateChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        // 보내기: down이면 바로 거절, 받은 구독자 수를 돌려줌 (0이면 받을 Node 없음)
        async publish(channel, message) {
            if (!isUp()) throw clusterError(CODES.CLUSTER_UNAVAILABLE);
            try { return await conns.cmd.publish(channel, message); } catch (error) {
                throw clusterError(CODES.CLUSTER_UNAVAILABLE, "publish 실패", { cause: error });
            }
        },
        // 구독: 끊긴 동안에도 줄에 넣어 두고 붙으면 감, 다시 붙으면 ioredis가 다시 구독
        // 돌려주는 Promise는 구독이 끝나면 풀림 (실패해도 거절 안 함)
        subscribe(channel, handler) {
            channelHandlers.set(channel, handler);
            return conns.sub.subscribe(channel).then(() => true, () => {
                quietWarn("[CLUSTER] 구독 실패 — 다시 붙을 때 재시도");
                return false;
            });
        },
        ops: createRedisOps(conns.cmd, isUp),
        connections: conns,
        connect: () => connectAndWait(conns, health, config),
        async close() {
            health.stop();
            listeners.clear();
            await closeAll(conns);
        },
    };
}

// 명령 묶음: down이면 바로 거절 (멈춘 Redis에 1초씩 기다리지 않게), 실패는 CLUSTER_UNAVAILABLE로 바꿈
// Redis OOM 쓰기 실패도 여기서 CLUSTER_UNAVAILABLE이 됨 → 부른 쪽은 down 때와 같은 대체 동작 (MN-106)
function createRedisOps(cmd, isUp) {
    const run = async (fn) => {
        if (!isUp()) throw clusterError(CODES.CLUSTER_UNAVAILABLE);
        try { return await fn(); } catch (error) {
            throw clusterError(CODES.CLUSTER_UNAVAILABLE, String(error?.message ?? error).split("\n")[0], { cause: error });
        }
    };
    const withTrack = (key, trackKey) => (trackKey ? [2, key, trackKey] : [1, key]);
    return {
        get: (key) => run(() => cmd.get(key)),
        set: (key, value, { pxMs, nx = false }) => run(async () =>
            (await (nx ? cmd.set(key, value, "PX", pxMs, "NX") : cmd.set(key, value, "PX", pxMs))) === "OK"),
        del: (key) => run(() => cmd.del(key)),
        delIfOwner: (key, node, bootEpoch, trackKey) => run(async () =>
            (await cmd.mmcDelIfOwner(...withTrack(key, trackKey), node, bootEpoch ?? "")) === 1),
        delIfEquals: (key, value, trackKey) => run(async () =>
            (await cmd.mmcDelIfEquals(...withTrack(key, trackKey), value)) === 1),
        writeTracked: (key, value, { pxMs, nx = false, trackKey, trackPxMs }) => run(async () =>
            (await cmd.mmcWriteTracked(2, key, trackKey, value, pxMs, nx ? "1" : "0", trackPxMs)) === 1),
        cleanupTracked: (trackKey) => run(() => cmd.mmcCleanupTracked(1, trackKey)),
        incrWindow: (key, windowMs) => run(async () => {
            const [count, ttlMs] = await cmd.mmcIncrWindow(1, key, windowMs);
            return { count, ttlMs };
        }),
        incrWithTtl: (key, ttlMs) => run(async () => (await cmd.mmcIncrTtl(1, key, ttlMs))),
        peekCounter: (key) => run(async () => {
            const [count, ttlMs] = await cmd.mmcPeek(1, key);
            return { count: Number(count) || 0, ttlMs };
        }),
        heartbeat: (key, setKey, member, fields, pxMs) => run(async () => {
            const flat = Object.entries(fields).flat().map(String);
            const [existed, prev] = await cmd.mmcHeartbeat(2, key, setKey, pxMs, member, ...flat);
            return { existed: existed === 1, prevBootEpoch: prev || null };
        }),
        hgetall: (key) => run(() => cmd.hgetall(key)),
        hgetallMany: (keys) => run(async () => {
            const rows = await keys.reduce((pipe, key) => pipe.hgetall(key), cmd.pipeline()).exec();
            return rows.map(([, value]) => value);
        }),
        smembers: (key) => run(() => cmd.smembers(key)),
        srem: (key, member) => run(() => cmd.srem(key, member)),
    };
}

module.exports = { createRedisBackend };
