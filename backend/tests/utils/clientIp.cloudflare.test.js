'use strict';

// 클라우드플레어 → nginx → 백엔드 뒤 진짜 사용자 IP 시험 (DB 안 씀)
// Express req.ip와 소켓 접속 IP가 같은 규칙인지 + 진짜 socket.io 손잡기에서 nginx가 넘긴 IP가 보이는지

const test   = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');

const { TRUST_PROXY_HOPS, getClientIp, getSocketClientIp } = require('../../utils/request');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');

// index.js와 같은 trust proxy로 Express req.ip 구하기 (포트 없이 가짜 요청)
const app = express();
app.set('trust proxy', TRUST_PROXY_HOPS);
const expressIp = (remoteAddress, xff) => {
    const req = Object.create(app.request);
    req.app = app;
    req.headers = xff === undefined ? {} : { 'x-forwarded-for': xff };
    req.socket = { remoteAddress };
    req.connection = req.socket;
    return getClientIp(req);
};
const socketIp = (remoteAddress, xff) => getSocketClientIp({
    request: { socket: { remoteAddress }, headers: xff === undefined ? {} : { 'x-forwarded-for': xff } },
    handshake: { address: remoteAddress },
});

// [nginx 컨테이너 주소, nginx가 넘긴 X-Forwarded-For, 기대 IP]
const CASES = [
    // nginx가 클라우드플레어 CF-Connecting-IP를 풀어 $remote_addr 하나만 넘긴 모양
    ['172.18.0.5', '203.0.113.7', '203.0.113.7'],
    ['::ffff:172.18.0.5', '2001:db8::7', '2001:db8::7'],
    // 옛 모양(줄 이어 붙이기)이어도 맨 오른쪽 = nginx가 붙인 값
    ['172.18.0.5', '6.6.6.6, 203.0.113.7', '203.0.113.7'],
    // 머리말 없음(nginx 없이 바로) → 바로 붙은 주소
    ['127.0.0.1', undefined, '127.0.0.1'],
    // 이상한 값은 기록 안 함
    ['172.18.0.5', "1.2.3.4'; DROP", 'UNKNOWN'],
];

test('TRUST_PROXY_HOPS는 nginx 하나 (index.js trust proxy와 같은 값)', () => {
    assert.equal(TRUST_PROXY_HOPS, 1);
});

for (const [remote, xff, expected] of CASES) {
    test(`Express req.ip와 소켓 IP가 같음: ${remote} / ${xff ?? '(머리말 없음)'} → ${expected}`, () => {
        assert.equal(expressIp(remote, xff), expected);
        assert.equal(socketIp(remote, xff), expected);
    });
}

test('소켓 IP: socket.request가 없으면 handshake.address, 그것도 없으면 UNKNOWN', () => {
    assert.equal(getSocketClientIp({ handshake: { address: '10.0.0.9' } }), '10.0.0.9');
    assert.equal(getSocketClientIp({}), 'UNKNOWN');
    assert.equal(getSocketClientIp(undefined), 'UNKNOWN');
});

test('진짜 socket.io 손잡기: nginx가 넘긴 X-Forwarded-For가 socket.data.clientIp', async (t) => {
    const server = http.createServer();
    const io = new Server(server, { transports: ['websocket'] });
    // socket.js와 같은 자리: 인증 앞에서 IP 정하기
    io.use((socket, next) => {
        socket.data.clientIp = getSocketClientIp(socket);
        next();
    });
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => io.close(() => resolve())));

    const seen = new Promise((resolve) => io.on('connection', (socket) => resolve(socket.data.clientIp)));
    const client = connectClient(url, {
        transports: ['websocket'],
        extraHeaders: { 'X-Forwarded-For': '203.0.113.7' },
        reconnection: false,
    });
    t.after(() => client.close());

    assert.equal(await seen, '203.0.113.7');
});
