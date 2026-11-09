// 버스 파일, Node끼리 한 방향 알림 (pub/sub `${prefix}:bus:v1`, 4-3장 모양 {v:1, type, from, at, ...})
// cluster/index.js가 만들어 bus.publish·bus.on으로 내보냄, 받는 처리기는 조각 2·3·4가 붙임

// 약속된 type (4-3장), 이 밖의 type도 처리기를 붙이면 받음 (붙인 처리기 없는 type은 무시)
const BUS_TYPES = Object.freeze({
    AUTH_REVOKED: "auth.revoked",
    OPS_RELOAD: "ops.reload",
    CONN_REPLACED: "conn.replaced",
    ROOMS_SNAPSHOT: "rooms.snapshot",
    CLUSTER_RESYNC: "cluster.resync",
});

const BUS_VERSION = 1;
// 메시지 하나 최대 크기 (방 목록 스냅샷 넉넉히, 넘으면 안 보냄·안 받음)
const MAX_MESSAGE_BYTES = 512 * 1024;
// 처리기가 덮어쓰면 안 되는 칸
const RESERVED = ["v", "type", "from", "at"];

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// 받은 글 → 메시지 또는 null (틀린 모양·다른 v·내가 보낸 것은 null, MN-056)
function parseMessage(text, selfId) {
    if (typeof text !== "string" || text.length > MAX_MESSAGE_BYTES) return null;
    let msg;
    try { msg = JSON.parse(text); } catch { return null; }
    if (!isPlainObject(msg) || msg.v !== BUS_VERSION) return null;
    if (typeof msg.type !== "string" || msg.type.length === 0 || msg.type.length > 64) return null;
    if (typeof msg.from !== "string" || msg.from === selfId) return null;
    if (typeof msg.at !== "number" || !Number.isFinite(msg.at)) return null;
    return msg;
}

// 버스 만들기: backend 없으면(단일 모드) 보내기는 늘 false, 받기 처리기만 쌓아 둠
function createBus({ backend, channel, serverId, handlers = new Map(), log = console }) {
    const run = (fn, msg) => {
        try {
            const result = fn(msg);
            if (result && typeof result.catch === "function") {
                result.catch((error) => log.warn(`[CLUSTER] 버스 처리기 실패 — ${msg.type}: ${error?.code ?? error?.name ?? "Error"}`));
            }
        } catch (error) {
            log.warn(`[CLUSTER] 버스 처리기 실패 — ${msg.type}: ${error?.code ?? error?.name ?? "Error"}`);
        }
    };

    const onRaw = (text) => {
        const msg = parseMessage(text, serverId);
        if (!msg) return;
        const set = handlers.get(msg.type);
        if (!set || set.size === 0) return;
        for (const fn of [...set]) run(fn, msg);
    };

    return {
        // 구독 시작 → 구독이 끝나면 풀리는 Promise
        start() { return backend ? backend.subscribe(channel, onRaw) : Promise.resolve(); },
        // 보내기: 다른 Node들에 알림 → 보냈으면 true, 단일 모드·Redis down·실패면 false (던지지 않음)
        // 나 자신은 안 받음 → 내 Node 일은 부른 쪽이 먼저 직접 하기
        async publish(type, payload = {}) {
            if (!backend || backend.state() !== "up" || typeof type !== "string") return false;
            const body = isPlainObject(payload) ? { ...payload } : {};
            for (const name of RESERVED) delete body[name];
            const text = JSON.stringify({ ...body, v: BUS_VERSION, type, from: serverId, at: Date.now() });
            if (text.length > MAX_MESSAGE_BYTES) return false;
            try {
                await backend.publish(channel, text);
                return true;
            } catch {
                return false;
            }
        },
        // 받기 처리기 붙이기 → 떼는 함수 돌려줌, 처리기는 msg 전체({v,type,from,at,...})를 받음
        on(type, fn) {
            if (!handlers.has(type)) handlers.set(type, new Set());
            handlers.get(type).add(fn);
            return () => handlers.get(type)?.delete(fn);
        },
        // 시험용: 받은 글 하나를 직접 넣어 봄
        deliverForTests: onRaw,
    };
}

module.exports = { BUS_TYPES, BUS_VERSION, MAX_MESSAGE_BYTES, parseMessage, createBus };
