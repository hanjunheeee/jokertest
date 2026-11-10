// 시험용 메모리 Redis 대신 파일, 진짜 cluster 코드(버스·RPC·디렉터리·카운터·하트비트)를 Redis 없이 돌림
// backend 단위 시험이 씀 (ioredis-mock 대신, pub/sub·Lua 동작을 우리 약속대로 흉내), 운영 코드는 안 씀
const { CODES, clusterError } = require("../errors");
const { readClusterConfig } = require("../../config/cluster");

// 저장소 바탕: 키 하나 = { kind:'string'|'hash'|'set', value, expiresAt(ms|null) }, 수명 지난 키는 읽을 때 지움
function createCore(now) {
    const map = new Map();
    const live = (key) => {
        const entry = map.get(key);
        if (!entry) return null;
        if (entry.expiresAt !== null && entry.expiresAt <= now()) { map.delete(key); return null; }
        return entry;
    };
    return {
        map, now, live,
        pttl: (key) => { const e = live(key); return !e ? -2 : e.expiresAt === null ? -1 : e.expiresAt - now(); },
        getString: (key) => (live(key)?.kind === "string" ? live(key).value : null),
        putString: (key, value, pxMs) => map.set(key, { kind: "string", value: String(value), expiresAt: pxMs ? now() + Number(pxMs) : null }),
        ensure(key, kind, make) {
            const entry = live(key);
            if (entry && entry.kind === kind) return entry;
            const created = { kind, value: make(), expiresAt: null };
            map.set(key, created);
            return created;
        },
        hdel: (key, field) => { const h = live(key); if (h?.kind === "hash") h.value.delete(field); },
    };
}

// 값의 node가 나인지 (redis scripts.js DEL_IF_OWNER와 같은 규칙)
const ownerMatches = (raw, node, bootEpoch) => {
    if (raw === node) return true;
    try {
        const obj = JSON.parse(raw);
        return Boolean(obj) && typeof obj === "object" && obj.node === node && (!bootEpoch || obj.bootEpoch == null || obj.bootEpoch === bootEpoch);
    } catch { return false; }
};

// 글자 키 명령: get·set·del·CAS 지우기·목록 남기며 쓰기·켤 때 정리
function stringOps(c) {
    const delTracked = (key, trackKey) => { c.map.delete(key); if (trackKey) c.hdel(trackKey, key); return true; };
    return {
        get: async (key) => c.getString(key),
        set: async (key, value, { pxMs, nx = false }) => (nx && c.live(key) ? false : (c.putString(key, value, pxMs), true)),
        del: async (key) => (c.map.delete(key) ? 1 : 0),
        delIfOwner: async (key, node, bootEpoch, trackKey) => {
            const raw = c.getString(key);
            return raw !== null && ownerMatches(raw, node, bootEpoch) ? delTracked(key, trackKey) : false;
        },
        delIfEquals: async (key, value, trackKey) => (c.getString(key) === value ? delTracked(key, trackKey) : false),
        writeTracked: async (key, value, { pxMs, nx = false, trackKey, trackPxMs }) => {
            if (nx && c.live(key)) return false;
            c.putString(key, value, pxMs);
            const track = c.ensure(trackKey, "hash", () => new Map());
            track.value.set(key, value);
            track.expiresAt = c.now() + trackPxMs;
            return true;
        },
        cleanupTracked: async (trackKey) => {
            const track = c.live(trackKey);
            let n = 0;
            if (track?.kind === "hash") {
                for (const [key, value] of track.value) if (c.getString(key) === value) { c.map.delete(key); n += 1; }
            }
            c.map.delete(trackKey);
            return n;
        },
    };
}

// 카운터 명령: 창 카운터·순번·보기
function counterOps(c) {
    const incr = (key) => {
        const entry = c.live(key);
        const n = (entry ? Number(entry.value) : 0) + 1;
        if (entry) entry.value = String(n); else c.putString(key, n, null);
        return n;
    };
    return {
        incrWindow: async (key, windowMs) => {
            const n = incr(key);
            if (n === 1 || c.pttl(key) < 0) c.live(key).expiresAt = c.now() + windowMs;
            return { count: n, ttlMs: c.pttl(key) };
        },
        incrWithTtl: async (key, ttlMs) => {
            const n = incr(key);
            c.live(key).expiresAt = c.now() + ttlMs;
            return n;
        },
        peekCounter: async (key) => ({ count: Number(c.getString(key)) || 0, ttlMs: c.pttl(key) }),
    };
}

