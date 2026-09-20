'use strict';

// F-29a: 메모리 기반 고정 창(fixed window) 요청 빈도 제한기. BW가 아이디 찾기(AC-05)를
// 위해 처음 만들지만, 후속 슬라이스가 같은 팩토리로 다른 경로에도 독립 인스턴스를 만들어
// 재사용할 수 있도록 요청별 키 추출·시계 주입을 옵션으로 받는다.
//
// 창이 지나면 카운터를 통째로 초기화하는 고정 창 방식이다 — 창 경계에서 두 배까지 허용될
// 수 있는 단순함을 감수하는 대신, 시험용 가짜 시계 주입만으로 결정론적으로 검증할 수 있다.
// 성공/실패 여부와 무관하게 카운트를 올리기만 하고 환불하지 않는다(호출부가 성공한
// 요청만 세고 싶다면 미들웨어를 그 지점 이후에 연결하면 된다).

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

    // key -> { windowStart, count }
    const hits = new Map();

    return (req, res, next) => {
        const nowMs = now();

        // 만료된 항목을 먼저 정리한다 — 오래 켜 둔 프로세스에서 키가 계속 쌓이지 않게 한다.
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
