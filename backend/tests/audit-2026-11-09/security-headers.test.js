'use strict';

// 보안 시험: 응답 헤더·오류 응답·CORS·배포 설정 (API 보안 헤더 · 404 되비춤 · 라이브러리 오류 문구 · 500 내부 정보 · CORS 허용 주소
// · nginx 버전 숨김·화면 보안 헤더·숨김 파일 · env 예시·추적 파일에 진짜 비밀 없음)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'security-headers-secret-0123456789abcdef';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const express = require('express');
const cors = require('cors');

const { getCorsOrigin } = require('../../config/frontendOrigins');
const { startRouterServer, send, json, withEnv, applyFrontMiddlewares, listen } = require('./securityHttp');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');

const ROOT = path.join(__dirname, '../../..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// 오류를 일부러 내는 라우터
const trapRouter = () => {
    const router = express.Router();
    router.get('/ok', (req, res) => res.json({ ok: true }));
    router.get('/cached', (req, res) => { res.set('Cache-Control', 'private, max-age=60'); res.json({ ok: true }); });
    router.get('/item/:id', (req, res) => res.json({ id: req.params.id }));
    router.get('/db', () => {
        const error = new Error("Table 'joker.users' doesn't exist: SELECT password_hash FROM users");
        error.name = 'SequelizeDatabaseError';
        error.sql = 'SELECT password_hash FROM users';
        throw error;
    });
    router.get('/lib400', () => { const error = new Error('Unexpected token < in JSON at position 0 near "secret-input"'); error.status = 400; throw error; });
    return router;
};

const API_HEADERS = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'cross-origin-opener-policy': 'same-origin',
    'cache-control': 'no-store',
};

