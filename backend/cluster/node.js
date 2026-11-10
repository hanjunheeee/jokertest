// Node 하나 조립 파일, 받침(Redis·메모리·없음) 위에 버스·RPC·Node 목록·디렉터리·카운터를 묶고 켜기·끄기·다시 맞추기
// cluster/index.js(한 프로세스 = Node 하나)와 시험(한 프로세스에 Node 여럿)이 createClusterNode로 만듦
const crypto = require("crypto");
const { createBus, BUS_TYPES } = require("./bus");
const { createRpc } = require("./rpc");
const { createNodes } = require("./nodes");
const { createDirectory } = require("./directory");
const { createCounters } = require("./counters");
const { CODES, clusterError } = require("./errors");
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

// 켜기 준비: 같은 이름 검사 → 옛 부팅 키 정리 → 구독 기다림 → 하트비트
// 이 순서가 깨지면 다른 Node가 새 부팅을 살아 있다고 볼 때 옛 부팅 키(판 값 = Node 이름 글자)가 남아 살아 있는 판으로 보임
// gate.phase: starting(켜는 중) → ready, 켤 때 Redis 없음·준비 실패면 waiting(붙으면 준비), 같은 이름 걸리면 refused, 끄면 closed
function createStartup({ config, backend, parts, gate, log }) {
    const s = { subscribed: null, running: null, retryTimer: null, show: () => {}, sync: () => {} };
    const ready = () => gate.phase === "ready";
    const subscribe = () => {
        s.subscribed ??= Promise.all([parts.bus.start(), parts.rpc.start()]);
        return s.subscribed;
    };
    async function prepare() {
        await parts.nodes.claim();
        if ((await parts.directory.cleanupStale()) === null) throw clusterError(CODES.CLUSTER_UNAVAILABLE, "켤 때 정리 못 함");
        // 구독이 끝난 뒤에 하트비트 (다른 Node가 나를 보자마자 RPC를 보내도 받게)
        await Promise.race([subscribe(), new Promise((resolve) => setTimeout(resolve, config.connectWaitMs))]);
        // 기다리는 사이 껐으면 하트비트를 켜지 않음
        if (gate.phase === "closed") throw clusterError(CODES.CLUSTER_UNAVAILABLE, "켜는 중 꺼짐");
        gate.phase = "ready";
        parts.nodes.start();
    }
    const startup = {
        ready,
        // 듣는 쪽·state()가 보는 상태: 준비 전 up은 아직 공유 모드가 아님
        view: () => (backend.state() === "up" && ready() ? "up" : "down"),
        subscribe,
        prepare,
        wait() { gate.phase = "waiting"; },
        bindShow({ show, sync }) { s.show = show; s.sync = sync; },
        // 켜는 중 준비가 끝남: 아직 이 Node를 쓰는 곳이 없음(init이 끝나야 바꿔 끼움) → 알림 없이 맞춤
        sync: () => s.sync(),
        // 늦은 준비: waiting일 때 한 번에 하나, 같은 이름이면 refused로 멈춤, 다른 실패는 한 주기 뒤 다시
        late() {
            if (gate.phase !== "waiting" || s.running || backend.state() !== "up") return;
            s.running = prepare().then(() => {
                // 켤 때부터 이 Node에만 쌓인 것(방·접속)을 옛 키 정리 끝난 Redis에 다시 씀
                parts.resync.request();
                s.show();
            }, (error) => {
                if (gate.phase !== "waiting") return;
                if (error?.code === CODES.DUPLICATE_SERVER_ID) {
                    gate.phase = "refused";
                    log.error(`[CLUSTER] 같은 SERVER_ID(${config.serverId})가 이미 돌고 있음 — 이 프로세스는 공유 모드로 안 들어감, 설정 확인 필요`);
                    return;
                }
                log.warn(`[CLUSTER] Redis 붙은 뒤 켜기 준비 실패 — 한 주기 뒤 다시 (${error?.code ?? error?.name ?? "Error"})`);
                clearTimeout(s.retryTimer);
                s.retryTimer = setTimeout(() => startup.late(), config.heartbeatMs);
                s.retryTimer.unref?.();
            }).finally(() => { s.running = null; });
        },
        close() {
            clearTimeout(s.retryTimer);
            gate.phase = "closed";
        },
    };
    return startup;
}

