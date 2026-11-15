'use strict';

// 요청 수 세기 시험 — 한도 다음부터 429, 막힌 동안도 셈, 창 끝나면 새로, 키마다 따로, 429 본문엔 안내 글만
// 목록 A15-B-038~042 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/unit/a15-rate-limiter.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { createRateLimiter } = require('../../middlewares/rateLimit.middleware');

const WINDOW_MS = 60_000;
const MESSAGE = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';

// 손으로 움직이는 시계 (시험마다 새로)
const makeClock = () => {
    let ms = 1_000_000;
    return { now: () => ms, advance: (d) => { ms += d; } };
};

// 한도 3·창 60초 제한 하나 (세는 곳은 이 서버 메모리, 시험마다 새로 만들어 장부 안 섞임)
const makeLimiter = (clock, extra = {}) => createRateLimiter({
    windowMs: WINDOW_MS, max: 3, keyOf: (req) => `ip:${req.ip}`, now: clock.now, store: null, ...extra,
});

// 요청 하나 → { passed, status, body }
const hit = (limiter, ip = '10.15.0.1', body = {}) => {
    const out = { passed: false, status: 200, body: null };
    const res = {
        status(code) { out.status = code; return this; },
        json(value) { out.body = value; return this; },
    };
    limiter({ ip, body }, res, () => { out.passed = true; });
    return out;
};

test('A15-B-038 한도 3·창 60초 → 3번째까지 통과, 4번째 429 + { ok:false, code:RATE_LIMITED }', () => {
    const limiter = makeLimiter(makeClock());
    for (let i = 1; i <= 3; i += 1) assert.equal(hit(limiter).passed, true, `${i}번째`);
    const fourth = hit(limiter);
    assert.equal(fourth.passed, false);
    assert.equal(fourth.status, 429);
    assert.deepEqual({ ok: fourth.body.ok, code: fourth.body.code }, { ok: false, code: 'RATE_LIMITED' });
});

test('A15-B-039 4번째 막힌 뒤 창 안에서 10번 더 → 전부 429', () => {
    const clock = makeClock();
    const limiter = makeLimiter(clock);
    for (let i = 0; i < 4; i += 1) hit(limiter);
    for (let i = 0; i < 10; i += 1) {
        clock.advance(1_000);
        const res = hit(limiter);
        assert.equal(res.status, 429, `막힌 뒤 ${i + 1}번째`);
        assert.equal(res.passed, false);
    }
});

test('A15-B-040 막힌 뒤 59.999초 → 429, 60초 → 통과', () => {
    const clock = makeClock();
    const limiter = makeLimiter(clock);
    for (let i = 0; i < 4; i += 1) hit(limiter);
    clock.advance(59_999);
    assert.equal(hit(limiter).status, 429, '59.999초에 풀림');
    clock.advance(1);
    assert.equal(hit(limiter).passed, true, '60초에 안 풀림');
});

test('A15-B-041 ip A 3번 막힘 뒤 ip B 첫 요청 → 통과', () => {
    const limiter = makeLimiter(makeClock());
    for (let i = 0; i < 4; i += 1) hit(limiter, '10.15.0.1');
    assert.equal(hit(limiter, '10.15.0.1').status, 429, '시험 준비: ip A가 안 막힘');
    assert.equal(hit(limiter, '10.15.0.2').passed, true);
});

test('A15-B-042 문구 준 제한 → 429 본문 message = 그 글, 입력 값 조각 없음', () => {
    const limiter = makeLimiter(makeClock(), { message: MESSAGE });
    const marker = 'a15-input-marker-zz';
    for (let i = 0; i < 3; i += 1) hit(limiter, '10.15.0.9', { email: marker });
    const res = hit(limiter, '10.15.0.9', { email: marker });
    assert.equal(res.status, 429);
    assert.equal(res.body.message, MESSAGE);
    assert.equal(JSON.stringify(res.body).includes(marker), false, '입력 값이 실림');
    assert.equal(JSON.stringify(res.body).includes('10.15.0.9'), false, 'ip가 실림');
});
