// Node 하나 조립 파일, 받침(Redis·메모리·없음) 위에 버스·RPC·Node 목록·디렉터리·카운터를 묶고 켜기·끄기·다시 맞추기
// cluster/index.js(한 프로세스 = Node 하나)와 시험(한 프로세스에 Node 여럿)이 createClusterNode로 만듦
const crypto = require("crypto");
const { createBus, BUS_TYPES } = require("./bus");
const { createRpc } = require("./rpc");
const { createNodes } = require("./nodes");
const { createDirectory } = require("./directory");
const { createCounters } = require("./counters");
const { attachRedisAdapter, fetchSocketsWithFallback } = require("./adapter");

// 처리기 보관함 (index.js는 init 전에 붙인 처리기도 남게 이것을 넘김)
const createRegistries = () => ({
    busHandlers: new Map(), rpcHandlers: new Map(), stateListeners: new Set(), resyncHandlers: new Set(),
});

// 다시 맞추기 처리기 돌리기: 0.5초 안에 여러 번 와도 한 번만
function createResync(handlers, log) {
    let timer = null;
    const runAll = () => {
        timer = null;
        for (const fn of [...handlers]) {
            Promise.resolve().then(fn).catch((error) => log.warn(`[CLUSTER] 다시 맞추기 실패 — ${error?.code ?? error?.name ?? "Error"}`));
        }
    };
    return {
        request() {
            if (timer) return;
            timer = setTimeout(runAll, 500);
            timer.unref?.();
        },
        cancel() { clearTimeout(timer); timer = null; },
    };
}

// 상태 바뀜 처리: down이면 기다리는 RPC 끝냄, 다시 up이면 다시 맞추기 (첫 up은 켜기라 안 함)
function wireState({ backend, registries, rpc, nodes, resync, log }) {
    let everUp = backend.state() === "up";
    backend.onStateChange((next, prev) => {
        // 켤 때 첫 up은 init 로그 한 줄로 충분 (그 뒤 바뀜만 남김)
        if (everUp) log.warn(`[CLUSTER] Redis ${prev} → ${next}`);
        if (next === "down") rpc.failPending();
        if (next === "up") {
            nodes.beatNow();
            if (everUp) resync.request();
            everUp = true;
        }
        for (const fn of [...registries.stateListeners]) {
            try { fn(next, prev); } catch { /* 듣는 쪽 오류는 무시 */ }
        }
    });
}

// 부품 만들기: 버스·RPC·Node 목록·디렉터리·카운터·다시 맞추기
function buildParts({ config, backend, bootEpoch, statsProvider, registries, log }) {
    const { prefix, serverId } = config;
    const resync = createResync(registries.resyncHandlers, log);
    const bus = createBus({ backend, channel: `${prefix}:bus:v1`, serverId, handlers: registries.busHandlers, log });
    const parts = { resync, bus };
    parts.rpc = createRpc({
        backend, prefix, serverId, timeoutMs: config.rpcTimeoutMs, listNodes: () => parts.nodes.ids(), handlers: registries.rpcHandlers, log,
    });
    // 내 하트비트가 없어졌음 = Redis가 비었음 → 나도 다시 쓰고 다른 Node에도 알림
    const onLost = () => {
        log.warn("[CLUSTER] 내 하트비트가 Redis에 없음 — 다시 맞추기");
        resync.request();
        bus.publish(BUS_TYPES.CLUSTER_RESYNC, {});
    };
    parts.nodes = createNodes({
        backend, prefix, serverId, bootEpoch, heartbeatMs: config.heartbeatMs, deadAfterMs: config.deadAfterMs,
        version: config.version, statsProvider, onLost, log,
    });
    parts.directory = createDirectory({ backend, prefix, serverId, bootEpoch, nodes: parts.nodes });
    parts.counters = createCounters({ backend, prefix });
    parts.offResync = bus.on(BUS_TYPES.CLUSTER_RESYNC, () => resync.request());
    if (backend) wireState({ backend, registries, rpc: parts.rpc, nodes: parts.nodes, resync, log });
    return parts;
}

// 켜기: 연결 → 같은 이름 검사 → 옛 부팅 키 정리 → 구독 → 하트비트 → 어댑터 → 어댑터 숫자(없으면 null)
async function startParts({ config, backend, parts, io, isUp, log }) {
    const first = await backend.connect();
    if (first === "up") {
        await parts.nodes.claim();
        await parts.directory.cleanupStale();
    } else {
        log.warn("[CLUSTER] 켤 때 Redis 연결 안 됨 — 대체 동작으로 켜고 뒤에서 계속 다시 붙음");
    }
    // 구독이 끝난 뒤에 하트비트 (다른 Node가 나를 보자마자 RPC를 보내도 받게), down이면 기다리지 않음
    const subscribed = Promise.all([parts.bus.start(), parts.rpc.start()]);
    if (first === "up") await Promise.race([subscribed, new Promise((resolve) => setTimeout(resolve, config.connectWaitMs))]);
    parts.nodes.start();
    if (!io || !backend.connections) return null;
    return attachRedisAdapter(io, {
        pubClient: backend.connections.adapterPub, subClient: backend.connections.adapterSub,
        prefix: config.prefix, requestsTimeout: config.rpcTimeoutMs, isUp,
    });
}

// Node 하나 만들기
// backend: null이면 단일 모드('off'), createRedisBackend 또는 memoryCluster 받침이면 공유 모드
function createClusterNode({
    config, backend = null, bootEpoch = crypto.randomUUID(), statsProvider, registries = createRegistries(), log = console,
}) {
    const { bus, rpc, nodes, directory, counters, resync, offResync } = buildParts({ config, backend, bootEpoch, statsProvider, registries, log });
    const run = { io: null, adapterStats: null };
    const state = () => (backend ? backend.state() : "off");
    return {
        config, serverId: config.serverId, bootEpoch, registries,
        mode: () => (backend ? backend.kind : "off"),
        state,
        isEnabled: () => Boolean(backend),
        isShared: () => state() === "up",
        onStateChange(fn) { registries.stateListeners.add(fn); return () => registries.stateListeners.delete(fn); },
        onResync(fn) { registries.resyncHandlers.add(fn); return () => registries.resyncHandlers.delete(fn); },
        bus: { publish: bus.publish, on: bus.on, deliverForTests: bus.deliverForTests },
        rpc: { register: rpc.register, call: rpc.call, callAll: rpc.callAll },
        nodes: {
            list: nodes.list, ids: nodes.ids, isAlive: nodes.isAlive, refresh: nodes.refresh,
            setDraining: nodes.setDraining, isDraining: nodes.isDraining,
        },
        directory,
        counters,
        async start({ io } = {}) {
            run.io = io ?? null;
            if (!backend) return { state: "off" };
            run.adapterStats = await startParts({ config, backend, parts: { bus, rpc, nodes, directory }, io: run.io, isUp: () => state() === "up", log });
            return { state: state() };
        },
        // 끄기: 하트비트 지우고 연결 닫기 (기다리던 RPC는 CLUSTER_UNAVAILABLE)
        async close() {
            resync.cancel();
            offResync();
            if (!backend) return;
            await nodes.stop();
            rpc.failPending();
            await backend.close();
        },
        // ioServer: init 안 한 시험에서 io를 직접 넘길 때
        fetchSockets: (channel, ioServer) => fetchSocketsWithFallback(ioServer ?? run.io, channel, { enabled: Boolean(backend), shared: state() === "up" }),
        adapterStats: () => (run.adapterStats ? { ...run.adapterStats } : null),
    };
}

module.exports = { createClusterNode, createRegistries };
