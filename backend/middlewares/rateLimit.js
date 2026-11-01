'use strict';

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

        for (const [key, entry] of hits) {
            if (nowMs - entry.windowStart >= windowMs) {
                hits.delete(key);
            }
        }

        const key = keyOf(req, res);
        let entry = hits.get(key);
        if (!entry) {
            entry = { windowStart: nowMs, count: 0 };
            hits.set(key, entry);
        }

        entry.count += 1;

        if (entry.count > max) {
            return res.status(429).json({ ok: false, code: 'RATE_LIMITED' });
        }

        return next();
    };
};

module.exports = { createRateLimiter };
