'use strict';

// 관리자 틀 시험 (AD-003·004·007), /admin-api 꺼짐·빈 자리 막힘·오류 모양
// DB 안 씀, 작은 express 앱에 관리자 라우터만 붙여 봄 + index.js가 두 경로를 붙였는지 글로 확인
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');

const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const { createError } = require('../../utils/appError');

const TOTP_KEY = 'a'.repeat(64);

// 시험 동안만 환경값 바꾸기
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

// index.js와 같은 자리: /admin-api 뒤에 없는 경로 404 → 마지막 오류 처리
const startServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use('/admin-api', require('../../admin'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return url;
};

const call = async (base, method, route, body) => {
    const res = await fetch(`${base}${route}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, body: json, text, cacheControl: res.headers.get('cache-control') };
};

// 경계.md 0-1 붙이는 자리 표 그대로 (영역마다 읽기 하나·쓰기 하나)
const AREA_PATHS = [
    '/dashboard', '/members', '/members/00000000-0000-4000-8000-000000000001',
    '/members/00000000-0000-4000-8000-000000000001/bans', '/members/00000000-0000-4000-8000-000000000001/wallet',
    '/announcements', '/audit-logs', '/admins', '/reports', '/maintenance', '/banned-words', '/payments',
    '/products', '/coupons', '/stats', '/games', '/terms', '/live', '/inquiries', '/auth/me', '/auth/login', '/nothing-here',
];

test('AD-003: ADMIN_TOTP_KEY 없으면 /admin-api 전부 404 (없는 경로와 같은 모양)', async (t) => {
    withEnv(t, { ADMIN_TOTP_KEY: undefined, ADMIN_ACCESS_MODE: 'off', NODE_ENV: 'test' });
    const base = await startServer(t);
    for (const route of ['/auth/me', '/dashboard', '/members']) {
        const res = await call(base, 'GET', `/admin-api${route}`);
        assert.equal(res.status, 404, route);
        assert.notEqual(res.body?.code, 'ADMIN_LOGIN_REQUIRED');
    }
    const post = await call(base, 'POST', '/admin-api/auth/login', { loginId: 'a' });
    assert.equal(post.status, 404);
});

test('AD-003: ADMIN_TOTP_KEY 있으면 로그인 전 401 ADMIN_LOGIN_REQUIRED + no-store', async (t) => {
    withEnv(t, { ADMIN_TOTP_KEY: TOTP_KEY, ADMIN_ACCESS_MODE: 'off', NODE_ENV: 'test' });
    const base = await startServer(t);
    const res = await call(base, 'GET', '/admin-api/dashboard');
    assert.equal(res.status, 401);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, 'ADMIN_LOGIN_REQUIRED');
    assert.equal(typeof res.body.message, 'string');
    assert.equal(res.cacheControl, 'no-store');
});

test('AD-004: 영역 빈 라우터 전부 로그인 없이 막힘 (읽기·쓰기·없는 경로 모두 401)', async (t) => {
    withEnv(t, { ADMIN_TOTP_KEY: TOTP_KEY, ADMIN_ACCESS_MODE: 'off', NODE_ENV: 'test' });
    const base = await startServer(t);
    for (const route of AREA_PATHS) {
        for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
            // 로그인 자체는 로그인 전에 열려 있어야 함 (0-2가 채움, 막힘은 auth.integration·access 시험이 봄)
            if (method === 'POST' && route === '/auth/login') continue;
            const res = await call(base, method, `/admin-api${route}`, method === 'GET' || method === 'DELETE' ? undefined : {});
            assert.equal(res.status, 401, `${method} ${route}`);
            assert.equal(res.body.code, 'ADMIN_LOGIN_REQUIRED', `${method} ${route}`);
        }
    }
});

test('AD-004: Access 확인 빈 자리는 기본(required)이면 403, 운영이면 off 값도 무시', async (t) => {
    // 팀·AUD 값: 운영에선 없으면 관리자 페이지가 아예 꺼짐(404, AD-014) → 켜진 채로 off 무시를 보려고 넣음
    withEnv(t, {
        ADMIN_TOTP_KEY: TOTP_KEY, ADMIN_ACCESS_MODE: undefined, NODE_ENV: 'test',
        ADMIN_ACCESS_TEAM_DOMAIN: 'myteam', ADMIN_ACCESS_AUD: 'aud-1', ADMIN_ACCESS_CERTS_URL: undefined,
    });
    const base = await startServer(t);
    const blocked = await call(base, 'GET', '/admin-api/members');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'ADMIN_ACCESS_REQUIRED');

    process.env.NODE_ENV = 'production';
    process.env.ADMIN_ACCESS_MODE = 'off';
    const prod = await call(base, 'GET', '/admin-api/auth/me');
    assert.equal(prod.status, 403);
    assert.equal(prod.body.code, 'ADMIN_ACCESS_REQUIRED');
});

test('AD-004: 붙이는 자리 표 = admin/routes 파일 전부, 경로는 경계.md 그대로', () => {
    const { MOUNTS } = require('../../admin');
    const routeFiles = fs.readdirSync(path.join(__dirname, '../../admin/routes')).map((f) => f.replace('.routes.js', '')).sort();
    const mountedFiles = [...new Set(MOUNTS.map((m) => m.file))].sort();
    assert.deepEqual(mountedFiles, routeFiles);
    assert.deepEqual(MOUNTS.map((m) => m.path).sort(), [
        '/admins', '/announcements', '/audit-logs', '/auth', '/banned-words', '/coupons', '/dashboard', '/games',
        '/inquiries', '/live', '/maintenance', '/members', '/members/:uuid', '/members/:uuid/wallet', '/payments',
        '/products', '/reports', '/stats', '/terms',
    ].sort());
    assert.equal(routeFiles.length, 18);
});

test('AD-004: index.js가 /admin-api·/inquiries를 오류 처리기 앞에 붙임', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');
    const adminAt = source.indexOf('app.use("/admin-api", require("./admin"))');
    const inquiryAt = source.indexOf('app.use("/inquiries", require("./routes/inquiry.routes"))');
    const notFoundAt = source.indexOf('app.use(notFoundHandler)');
    assert.ok(adminAt > 0 && inquiryAt > 0, '두 줄 있음');
    assert.ok(adminAt < notFoundAt && inquiryAt < notFoundAt, '404 처리기 앞');
});

// 오류 처리기만 따로 (res 흉내)
const fakeRes = () => ({
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set(key, value) { this.headers[key] = value; return this; },
});

test('AD-007: 정한 오류는 { ok:false, code, message } + 덧붙인 칸 그대로', () => {
    const { adminErrorHandler } = require('../../admin/middlewares/adminError.middleware');
    const error = createError('이미 정지 중이에요.', 409, 'ALREADY_BANNED');
    error.details = { banId: 7 };
    const res = fakeRes();
    adminErrorHandler(error, {}, res, assert.fail);
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { ok: false, code: 'ALREADY_BANNED', message: '이미 정지 중이에요.', banId: 7 });
});

test('AD-007: 모르는 오류·500 오류는 500 ADMIN_INTERNAL, 속 문구 숨김', (t) => {
    const { adminErrorHandler } = require('../../admin/middlewares/adminError.middleware');
    t.mock.method(console, 'error', () => {});
    for (const error of [new Error('SELECT secret FROM admin_users'), createError('db 비번 틀림', 500, 'DB_DOWN'), 'raw string']) {
        const res = fakeRes();
        adminErrorHandler(error, {}, res, assert.fail);
        assert.equal(res.statusCode, 500);
        assert.equal(res.body.ok, false);
        assert.equal(res.body.code, 'ADMIN_INTERNAL');
        assert.doesNotMatch(JSON.stringify(res.body), /secret|비번|raw string/);
        assert.deepEqual(Object.keys(res.body).sort(), ['code', 'message', 'ok']);
    }
});

test('AD-007: 덧붙인 칸이 ok·code·message를 못 덮음', () => {
    const { adminErrorHandler } = require('../../admin/middlewares/adminError.middleware');
    const error = createError('잘못된 값이에요.', 400, 'INVALID_INPUT');
    error.details = { field: 'reason', ok: true, code: 'X', message: 'Y' };
    const res = fakeRes();
    adminErrorHandler(error, {}, res, assert.fail);
    assert.deepEqual(res.body, { ok: false, code: 'INVALID_INPUT', message: '잘못된 값이에요.', field: 'reason' });
});
