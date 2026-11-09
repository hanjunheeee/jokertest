// RPC 파일, 다른 Node에 묻고 답 받기 (요청 `${prefix}:rpc:<node>`, 답 `${prefix}:rpc:<node>:reply`, 4-4장)
// cluster/index.js가 만들어 rpc.register·call·callAll로 내보냄, 메서드는 조각 2·4가 등록
const crypto = require("crypto");
const { CODES, clusterError } = require("./errors");

const RPC_VERSION = 1;
const MAX_MESSAGE_BYTES = 512 * 1024;

const safeParse = (text) => {
    if (typeof text !== "string" || text.length > MAX_MESSAGE_BYTES) return null;
    try {
        const msg = JSON.parse(text);
        return msg && typeof msg === "object" && msg.v === RPC_VERSION && typeof msg.id === "string" ? msg : null;
    } catch {
        return null;
    }
};

// 등록된 처리기 돌리기 → { ok:true, value } 또는 { ok:false, code, remoteCode }
// 처리기 오류 글은 넘기지 않음 (내부 문구가 다른 Node 로그·답에 새지 않게), 오류 code만 remoteCode로
async function runHandler(handlers, method, args, from) {
    const fn = handlers.get(method);
    if (!fn) return { ok: false, code: CODES.RPC_UNKNOWN_METHOD };
    try {
        const value = await fn(args, { from });
        return { ok: true, value: value === undefined ? null : value };
    } catch (error) {
        return { ok: false, code: CODES.RPC_FAILED, remoteCode: typeof error?.code === "string" ? error.code : null };
    }
}

const toError = (reply, node, method) => clusterError(reply.code, `${method} → ${node}: ${reply.code}`, {
    node, method, remoteCode: reply.remoteCode ?? null,
});

// 기다리는 요청 장부: id → { resolve, reject, timer, node, method }
function createPending() {
    const pending = new Map();
    const settle = (id, reply) => {
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        clearTimeout(entry.timer);
        if (reply.ok) entry.resolve(reply.value);
        else entry.reject(toError(reply, entry.node, entry.method));
    };
    // 시간 초과 타이머 걸고 결과 Promise 돌려줌
    const open = (id, node, method, ms) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => settle(id, { ok: false, code: CODES.RPC_TIMEOUT }), ms);
        timer.unref?.();
        pending.set(id, { resolve, reject, timer, node, method });
    });
    const failAll = (code) => { for (const id of [...pending.keys()]) settle(id, { ok: false, code }); };
    return { settle, open, failAll };
}

// 받는 쪽: 요청 처리 뒤 답 보내기, 답 받으면 장부 정리
function createReceivers({ backend, handlers, pending, replyChannel, log }) {
    const onRequest = async (text) => {
        const msg = safeParse(text);
        if (!msg || typeof msg.method !== "string" || typeof msg.from !== "string") return;
        // 시간 넘긴 요청은 답 안 함 (부른 쪽은 이미 시간 초과로 끝남)
        if (typeof msg.deadline === "number" && Date.now() > msg.deadline) return;
        const reply = await runHandler(handlers, msg.method, msg.args ?? null, msg.from);
        try {
            await backend.publish(replyChannel(msg.from), JSON.stringify({ v: RPC_VERSION, id: msg.id, ...reply }));
        } catch {
            log.warn(`[CLUSTER] RPC 답 못 보냄 — ${msg.method}`);
        }
    };
    const onReply = (text) => {
        const msg = safeParse(text);
        if (msg) pending.settle(msg.id, msg.ok ? { ok: true, value: msg.value } : { ok: false, code: msg.code, remoteCode: msg.remoteCode });
    };
    return { onRequest, onReply };
}

