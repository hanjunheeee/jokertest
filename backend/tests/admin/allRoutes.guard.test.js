'use strict';

// 관리자 전 경로 막힘 시험 (AD-301), 라우터에서 읽은 경로 전부에 로그인 없음·플레이어 토큰·Access 없음·쓰기 확인 없음을 한 번에 봄
// DB 안 씀: 로그인된 상태는 세션 확인만 가짜로 바꿔 흉내 (쓰기 확인이 영역 처리 앞에서 막는지만 봄)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-all-routes-guard-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const { listAdminRoutes, fillPath, dummyValues } = require('./helpers/adminRoutes');

const TOTP_KEY = 'c'.repeat(64);
const ORIGIN = 'http://admin.test';

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

// index.js와 같은 자리 (IP는 x-forwarded-for로 바꿔 요청 수 제한에 안 걸리게)
const startServer = async (t) => {
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use(cookieParser());
    app.use('/admin-api', require('../../admin'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return url;
};

const randomIp = () => `10.${[0, 0, 0].map(() => crypto.randomInt(1, 255)).join('.')}`;

// 경로 하나 부르기 (쓰기면 빈 몸 {})
const call = async (base, route, headers = {}) => {
    const sent = { origin: ORIGIN, 'x-forwarded-for': randomIp(), ...headers };
    const body = route.isWrite ? '{}' : undefined;
    if (body) sent['content-type'] = 'application/json';
    for (const [name, value] of Object.entries(sent)) if (value === undefined) delete sent[name];
    const res = await fetch(`${base}${fillPath(route, dummyValues())}`, { method: route.method, headers: sent, body });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, code: json?.code ?? null };
};

// 경로마다 돌려서 [상태, 코드] 다른 것만 모음 → 빈 배열이어야 통과 (실패하면 걸린 경로가 한눈에 보임)
const mismatches = async (routes, run, expected) => {
    const wrong = [];
    for (const route of routes) {
        const got = await run(route);
        if (got.status !== expected[0] || got.code !== expected[1]) wrong.push(`${route.key} → ${got.status} ${got.code}`);
    }
    return wrong;
};

const routes = listAdminRoutes();
const areaRoutes = routes.filter((route) => !route.isAuth);
const areaWrites = areaRoutes.filter((route) => route.isWrite);

test('AD-301: 경로 표를 라우터에서 읽음 — 영역 경로·쓰기 경로가 있고 겹침 없음', () => {
    assert.ok(areaRoutes.length >= 40, `영역 경로 ${areaRoutes.length}개`);
    assert.ok(areaWrites.length >= 19, `쓰기 경로 ${areaWrites.length}개`);
    assert.equal(new Set(routes.map((route) => route.key)).size, routes.length);
    assert.ok(routes.some((route) => route.key === 'POST /admin-api/members/:uuid/wallet/adjust'));
    assert.ok(routes.some((route) => route.key === 'PATCH /admin-api/products/:productId'));
});

test('AD-301: 로그인 없음 → 영역 경로 전부 401 ADMIN_LOGIN_REQUIRED', async (t) => {
    withEnv(t, { ADMIN_TOTP_KEY: TOTP_KEY, ADMIN_ORIGIN: ORIGIN, ADMIN_ACCESS_MODE: 'off', NODE_ENV: 'test' });
    const base = await startServer(t);
    assert.deepEqual(await mismatches(areaRoutes, (route) => call(base, route), [401, 'ADMIN_LOGIN_REQUIRED']), []);
});

test('AD-301: 플레이어 토큰(role=ADMIN, 머리글·쿠키 둘 다) → 영역 경로 전부 401', async (t) => {
    withEnv(t, { ADMIN_TOTP_KEY: TOTP_KEY, ADMIN_ORIGIN: ORIGIN, ADMIN_ACCESS_MODE: 'off', NODE_ENV: 'test' });
    const base = await startServer(t);
    const token = jwt.sign({ uuid: crypto.randomUUID(), role: 'ADMIN', sid: 'x' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const headers = { authorization: `Bearer ${token}`, cookie: `accessToken=${token}` };
    assert.deepEqual(await mismatches(areaRoutes, (route) => call(base, route, headers), [401, 'ADMIN_LOGIN_REQUIRED']), []);
});

test('AD-301: Access 표 없음 → 로그인 경로까지 전부 403 ADMIN_ACCESS_REQUIRED', async (t) => {
    withEnv(t, {
        ADMIN_TOTP_KEY: TOTP_KEY, ADMIN_ORIGIN: ORIGIN, ADMIN_ACCESS_MODE: undefined, NODE_ENV: 'test',
        ADMIN_ACCESS_TEAM_DOMAIN: 'myteam', ADMIN_ACCESS_AUD: 'aud-1', ADMIN_ACCESS_CERTS_URL: undefined,
    });
    const base = await startServer(t);
    assert.deepEqual(await mismatches(routes, (route) => call(base, route), [403, 'ADMIN_ACCESS_REQUIRED']), []);
});

test('AD-301: 로그인 됐어도 쓰기 확인 없음·틀림·다른 Origin → 쓰기 경로 전부 403 ADMIN_CSRF_FAILED', async (t) => {
    withEnv(t, { ADMIN_TOTP_KEY: TOTP_KEY, ADMIN_ORIGIN: ORIGIN, ADMIN_ACCESS_MODE: 'off', NODE_ENV: 'test' });
    const session = require('../../admin/services/core/session');
    // 세션 확인만 가짜 (관리자 1번으로 통과), 쓰기 확인은 진짜
    t.mock.method(session, 'resolveSession', async () => ({
        admin: { id: 1, loginId: 'guard', email: 'guard@example.com' }, sessionId: 'guard', idleExpiresAt: new Date(Date.now() + 60_000),
    }));
    const base = await startServer(t);
    const raw = 'guard-session-raw';
    const cookie = `${session.SESSION_COOKIE}=${raw}`;
    const good = session.csrfTokenOf(raw);
    const cases = {
        '머리글 없음': { cookie },
        '다른 세션 값': { cookie, 'x-admin-csrf': session.csrfTokenOf('other-raw') },
        '다른 Origin': { cookie, 'x-admin-csrf': good, origin: 'http://player.test' },
        'Origin 없음': { cookie, 'x-admin-csrf': good, origin: undefined },
    };
    for (const [name, headers] of Object.entries(cases)) {
        const wrong = await mismatches(areaWrites, (route) => call(base, route, headers), [403, 'ADMIN_CSRF_FAILED']);
        assert.deepEqual(wrong, [], name);
    }
});

test('AD-301: 로그인 앞 /auth 쓰기(로그인·로그아웃)는 다른 Origin이면 403', async (t) => {
    withEnv(t, { ADMIN_TOTP_KEY: TOTP_KEY, ADMIN_ORIGIN: ORIGIN, ADMIN_ACCESS_MODE: 'off', NODE_ENV: 'test' });
    const base = await startServer(t);
    const authWrites = routes.filter((route) => route.isAuth && route.isWrite);
    assert.ok(authWrites.length >= 2);
    const headers = { origin: 'http://player.test' };
    assert.deepEqual(await mismatches(authWrites, (route) => call(base, route, headers), [403, 'ADMIN_CSRF_FAILED']), []);
});

// 0-2 부탁: 서버 시작 때 관리자 표 정리 (Node마다 따로 돌아도 지우기만이라 겹쳐도 됨)
test('정리 시작: index.js가 표 준비·Node 묶음 켠 뒤, 포트 열기 전에 관리자 켜짐일 때만 부름', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');
    const gated = 'if (require("./admin").isAdminEnabled()) require("./admin/services/core/cleanup").startAdminCleanup();';
    const at = source.indexOf(gated);
    assert.ok(at > 0, '켜짐 확인 붙은 한 줄 있음');
    assert.equal(source.split('startAdminCleanup').length - 1, 1, '한 번만 부름');
    assert.ok(at > source.indexOf('.then(startCluster)') && at < source.indexOf('server.listen(port'), '표 준비·Node 묶음 뒤, 포트 열기 전');
});

test('정리 시작: 타이머는 unref(서버 끄기 안 막음), 돌려준 함수로 멈춤', (t) => {
    const { startAdminCleanup } = require('../../admin/services/core/cleanup');
    const timer = { unrefed: false, unref() { this.unrefed = true; return this; } };
    const setMock = t.mock.method(globalThis, 'setInterval', () => timer);
    const clearMock = t.mock.method(globalThis, 'clearInterval', () => {});
    const stop = startAdminCleanup();
    assert.equal(setMock.mock.callCount(), 1);
    assert.equal(setMock.mock.calls[0].arguments[1], 6 * 60 * 60 * 1000);
    assert.equal(timer.unrefed, true);
    stop();
    assert.equal(clearMock.mock.calls[0].arguments[0], timer);
});
