'use strict';

// 보안 시험: 요청 본문 앞단 (크기 제한·깨진 JSON 고정 응답·__proto__ 같은 키 거절·깊은 본문) + index.js가 같은 앞단을 붙였는지
// DB 안 씀, 작은 express 앱에 앞단만 붙여 봄
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'security-body-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const guard = require('../../middlewares/bodyGuard.middleware');
const { startRouterServer, send, json } = require('./securityHttp');

// 받은 본문을 그대로 돌려주는 라우터 (앞단을 지나왔는지 보기)
const echoRouter = () => {
    const router = express.Router();
    router.post('/', (req, res) => res.json({ ok: true, body: req.body, polluted: ({}).polluted === true }));
    router.get('/', (req, res) => res.json({ ok: true, query: req.query }));
    return router;
};

test('본문 크기: 100kb 넘는 JSON은 413 PAYLOAD_TOO_LARGE, 라이브러리 문구 없음', async (t) => {
    const base = await startRouterServer(t, [['/echo', echoRouter()]]);
    const res = await json(await send(base, 'POST', '/echo', { body: { text: 'x'.repeat(110 * 1024) } }));
    assert.equal(res.status, 413);
    assert.deepEqual(res.body, { ok: false, code: 'PAYLOAD_TOO_LARGE' });
    assert.doesNotMatch(res.text, /entity|stack|body-parser/i);
});

test('본문 크기: 100kb 안은 그대로 통과', async (t) => {
    const base = await startRouterServer(t, [['/echo', echoRouter()]]);
    const res = await json(await send(base, 'POST', '/echo', { body: { text: 'x'.repeat(90 * 1024) } }));
    assert.equal(res.status, 200);
    assert.equal(res.body.body.text.length, 90 * 1024);
});

test('깨진 JSON: 400 INVALID_INPUT만 (본문 조각·위치 같은 내부 문구 안 돌려줌)', async (t) => {
    const base = await startRouterServer(t, [['/echo', echoRouter()]]);
    const res = await json(await send(base, 'POST', '/echo', { raw: '{"email":"secret-value@x.io",' }));
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, code: 'INVALID_INPUT' });
    assert.doesNotMatch(res.text, /secret-value|position|Unexpected|SyntaxError/);
});

test('본문 __proto__ 키: 400 INVALID_INPUT, 전역 객체 모양 안 바뀜', async (t) => {
    const base = await startRouterServer(t, [['/echo', echoRouter()]]);
    const res = await json(await send(base, 'POST', '/echo', { raw: '{"__proto__":{"polluted":true},"a":1}' }));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_INPUT');
    assert.equal(({}).polluted, undefined);
});

test('본문 constructor·prototype 키 (겹친 곳·배열 안이어도) 400', async (t) => {
    const base = await startRouterServer(t, [['/echo', echoRouter()]]);
    for (const raw of ['{"a":{"constructor":{"prototype":{"x":1}}}}', '{"list":[{"ok":1},{"__proto__":{}}]}', '[{"prototype":1}]']) {
        const res = await json(await send(base, 'POST', '/echo', { raw }));
        assert.equal(res.status, 400, raw);
    }
});

test('쿼리 __proto__ 키도 400 (GET)', async (t) => {
    const base = await startRouterServer(t, [['/echo', echoRouter()]]);
    const res = await json(await send(base, 'GET', '/echo?__proto__=1'));
    assert.equal(res.status, 400);
    const ok = await json(await send(base, 'GET', '/echo?name=proto'));
    assert.equal(ok.status, 200);
});

test('폼 본문: 겹친 키(a[b]=1)는 풀지 않고 글자 키 그대로 (qs 겹친 객체·배열 한도 우회 막기)', async (t) => {
    const base = await startRouterServer(t, [['/echo', echoRouter()]]);
    const res = await json(await send(base, 'POST', '/echo', { raw: 'a[b]=1&c=2', headers: { 'content-type': 'application/x-www-form-urlencoded' } }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.body, { 'a[b]': '1', c: '2' });
});

test('너무 깊게 겹친 본문은 400 (깊이 32 넘음)', async (t) => {
    const base = await startRouterServer(t, [['/echo', echoRouter()]]);
    const deep = `${'{"a":'.repeat(40)}1${'}'.repeat(40)}`;
    const res = await json(await send(base, 'POST', '/echo', { raw: deep }));
    assert.equal(res.status, 400);
});

test('금지 키 찾기 함수: 보통 본문은 통과, null·숫자·글자도 통과', () => {
    assert.equal(guard.hasForbiddenKey({ email: 'a@b.co', list: [1, { name: 'x' }] }), false);
    for (const value of [null, undefined, 1, 'text', []]) assert.equal(guard.hasForbiddenKey(value), false);
    assert.equal(guard.hasForbiddenKey(JSON.parse('{"__proto__":1}')), true);
});

test('읽기 실패 처리기: 본문 오류 아닌 오류는 다음 처리기로 넘김', () => {
    let passed = null;
    guard.bodyParseErrorHandler(new Error('db down'), {}, {}, (err) => { passed = err; });
    assert.equal(passed.message, 'db down');
});

test('index.js가 본문 앞단을 쓰고 extended 폼 파서는 안 씀', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');
    assert.match(source, /bodyGuard\.middleware"\)\.bodyGuards\(\)/);
    assert.doesNotMatch(source, /urlencoded\(\{\s*extended:\s*true/);
    assert.doesNotMatch(source, /app\.use\(express\.json\(\)\)/);
});