// 하나 부르기: 나 자신이면 바로 처리기, 아니면 Redis로 → 값 또는 code 달린 오류
function createCall({ backend, serverId, timeoutMs, handlers, pending, requestChannel }) {
    return async function call(node, method, args = null, { timeoutMs: ms = timeoutMs } = {}) {
        const fail = (code) => clusterError(code, `${method} → ${node}: ${code}`, { node, method });
        if (node === serverId) {
            const reply = await runHandler(handlers, method, args, serverId);
            if (reply.ok) return reply.value;
            throw toError(reply, node, method);
        }
        if (!backend) throw fail(CODES.NODE_UNAVAILABLE);
        if (backend.state() !== "up") throw fail(CODES.CLUSTER_UNAVAILABLE);
        const id = crypto.randomUUID();
        const result = pending.open(id, node, method, ms);
        const text = JSON.stringify({ v: RPC_VERSION, id, method, args, from: serverId, deadline: Date.now() + ms });
        // 보내기를 기다리지 않고 result를 바로 돌려줌 (보내기가 시간 초과보다 늦으면 result 거절에 처리기가 없어 새는 것 막기)
        // 받은 구독자 0 = 그 Node가 없음 (죽었거나 이름 틀림) → 시간 초과 기다리지 않고 바로
        backend.publish(requestChannel(node), text).then(
            (receivers) => { if (receivers === 0) pending.settle(id, { ok: false, code: CODES.NODE_UNAVAILABLE }); },
            () => pending.settle(id, { ok: false, code: CODES.CLUSTER_UNAVAILABLE }),
        );
        return result;
    };
}

// 전 Node에 묻기 → { results:[{node, ok, value} | {node, ok:false, code}], partial }
// partial: 못 물은 Node가 있거나 Redis down이라 내 Node만 물었을 때 true
function createCallAll({ backend, serverId, listNodes, call }) {
    return async function callAll(method, args = null, opts = {}) {
        const shared = Boolean(backend) && backend.state() === "up";
        const ids = shared ? [...new Set([serverId, ...listNodes()])] : [serverId];
        const results = await Promise.all(ids.map(async (node) => {
            try {
                return { node, ok: true, value: await call(node, method, args, opts) };
            } catch (error) {
                return { node, ok: false, code: error?.code ?? CODES.RPC_FAILED };
            }
        }));
        const partial = (Boolean(backend) && !shared) || results.some((r) => !r.ok && r.node !== serverId);
        return { results, partial };
    };
}

// RPC 만들기
// listNodes: 살아 있는 Node id 목록 (callAll 대상), backend 없으면(단일 모드) 나 자신만 부를 수 있음
function createRpc({ backend, prefix, serverId, timeoutMs, listNodes, handlers = new Map(), log = console }) {
    const requestChannel = (node) => `${prefix}:rpc:${node}`;
    const replyChannel = (node) => `${prefix}:rpc:${node}:reply`;
    const pending = createPending();
    const receivers = createReceivers({ backend, handlers, pending, replyChannel, log });
    const call = createCall({ backend, serverId, timeoutMs, handlers, pending, requestChannel });
    return {
        // 구독 시작 → 요청·답 채널 구독이 끝나면 풀리는 Promise
        start() {
            if (!backend) return Promise.resolve();
            return Promise.all([
                backend.subscribe(requestChannel(serverId), receivers.onRequest),
                backend.subscribe(replyChannel(serverId), receivers.onReply),
            ]);
        },
        // Redis가 down이 되면 기다리는 요청을 바로 끝냄 (1.5초 다 안 기다림)
        failPending: (code = CODES.CLUSTER_UNAVAILABLE) => pending.failAll(code),
        // 처리기 등록 (같은 이름이면 덮어씀) → 떼는 함수, 처리기는 (args, { from }) → JSON으로 바꿀 수 있는 값
        register(method, fn) {
            handlers.set(method, fn);
            return () => { if (handlers.get(method) === fn) handlers.delete(method); };
        },
        call,
        callAll: createCallAll({ backend, serverId, listNodes, call }),
    };
}

module.exports = { RPC_VERSION, createRpc };
