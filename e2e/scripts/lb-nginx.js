'use strict';

// e2e 앞단 nginx 파일, E2E_PROXY=nginx일 때 docker nginx를 4100에 켜고 생성한 upstream(gen-nodes.js e2e)으로 Node에 넘김
// scripts/lb-proxy.js의 startProxy가 부름 (CI·리눅스용, 운영과 같은 nginx 규칙을 실제로 확인), 끝나면 컨테이너를 지움
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { E2E, RUNTIME_DIR } = require('../helpers/env');
const { planNodes, renderUpstreams } = require('../../deploy/scripts/gen-nodes');

const IMAGE = process.env.E2E_NGINX_IMAGE || 'nginx:1.27-alpine';
// docker 안에서 내 PC(Node들)를 부르는 이름
const HOST_ALIAS = 'host.docker.internal';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });

// 앞단 server 글: 운영 API 사이트와 같은 넘기기 (소켓 Upgrade·X-Forwarded-For 하나·$mmc_upstream)
// X-Forwarded-For는 docker 망 주소가 됨 (ip 제한은 시험에서 넉넉히 올려 둬서 상관없음)
function renderServer(port) {
    return [
        '# e2e 앞단 (생성 파일, e2e/scripts/lb-nginx.js)',
        'include /etc/nginx/conf.d/mmc-upstreams.inc;',
        'map $http_upgrade $connection_upgrade { default upgrade; "" close; }',
        'server {',
        `  listen ${port};`,
        '  client_max_body_size 10m;',
        '  location / {',
        '    proxy_pass http://$mmc_upstream;',
        '    proxy_http_version 1.1;',
        '    proxy_set_header Upgrade $http_upgrade;',
        '    proxy_set_header Connection $connection_upgrade;',
        '    proxy_set_header Host $host;',
        '    proxy_set_header X-Forwarded-For $remote_addr;',
        '    proxy_set_header X-Forwarded-Proto $scheme;',
        '    proxy_read_timeout 120s;',
        '  }',
        '}',
        '',
    ].join('\n');
}

/** 설정 파일 쓰기 → 폴더 경로 (Node들은 내 PC 4101.. 를 host.docker.internal로) */
function writeConfig(dir = path.join(RUNTIME_DIR, 'nginx'), { port = E2E.backendPort, lb = E2E.lb } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const nodes = planNodes({ count: E2E.nodeCount, target: 'e2e', host: HOST_ALIAS });
    fs.writeFileSync(path.join(dir, 'mmc-upstreams.inc'), renderUpstreams(nodes, { resolve: false, lb, target: 'e2e' }));
    fs.writeFileSync(path.join(dir, 'default.conf'), renderServer(port));
    return dir;
}

/** nginx 컨테이너 켜기 → { close } (nginx -t 먼저, 실패면 던짐) */
async function startNginxProxy({ port = E2E.backendPort, lb = E2E.lb } = {}) {
    const dir = writeConfig(undefined, { port, lb });
    const name = `mmc-e2e-lb-${process.pid}`;
    const mount = `${dir}:/etc/nginx/conf.d:ro`;
    const common = ['--add-host', `${HOST_ALIAS}:host-gateway`, '-v', mount];
    const test = docker(['run', '--rm', ...common, IMAGE, 'nginx', '-t']);
    if (test.status !== 0) throw new Error(`nginx -t 실패: ${(test.stderr || '').trim().split('\n').slice(-2).join(' / ')}`);
    docker(['rm', '-f', name]);
    // 실행 번호 꼬리표: 윈도에서 Playwright가 강제로 끄면 close가 안 불림 → global-teardown이 이 꼬리표로 지움
    const run = docker(['run', '-d', '--name', name, '--label', `mmc.e2e.lb=${process.env.E2E_RUN_ID || 'local'}`, '-p', `${port}:${port}`, ...common, IMAGE]);
    if (run.status !== 0) throw new Error(`nginx 못 켬: ${(run.stderr || '').trim().split('\n').pop()}`);
    return {
        port,
        name,
        close: async () => { docker(['rm', '-f', name]); },
    };
}

/** 이번 실행이 남긴 앞단 컨테이너 지우기 (global-teardown) → 지운 수 */
function removeRunContainers(runId = process.env.E2E_RUN_ID || 'local') {
    const ids = (docker(['ps', '-aq', '--filter', `label=mmc.e2e.lb=${runId}`]).stdout || '').split(/\s+/).filter(Boolean);
    if (ids.length > 0) docker(['rm', '-f', ...ids]);
    return ids.length;
}

module.exports = { startNginxProxy, writeConfig, renderServer, removeRunContainers };
