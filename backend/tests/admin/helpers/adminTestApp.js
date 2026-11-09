'use strict';

// 관리자 시험 도우미 파일, 시험 DB 준비 + 관리자 계정 만들기 + 로그인까지 된 시험 앱·요청 도구(agent)
// 관리자 서버 통합 시험이 씀: adminTestApp({ accessMode, admin }) → { app, url, agent, csrfToken, admin, close }
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');

const { listenOnFetchablePort } = require('../../helpers/fetchablePort');
const { createAccessKeys } = require('./accessKeys');

const TEST_TOTP_KEY = 'e'.repeat(64);
const TEST_ORIGIN = 'http://admin.test';
const READ_METHODS = new Set(['GET', 'HEAD']);

// ── 시험 DB ──
// 진짜 시험 DB를 처음 모양으로 (표 지우고 마이그레이션 전부) → { sequelize, close } / DB 없으면 null
const prepareAdminDb = async () => {
    const url = process.env.F01_TEST_DATABASE_URL;
    if (!url) return null;
    const { Sequelize } = require('sequelize');
    const migrationRunner = require('../../../db/migrationRunner');
    const { buildManagedSchema, resetManagedSchema } = require('../../helpers/isolatedTestDb');
    const { MIGRATIONS } = require('../../../scripts/migrate-db');
    const schema = buildManagedSchema({
        baseline: require('../../../db/migrations/0001-legacy-baseline'),
        addRefreshTokenHistory: require('../../../db/migrations/0004-add-refresh-token-history'),
        addSocialAuth: require('../../../db/migrations/0005-add-social-auth'),
        migrationRunner,
    });
    const sequelize = new Sequelize(url, { logging: false });
    await sequelize.authenticate();
    await resetManagedSchema(sequelize, url, schema);
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    return {
        sequelize,
        close: async () => {
            await sequelize.close();
            await require('../../../models').sequelize.close();
        },
    };
};

// 시험 동안만 환경값 바꾸기 (빈 값 undefined면 지움), 되돌리는 함수 돌려줌
const setEnv = (values) => {
    const saved = {};
    for (const [key, value] of Object.entries(values)) {
        saved[key] = process.env[key];
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    return () => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    };
};

// ── 관리자 계정 ──
let serial = 0;
const uniqueName = (prefix) => `${prefix}${Date.now().toString(36)}${(serial += 1)}${crypto.randomBytes(2).toString('hex')}`;

// 시험 관리자 만들기 → { id, loginId, email, password, totpSecret }
const createTestAdmin = async ({ loginId, email, password = 'test-password-1234', active = true } = {}) => {
    const accounts = require('../../../admin/scripts/admin-account');
    const name = loginId ?? uniqueName('adm');
    const made = await accounts.createAdminAccount({ loginId: name, email: email ?? `${name}@example.com`, password });
    if (!active) await accounts.setAdminActive({ loginId: name, active: false });
    return { id: made.id, loginId: name, email: made.email, password, totpSecret: made.totpSecret };
};

const otpNow = (secret, nowMs = Date.now()) => require('../../../admin/services/core/totp').codeAt(secret, nowMs);

// ── 요청 도구 ──
// 쿠키 보관 + Origin·IP·Access 표·CSRF 머리글 자동, headers에 undefined 넣으면 그 머리글 뺌
const createAgent = ({ url, origin = TEST_ORIGIN, ip, accessToken = null }) => {
    const jar = new Map();
    const agent = { url, ip, accessToken, csrfToken: null, jar };

    const keepCookies = (res) => {
        for (const line of res.headers.getSetCookie()) {
            const [pair] = line.split(';');
            const at = pair.indexOf('=');
            const name = pair.slice(0, at).trim();
            const value = pair.slice(at + 1).trim();
            const cleared = !value || /max-age=0/i.test(line) || /expires=thu, 01 jan 1970/i.test(line);
            if (cleared) jar.delete(name); else jar.set(name, value);
        }
    };

    agent.request = async (method, path, { body, headers = {} } = {}) => {
        const sent = { origin, 'x-forwarded-for': agent.ip };
        if (agent.accessToken) sent['cf-access-jwt-assertion'] = agent.accessToken;
        if (jar.size > 0) sent.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
        if (body !== undefined) sent['content-type'] = 'application/json';
        if (agent.csrfToken && !READ_METHODS.has(method)) sent['x-admin-csrf'] = agent.csrfToken;
        for (const [name, value] of Object.entries(headers)) {
            if (value === undefined) delete sent[name.toLowerCase()]; else sent[name.toLowerCase()] = value;
        }
        const res = await fetch(`${url}${path}`, { method, headers: sent, body: body === undefined ? undefined : JSON.stringify(body) });
        keepCookies(res);
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { json = null; }
        return { status: res.status, body: json, headers: res.headers, setCookies: res.headers.getSetCookie() };
    };
    agent.get = (path, options) => agent.request('GET', path, options);
    agent.post = (path, body, options) => agent.request('POST', path, { ...options, body });
    agent.login = async (account, { otp } = {}) => {
        const res = await agent.post('/admin-api/auth/login', {
            loginId: account.loginId, password: account.password, otp: otp ?? otpNow(account.totpSecret),
        });
        if (res.status === 200) agent.csrfToken = res.body.csrfToken;
        return res;
    };
    return agent;
};

const randomIp = () => `10.${[0, 0, 0].map(() => crypto.randomInt(1, 255)).join('.')}`;

// 관리자 라우터를 index.js와 같은 자리에 붙인 시험 서버 → { app, url, close }
// trust proxy true → x-forwarded-for로 시험마다 IP 바꿈
const startAdminServer = async () => {
    const { notFoundHandler, globalErrorHandler } = require('../../../middlewares/errorHandler.middleware');
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use(cookieParser());
    app.use('/admin-api', require('../../../admin'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    return { app, url, close: () => new Promise((resolve) => server.close(resolve)) };
};

// 로그인까지 된 시험 앱 (DB는 prepareAdminDb로 먼저 준비)
// accessMode 'off' = 문 1 끔 / 'required' = 시험 공개키 서버 + 관리자 이메일로 서명한 표를 늘 붙임
const adminTestApp = async ({ accessMode = 'off', admin = {}, t } = {}) => {
    const keys = accessMode === 'required' ? await createAccessKeys() : null;
    const restoreEnv = setEnv({
        ADMIN_TOTP_KEY: process.env.ADMIN_TOTP_KEY || TEST_TOTP_KEY,
        ADMIN_ORIGIN: TEST_ORIGIN,
        ADMIN_ACCESS_MODE: accessMode === 'off' ? 'off' : undefined,
        ...(keys ? keys.env : {}),
    });
    const server = await startAdminServer();
    const account = await createTestAdmin(admin);
    const agent = createAgent({ url: server.url, ip: randomIp(), accessToken: keys ? keys.sign({ email: account.email }) : null });
    const res = await agent.login(account);
    if (res.status !== 200) throw new Error(`시험 관리자 로그인 실패 ${res.status} ${res.body?.code}`);
    const close = async () => {
        await server.close();
        if (keys) await keys.close();
        restoreEnv();
    };
    if (t) t.after(close);
    return { app: server.app, url: server.url, agent, csrfToken: agent.csrfToken, admin: account, keys, close };
};

module.exports = {
    TEST_TOTP_KEY,
    TEST_ORIGIN,
    prepareAdminDb,
    setEnv,
    createTestAdmin,
    otpNow,
    createAgent,
    randomIp,
    startAdminServer,
    adminTestApp,
};
