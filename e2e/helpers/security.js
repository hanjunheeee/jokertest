'use strict';

// 보안 시험 도우미 파일, XSS 실행 잡기(콘솔·대화상자·표식 함수) · 응답 헤더·쿠키 읽기 · 소켓 직접 열기(다른 Origin 포함, Node 이동 약속 따름)
// tests/security/*.spec.js가 씀 (근거 항목은 docs/보안_점검_2026-11-09.md)
const path = require('node:path');
const { BACKEND_DIR, E2E } = require('./env');
const { io } = require(path.join(BACKEND_DIR, 'node_modules', 'socket.io-client'));

// Node 여러 개 이동 약속 (계획 4-5, 화면 shared/constants/connectionSocket.js와 같은 값)
// WRONG_NODE 접속 거절은 data.node로 다시 붙음(3번까지, 넘으면 아무 Node로 한 번 더) · ROOM_ON_OTHER_NODE 답은 옮긴 뒤 한 번만 다시
const NODE_BOUNCE_LIMIT = 3;
const NODE_MOVE_TIMEOUT_MS = 10000;
const isNodeId = (node) => typeof node === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(node);

/** 다음 접속이 갈 Node (?node=) 바꾸기, 같은 소켓 그대로 (socket.io는 접속 때마다 io.opts.query를 읽음) */
function pointSocketAtNode(socket, node) {
    const opts = socket.io.opts;
    if (!opts.query || typeof opts.query !== 'object') opts.query = {};
    if (isNodeId(node)) opts.query.node = node;
    else delete opts.query.node;
}

/** 소켓을 node로 옮겨 다시 붙음 (끊고 다시 붙기), 붙으면 true, 시간 초과면 false */
function moveSocketToNode(socket, node, timeoutMs = NODE_MOVE_TIMEOUT_MS) {
    if (!isNodeId(node)) return Promise.resolve(false);
    return new Promise((resolve) => {
        const finish = (ok) => { clearTimeout(timer); socket.off('connect', onConnect); resolve(ok); };
        const onConnect = () => finish(true);
        const timer = setTimeout(() => finish(false), timeoutMs);
        socket.on('connect', onConnect);
        pointSocketAtNode(socket, node);
        socket.disconnect();
        socket.connect();
    });
}

/**
 * XSS 덫 놓기 (page.goto 전에 부름): 실행되면 window.__xssHit(표식)이 불려 기록됨 + alert·confirm·prompt 대화상자도 기록
 * 넣을 글은 xssPayloads(표식)로 만들기. 끝에 assertNoXss(trap)로 확인
 * 주의: 대화상자를 여기서 다 닫으므로, 화면 alert 문구를 볼 시험은 trap.dialogs를 읽기
 * @returns {Promise<{ hits: string[], dialogs: string[] }>}
 */
async function trapXss(page) {
    const trap = { hits: [], dialogs: [] };
    await page.exposeFunction('__xssReport', (marker) => { trap.hits.push(String(marker)); }).catch(() => {});
    await page.addInitScript(() => {
        window.__xssHit = (marker) => { try { window.__xssReport(String(marker)); } catch { /* 없음 */ } };
    });
    page.on('dialog', async (dialog) => {
        trap.dialogs.push(`${dialog.type()}:${dialog.message()}`);
        await dialog.dismiss().catch(() => {});
    });
    page.on('console', (msg) => {
        if (msg.text().includes('__XSS_FIRED__')) trap.hits.push(`console:${msg.text()}`);
    });
    return trap;
}

/**
 * 흔한 XSS 넣을 글 목록 (전부 실행되면 __xssHit(표식) 또는 alert를 부름)
 * @param {string} marker 이 시험만의 표식 (기록에 남음)
 */
function xssPayloads(marker = 'x') {
    // 표식은 늘 XSS- 로 시작 (화면이 원래 띄우는 alert와 구별)
    marker = `XSS-${marker}`;
    const call = `window.__xssHit&&window.__xssHit('${marker}')`;
    return [
        `<img src=x onerror="${call}">`,
        `<svg onload="${call}">`,
        `<script>${call}</script>`,
        `"><img src=x onerror=${call}>`,
        `<a href="javascript:${call}">눌러</a>`,
        `<iframe srcdoc="<script>parent.${call}</script>"></iframe>`,
        `{{constructor.constructor('${call}')()}}`,
        `<details open ontoggle="${call}">`,
        `<img src=x onerror=alert('${marker}')>`,
    ];
}

/** 덫에 걸린 게 없어야 함 (있으면 던짐) — 화면이 원래 띄우는 alert(로그인 실패 등)는 XSS- 표식이 없어 안 셈 */
function assertNoXss(trap) {
    const xssDialogs = trap.dialogs.filter((d) => d.includes('XSS-'));
    if (trap.hits.length > 0 || xssDialogs.length > 0) {
        throw new Error(`XSS 실행됨: hits=${JSON.stringify(trap.hits)} dialogs=${JSON.stringify(xssDialogs)}`);
    }
}

/**
 * 응답 헤더 읽기 (fetch, 리다이렉트 안 따라감)
 * @returns {Promise<{ status:number, headers:Record<string,string>, setCookies:string[], body:string }>}
 */