// hash·set 명령: 하트비트·Node 목록
function structureOps(c) {
    const hgetall = async (key) => {
        const entry = c.live(key);
        return entry?.kind === "hash" ? Object.fromEntries(entry.value) : {};
    };
    return {
        heartbeat: async (key, setKey, member, fields, pxMs) => {
            const before = c.live(key);
            const prev = before?.kind === "hash" ? before.value.get("bootEpoch") ?? null : null;
            const hash = c.ensure(key, "hash", () => new Map());
            for (const [field, value] of Object.entries(fields)) hash.value.set(field, String(value));
            hash.expiresAt = c.now() + pxMs;
            c.ensure(setKey, "set", () => new Set()).value.add(member);
            return { existed: Boolean(before), prevBootEpoch: prev };
        },
        // 켜기 표시 잡기 (redis scripts.js CLAIM_NODE와 같은 규칙)
        claimNode: async (claimKey, nodeKey, bootEpoch, pxMs) => {
            const holder = c.getString(claimKey);
            const hash = await hgetall(nodeKey);
            const cur = hash.bootEpoch || null;
            if (holder !== null && holder !== bootEpoch && holder !== cur) return { claimed: false, bootEpoch: holder, lastSeen: null };
            c.putString(claimKey, bootEpoch, pxMs);
            return { claimed: true, bootEpoch: cur, lastSeen: hash.lastSeen || null };
        },
        hgetall,
        hgetallMany: async (keys) => Promise.all(keys.map((key) => hgetall(key))),
        smembers: async (key) => { const e = c.live(key); return e?.kind === "set" ? [...e.value] : []; },
        srem: async (key, member) => { const e = c.live(key); return e?.kind === "set" && e.value.delete(member) ? 1 : 0; },
    };
}

// 메모리 저장소 (redis.js createRedisOps와 같은 이름·모양)
function createMemoryStore(now) {
    const core = createCore(now);
    return { ops: { ...stringOps(core), ...counterOps(core), ...structureOps(core) }, map: core.map, clear: () => core.map.clear() };
}

// Node 하나 몫 받침 (createRedisBackend와 같은 모양) + 시험 손잡이 setDown
// shared: { store, channels, backends, published }
function createMemoryBackend(shared) {
    let state = "up";
    const listeners = new Set();
    const guard = (fn) => async (...args) => {
        if (state !== "up") throw clusterError(CODES.CLUSTER_UNAVAILABLE);
        return fn(...args);
    };
    const self = {
        kind: "memory",
        state: () => state,
        onStateChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        setDown(down) {
            const next = down ? "down" : "up";
            if (next === state) return;
            const prev = state;
            state = next;
            for (const fn of [...listeners]) fn(next, prev);
        },
        async publish(channel, message) {
            if (state !== "up") throw clusterError(CODES.CLUSTER_UNAVAILABLE);
            shared.published.push({ channel, message });
            const targets = [...(shared.channels.get(channel) ?? [])].filter((sub) => sub.owner.state() === "up");
            // 진짜 Redis처럼 다음 차례에 도착
            for (const sub of targets) setImmediate(() => { if (sub.owner.state() === "up") sub.handler(message); });
            return targets.length;
        },
        subscribe(channel, handler) {
            if (!shared.channels.has(channel)) shared.channels.set(channel, new Set());
            shared.channels.get(channel).add({ owner: self, handler });
            return Promise.resolve(true);
        },
        ops: Object.fromEntries(Object.entries(shared.store.ops).map(([name, fn]) => [name, guard(fn)])),
        connect: async () => state,
        async close() {
            for (const set of shared.channels.values()) for (const sub of [...set]) if (sub.owner === self) set.delete(sub);
            listeners.clear();
            shared.backends.delete(self);
        },
    };
    shared.backends.add(self);
    return self;
}

// 시험 출력이 넘치지 않게 경고는 버리는 로그
const quietLog = { log() {}, info() {}, warn() {}, error() {} };

// 메모리 허브: Node 여럿이 같은 저장소·pub/sub를 나눠 씀 (진짜 Redis 서버 하나 자리)
// now: 시계 바꿔 넣기 (수명 시험), 기본은 Date.now
function createMemoryHub({ now = () => Date.now() } = {}) {
    const shared = { store: createMemoryStore(now), channels: new Map(), backends: new Set(), published: [] };
    const started = new Set();
    return {
        backend: () => createMemoryBackend(shared),
        // 따로 도는 Node 하나 켜기 (cluster/index.js 싱글턴과 따로, 처리기 보관함도 따로)
        async startNode(serverId, { env = {}, bootEpoch, statsProvider, io, log = quietLog } = {}) {
            const { createClusterNode } = require("../node");
            const config = readClusterConfig({ REDIS_URL: "memory://", SERVER_ID: serverId, ...env });
            const node = createClusterNode({ config, backend: createMemoryBackend(shared), bootEpoch, statsProvider, log });
            await node.start({ io });
            started.add(node);
            return node;
        },
        store: shared.store,
        published: shared.published,
        // 모든 Node의 Redis를 한꺼번에 끊기·살리기
        setDown(down) { for (const b of [...shared.backends]) b.setDown(down); },
        // Redis 재시작(빈 데이터) 흉내
        flush() { shared.store.clear(); },
        async close() {
            for (const node of [...started]) await node.close().catch(() => {});
            started.clear();
        },
    };
}

module.exports = { createMemoryHub, createMemoryStore, quietLog };
