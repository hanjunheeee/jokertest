'use strict';

// 보안 시험 도우미: 실제 index.js와 같은 앞단(보안 헤더·본문 검사·오류 처리기) + /auth 라우터 서버 띄우기, 요청 보내기
// security-*.test.js가 씀, DB 안 씀 (가짜 저장소), 메일은 메모리 발송기, 라우터는 부를 때마다 새로 불러 카운터 새로 받음
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');

const mailAdapter = require('../../utils/adapters/mail');
const economyService = require('../../services/economy');
const { securityHeaders } = require('../../middlewares/securityHeaders.middleware');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const { useAuthStore, swap } = require('./authFakes');

const ROUTE_PATH = require.resolve('../../routes/auth.routes');
const SECRET = 'security-http-hmac-secret-0123456789';

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

// 서버 열고 닫기 등록, 500 로그는 조용히
const listen = async (t, app) => {
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const quietError = console.error;
    console.error = () => {};
    t.after(() => { console.error = quietError; });
    return url;
};

// 앞단: index.js와 같은 순서 (보안 헤더 → 본문 읽기·검사 → 쿠키)
const applyFrontMiddlewares = (app) => {
    const { bodyGuards } = require('../../middlewares/bodyGuard.middleware');
    app.set('trust proxy', 1);
    app.use(securityHeaders);
    for (const middleware of bodyGuards()) app.use(middleware);
    app.use(cookieParser());
};

// /auth 라우터 서버 (가짜 저장소·메모리 메일)
const startAuthServer = async (t, env = {}) => {
    withEnv(t, { SIGNUP_EMAIL_HMAC_SECRET: SECRET, PASSWORD_RESET_APP_URL: 'https://play.example.com', ...env });
    require('../helpers/termsStub').passSignupTerms(t);
    const store = useAuthStore(t);
    const mail = mailAdapter.createMemoryMailAdapter();
    swap(t, mailAdapter, 'createHttpMailAdapter', () => mail);
    swap(t, economyService, 'ensureDefaultEntitlements', async () => ({}));
    delete require.cache[ROUTE_PATH];
    const router = require(ROUTE_PATH);
    const app = express();
    applyFrontMiddlewares(app);
    app.use('/auth', router);
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    return { base: await listen(t, app), store, mail };
};

// 라우터 하나만 붙인 서버 (경로 묶음 이름과 라우터를 받음)
const startRouterServer = async (t, mounts) => {
    const app = express();
    applyFrontMiddlewares(app);
    for (const [path, router] of mounts) app.use(path, router);
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    return listen(t, app);
};

// 요청 하나 (본문 있으면 JSON, raw 주면 그 글자 그대로)
const send = (base, method, path, { body, raw, cookie, headers = {} } = {}) => fetch(`${base}${path}`, {
    method,
    headers: {
        ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        Connection: 'close',
        ...headers,
    },
    body: raw !== undefined ? raw : (body !== undefined ? JSON.stringify(body) : undefined),
    redirect: 'manual',
});

// 상태·본문·헤더 (본문이 JSON 아니면 글자 그대로)
const json = async (res) => {
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body, headers: res.headers, text };
};

module.exports = { withEnv, startAuthServer, startRouterServer, applyFrontMiddlewares, send, json, listen };
