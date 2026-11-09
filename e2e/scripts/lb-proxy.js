#!/usr/bin/env node
'use strict';

// e2e 앞단 파일, E2E_NODES=2일 때 4100에서 받아 Node(4101·4102)로 넘김 — 운영 nginx 규칙과 같게 ?node=<SERVER_ID>면 그 Node
// scripts/start-backend.js가 켬 (혼자도: node scripts/lb-proxy.js), E2E_PROXY=nginx면 docker nginx(lb-nginx.js)로, 패키지 없이 node 기본 모듈만
const http = require('node:http');
const net = require('node:net');
const { E2E } = require('../helpers/env');

// nginx max_fails=1 fail_timeout=5s 와 같음: 붙기 실패한 Node는 5초 동안 뒤로
const FAIL_TIMEOUT_MS = 5000;
// 요청 본문은 다시 보내려고 모아 둠 (e2e 요청은 작음), 넘으면 413
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Node 고르기: ?node=가 아는 Node면 그 Node 먼저·나머지는 backup, 모르거나 없으면 아무 Node(rr 번갈아·least 덜 바쁜)
 * 살아 있는 Node 먼저, 다 죽었다고 표시돼 있으면 그래도 순서대로 해 봄 (nginx도 마지막엔 다시 해 봄)
 * @param {{ nodes:{id:string,port:number}[], lb?:'rr'|'least', now?:()=>number }} o
 */
function createPicker({ nodes, lb = 'rr', now = Date.now }) {
    const state = nodes.map((n) => ({ ...n, active: 0, downUntil: 0 }));
    let turn = 0;
    const alive = (n) => n.downUntil <= now();
    const anyOrder = () => {
        if (lb === 'least') return [...state].sort((a, b) => a.active - b.active);
        const start = turn % state.length;
        turn += 1;
        return [...state.slice(start), ...state.slice(0, start)];
    };
    return {
        state,
        /** 해 볼 순서 [node...] */
        candidates(url) {
            let wanted = null;
            try { wanted = new URL(url, 'http://x').searchParams.get('node'); } catch { /* 이상한 주소 → 아무 Node */ }
            const owner = state.find((n) => n.id === wanted);
            const order = owner ? [owner, ...state.filter((n) => n !== owner)] : anyOrder();
            return [...order.filter(alive), ...order.filter((n) => !alive(n))];
        },
        markDown(node) { node.downUntil = now() + FAIL_TIMEOUT_MS; },
        markUp(node) { node.downUntil = 0; },
    };
}

// 백엔드로 넘길 머리말: X-Forwarded-For는 바로 붙은 주소 하나만 (nginx $remote_addr과 같음 → 백엔드 trust proxy 1이 이 값을 읽음)
function forwardHeaders(req) {
    const headers = { ...req.headers };
    const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    headers['x-forwarded-for'] = ip;
    headers['x-forwarded-proto'] = 'http';
    return headers;
}

// 붙기 실패(아직 아무것도 못 보냄)면 다음 Node로 다시 해 봐도 됨
const isConnectError = (error) => ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ETIMEDOUT'].includes(error?.code);

// HTTP 요청 하나: 본문 모은 뒤 순서대로 해 봄
function handleRequest(picker, agent, req, res) {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= MAX_BODY_BYTES) chunks.push(c); });
    req.on('end', () => {
        if (size > MAX_BODY_BYTES) { res.writeHead(413).end(); return; }
        const body = Buffer.concat(chunks);
        const order = picker.candidates(req.url);
        const attempt = (i, reusedRetry = false) => {
            const node = order[i];
            if (!node) { if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' }); res.end('no live upstreams'); return; }
            node.active += 1;
            const up = http.request({ host: '127.0.0.1', port: node.port, method: req.method, path: req.url, headers: forwardHeaders(req), agent }, (upRes) => {
                picker.markUp(node);
                res.writeHead(upRes.statusCode, upRes.statusMessage, upRes.rawHeaders);
                upRes.pipe(res);
                upRes.on('end', () => { node.active -= 1; });
                upRes.on('error', () => { node.active -= 1; res.destroy(); });
            });
            up.on('error', (error) => {
                node.active -= 1;
                if (res.headersSent) { res.destroy(); return; }
                // 오래 쉰 keep-alive 연결이 끊긴 것: 같은 Node에 한 번 더 (죽음 표시 안 함)
                if (up.reusedSocket && error.code === 'ECONNRESET' && !reusedRetry) { attempt(i, true); return; }
                if (!isConnectError(error)) { res.writeHead(502).end(); return; }
                picker.markDown(node);
                attempt(i + 1);
            });
            up.end(body);
        };
        attempt(0);
    });
}

