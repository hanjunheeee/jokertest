'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRateLimiter } = require('../../middlewares/rateLimit.middleware');

const fakeRes = () => {
    const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    return res;
};

const callLimiter = (limiter, { key = 'k' } = {}) => {
    const req = { key };
    const res = fakeRes();
    let nextCalled = false;
    limiter(req, res, () => { nextCalled = true; });
    return { req, res, nextCalled };
};

test('createRateLimiter는 잘못된 설정을 조용히 넘기지 않고 즉시 던진다', () => {
    assert.throws(() => createRateLimiter({ windowMs: 0, max: 1, keyOf: () => 'k' }));
    assert.throws(() => createRateLimiter({ windowMs: 1000, max: 0, keyOf: () => 'k' }));
    assert.throws(() => createRateLimiter({ windowMs: 1000, max: 1.5, keyOf: () => 'k' }));
    assert.throws(() => createRateLimiter({ windowMs: 1000, max: 1, keyOf: 'not-a-function' }));
});

test('같은 키로 max회까지는 통과하고 그다음(max+1번째)은 429다', () => {
    let now = 1_000_000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 10, keyOf: (req) => req.key, now: () => now });

    for (let i = 0; i < 10; i += 1) {
        const req = { key: 'ip-1' };
        const res = fakeRes();
        let nextCalled = false;
        limiter(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, true, `${i + 1}번째 요청은 통과해야 합니다`);
        assert.equal(res.statusCode, null);
    }

    const req = { key: 'ip-1' };
    const res = fakeRes();
    let nextCalled = false;
    limiter(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, '11번째 요청은 막혀야 합니다');
    assert.equal(res.statusCode, 429);
    assert.deepEqual(res.body, { ok: false, code: 'RATE_LIMITED' });
});

test('대상(닉네임) 제한은 max=5 기준으로 6번째부터 429다', () => {
    let now = 2_000_000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5, keyOf: (req) => req.key, now: () => now });

    for (let i = 0; i < 5; i += 1) {
        const { nextCalled } = callLimiter(limiter, {});
        assert.equal(nextCalled, true);
    }
    const { nextCalled, res } = callLimiter(limiter, {});
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 429);
});

test('같은 IP라도 대상(키)이 다르면 서로 다른 카운터를 쓴다', () => {
    let now = 3_000_000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, keyOf: (req) => req.key, now: () => now });

    for (let i = 0; i < 2; i += 1) assert.equal(callLimiter(limiter, {}).nextCalled, true);

    const req = { key: 'other-target' };
    const res = fakeRes();
    let nextCalled = false;
    limiter(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, '다른 대상 키는 독립된 카운터를 써야 합니다');
});

test('여러 IP가 같은 정규화된 대상을 조회하면 대상 키 하나로 함께 제한된다', () => {
    let now = 4_000_000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, keyOf: () => 'normalized-target', now: () => now });

    const ips = ['1.1.1.1', '2.2.2.2', '3.3.3.3'];
    for (const ip of ips) {
        const req = { ip };
        const res = fakeRes();
        let nextCalled = false;
        limiter(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
    }

    const req = { ip: '4.4.4.4' };
    const res = fakeRes();
    let nextCalled = false;
    limiter(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, '다른 IP라도 같은 정규화 대상이면 함께 제한되어야 합니다');
    assert.equal(res.statusCode, 429);
});

test('앞뒤 공백이 있는 키도 호출부가 정규화한 값을 그대로 쓰면(트림 후 같은 값) 같은 카운터를 공유한다', () => {
    let now = 5_000_000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyOf: (req) => req.key.trim(), now: () => now });

    assert.equal(callLimiter(limiter, { key: 'same-key' }).nextCalled, true, '준비');

    const req = { key: '  same-key  ' };
    const res = fakeRes();
    let nextCalled = false;
    limiter(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
});

test('성공·계정 없음·날짜 불일치 이후에도(호출부가 매번 통과시키는 요청) 카운트는 계속 유지된다 — 성공 여부로 환불하지 않는다', () => {
    let now = 6_000_000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, keyOf: (req) => req.key, now: () => now });

    for (let i = 0; i < 3; i += 1) assert.equal(callLimiter(limiter, {}).nextCalled, true);
    const fourth = callLimiter(limiter, {});
    assert.equal(fourth.nextCalled, false);
    assert.equal(fourth.res.statusCode, 429);
});

test('창이 지나면 카운터가 초기화되어 다시 통과한다', () => {
    let now = 7_000_000;
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, keyOf: (req) => req.key, now: () => now });

    assert.equal(callLimiter(limiter, {}).nextCalled, true);
    assert.equal(callLimiter(limiter, {}).nextCalled, false, '창 안에서는 여전히 막혀야 합니다');

    now += 1000;
    assert.equal(callLimiter(limiter, {}).nextCalled, true, '창이 지나면 회복되어야 합니다');
});

test('창 만료로 회복된 뒤에도 그 창 안에서는 다시 max를 넘기면 막힌다', () => {
    let now = 8_000_000;
    const limiter = createRateLimiter({ windowMs: 1000, max: 2, keyOf: (req) => req.key, now: () => now });

    assert.equal(callLimiter(limiter, {}).nextCalled, true);
    assert.equal(callLimiter(limiter, {}).nextCalled, true);
    assert.equal(callLimiter(limiter, {}).nextCalled, false);

    now += 1500;
    assert.equal(callLimiter(limiter, {}).nextCalled, true);
    assert.equal(callLimiter(limiter, {}).nextCalled, true);
    const third = callLimiter(limiter, {});
    assert.equal(third.nextCalled, false);
    assert.equal(third.res.statusCode, 429);
});

test('동시(같은 now) 요청도 허용 수를 넘지 않는다', () => {
    const now = 9_000_000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 4, keyOf: (req) => req.key, now: () => now });

    const results = Array.from({ length: 6 }, () => callLimiter(limiter, {}).nextCalled);
    const passed = results.filter(Boolean).length;
    assert.equal(passed, 4, '동시에 6번 호출해도 통과는 정확히 max(4)회여야 합니다');
});
