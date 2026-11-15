'use strict';

// 토큰 모양마다 거절 시험 (HTTP) — 서명·종류가 틀린 로그인 토큰으로 내 프로필을 부르면 401, 프로필 값 없음
// 목록 A15-B-138~142 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/flow/a15-token-http.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 모델이 진짜 DB에 안 붙게
// 시험 전용 서명 값 (시험 환경값에 없을 때만, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-token-http-test-only-signing-text';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const userService = require('../../services/user');
const { signOAuthAttempt } = require('../../services/auth/social/attempt');
const { swap } = require('../audit-2026-11-09/authFakes');
const { startRouterServer, send, json } = require('../audit-2026-11-09/securityHttp');

const UUID = 'a15-token-user';
const SECRET_NICK = 'a15비밀닉';
const CLAIMS = { uuid: UUID, role: 'USER', sessionId: 'a15-token-session' };

// 서명 없는 토큰 (머리 alg none + 몸통 + 빈 서명)
const unsignedToken = () => {
    const part = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `${part({ alg: 'none', typ: 'JWT' })}.${part({ ...CLAIMS, exp: Math.floor(Date.now() / 1000) + 600 })}.`;
};

// 토큰 모양: 번호 | 이름 | 만들기 | 기대 코드 (없으면 코드 안 봄)
const CASES = [
    ['A15-B-138', '다른 키로 서명', () => jwt.sign(CLAIMS, 'a15-not-the-server-signing-text', { algorithm: 'HS256', expiresIn: 600 }), undefined],
    ['A15-B-139', '만료', () => jwt.sign({ ...CLAIMS, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, { algorithm: 'HS256' }), 'ACCESS_TOKEN_EXPIRED'],
    ['A15-B-140', 'purpose 든 소셜 시도 표', () => signOAuthAttempt({ ...CLAIMS, purpose: 'link', provider: 'discord' }, 600), undefined],
    ['A15-B-141', 'HS512 서명', () => jwt.sign(CLAIMS, process.env.JWT_SECRET, { algorithm: 'HS512', expiresIn: 600 }), undefined],
    ['A15-B-142', '서명 없음', unsignedToken, undefined],
];

for (const [id, label, makeToken, code] of CASES) {
    test(`${id} GET /user/me/profile에 ${label} 토큰 → 401${code ? ` ${code}` : ''}, 프로필 값 없음`, async (t) => {
        // 세션은 살아 있고 프로필도 있다고 둠 (토큰 검사를 지나면 프로필이 나가게)
        swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
        swap(t, userService, 'getMyProfile', async () => ({ uuid: UUID, nickname: SECRET_NICK }));
        const base = await startRouterServer(t, [['/user', require('../../routes/user.routes')]]);
        const res = await json(await send(base, 'GET', '/user/me/profile', { cookie: `accessToken=${makeToken()}` }));
        assert.equal(res.status, 401);
        if (code) assert.equal(res.body.code, code);
        assert.ok(!res.text.includes(SECRET_NICK), '본문에 프로필 값이 실림');
        assert.ok(!res.text.includes(UUID), '본문에 사람 번호가 실림');
    });
}
