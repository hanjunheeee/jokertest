'use strict';

// 문 1 시험 (AD-010~014), 클라우드플레어 Access 표를 진짜 서명 검증으로 확인
// DB 안 씀, 시험이 만든 RSA 열쇠로 서명한 표 + 작은 공개키 서버 (accessKeys.js)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');

const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const { createAccessKeys, makeKeyPair, ISSUER, AUD } = require('./helpers/accessKeys');

const TOTP_KEY = 'b'.repeat(64);

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

const listen = async (t, app) => {
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return url;
};

// 관리자 라우터 전체 (index.js와 같은 자리)
const startAdmin = (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/admin-api', require('../../admin'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    return listen(t, app);
};

// 문 1만 붙인 작은 앱: 통과하면 요청에 실린 값 돌려줌
const startProbe = (t) => {
    const { requireAccess } = require('../../admin/middlewares/access.middleware');
    const { adminErrorHandler } = require('../../admin/middlewares/adminError.middleware');
    const app = express();
    app.get('/probe', requireAccess, (req, res) => res.json({ email: req.adminAccessEmail, meta: req.adminRequestMeta }));
    app.use(adminErrorHandler);
    return listen(t, app);
};

const get = async (url, token, extraHeaders = {}) => {
    const headers = { ...extraHeaders };
    if (token) headers['cf-access-jwt-assertion'] = token;
    const res = await fetch(url, { headers });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = null; }
    return { status: res.status, body, headers: res.headers };
};

const setUpKeys = async (t, extraEnv = {}) => {
    const keys = await createAccessKeys();
    t.after(() => keys.close());
    withEnv(t, { ADMIN_TOTP_KEY: TOTP_KEY, ADMIN_ACCESS_MODE: undefined, NODE_ENV: 'test', ...keys.env, ...extraEnv });
    return keys;
};

