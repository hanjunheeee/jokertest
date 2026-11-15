'use strict';

// 소켓 접속 주소(Origin) 검사 시험 — 운영은 주소 없으면 거절, 목록 밖·흉내 주소 거절, 화면 주소 둘은 받음
// 목록 A15-B-001~008 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/unit/a15-socket-origin.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { checkSocketOrigin } = require('../../socket/connection/originCheck');
const { getAllowedOrigins } = require('../../config/frontendOrigins');

// 시험 전용 화면 주소 (진짜 주소 아님)
const PC = 'https://pc.a15-origin.test';
const MOBILE = 'https://m.a15-origin.test';

// 시험 동안만 환경값 바꾸기 → 끝나면 되돌림
const withEnv = (t, values) => {
    const saved = {};
    for (const [key, value] of Object.entries(values)) {
        saved[key] = process.env[key];
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
};

// 화면 주소 두 개를 설정에 넣고 그 설정 목록으로 검사 (설정 읽는 길까지 같이 봄)
const check = (t, origin, nodeEnv) => {
    withEnv(t, { FRONTEND_URL: PC, FRONTEND_MOBILE_URL: MOBILE, NODE_ENV: nodeEnv });
    return checkSocketOrigin(origin, { env: { NODE_ENV: nodeEnv }, allowedOrigins: getAllowedOrigins() });
};

test('A15-B-001 운영·Origin 없음 → 거절 ORIGIN_REQUIRED', (t) => {
    const result = check(t, undefined, 'production');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'ORIGIN_REQUIRED');
});

test('A15-B-002 개발·Origin 없음 → 받음', (t) => {
    assert.equal(check(t, undefined, 'development').ok, true);
});

test('A15-B-003 PC 화면 주소 → 받음', (t) => {
    assert.equal(check(t, PC, 'production').ok, true);
});

test('A15-B-004 모바일 화면 주소 → 받음', (t) => {
    assert.equal(check(t, MOBILE, 'production').ok, true);
});

test('A15-B-005 PC 주소 끝 / · 대문자 섞임 → 받음', (t) => {
    assert.equal(check(t, 'HTTPS://PC.A15-Origin.test/', 'production').ok, true);
});

test('A15-B-006 목록 밖 주소 → ORIGIN_NOT_ALLOWED', (t) => {
    const result = check(t, 'https://other-site.a15-origin.test', 'production');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'ORIGIN_NOT_ALLOWED');
});

test('A15-B-007 PC 주소 뒤에 글자 붙인 다른 도메인 → 거절', (t) => {
    assert.equal(check(t, `${PC}.evil.example`, 'production').ok, false);
});

test('A15-B-008 같은 호스트 다른 포트 → 거절', (t) => {
    assert.equal(check(t, `${PC}:8443`, 'production').ok, false);
});
