// socket.io Redis 어댑터 붙이기 파일, 노드 넘는 전송(계정 채널 등) + Redis down 때 내 Node만으로 바꾸기
// cluster/index.js가 Redis 모드에서 io를 받으면 붙임, fetchSockets 대체 동작(partial)도 여기

// down 때 내 Node만 보게 할 어댑터 메서드 (opts가 몇 번째 인자인지)
const LOCAL_WHEN_DOWN = Object.freeze({
    broadcast: 1, broadcastWithAck: 1, fetchSockets: 0, addSockets: 0, delSockets: 0, disconnectSockets: 0,
});

// opts.flags.local = true로 바꾼 새 opts (원래 것은 안 건드림)
const forceLocal = (opts) => ({ ...opts, flags: { ...(opts?.flags ?? {}), local: true } });

// 어댑터 한 개를 감쌈: Redis가 up이 아니면 local 표시를 붙여 publish를 아예 안 함
// → 처리 안 된 거절이 안 생기고, 내 Node 전송은 그대로, fetchSockets는 기다림 없이 바로 (실측 README)
function guardAdapter(adapter, isUp, stats) {
    for (const [method, index] of Object.entries(LOCAL_WHEN_DOWN)) {
        const original = adapter[method];
        if (typeof original !== "function") continue;
        adapter[method] = function guarded(...args) {
            if (!isUp() && !args[index]?.flags?.local) {
                args[index] = forceLocal(args[index]);
                stats.forcedLocal += 1;
            }
            return original.apply(this, args);
        };
    }
    return adapter;
}

// 보내기 연결의 publish 감싸기: 어댑터는 publish 결과를 안 기다려서 실패하면 처리 안 된 거절이 됨
// → 거절에 처리기를 달아 둠 (돌려주는 Promise는 같아서 기다리는 쪽은 그대로 거절을 받음), 수도 셈
function guardPublish(pubClient, stats) {
    const original = pubClient.publish.bind(pubClient);
    pubClient.publish = (...args) => {
        stats.published += 1;
        const result = original(...args);
        if (result && typeof result.catch === "function") result.catch(() => { stats.publishFailed += 1; });
        return result;
    };
}

// io에 어댑터 붙이기 → 숫자 묶음 { published, publishFailed, forcedLocal } (조각 4 "판 방송이 Redis 안 탐" 확인용)
function attachRedisAdapter(io, { pubClient, subClient, prefix, requestsTimeout, isUp }) {
    const { createAdapter } = require("@socket.io/redis-adapter");
    const stats = { published: 0, publishFailed: 0, forcedLocal: 0 };
    guardPublish(pubClient, stats);
    const factory = createAdapter(pubClient, subClient, { key: `${prefix}:sio`, requestsTimeout });
    // socket.io가 new로 부르므로 화살표 함수 말고 function (객체를 돌려주면 new 결과가 그 객체)
    function GuardedRedisAdapter(nsp) {
        return guardAdapter(factory(nsp), isUp, stats);
    }
    io.adapter(GuardedRedisAdapter);
    return stats;
}

// 채널 소켓 모으기 → { sockets, partial }
// - 단일 모드: 그냥 io.in (전부 이 Node)
// - Redis down: 내 Node만 + partial (기다림 없음)
// - up: 전 Node (어댑터 시간 초과 = RPC 시간), 실패·시간 초과면 내 Node만 + partial
async function fetchSocketsWithFallback(io, channel, { shared, enabled }) {
    if (!enabled) return { sockets: await io.in(channel).fetchSockets(), partial: false };
    if (!shared) return { sockets: await io.local.in(channel).fetchSockets(), partial: true };
    try {
        return { sockets: await io.in(channel).fetchSockets(), partial: false };
    } catch {
        return { sockets: await io.local.in(channel).fetchSockets(), partial: true };
    }
}

module.exports = { attachRedisAdapter, guardAdapter, fetchSocketsWithFallback, LOCAL_WHEN_DOWN };