test('AD-010: Access 표 없음 → 403 ADMIN_ACCESS_REQUIRED (관리자 경로 전부)', async (t) => {
    await setUpKeys(t);
    const base = await startAdmin(t);
    for (const route of ['/auth/me', '/dashboard', '/members']) {
        const res = await get(`${base}/admin-api${route}`);
        assert.equal(res.status, 403, route);
        assert.equal(res.body.code, 'ADMIN_ACCESS_REQUIRED', route);
    }
    const login = await fetch(`${base}/admin-api/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(login.status, 403);
});

test('AD-011: 다른 키 서명·aud 다름·iss 다름·만료·alg none·이메일 없음·깨진 표 → 403', async (t) => {
    const keys = await setUpKeys(t);
    const base = await startAdmin(t);
    const stranger = makeKeyPair(keys.kid);
    const bad = {
        '다른 키': keys.sign({}, { privateKey: stranger.privateKey }),
        'aud 다름': keys.sign({}, { audience: ['other-app'] }),
        'iss 다름': keys.sign({}, { issuer: 'https://evil.cloudflareaccess.com' }),
        '만료': keys.sign({}, { expiresIn: -60 }),
        'alg none': keys.unsigned(),
        '이메일 없음': keys.sign({ email: '' }),
        '모르는 kid': keys.sign({}, { kid: 'nobody' }),
        '깨진 표': 'not.a.token',
    };
    for (const [label, token] of Object.entries(bad)) {
        const res = await get(`${base}/admin-api/auth/me`, token);
        assert.equal(res.status, 403, label);
        assert.equal(res.body.code, 'ADMIN_ACCESS_REQUIRED', label);
    }
});

test('AD-012: 맞는 표 → 문 1 통과(다음은 로그인 확인 401), 이메일이 요청에 실림(소문자)', async (t) => {
    const keys = await setUpKeys(t);
    const base = await startAdmin(t);
    const token = keys.sign({ email: 'Boss@Example.com' });
    const me = await get(`${base}/admin-api/auth/me`, token);
    assert.equal(me.status, 401);
    assert.equal(me.body.code, 'ADMIN_LOGIN_REQUIRED');

    const probe = await startProbe(t);
    const res = await get(`${probe}/probe`, token);
    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'boss@example.com');
    assert.equal(res.body.meta.accessEmail, 'boss@example.com');
    assert.equal(typeof res.body.meta.ip, 'string');
});

test('AD-012: 관리자 응답엔 다른 주소 읽기 허락 머리글(CORS)이 안 붙음', async (t) => {
    const keys = await setUpKeys(t);
    const cors = require('cors');
    const app = express();
    app.use(cors({ origin: 'http://player.test', credentials: true }));
    app.use(cookieParser());
    app.use('/admin-api', require('../../admin'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const base = await listen(t, app);
    const res = await get(`${base}/admin-api/auth/me`, keys.sign(), { origin: 'http://player.test' });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    assert.equal(res.headers.get('access-control-allow-credentials'), null);
});

test('AD-013: 공개키 못 받음 + 보관본 없음 → 503 ADMIN_ACCESS_UNAVAILABLE', async (t) => {
    const keys = await setUpKeys(t, { ADMIN_ACCESS_CERTS_URL: 'http://127.0.0.1:9/never' });
    const probe = await startProbe(t);
    const res = await get(`${probe}/probe`, keys.sign());
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'ADMIN_ACCESS_UNAVAILABLE');
});

test('AD-013: 보관본 있으면 공개키 서버가 죽어도 통과, 1시간 지나면 다시 받음', async (t) => {
    const { createAccessVerifier } = require('../../admin/services/core/accessToken');
    const keys = await createAccessKeys();
    t.after(() => keys.close());
    let nowMs = 1_000_000;
    const verifier = createAccessVerifier({ issuer: ISSUER, aud: AUD, certsUrl: keys.certsUrl, now: () => nowMs });

    const first = await verifier.verify(keys.sign());
    assert.equal(first.email, 'boss@example.com');
    assert.equal(keys.requestCount(), 1);

    await verifier.verify(keys.sign());
    assert.equal(keys.requestCount(), 1, '1시간 안엔 보관본');

    nowMs += 60 * 60 * 1000;
    keys.failNext(1);
    const stale = await verifier.verify(keys.sign());
    assert.equal(stale.email, 'boss@example.com', '다시 받기 실패해도 보관본으로 통과');
    assert.equal(keys.requestCount(), 2);
});

test('AD-013: 모르는 kid 다시 받기는 1분에 한 번까지, 새 열쇠 받으면 통과', async (t) => {
    const { createAccessVerifier } = require('../../admin/services/core/accessToken');
    const keys = await createAccessKeys();
    t.after(() => keys.close());
    let nowMs = 5_000_000;
    const verifier = createAccessVerifier({ issuer: ISSUER, aud: AUD, certsUrl: keys.certsUrl, now: () => nowMs });
    await verifier.verify(keys.sign());
    assert.equal(keys.requestCount(), 1);

    // 클라우드플레어가 열쇠를 돌림: 새 kid
    const rotated = makeKeyPair('test-kid-2');
    keys.setKeys([rotated.jwk]);
    const rotatedToken = keys.sign({}, { privateKey: rotated.privateKey, kid: 'test-kid-2' });

    // 첫 받기 직후(1분 안)라 다시 안 받음 → 403
    await assert.rejects(verifier.verify(rotatedToken), (error) => error.status === 403);
    assert.equal(keys.requestCount(), 1);

    nowMs += 61 * 1000;
    const ok = await verifier.verify(rotatedToken);
    assert.equal(ok.email, 'boss@example.com');
    assert.equal(keys.requestCount(), 2);

    // 또 모르는 kid → 1분 안이라 안 받음
    await assert.rejects(verifier.verify(keys.sign({}, { kid: 'test-kid-3' })), (error) => error.status === 403);
    assert.equal(keys.requestCount(), 2);
});

test('AD-014: 운영에서 MODE=off 무시 → 표 없으면 403', async (t) => {
    await setUpKeys(t, { NODE_ENV: 'production', ADMIN_ACCESS_MODE: 'off' });
    const base = await startAdmin(t);
    const res = await get(`${base}/admin-api/auth/me`);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ADMIN_ACCESS_REQUIRED');
});

test('AD-014: 운영에서 시험용 공개키 주소(CERTS_URL) 무시 → 팀 주소에서 받음', () => {
    const config = require('../../admin/config');
    const env = {
        NODE_ENV: 'production', ADMIN_ACCESS_TEAM_DOMAIN: 'myteam', ADMIN_ACCESS_AUD: 'aud-1',
        ADMIN_ACCESS_CERTS_URL: 'http://127.0.0.1:5555/certs', ADMIN_ACCESS_MODE: 'off',
    };
    const settings = config.accessSettings(env);
    assert.equal(settings.certsUrl, 'https://myteam.cloudflareaccess.com/cdn-cgi/access/certs');
    assert.equal(settings.issuer, 'https://myteam.cloudflareaccess.com');
    assert.equal(config.isAccessOff(env), false);
    // 개발·시험에선 시험용 주소 씀
    assert.equal(config.accessSettings({ ...env, NODE_ENV: 'test' }).certsUrl, 'http://127.0.0.1:5555/certs');
});

test('AD-014: 운영에서 팀·AUD 값 없으면 /admin-api 전체 404', async (t) => {
    withEnv(t, {
        ADMIN_TOTP_KEY: TOTP_KEY, NODE_ENV: 'production', ADMIN_ACCESS_MODE: undefined,
        ADMIN_ACCESS_TEAM_DOMAIN: undefined, ADMIN_ACCESS_AUD: 'aud-1', ADMIN_ACCESS_CERTS_URL: undefined,
    });
    const base = await startAdmin(t);
    for (const route of ['/auth/me', '/dashboard']) {
        const res = await get(`${base}/admin-api${route}`);
        assert.equal(res.status, 404, route);
    }
    process.env.ADMIN_ACCESS_TEAM_DOMAIN = 'myteam';
    process.env.ADMIN_ACCESS_AUD = '';
    assert.equal((await get(`${base}/admin-api/auth/me`)).status, 404);
    // 둘 다 있으면 켜짐 (표 없으니 403)
    process.env.ADMIN_ACCESS_AUD = 'aud-1';
    assert.equal((await get(`${base}/admin-api/auth/me`)).status, 403);
});
