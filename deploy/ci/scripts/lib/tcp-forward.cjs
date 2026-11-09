#!/usr/bin/env node
'use strict';

// CI 시험 DB 이어 주기 파일, 127.0.0.1:<포트>로 들어온 연결을 <호스트>:<포트>로 그대로 넘김
// lib/db.sh가 부름 — 앱 시험 스크립트가 DB 주소를 127.0.0.1로 고정해서, 서비스 이름이 다른 CI(GitLab의 mysql)에서 필요
// 쓰는 법: node tcp-forward.cjs <받을 포트> <보낼 호스트> <보낼 포트>
const net = require('node:net');

const [listenPort, targetHost, targetPort] = process.argv.slice(2);
if (!listenPort || !targetHost || !targetPort) {
    console.error('쓰는 법: node tcp-forward.cjs <받을 포트> <보낼 호스트> <보낼 포트>');
    process.exit(2);
}

const server = net.createServer((client) => {
    const upstream = net.connect(Number(targetPort), targetHost);
    client.pipe(upstream);
    upstream.pipe(client);
    const close = () => { client.destroy(); upstream.destroy(); };
    client.on('error', close);
    upstream.on('error', close);
});

server.listen(Number(listenPort), '127.0.0.1');
server.on('error', (error) => {
    console.error(`[ci-forward] ${error.message}`);
    process.exit(1);
});
