'use strict';

// 로그인 토큰 아닌 것 거절 시험 — 같은 키라도 소셜 시도 표·HS512·서명 없는 토큰은 로그인 토큰으로 안 받음
// 목록 A15-B-043~045 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/unit/a15-token-kind.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// 시험 전용 서명 값 (시험 환경값에 없을 때만 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-token-kind-test-only-secret-000000';

const { verifyAccessToken } = require('../../services/auth/sessionLifecycle');
const { signOAuthAttempt } = require('../../services/auth/social/attempt');

// 로그인 때 주는 것과 같은 모양 칸
const PAYLOAD = { uuid: 'a15-user-1', role: 'USER', sessionId: 'a15-sess-1' };

// 정상 로그인 토큰은 받는지 먼저 봄 (거절이 키 문제 탓이 아님을 확인)
const assertNormalAccepted = () => {
    const normal = jwt.sign(PAYLOAD, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: 600 });
    assert.equal(verifyAccessToken(normal).uuid, PAYLOAD.uuid, '시험 준비: 보통 토큰도 거절됨');
};

test('A15-B-043 같은 키로 서명했지만 purpose 칸 있는 소셜 시도 표 → 거절', () => {
    assertNormalAccepted();
    const attempt = signOAuthAttempt({ ...PAYLOAD, purpose: 'link', provider: 'discord' }, 600);
    assert.throws(() => verifyAccessToken(attempt));
});

test('A15-B-044 HS512로 서명 → 거절', () => {
    assertNormalAccepted();
    const forged = jwt.sign(PAYLOAD, process.env.JWT_SECRET, { algorithm: 'HS512', expiresIn: 600 });
    assert.throws(() => verifyAccessToken(forged));
});

test('A15-B-045 서명 없는 토큰 → 거절', () => {
    assertNormalAccepted();
    const head = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ ...PAYLOAD, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
    assert.throws(() => verifyAccessToken(`${head}.${body}.`));
});
