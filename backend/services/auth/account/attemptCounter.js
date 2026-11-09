// 틀린 횟수 세기 파일, 비번 바꾸기·탈퇴의 "현재 비번 틀림"을 창 안에서 셈 (단일 모드는 서버 메모리, Node 여러 개면 Redis로 합쳐 셈)
// password.js(`wrong:pw:<uuid>`)·withdraw.js(`wrong:wd:<uuid>`)가 하나씩 만들어 씀
const cluster = require("../../../cluster");

// 세는 곳 하나 만들기: kind = 'pw' | 'wd', windowMs = 창 길이
// 단일 모드는 예전과 똑같이 메모리 + 넘겨받은 시각(nowMs)으로, Node 여러 개면 Redis 수명으로 (down이면 cluster가 메모리로)
function createAttemptCounter({ kind, windowMs }) {
    const local = new Map();
    const keyOf = (uuid) => `wrong:${kind}:${uuid}`;
    const shared = () => cluster.isEnabled();

    // 창 안 횟수 (창 지났으면 지움)
    const localCount = (uuid, nowMs) => {
        const entry = local.get(uuid);
        if (!entry) return 0;
        if (nowMs - entry.windowStart >= windowMs) {
            local.delete(uuid);
            return 0;
        }
        return entry.count;
    };

    // 하나 올림 (처음이거나 창 지났으면 지금부터 창 시작)
    const localRecord = (uuid, nowMs) => {
        const entry = local.get(uuid);
        if (entry && nowMs - entry.windowStart < windowMs) entry.count += 1;
        else local.set(uuid, { windowStart: nowMs, count: 1 });
    };

    return {
        async count(uuid, nowMs) {
            if (!shared()) return localCount(uuid, nowMs);
            return (await cluster.counters.peek(keyOf(uuid))).count;
        },
        async record(uuid, nowMs) {
            if (!shared()) return localRecord(uuid, nowMs);
            await cluster.counters.hit(keyOf(uuid), windowMs);
            return undefined;
        },
        // 맞혔으면 지움
        async clear(uuid) {
            local.delete(uuid);
            if (shared()) await cluster.counters.reset(keyOf(uuid));
        },
        resetForTests: () => local.clear(),
    };
}

module.exports = { createAttemptCounter };
