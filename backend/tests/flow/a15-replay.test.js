'use strict';

// 남의 소셜 가입 링크 되풀이 시험 — 가입 시도 쿠키 없는 브라우저가 남의 가입 링크(의도 토큰)로 가입 마무리하면 거절
// 목록 A15-B-211 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md "같은 요청 되풀이"), 돌리기: node --env-file=.env.test --test tests/flow/a15-replay.test.js

// 시험 전용 서명 값 (시험 환경값에 없을 때만 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-replay-test-only-signing-value';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { startAuthServer, send, json } = require('../audit-2026-11-09/securityHttp');

test('A15-B-211 가입 시도 쿠키 없이 남의 소셜 가입 링크로 POST /auth/social/signup/complete → 400 INTENT_EXPIRED, 계정 안 생김', async (t) => {
    const { base, store } = await startAuthServer(t);
    // 남(피해자)이 소셜 로그인으로 받은 가입 의도 (아직 안 씀, 만료 전) — DB엔 해시만 있음
    const rawIntent = crypto.randomBytes(32).toString('base64url');
    store.data.intents.push({
        id: 'intent-211', intent_token_hash: crypto.createHash('sha256').update(rawIntent).digest('hex'),
        provider: 'google', subject: 'victim-subject-211', email: 'victim-211@example.com',
        expires_at: new Date(Date.now() + 10 * 60_000), consumed_at: null,
    });
    // 링크를 연 다른 브라우저: 그 사람이 받은 시도 쿠키가 없음
    const res = await send(base, 'POST', '/auth/social/signup/complete', {
        body: {
            intentToken: rawIntent, nickname: '가로채기', birthDate: '2000-01-02',
            agreedTermsVersionIds: [1], ageConfirmed: true,
        },
        headers: { 'x-forwarded-for': '198.51.100.211' },
    });
    const body = await json(res);
    assert.equal(body.status, 400);
    assert.equal(body.body.code, 'INTENT_EXPIRED');
    assert.equal(store.data.users.length, 0, '계정이 생김');
    assert.equal(store.data.identities.length, 0, '소셜 계정이 묶임');
    assert.equal(store.data.intents[0].consumed_at, null, '가입 의도가 쓰임');
    assert.equal(res.headers.getSetCookie().filter((c) => /^(accessToken|refreshToken)=[^;]/.test(c)).length, 0, '로그인 쿠키가 나감');
});
