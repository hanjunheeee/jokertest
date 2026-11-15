'use strict';

// 안쪽 전용 열쇠 시험 — 설정 키가 32자 못 되면 경로 꺼짐, 보낸 키는 똑같아야만 통과
// 목록 A15-B-009~014 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/unit/a15-internal-key.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { requireInternalKey } = require('../../middlewares/internalKey.middleware');

// 시험 전용 열쇠 글자 (누가 봐도 가짜)
const KEY_32 = 'a15-fake-internal-key-0000000032';
assert.equal(KEY_32.length, 32);

// 미들웨어 한 번 돌려 결과만 봄 → 'off'(경로 꺼짐) / 'pass'(통과) / 401 등 상태 번호
const run = (configured, sent) => {
    let outcome = null;
    const env = configured === undefined ? {} : { INTERNAL_API_KEY: configured };
    const req = { get: (name) => (name.toLowerCase() === 'x-internal-key' ? sent : undefined) };
    const res = {
        status(code) { outcome = code; return this; },
        json() { return this; },
    };
    requireInternalKey({ env })(req, res, (arg) => { outcome = arg === 'router' ? 'off' : 'pass'; });
    return outcome;
};

test('A15-B-009 설정 키 없음 → 꺼짐', () => {
    assert.equal(run(undefined, KEY_32), 'off');
});

test('A15-B-010 설정 키 31자 → 꺼짐', () => {
    const key31 = KEY_32.slice(0, 31);
    assert.equal(run(key31, key31), 'off');
});

test('A15-B-011 설정 키 32자 → 켜짐 (열쇠 없이 부르면 401)', () => {
    assert.equal(run(KEY_32, undefined), 401);
});

test('A15-B-012 보낸 키가 같은 값 → 맞음', () => {
    assert.equal(run(KEY_32, KEY_32), 'pass');
});

test('A15-B-013 보낸 키 끝 한 글자 다름 → 틀림', () => {
    assert.equal(run(KEY_32, `${KEY_32.slice(0, 31)}3`), 401);
});

test('A15-B-014 보낸 키 빈 글자 → 틀림', () => {
    assert.equal(run(KEY_32, ''), 401);
});