// 웹소켓 업그레이드: 받은 요청 머리를 그대로 다시 써서 Node에 TCP로 붙이고 양쪽을 이음
function handleUpgrade(picker, req, socket, head) {
    const order = picker.candidates(req.url);
    socket.on('error', () => { /* 화면 쪽 끊김 */ });
    const attempt = (i) => {
        const node = order[i];
        if (!node) { socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); return; }
        const up = net.connect(node.port, '127.0.0.1');
        let connected = false;
        up.once('connect', () => {
            connected = true;
            node.active += 1;
            picker.markUp(node);
            const headers = forwardHeaders(req);
            const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`, ...Object.entries(headers).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => `${k}: ${x}`))];
            up.write(`${lines.join('\r\n')}\r\n\r\n`);
            if (head?.length) up.write(head);
            up.pipe(socket);
            socket.pipe(up);
        });
        // 한쪽이 끝나면 양쪽 다 닫음 (http 서버 소켓은 반쯤 닫힌 채 남을 수 있어서 end에서도)
        up.on('close', () => { if (connected) node.active -= 1; socket.destroy(); });
        up.on('end', () => socket.destroy());
        socket.on('close', () => up.destroy());
        socket.on('end', () => up.destroy());
        up.on('error', (error) => {
            if (connected) return;
            if (isConnectError(error)) picker.markDown(node);
            attempt(i + 1);
        });
    };
    attempt(0);
}

/**
 * node 앞단 켜기
 * @returns {Promise<{ close:()=>Promise<void>, picker:object, port:number }>}
 */
function startNodeProxy({ port = E2E.backendPort, nodes = E2E.nodes, lb = E2E.lb } = {}) {
    const picker = createPicker({ nodes, lb });
    const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });
    const server = http.createServer((req, res) => handleRequest(picker, agent, req, res));
    server.on('upgrade', (req, socket, head) => handleUpgrade(picker, req, socket, head));
    // 오래 열린 소켓 연결은 시간 제한 없음 (서버 ping이 살아 있음을 맞춤)
    server.requestTimeout = 0;
    server.headersTimeout = 30_000;
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => resolve({
            port: server.address().port,
            picker,
            close: () => new Promise((done) => { agent.destroy(); server.closeAllConnections?.(); server.close(() => done()); }),
        }));
    });
}

/** E2E_PROXY에 맞는 앞단 켜기 (node 기본, nginx는 docker) */
async function startProxy(opts = {}) {
    if (E2E.proxy === 'nginx') return require('./lb-nginx').startNginxProxy(opts);
    if (E2E.proxy !== 'node') throw new Error(`E2E_PROXY는 node|nginx (받음: ${E2E.proxy})`);
    return startNodeProxy(opts);
}

module.exports = { createPicker, startNodeProxy, startProxy, FAIL_TIMEOUT_MS };

if (require.main === module) {
    startProxy().then((p) => {
        console.log(`[e2e-lb] ${E2E.proxy} 앞단 ${E2E.backendPort} → ${E2E.nodes.map((n) => `${n.id}:${n.port}`).join(', ')} (${E2E.lb})`);
        const stop = () => p.close().finally(() => process.exit(0));
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
    }).catch((error) => { console.error(`[e2e-lb] 시작 실패: ${error.message}`); process.exit(1); });
}
