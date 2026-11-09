'use strict';

// 요청 수 제한 만드는 파일, 키마다 정한 시간 창 안 횟수 세고 넘으면 429 (카운터는 서버 메모리)
// routes/auth.routes.js가 authRateLimit.middleware.js 함수에 넘겨 씀 (시험은 now를 넣어 시간 바꿈)

// 창 지난 키 지우기 (메모리 안 늘기)
const sweepExpired = (hits, nowMs, windowMs) => {
    for (const [key, entry] of hits) {
        if (nowMs - entry.windowStart >= windowMs) hits.delete(key);
    }
};

// 청소는 창 길이마다 한 번만 (요청마다 전체 훑기 막기)
// 설정 틀리면 만들 때 바로 던짐 (잘못된 제한으로 서버 뜨는 것 막기)
// message 주면 429 본문에 문구도 실음 (화면이 그대로 띄움)
const createRateLimiter = ({ windowMs, max, keyOf, now = Date.now, message }) => {
    if (!(Number.isFinite(windowMs) && windowMs > 0)) {
        throw new Error('createRateLimiter: windowMs는 양수여야 합니다.');
    }
    if (!(Number.isInteger(max) && max > 0)) {
        throw new Error('createRateLimiter: max는 양의 정수여야 합니다.');
    }
    if (typeof keyOf !== 'function') {
        throw new Error('createRateLimiter: keyOf는 함수여야 합니다.');
    }

    const hits = new Map();
    let lastSweepMs = now();

    return (req, res, next) => {
        const nowMs = now();

        // 창 지난 키는 창 길이마다 한 번 지움 (메모리 안 늘기, 요청마다 다 훑지 않기)
        if (nowMs - lastSweepMs >= windowMs) {
            lastSweepMs = nowMs;
            sweepExpired(hits, nowMs, windowMs);
        }

        // 처음 보는 키면 지금부터 창 시작
        const key = keyOf(req, res);
        let entry = hits.get(key);
        // 창 지난 키는 청소 전이라도 새 창으로
        if (entry && nowMs - entry.windowStart >= windowMs) {
            entry = null;
        }
        if (!entry) {
            entry = { windowStart: nowMs, count: 0 };
            hits.set(key, entry);
        }

        // 막힌 요청도 셈에 넣음, 넘으면 창 끝날 때까지 429
        entry.count += 1;

        if (entry.count > max) {
            const body = { ok: false, code: 'RATE_LIMITED' };
            if (typeof message === 'string' && message) body.message = message;
            return res.status(429).json(body);
        }

        return next();
    };
};

module.exports = { createRateLimiter };
