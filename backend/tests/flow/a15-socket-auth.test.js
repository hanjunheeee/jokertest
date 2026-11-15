'use strict';

// 소켓 접속도 로그인 토큰 아닌 것 거절 시험 — 소셜 시도 표·HS512·서명 없는 토큰 쿠키면 UNAUTHORIZED 하나로, 까닭 안 드러남
// 목록 A15-B-146~148 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md, 나머지 다섯 가지는 A10-B-224~228), 돌리기: node --env-file=.env.test --test tests/flow/a15-socket-auth.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// 시험 전용 서명 값 (시험 환경값에 없을 때만 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-socket-auth-test-only-secret-0000';

const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const { authenticateSocket } = require('../../socket/connection/auth');
const { signOAuthAttempt } = require('../../services/auth/social/attempt');

// 세션은 늘 살아 있다고 봄 → 거절되면 토큰 모양 탓만 남음 (DB 안 감)
const aliveSession = (t) => {
    const original = sessionLifecycle.resolveSession;
    sessionLifecycle.resolveSession = async () => ({ ok: true });
    t.after(() => { sessionLifecycle.resolveSession = original; });
};

const PAYLOAD = { uuid: 'a15-sock-user', role: 'USER', sessionId: 'a15-sock-sess' };

// 접속 인증 한 번 → { err, socket } (통과면 err 없음)
const handshake = (token) => {
    const socket = { data: {}, handshake: { headers: { cookie: `accessToken=${token}` } } };
    return new Promise((resolve) => authenticateSocket(socket, (err) => resolve({ err, socket })));
};

// 정상 토큰은 통과하는지 먼저 봄 (거절이 세션·키 탓이 아님을 확인)
const assertNormalPasses = async () => {
    const normal = jwt.sign(PAYLOAD, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: 900 });
    const { err } = await handshake(normal);
    assert.equal(err, undefined, '시험 준비: 보통 토큰도 거절됨');
};

const assertRejected = async (token) => {
    const { err, socket } = await handshake(token);
    assert.ok(err instanceof Error, '접속이 통과됨');
    assert.equal(err.message, 'UNAUTHORIZED');
    assert.equal(err.data, undefined, '오류에 까닭이 실림');
    assert.equal(socket.data.user, undefined, '거절됐는데 사용자 정보가 붙음');
};

test('A15-B-146 쿠키에 purpose 든 토큰 → 접속 오류 UNAUTHORIZED, 까닭 안 드러남', async (t) => {
    aliveSession(t);
    await assertNormalPasses();
    await assertRejected(signOAuthAttempt({ ...PAYLOAD, purpose: 'link', provider: 'discord' }, 600));
});

test('A15-B-147 쿠키에 HS512 서명 토큰 → 접속 오류 UNAUTHORIZED, 까닭 안 드러남', async (t) => {
    aliveSession(t);
    await assertNormalPasses();
    await assertRejected(jwt.sign(PAYLOAD, process.env.JWT_SECRET, { algorithm: 'HS512', expiresIn: 900 }));
});

test('A15-B-148 쿠키에 서명 없는 토큰 → 접속 오류 UNAUTHORIZED, 까닭 안 드러남', async (t) => {
    aliveSession(t);
    await assertNormalPasses();
    const head = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ ...PAYLOAD, exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
    await assertRejected(`${head}.${body}.`);
});
