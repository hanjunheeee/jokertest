'use strict';

// 요청 수 제한 만드는 파일, 키마다 정한 시간 창 안 횟수 세고 넘으면 429 (카운터는 서버 메모리)
// routes/auth.routes.js가 authRateLimit.middleware.js 함수에 넘겨 씀 (시험은 now를 넣어 시간 바꿈)

// 설정 틀리면 만들 때 바로 던짐 (잘못된 제한으로 서버 뜨는 것 막기)
const createRateLimiter = ({ windowMs, max, keyOf, now = Date.now }) => {
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

    return (req, res, next) => {
        const nowMs = now();

        // 창 지난 키는 요청마다 지움 (메모리 안 늘기)
        for (const [key, entry] of hits) {
            if (nowMs - entry.windowStart >= windowMs) {
                hits.delete(key);
            }
        }

        // 처음 보는 키면 지금부터 창 시작
        const key = keyOf(req, res);
        let entry = hits.get(key);
        if (!entry) {
            entry = { windowStart: nowMs, count: 0 };
            hits.set(key, entry);
        }

        // 막힌 요청도 셈에 넣음, 넘으면 창 끝날 때까지 429
        entry.count += 1;

        if (entry.count > max) {
            return res.status(429).json({ ok: false, code: 'RATE_LIMITED' });
        }

        return next();
    };
};

module.exports = { createRateLimiter };
