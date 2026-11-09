'use strict';

// 요청 수 제한 만드는 파일, 키마다 정한 시간 창 안 횟수 세고 넘으면 429 (단일 모드는 서버 메모리, Node 여러 개면 Redis 카운터로 합쳐 셈)
// routes/auth.routes.js가 authRateLimit.middleware.js 함수에 넘겨 씀 (시험은 now를 넣어 시간 바꿈, store로 세는 곳 바꿈)
const cluster = require('../cluster');

// 기본 세는 곳: Node 여러 개 모드(REDIS_URL 있음)일 때만 cluster 카운터 `rl:<이름>:<키>`
// Redis down이면 cluster 카운터가 알아서 Node 메모리로 셈 (Node 수만큼 느슨, 4-6장)
const clusterStore = Object.freeze({
    active: () => cluster.isEnabled(),
    hit: (key, windowMs) => cluster.counters.hit(`rl:${key}`, windowMs),
});

// 창 지난 키 지우기 (메모리 안 늘기)
const sweepExpired = (hits, nowMs, windowMs) => {
    for (const [key, entry] of hits) {
        if (nowMs - entry.windowStart >= windowMs) hits.delete(key);
    }
};

// 서버 메모리로 세기 (단일 모드 = 예전 그대로) → 이번까지 횟수
// 청소는 창 길이마다 한 번만 (요청마다 전체 훑기 막기)
const createMemoryCounter = (windowMs, now) => {
    const hits = new Map();
    let lastSweepMs = now();
    return (key) => {
        const nowMs = now();
        if (nowMs - lastSweepMs >= windowMs) {
            lastSweepMs = nowMs;
            sweepExpired(hits, nowMs, windowMs);
        }
        // 처음 보는 키·창 지난 키(청소 전이라도)는 지금부터 새 창
        let entry = hits.get(key);
        if (entry && nowMs - entry.windowStart >= windowMs) entry = null;
        if (!entry) {
            entry = { windowStart: nowMs, count: 0 };
            hits.set(key, entry);
        }
        entry.count += 1;
        return entry.count;
    };
};

// 설정 틀리면 만들 때 바로 던짐 (잘못된 제한으로 서버 뜨는 것 막기)
const validateOptions = ({ windowMs, max, keyOf }) => {
    if (!(Number.isFinite(windowMs) && windowMs > 0)) {
        throw new Error('createRateLimiter: windowMs는 양수여야 합니다.');
    }
    if (!(Number.isInteger(max) && max > 0)) {
        throw new Error('createRateLimiter: max는 양의 정수여야 합니다.');
    }
    if (typeof keyOf !== 'function') {
        throw new Error('createRateLimiter: keyOf는 함수여야 합니다.');
    }
};

// message 주면 429 본문에 문구도 실음 (화면이 그대로 띄움)
// name: 같은 keyOf 모양(ip:…)을 쓰는 제한끼리 Redis에서 안 섞이게 붙이는 이름, 안 주면 `창길이:최대`
// store: { hit(key, windowMs) → { count } (Promise 가능), active?() } — null이면 늘 서버 메모리
const createRateLimiter = ({ windowMs, max, keyOf, now = Date.now, message, name, store = clusterStore }) => {
    validateOptions({ windowMs, max, keyOf });
    const countLocal = createMemoryCounter(windowMs, now);
    const prefix = typeof name === 'string' && name ? name : `${windowMs}:${max}`;

    // 막힌 요청도 셈에 넣음, 넘으면 창 끝날 때까지 429
    const decide = (count, res, next) => {
        if (count > max) {
            const body = { ok: false, code: 'RATE_LIMITED' };
            if (typeof message === 'string' && message) body.message = message;
            return res.status(429).json(body);
        }
        return next();
    };

    return (req, res, next) => {
        const key = keyOf(req, res);
        if (!store || (typeof store.active === 'function' && !store.active())) return decide(countLocal(key), res, next);
        // 나눠 세는 곳이 실패하면 이 서버 메모리로 (요청을 막거나 그냥 통과시키지 않게)
        return Promise.resolve()
            .then(() => store.hit(`${prefix}:${key}`, windowMs))
            .then((result) => (Number.isInteger(result?.count) ? result.count : countLocal(key)), () => countLocal(key))
            .then((count) => decide(count, res, next));
    };
};

module.exports = { createRateLimiter, clusterStore };
