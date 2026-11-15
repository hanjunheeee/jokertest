'use strict';

// A11a 요청 시험 작은 도우미: /auth 경로만 붙인 서버를 시험마다 새로 띄움 (요청 수 세기도 새로), IP 바꿔 보내기
// a11a-auth-input·a11a-auth-limit·a11a-token-check 시험이 씀 (시험 파일 아님, 공용 도우미는 안 고침)
const express = require('express');

const { applyFrontMiddlewares, listen, send, json, withEnv } = require('../audit-2026-11-09/securityHttp');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');

const ROUTE_PATH = require.resolve('../../routes/auth.routes');

// 시험 전용 비밀 값 (진짜 값 아님), 환경값에 없을 때만 넣음
const ensureTestSecrets = () => {
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a11a-auth-test-only-jwt-secret';
    if (!process.env.SIGNUP_EMAIL_HMAC_SECRET) process.env.SIGNUP_EMAIL_HMAC_SECRET = 'a11a-auth-test-only-hmac-secret';
};

// 경로 파일을 다시 불러 요청 수 세기를 새로 받음 (env는 불러올 때 읽으므로 먼저 넣음)
const startAuthApp = async (t, env = {}) => {
    ensureTestSecrets();
    withEnv(t, env);
    delete require.cache[ROUTE_PATH];
    const router = require(ROUTE_PATH);
    const app = express();
    applyFrontMiddlewares(app);
    app.use('/auth', router);
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    return listen(t, app);
};

// 시험마다 다른 IP (요청 수 세기가 IP별이라 시험끼리 안 섞임)
let ipSeq = 0;
const nextIp = () => {
    ipSeq += 1;
    return `10.11.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
};

// 요청 하나 → { status, body, headers, text } (IP는 믿는 프록시가 붙인 머리말로)
const request = async (base, method, path, { ip, ...options } = {}) => {
    const headers = { ...(options.headers ?? {}), ...(ip ? { 'x-forwarded-for': ip } : {}) };
    return json(await send(base, method, path, { ...options, headers }));
};

// Set-Cookie 줄을 이름별로 → { accessToken: { value, attrs } } (attrs 이름은 소문자)
const cookiesOf = (headers) => {
    const result = {};
    for (const line of headers.getSetCookie()) {
        const [pair, ...rest] = line.split(';').map((part) => part.trim());
        const at = pair.indexOf('=');
        const attrs = {};
        for (const item of rest) {
            const eq = item.indexOf('=');
            if (eq === -1) attrs[item.toLowerCase()] = true;
            else attrs[item.slice(0, eq).toLowerCase()] = item.slice(eq + 1);
        }
        result[pair.slice(0, at)] = { value: pair.slice(at + 1), attrs };
    }
    return result;
};

// 지우는 쿠키인지 (값 비고 끝 시각이 1970년)
const isCleared = (cookie) => Boolean(cookie) && cookie.value === ''
    && typeof cookie.attrs.expires === 'string' && new Date(cookie.attrs.expires).getTime() <= 0;

module.exports = { ensureTestSecrets, startAuthApp, nextIp, request, cookiesOf, isCleared };