test('API 헤더: 보통 응답에 보안 헤더 전부, X-Powered-By 없음', async (t) => {
    const base = await startRouterServer(t, [['/t', trapRouter()]]);
    const res = await send(base, 'GET', '/t/ok');
    for (const [name, value] of Object.entries(API_HEADERS)) assert.equal(res.headers.get(name), value, name);
    assert.match(res.headers.get('permissions-policy'), /camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    assert.equal(res.headers.get('x-powered-by'), null);
});

test('API 헤더: HSTS는 운영에서만 1년·하위 도메인 포함', async (t) => {
    const base = await startRouterServer(t, [['/t', trapRouter()]]);
    withEnv(t, { NODE_ENV: 'development' });
    assert.equal((await send(base, 'GET', '/t/ok')).headers.get('strict-transport-security'), null);
    process.env.NODE_ENV = 'production';
    assert.equal((await send(base, 'GET', '/t/ok')).headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
});

test('API 헤더: 저장 금지가 기본이고 경로가 정한 캐시 값은 그대로 덮음', async (t) => {
    const base = await startRouterServer(t, [['/t', trapRouter()]]);
    assert.equal((await send(base, 'GET', '/t/cached')).headers.get('cache-control'), 'private, max-age=60');
});

test('없는 경로 404: 요청 주소·쿼리(토큰·스크립트 조각)를 응답에 되비추지 않음', async (t) => {
    const base = await startRouterServer(t, [['/t', trapRouter()]]);
    const res = await json(await send(base, 'GET', '/nope/<script>alert(1)</script>?token=SECRET-TOKEN-123'));
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, /SECRET-TOKEN|script|nope/);
    assert.equal(res.body.message, '요청한 경로를 찾을 수 없습니다.');
});

test('라이브러리 4xx(주소 풀기 실패): 운영은 입력 조각 없는 고정 문구', async (t) => {
    withEnv(t, { NODE_ENV: 'production' });
    const base = await startRouterServer(t, [['/t', trapRouter()]]);
    const decode = await json(await send(base, 'GET', '/t/item/%E0%A4%A'));
    assert.equal(decode.status, 400);
    assert.deepEqual(decode.body, { success: false, message: '요청을 처리할 수 없습니다.' });
    const lib = await json(await send(base, 'GET', '/t/lib400'));
    assert.equal(lib.status, 400);
    assert.doesNotMatch(lib.text, /secret-input|Unexpected token/);
});

test('500 오류: 운영은 고정 문구만 (DB 표 이름·SQL·스택·오류 이름 없음)', async (t) => {
    withEnv(t, { NODE_ENV: 'production' });
    const base = await startRouterServer(t, [['/t', trapRouter()]]);
    const res = await json(await send(base, 'GET', '/t/db'));
    assert.equal(res.status, 500);
    assert.equal(res.body.message, '서버 내부에서 에러가 발생했습니다.');
    assert.doesNotMatch(res.text, /joker\.users|password_hash|SELECT|Sequelize|stack|at /);
});

test('500 오류: NODE_ENV가 비어 있어도 내부 정보 안 나감 (빠뜨린 운영 설정 대비)', async (t) => {
    withEnv(t, { NODE_ENV: undefined });
    const base = await startRouterServer(t, [['/t', trapRouter()]]);
    const res = await json(await send(base, 'GET', '/t/db'));
    assert.doesNotMatch(res.text, /password_hash|SELECT/);
    assert.equal(res.body.error, undefined);
});

// ── CORS ──

const startCorsServer = async (t, env) => {
    withEnv(t, env);
    const app = express();
    applyFrontMiddlewares(app);
    app.use(cors({ origin: getCorsOrigin(), credentials: true }));
    app.use('/t', trapRouter());
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    return listen(t, app);
};

test('CORS: 다른 사이트 Origin엔 허용 헤더 없음, 허용 주소엔 그 주소 그대로 + 쿠키 허용 (와일드카드 없음)', async (t) => {
    const base = await startCorsServer(t, { FRONTEND_URL: 'https://mmc.example.test/', FRONTEND_MOBILE_URL: 'https://m.mmc.example.test' });
    const evil = await send(base, 'GET', '/t/ok', { headers: { origin: 'https://evil.example' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
    const near = await send(base, 'GET', '/t/ok', { headers: { origin: 'https://mmc.example.test.evil.example' } });
    assert.equal(near.headers.get('access-control-allow-origin'), null);
    const mobile = await send(base, 'GET', '/t/ok', { headers: { origin: 'https://m.mmc.example.test' } });
    assert.equal(mobile.headers.get('access-control-allow-origin'), 'https://m.mmc.example.test');
    assert.equal(mobile.headers.get('access-control-allow-credentials'), 'true');
});

test('CORS: 미리 묻기(OPTIONS)에 다른 사이트 주소를 되비추거나 * 를 주지 않음 (주소 하나면 그 주소 고정값)', async (t) => {
    const base = await startCorsServer(t, { FRONTEND_URL: 'https://mmc.example.test', FRONTEND_MOBILE_URL: undefined });
    const res = await send(base, 'OPTIONS', '/t/ok', { headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    const allowed = res.headers.get('access-control-allow-origin');
    assert.notEqual(allowed, 'https://evil.example');
    assert.notEqual(allowed, '*');
    assert.ok(allowed === null || allowed === 'https://mmc.example.test');
});

// ── nginx (화면·API 앞단) ──

test('nginx: 버전 숨김(server_tokens off)·HSTS는 https일 때만 값', () => {
    const conf = read('nginx/default.conf');
    assert.match(conf, /^server_tokens off;/m);
    assert.match(conf, /map \$scheme \$hsts_value \{[\s\S]*?https "max-age=31536000; includeSubDomains";[\s\S]*?default "";/);
});

test('nginx: add_header 쓰는 location마다 보안 헤더 조각 include (안 물려받는 것 막기)', () => {
    const conf = read('nginx/default.conf');
    const blocks = conf.split(/\n\s*location /).slice(1);
    for (const block of blocks) {
        const body = block.slice(0, block.indexOf('}'));
        if (/add_header/.test(body)) assert.match(body, /include \/etc\/nginx\/snippets\/security-headers\.conf;/, body.split('\n')[0]);
    }
});

test('nginx: 화면 두 사이트·API 모두 숨김 파일(.env·.git) 404', () => {
    const conf = read('nginx/default.conf');
    assert.equal((conf.match(/location ~ \/\\\.\(\?!well-known\/\) \{\s*return 404;/g) ?? []).length, 3);
});

test('nginx 보안 헤더 조각: 틀 넣기 막기·MIME 추측 막기·CSP·HSTS 들어 있음, Dockerfile이 복사함', () => {
    const snippet = read('nginx/snippets/security-headers.conf');
    for (const header of ['X-Content-Type-Options "nosniff"', 'X-Frame-Options "DENY"', 'Referrer-Policy', 'Permissions-Policy',
        "Content-Security-Policy \"frame-ancestors 'none'; object-src 'none'; base-uri 'self'\"", 'Strict-Transport-Security $hsts_value']) {
        assert.ok(snippet.includes(header), header);
    }
    assert.match(read('frontend/Dockerfile'), /COPY nginx\/snippets\/ \/etc\/nginx\/snippets\//);
});

test('nginx TLS: TLS 1.2·1.3만, http는 https로 돌림', () => {
    const tls = read('nginx/tls/ssl.conf');
    assert.match(tls, /ssl_protocols TLSv1\.2 TLSv1\.3;/);
    assert.match(tls, /return 301 https:\/\/\$host\$request_uri;/);
});

// ── 비밀값 ──

test('env 예시: 비밀 칸(키·비번·토큰)은 비었거나 change 로 시작하는 자리표시만', () => {
    for (const file of ['.env.example', 'backend/.env.example', 'frontend-mobile/.env.example']) {
        for (const line of read(file).split(/\r?\n/)) {
            const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
            if (!match || !/(SECRET|PASSWORD|PASS|TOKEN|KEY)$/.test(match[1])) continue;
            const value = match[2].trim();
            assert.ok(value === '' || /^change/i.test(value), `${file} ${match[1]}`);
        }
    }
});

test('추적 파일: .env 진짜 파일은 안 올라감 (예시·시험 더미만), .gitignore가 .env를 막음', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
    const envFiles = tracked.filter((file) => /(^|\/)\.env(\.|$)/.test(file));
    for (const file of envFiles) assert.ok(/\.env\.example$|^backend\/\.env\.test$/.test(file), file);
    assert.match(read('.gitignore'), /^\*\*\/\.env$/m);
});

test('시험 더미 env: 진짜 DB 주소가 아닌 막힌 주소', () => {
    const dummy = read('backend/.env.test');
    const url = dummy.match(/^DATABASE_URL=(.*)$/m)[1];
    assert.doesNotMatch(url, /amazonaws|rds|@(?!127\.0\.0\.1|localhost)/);
});