async function readResponse(url, init = {}) {
    const res = await fetch(url, { redirect: 'manual', ...init });
    const headers = Object.fromEntries(res.headers.entries());
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    return { status: res.status, headers, setCookies, body: await res.text() };
}

/**
 * Set-Cookie 한 줄 → { name, httpOnly, secure, sameSite, path, maxAge, expires } (값은 안 돌려줌)
 */
function parseSetCookie(line) {
    const [pair, ...attrs] = line.split(';').map((s) => s.trim());
    const name = pair.split('=')[0];
    const out = { name, httpOnly: false, secure: false, sameSite: null, path: null, maxAge: null, expires: null };
    for (const attr of attrs) {
        const [k, v] = attr.split('=');
        const key = k.toLowerCase();
        if (key === 'httponly') out.httpOnly = true;
        else if (key === 'secure') out.secure = true;
        else if (key === 'samesite') out.sameSite = v;
        else if (key === 'path') out.path = v;
        else if (key === 'max-age') out.maxAge = Number(v);
        else if (key === 'expires') out.expires = v;
    }
    return out;
}

/** 브라우저 context의 쿠키 속성 (값은 길이만) */
async function cookieAttributes(context, url = E2E.apiUrl) {
    return (await context.cookies(url)).map((c) => ({
        name: c.name, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite, domain: c.domain, path: c.path, expires: c.expires, valueLength: c.value.length,
    }));
}

/**
 * API로 로그인해 accessToken 쿠키 줄만 받기 (소켓 직접 열기용) — 값은 화면에 찍지 말 것
 * @returns {Promise<{ cookie: string|null, status: number, body: any }>}
 */
async function loginCookie(account, apiUrl = E2E.apiUrl, headers = {}) {
    const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ email: account.email, password: account.password }),
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const access = setCookies.map((l) => l.split(';')[0]).find((p) => p.startsWith('accessToken='));
    let body = null;
    try { body = await res.json(); } catch { /* 글자 */ }
    return { cookie: access ?? null, status: res.status, body };
}

/**
 * 소켓 직접 열기 (화면 없이), Origin을 마음대로 (다른 사이트에서 연 척)
 * @param {object} o
 * @param {string|null} [o.cookie] 'accessToken=...' (없으면 비로그인)
 * @param {string|null} [o.origin] Origin 머리 (null이면 안 붙임)
 * @param {string} [o.url] 기본 시험 백엔드
 * @param {string|null} [o.node] 처음부터 갈 Node (?node=), 없으면 아무 Node
 * @returns {Promise<{ socket: import('socket.io-client').Socket|null, connected: boolean, error: string|null, events: {event:string,payload:any}[], emitAck:(event:string,payload?:any,timeoutMs?:number)=>Promise<any>, moveToNode:(node:string)=>Promise<boolean>, close:()=>void }>}
 */
function openRawSocket({ cookie = null, origin = E2E.desktopUrl, url = E2E.apiUrl, timeoutMs = 8000, node = null } = {}) {
    return new Promise((resolve) => {
        const extraHeaders = {};
        if (cookie) extraHeaders.cookie = cookie;
        if (origin) extraHeaders.origin = origin;
        const query = isNodeId(node) ? { query: { node } } : {};
        const socket = io(url, { transports: ['websocket'], extraHeaders, reconnection: false, timeout: timeoutMs, ...query });
        const events = [];
        socket.onAny((event, payload) => events.push({ event, payload }));
        // 답 받는 요청, 다른 Node 방이라는 답이면 옮긴 뒤 한 번만 다시
        const ackOnce = (event, payload, ms) => socket.timeout(ms).emitWithAck(event, payload).catch((e) => ({ timeout: true, error: String(e?.message ?? e) }));
        const api = {
            socket,
            events,
            emitAck: async (event, payload, ms = 5000) => {
                const reply = await ackOnce(event, payload, ms);
                const owner = reply?.code === 'ROOM_ON_OTHER_NODE' ? reply.node : null;
                if (owner && await moveSocketToNode(socket, owner)) return ackOnce(event, payload, ms);
                return reply;
            },
            moveToNode: (target) => moveSocketToNode(socket, target),
            close: () => socket.close(),
        };
        let settled = false;
        let bounces = 0;
        socket.once('connect', () => { settled = true; resolve({ ...api, connected: true, error: null }); });
        socket.on('connect_error', (err) => {
            // WRONG_NODE면 알려 준 Node로 (미들웨어 거절 뒤엔 socket.io가 스스로 안 붙음)
            if (err?.message === 'WRONG_NODE' && bounces <= NODE_BOUNCE_LIMIT) {
                bounces += 1;
                pointSocketAtNode(socket, bounces <= NODE_BOUNCE_LIMIT ? err?.data?.node : null);
                socket.connect();
                return;
            }
            if (settled) return;
            settled = true;
            socket.close();
            resolve({ ...api, connected: false, error: String(err?.message ?? err) });
        });
    });
}

module.exports = { trapXss, xssPayloads, assertNoXss, readResponse, parseSetCookie, cookieAttributes, loginCookie, openRawSocket };
