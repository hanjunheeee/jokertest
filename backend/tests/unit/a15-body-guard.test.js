'use strict';

// 본문 금지 키·너무 깊은 본문 찾기 시험 — 프로토타입 바꾸는 키는 어디 있든 잡고, 값 글자일 뿐이면 안 잡음, 깊이 32까지만 받음
// 목록 A15-B-032~037 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/unit/a15-body-guard.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { hasForbiddenKey } = require('../../middlewares/bodyGuard.middleware');

// 맨 안쪽 객체가 depth 깊이에 오게 겹침 (맨 위 = 0) → { x: { x: … { leaf: 1 } } }
const nested = (depth) => {
    let value = { leaf: 1 };
    for (let i = 0; i < depth; i += 1) value = { x: value };
    return value;
};

test('A15-B-032 JSON.parse로 만든 맨 위 __proto__ 키 → 있음', () => {
    assert.equal(hasForbiddenKey(JSON.parse('{"__proto__":{"admin":true},"email":"a"}')), true);
});

test('A15-B-033 3겹 안 constructor → 있음', () => {
    assert.equal(hasForbiddenKey(JSON.parse('{"a":{"b":{"constructor":{"x":1}}}}')), true);
});

test('A15-B-034 배열 안 객체 prototype → 있음', () => {
    assert.equal(hasForbiddenKey(JSON.parse('{"list":[{"ok":1},{"prototype":{"x":1}}]}')), true);
});

test('A15-B-035 값이 "__proto__" 글자일 뿐 → 없음', () => {
    assert.equal(hasForbiddenKey(JSON.parse('{"nickname":"__proto__","items":["constructor"]}')), false);
});

test('A15-B-036 깊이 32(맨 위 = 0) → 없음', () => {
    assert.equal(hasForbiddenKey(nested(32)), false);
});

test('A15-B-037 깊이 33 → 있음', () => {
    assert.equal(hasForbiddenKey(nested(33)), true);
});