// 상태 바뀜 처리: down이면 기다리는 RPC 끝냄, 다시 up이면 다시 맞추기 (첫 up은 켜기라 안 함)
// 듣는 쪽에는 startup.view()가 바뀔 때만 알림 → 켜기 준비 끝나기 전 up은 안 알림
function wireState({ backend, registries, rpc, nodes, resync, startup, log }) {
    let everUp = backend.state() === "up";
    let shown = startup.view();
    const show = () => {
        const next = startup.view();
        if (next === shown) return;
        const prev = shown;
        shown = next;
        for (const fn of [...registries.stateListeners]) {
            try { fn(next, prev); } catch { /* 듣는 쪽 오류는 무시 */ }
        }
    };
    backend.onStateChange((next, prev) => {
        // 켤 때 첫 up은 init 로그 한 줄로 충분 (그 뒤 바뀜만 남김)
        if (everUp) log.warn(`[CLUSTER] Redis ${prev} → ${next}`);
        if (next === "down") rpc.failPending();
        if (next === "up") {
            if (startup.ready()) {
                nodes.beatNow();
                if (everUp) resync.request();
            } else {
                // 켤 때 Redis가 없었음 → 지금 켜기 준비 (끝나야 하트비트·알림)
                startup.late();
            }
            everUp = true;
        }
        show();
    });
    startup.bindShow({ show, sync: () => { shown = startup.view(); } });
}

// 부품 만들기: 버스·RPC·Node 목록·디렉터리·카운터·다시 맞추기·켜기 준비
function buildParts({ config, backend, bootEpoch, statsProvider, registries, log }) {
    const { prefix, serverId } = config;
    const resync = createResync(registries.resyncHandlers, log);
    const bus = createBus({ backend, channel: `${prefix}:bus:v1`, serverId, handlers: registries.busHandlers, log });
    const gate = { phase: "starting" };
    const parts = { resync, bus, gate };
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
        connectWaitMs: config.connectWaitMs, version: config.version, statsProvider, onLost, log,
    });
    // 켤 때 정리 전엔 디렉터리를 안 씀 (정리 전에 쓴 새 키가 옛 키와 같이 지워지지 않게)
    parts.directory = createDirectory({ backend, prefix, serverId, bootEpoch, nodes: parts.nodes, isReady: () => gate.phase === "ready" });
    parts.counters = createCounters({ backend, prefix });
    parts.offResync = bus.on(BUS_TYPES.CLUSTER_RESYNC, () => resync.request());
    if (backend) {
        parts.startup = createStartup({ config, backend, parts, gate, log });
        wireState({ backend, registries, rpc: parts.rpc, nodes: parts.nodes, resync, startup: parts.startup, log });
    }
    return parts;
}

// 켜기: 연결 → 켜기 준비(같은 이름 검사 → 옛 부팅 키 정리 → 구독 → 하트비트) → 어댑터 → 어댑터 숫자(없으면 null)
// Redis가 없으면 준비를 미루고 down으로 켬 → 붙으면 같은 순서로 준비 (wireState)
async function startParts({ config, backend, parts, io, isUp, log }) {
    const { startup } = parts;
    const first = await backend.connect();
    if (first === "up") {
        try {
            await startup.prepare();
            startup.sync();
        } catch (error) {
            if (error?.code === CODES.DUPLICATE_SERVER_ID) throw error;
            log.warn(`[CLUSTER] 켤 때 준비 못 함 — 대체 동작으로 켜고 Redis 붙으면 다시 (${error?.code ?? error?.name ?? "Error"})`);
        }
    } else {
        log.warn("[CLUSTER] 켤 때 Redis 연결 안 됨 — 대체 동작으로 켜고 뒤에서 계속 다시 붙음");
    }
    if (!startup.ready()) {
        // down이면 구독은 줄에 넣어 두고 기다리지 않음, 붙으면 준비
        startup.subscribe();
        startup.wait();
        startup.late();
    }
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
    const parts = buildParts({ config, backend, bootEpoch, statsProvider, registries, log });
    const { bus, rpc, nodes, directory, counters, resync, offResync, startup } = parts;
    const run = { io: null, adapterStats: null };
    // 켜기 준비가 끝나야 up (준비 전엔 Redis가 붙어 있어도 down처럼 대체 동작)
    const state = () => (backend ? startup.view() : "off");
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
            run.adapterStats = await startParts({ config, backend, parts, io: run.io, isUp: () => state() === "up", log });
            return { state: state() };
        },
        // 끄기: 하트비트 지우고 연결 닫기 (기다리던 RPC는 CLUSTER_UNAVAILABLE)
        async close() {
            resync.cancel();
            offResync();
            if (!backend) return;
            startup.close();
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
