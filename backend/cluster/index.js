// Node 여러 개 입구 파일, 이 프로세스 Node 하나를 켜고 다른 조각이 쓸 함수를 내보냄 (모양은 cluster/README.md)
// backend/index.js가 init·close, 조각 2·3·4가 bus·rpc·nodes·directory·counters·fetchSockets를 씀
const { readClusterConfig } = require("../config/cluster");
const { CODES } = require("./errors");
const { BUS_TYPES } = require("./bus");
const { TTL } = require("./directory");
const { createClusterNode, createRegistries } = require("./node");

// init 전에 붙인 처리기도 init 뒤 Node에 그대로 이어지게 보관함은 여기 하나
const registries = createRegistries();
let current = null;
let starting = null;

// 지금 Node (init 전·close 뒤는 단일 모드 Node, 연결 없음)
const node = () => {
    if (!current) current = createClusterNode({ config: readClusterConfig(process.env), registries });
    return current;
};

// 켜기: REDIS_URL 없으면 단일 모드(지금과 같음), 있으면 Redis 연결·하트비트·어댑터
// - backend를 넘기면 그것을 씀 (시험: testing/memoryCluster의 hub.backend())
// - 같은 SERVER_ID가 이미 돌고 있으면 DUPLICATE_SERVER_ID로 거절 (부른 쪽이 시작 실패 처리)
// - Redis에 못 붙어도 거절 안 함 (down으로 켜고 대체 동작)
async function init({ io, env = process.env, backend, bootEpoch, statsProvider, log = console } = {}) {
    if (starting) return starting;
    starting = (async () => {
        const config = readClusterConfig(env);
        let chosen = backend ?? null;
        if (!chosen && config.mode === "redis") chosen = require("./redis").createRedisBackend(config, { log });
        const next = createClusterNode({ config, backend: chosen, bootEpoch, statsProvider, registries, log });
        try {
            await next.start({ io });
        } catch (error) {
            await next.close().catch(() => {});
            throw error;
        }
        const prev = current;
        current = next;
        if (prev) await prev.close().catch(() => {});
        if (chosen) log.log(`[CLUSTER] 켜짐 — serverId=${config.serverId} mode=${next.mode()} redis=${next.state()}`);
        return next;
    })();
    try {
        return await starting;
    } finally {
        starting = null;
    }
}

// 끄기: 하트비트 지우고 연결 닫음, 뒤로는 단일 모드 Node (처리기 보관함은 남김)
async function close() {
    const was = current;
    current = null;
    if (was) await was.close();
}

module.exports = {
    init,
    close,
    CODES,
    BUS_TYPES,
    TTL,
    // 이 Node
    serverId: () => node().serverId,
    bootEpoch: () => node().bootEpoch,
    // 'off'(단일) | 'redis' | 'memory'(시험)
    mode: () => node().mode(),
    // 'off' | 'up' | 'down'
    state: () => node().state(),
    // REDIS_URL이 있는지 (down이어도 true)
    isEnabled: () => node().isEnabled(),
    // 지금 Node끼리 나눠 쓸 수 있는지 (up일 때만 true)
    isShared: () => node().isShared(),
    onStateChange: (fn) => node().onStateChange(fn),
    onResync: (fn) => node().onResync(fn),
    bus: {
        publish: (type, payload) => node().bus.publish(type, payload),
        on: (type, fn) => node().bus.on(type, fn),
    },
    rpc: {
        register: (method, fn) => node().rpc.register(method, fn),
        call: (target, method, args, opts) => node().rpc.call(target, method, args, opts),
        callAll: (method, args, opts) => node().rpc.callAll(method, args, opts),
    },
    nodes: {
        list: () => node().nodes.list(),
        isAlive: (id, epoch) => node().nodes.isAlive(id, epoch),
        refresh: () => node().nodes.refresh(),
        setDraining: (value) => node().nodes.setDraining(value),
        isDraining: () => node().nodes.isDraining(),
    },
    directory: {
        keys: () => node().directory.keys,
        available: () => node().directory.available(),
        read: (key) => node().directory.read(key),
        locate: (key) => node().directory.locate(key),
        write: (key, value, opts) => node().directory.write(key, value, opts),
        removeIfOwned: (key) => node().directory.removeIfOwned(key),
        removeIfValue: (key, expected) => node().directory.removeIfValue(key, expected),
        nextSeq: (key, ttlMs) => node().directory.nextSeq(key, ttlMs),
    },
    counters: {
        hit: (key, windowMs) => node().counters.hit(key, windowMs),
        peek: (key) => node().counters.peek(key),
        reset: (key) => node().counters.reset(key),
    },
    // 채널 소켓 모으기 → { sockets, partial } (io는 init 안 한 시험에서만 넘김)
    fetchSockets: (channel, io) => node().fetchSockets(channel, io),
    adapterStats: () => node().adapterStats(),
    config: () => node().config,
};
