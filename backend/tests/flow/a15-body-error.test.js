'use strict';

// 본문·오류 응답 시험 — 큰 본문·깨진 본문·금지 키·없는 경로·운영 500·운영 라이브러리 4xx에 입력 조각·서버 속 정보가 안 실리는지
// 목록 A15-B-222~228 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/flow/a15-body-error.test.js
// 모델이 DB에 안 붙게 닿지 않는 주소 (꼭 다른 require보다 먼저)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcrypt');

const { startAuthServer, startRouterServer, send, json, withEnv } = require('../audit-2026-11-09/securityHttp');

// 본문 한도 = 100kb = 102400바이트 (express 본문 읽기 단위가 1024)
const LIMIT_BYTES = 100 * 1024;
// 시험 전용 비번 (진짜 값 아님)
const PASSWORD = 'a15-body-pass-1';

// 정해진 바이트 수 JSON 만들기: 빈 칸 하나에 글자를 채워 길이 맞춤 → {"email":"…","password":"…","pad":"xxx…"}
const jsonOfBytes = (bytes, fields) => {
    const base = JSON.stringify({ ...fields, pad: '' });
    const raw = JSON.stringify({ ...fields, pad: 'x'.repeat(bytes - Buffer.byteLength(base)) });
    assert.equal(Buffer.byteLength(raw), bytes, '준비: 본문 길이가 안 맞음');
    return raw;
};

// 가짜 저장소에 로그인 되는 계정 하나
const addUser = async (store, email) => {
    store.data.users.push({
        uuid: `a15-body-${email}`, email, nickname: '본문시험', role: 'USER', status: 'ACTIVE',
        password_hash: await bcrypt.hash(PASSWORD, 4), failed_login_count: 0, locked_until: null,
    });
};

test('A15-B-222 딱 100kb JSON으로 로그인 → 413 아님(보통 답)', async (t) => {
    const { base } = await startAuthServer(t);
    const raw = jsonOfBytes(LIMIT_BYTES, { email: 'nobody-222@example.test', password: 'wrong-pass-1' });
    const res = await json(await send(base, 'POST', '/auth/login', { raw }));
    assert.notEqual(res.status, 413);
    assert.notEqual(res.body?.code, 'PAYLOAD_TOO_LARGE');
    assert.ok(res.status >= 400 && res.status < 500, `보통 거절이 아님: ${res.status}`);
});

test('A15-B-223 100kb+1바이트 → 413 { ok:false, code:PAYLOAD_TOO_LARGE }, 라이브러리 문구 없음', async (t) => {
    const { base } = await startAuthServer(t);
    const raw = jsonOfBytes(LIMIT_BYTES + 1, { email: 'nobody-223@example.test', password: 'wrong-pass-1' });
    const res = await json(await send(base, 'POST', '/auth/login', { raw }));
    assert.equal(res.status, 413);
    assert.deepEqual(res.body, { ok: false, code: 'PAYLOAD_TOO_LARGE' });
    assert.doesNotMatch(res.text, /entity|too large|body-parser|raw-body|limit/i);
});

test('A15-B-224 닫히지 않은 JSON → 400 INVALID_INPUT, 보낸 조각·SyntaxError·라이브러리 이름 없음', async (t) => {
    const { base } = await startAuthServer(t);
    const raw = '{"email":"broken-224@example.test","password":"piece-of-224';
    const res = await json(await send(base, 'POST', '/auth/login', { raw }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_INPUT');
    assert.doesNotMatch(res.text, /broken-224|piece-of-224/);
    assert.doesNotMatch(res.text, /SyntaxError|Unexpected|JSON\.parse|body-parser|entity\.parse/i);
});

test('A15-B-225 __proto__ 키 든 JSON으로 로그인 → 400 INVALID_INPUT, 로그인 처리 안 됨', async (t) => {
    const { base, store } = await startAuthServer(t);
    await addUser(store, 'proto-225@example.test');
    // 맞는 이메일·비번을 같이 실음 → 처리됐다면 로그인 쿠키가 나옴
    const raw = `{"__proto__":{"isAdmin":true},"email":"proto-225@example.test","password":"${PASSWORD}"}`;
    const res = await json(await send(base, 'POST', '/auth/login', { raw }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_INPUT');
    assert.equal(res.headers.getSetCookie().some((c) => /^accessToken=[^;]+/.test(c)), false, '로그인 쿠키가 나옴');
    assert.equal(store.data.sessions.length, 0, '세션이 생김');
    assert.equal(store.data.history.length, 0, '로그인 기록이 생김');
});

test('A15-B-226 없는 경로 + 쿼리에 토큰·<script> → 404 "요청한 경로를 찾을 수 없습니다.", 주소·쿼리 글자 안 되비춤', async (t) => {
    const { base } = await startAuthServer(t);
    const marker = 'a15-226-fake-token-value';
    const res = await json(await send(base, 'GET', `/no-such?token=${marker}&x=${encodeURIComponent('<script>alert(226)</script>')}`));
    assert.equal(res.status, 404);
    assert.equal(res.body.message, '요청한 경로를 찾을 수 없습니다.');
    assert.doesNotMatch(res.text, /no-such|a15-226-fake-token-value|script|alert/);
});

test('A15-B-227 운영 값에서 일부러 던지는 라우터 → 500 고정 문구, 스택(error) 칸·던진 글 없음', async (t) => {
    withEnv(t, { NODE_ENV: 'production' });
    const router = express.Router();
    router.get('/boom', () => { throw new Error('a15-227-secret-thrown-text at table users_secret'); });
    const base = await startRouterServer(t, [['/test-throw', router]]);
    const res = await json(await send(base, 'GET', '/test-throw/boom'));
    assert.equal(res.status, 500);
    assert.equal(res.body.message, '서버 내부에서 에러가 발생했습니다.');
    assert.equal(Object.hasOwn(res.body, 'error'), false, '스택 칸이 실림');
    assert.doesNotMatch(res.text, /a15-227-secret-thrown-text|users_secret|at\s+\S+\s+\(/);
});

test('A15-B-228 운영 값에서 주소 풀기 실패(%E0%A4%A) → "요청을 처리할 수 없습니다.", 입력 조각 없음', async (t) => {
    withEnv(t, { NODE_ENV: 'production' });
    // 진짜 친구 라우터의 번호 칸 경로 (번호 칸 풀기에서 실패)
    const friendPath = require.resolve('../../routes/friend.routes');
    delete require.cache[friendPath];
    const base = await startRouterServer(t, [['/friends', require(friendPath)]]);
    const res = await json(await send(base, 'GET', '/friends/invites/%E0%A4%A'));
    assert.ok(res.status >= 400 && res.status < 500, `4xx 아님: ${res.status}`);
    assert.equal(res.body.message, '요청을 처리할 수 없습니다.');
    assert.doesNotMatch(res.text, /%E0|E0%A4|decode|Failed|URIError/i);
});
