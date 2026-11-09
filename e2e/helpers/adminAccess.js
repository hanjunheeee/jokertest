'use strict';

// 관리자 문 1(클라우드플레어 Access) 흉내 쿠키 파일, 브라우저에 "이 이메일로 Access 통과" · "이 IP에서 옴" 쿠키를 심음
// 관리자 브라우저 시험이 씀 — 쿠키를 읽고 진짜 서명 표를 붙이는 건 scripts/admin-gate.js (화면 서버 5275)
const crypto = require('node:crypto');
const { E2E } = require('./env');

// admin-gate.js와 같은 이름 (그 파일은 서버 쪽이라 여기서 안 불러옴)
const ACCESS_COOKIE = 'e2e_access_email';
const CLIENT_IP_COOKIE = 'e2e_client_ip';

// 시험마다 다른 가짜 IP (예: '10.83.4.201') → 로그인 잠금(IP 15분 20번)·요청 수(1분 10번)가 시험끼리 안 섞임
const randomClientIp = () => {
    const [a, b, c] = crypto.randomBytes(3);
    return `10.${a}.${b}.${Math.max(1, c % 255)}`;
};

const cookie = (name, value) => ({ name, value: encodeURIComponent(value), url: E2E.adminUrl, httpOnly: true, sameSite: 'Strict' });

/**
 * 가짜 IP 정하기 (한 번 정하면 그 context 동안 그대로), 정한 IP 돌려줌
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} [ip] 안 주면 무작위
 */
async function useClientIp(context, ip) {
    const existing = (await context.cookies(E2E.adminUrl)).find((c) => c.name === CLIENT_IP_COOKIE);
    if (existing && !ip) return decodeURIComponent(existing.value);
    const chosen = ip ?? randomClientIp();
    await context.addCookies([cookie(CLIENT_IP_COOKIE, chosen)]);
    return chosen;
}

/**
 * 이 이메일로 Access를 통과한 브라우저로 (가짜 IP도 같이 정함)
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} email
 */
async function allowAccess(context, email) {
    await context.addCookies([cookie(ACCESS_COOKIE, String(email).trim().toLowerCase())]);
    await useClientIp(context);
}

/** Access 통과 쿠키 지우기 (다음 요청부터 403 화면) */
async function denyAccess(context) {
    await context.clearCookies({ name: ACCESS_COOKIE });
}

module.exports = { allowAccess, denyAccess, useClientIp, randomClientIp, ACCESS_COOKIE, CLIENT_IP_COOKIE };
