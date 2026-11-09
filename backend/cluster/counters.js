// 카운터 파일, 요청 제한·틀린 횟수를 Node끼리 합쳐 셈 (Redis INCR+PEXPIRE 한 번에), Redis 못 쓰면 Node 메모리로
// cluster/index.js가 만들어 counters로 내보냄, 요청 제한(조각 2)·코드 입장 시도(조각 4)가 씀

// 메모리 카운터가 이만큼 넘으면 지난 것 정리 (요청마다 다 훑지 않게)
const SWEEP_AT = 5000;

// 메모리 카운터: Redis 못 쓸 때 대체 (Node마다 따로 세서 Node 수만큼 느슨해짐, 4-6장)
function createMemoryCounters(now) {
    const map = new Map();
    const sweep = () => {
        const t = now();
        for (const [key, entry] of map) if (entry.expiresAt <= t) map.delete(key);
    };
    const live = (key) => {
        const entry = map.get(key);
        if (!entry) return null;
        if (entry.expiresAt <= now()) { map.delete(key); return null; }
        return entry;
    };
    return {
        hit(key, windowMs) {
            if (map.size >= SWEEP_AT) sweep();
            const entry = live(key) ?? { count: 0, expiresAt: now() + windowMs };
            entry.count += 1;
            map.set(key, entry);
            return { count: entry.count, ttlMs: entry.expiresAt - now() };
        },
        peek(key) {
            const entry = live(key);
            return entry ? { count: entry.count, ttlMs: entry.expiresAt - now() } : { count: 0, ttlMs: -2 };
        },
        reset(key) { map.delete(key); },
        size: () => map.size,
    };
}

// 카운터 만들기: key는 앞머리 뺀 이름 (`rl:<이름>:<키>`, `wrong:pw:<uuid>`, `join:<uuid>`)
// 돌려주는 것 { count, ttlMs, shared } — shared가 false면 이 Node 메모리로 센 값
function createCounters({ backend, prefix, now = () => Date.now() }) {
    const memory = createMemoryCounters(now);
    const full = (key) => `${prefix}:${key}`;
    const usable = () => Boolean(backend) && backend.state() === "up";

    return {
        // 한 번 셈 (창 안 첫 번째면 창 길이 수명 시작)
        async hit(key, windowMs) {
            if (usable()) {
                try {
                    const { count, ttlMs } = await backend.ops.incrWindow(full(key), windowMs);
                    return { count, ttlMs, shared: true };
                } catch { /* 아래 메모리로 */ }
            }
            return { ...memory.hit(key, windowMs), shared: false };
        },
        // 세지 않고 보기 (없으면 count 0)
        async peek(key) {
            if (usable()) {
                try { return { ...(await backend.ops.peekCounter(full(key))), shared: true }; } catch { /* 아래 메모리로 */ }
            }
            return { ...memory.peek(key), shared: false };
        },
        // 지우기 (로그인 성공 뒤 틀린 횟수 비우기 등), 메모리 쪽도 같이
        async reset(key) {
            memory.reset(key);
            if (!usable()) return false;
            try { await backend.ops.del(full(key)); return true; } catch { return false; }
        },
        memorySize: memory.size,
    };
}

module.exports = { createCounters, createMemoryCounters };
