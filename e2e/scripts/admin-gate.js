'use strict';

// 관리자 시험 화면 앞단 파일, 클라우드플레어 Access 흉내(쿠키 있을 때만 서명한 표를 머리글에) + /admin-api를 시험 백엔드로 넘기기 + 공개키 주소
// scripts/serve-front.js admin이 씀 — 시험 전용 열쇠는 켤 때마다 새로 만들어 메모리에만 둠 (운영에선 백엔드가 시험 공개키 주소를 안 읽음)
const crypto = require('node:crypto');
const http = require('node:http');
const { E2E } = require('../helpers/env');

const CERTS_PATH = '/__e2e/access-certs';
const API_PREFIX = '/admin-api';
// 브라우저 쿠키: 이 이메일로 Access를 통과한 것처럼 / 이 IP에서 온 것처럼 (시험끼리 로그인 잠금·요청 수가 안 섞이게)
const ACCESS_COOKIE = 'e2e_access_email';
const CLIENT_IP_COOKIE = 'e2e_client_ip';
const IP_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
// 브라우저가 보낸 것은 버리고 앞단이 새로 붙이는 머리글 (진짜 클라우드플레어·nginx와 같게)
const DROP_HEADERS = new Set(['cf-access-jwt-assertion', 'x-forwarded-for', 'host', 'connection']);

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

// 쿠키 머리글 → { 이름: 값 } (예: 'a=1; e2e_access_email=boss%40x.test' → { a:'1', e2e_access_email:'boss@x.test' })
const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const at = part.indexOf('=');
    const name = at < 0 ? part : part.slice(0, at);
    let value = at < 0 ? '' : part.slice(at + 1);
    try { value = decodeURIComponent(value); } catch { /* 그대로 */ }
    return [name, value];
}));

// 켤 때마다 새 열쇠 + 새 kid (다시 켜면 백엔드가 모르는 kid로 보고 공개키를 다시 받음)
function createAccessSigner({ teamDomain, aud }) {
    const kid = `e2e-${crypto.randomBytes(4).toString('hex')}`;
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
    // RS256 표 만들기 (jsonwebtoken 없이 — e2e 폴더엔 없음), 1시간 유효
    const sign = (email) => {
        const now = Math.floor(Date.now() / 1000);
        const head = `${b64({ alg: 'RS256', typ: 'JWT', kid })}.${b64({ email, iss: `https://${teamDomain}`, aud: [aud], iat: now, exp: now + 3600 })}`;
        const signature = crypto.sign('RSA-SHA256', Buffer.from(head), privateKey).toString('base64url');
        return `${head}.${signature}`;
    };
    return { certs: { keys: [jwk] }, sign };
}

// 백엔드로 넘길 머리글: 브라우저 것 + 앞단이 정하는 IP·Access 표
const forwardHeaders = (req, signer) => {
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) if (!DROP_HEADERS.has(name)) headers[name] = value;
    const cookies = parseCookies(req.headers.cookie);
    const fakeIp = cookies[CLIENT_IP_COOKIE];
    headers['x-forwarded-for'] = IP_PATTERN.test(fakeIp ?? '') ? fakeIp : (req.socket.remoteAddress ?? '127.0.0.1').replace(/^::ffff:/, '');
    const email = (cookies[ACCESS_COOKIE] ?? '').trim();
    if (email) headers['cf-access-jwt-assertion'] = signer.sign(email.toLowerCase());
    return headers;
};

// /admin-api → 시험 백엔드 그대로 (몸·응답 흘려보냄)
const proxyToBackend = (req, res, signer) => {
    const target = new URL(req.url, E2E.apiUrl);
    const upstream = http.request(target, { method: req.method, headers: { ...forwardHeaders(req, signer), host: target.host } }, (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
    });
    upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, code: 'E2E_BACKEND_DOWN', message: '시험 백엔드에 닿지 않음' }));
    });
    req.pipe(upstream);
};

/**
 * 관리자 앞단 처리기: 맡은 주소면 처리하고 true, 아니면 false (정적 파일로 넘김)
 * @returns {(req: http.IncomingMessage, res: http.ServerResponse) => boolean}
 */
function createAdminGate({ teamDomain = E2E.adminAccess.teamDomain, aud = E2E.adminAccess.aud } = {}) {
    const signer = createAccessSigner({ teamDomain, aud });
    return (req, res) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === CERTS_PATH) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(signer.certs));
            return true;
        }
        if (pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)) {
            proxyToBackend(req, res, signer);
            return true;
        }
        return false;
    };
}

module.exports = { createAdminGate, createAccessSigner, parseCookies, ACCESS_COOKIE, CLIENT_IP_COOKIE, CERTS_PATH };
