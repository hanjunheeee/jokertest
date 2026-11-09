'use strict';

// 관리자 페이지 배포 설정 확인 시험 (AD-290~293), nginx·Dockerfile·조각 글자 확인
// 실제 nginx 동작은 deploy/ci/scripts/admin-site-check.sh(docker nginx -t + curl)가 따로 봄

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// server { ... } 덩어리 나누기 (중괄호 짝 세기)
const serverBlocks = (conf) => {
    const blocks = [];
    const re = /^server \{/gm;
    let match;
    while ((match = re.exec(conf))) {
        let depth = 0;
        for (let i = match.index; i < conf.length; i += 1) {
            if (conf[i] === '{') depth += 1;
            if (conf[i] === '}') { depth -= 1; if (depth === 0) { blocks.push(conf.slice(match.index, i + 1)); break; } }
        }
    }
    return blocks;
};

// 주석 줄 빼기 (주석 속 글자에 걸리지 않게)
const stripComments = (text) => text.split(/\r?\n/).filter((line) => !line.trim().startsWith('#')).join('\n');

const blocks = () => serverBlocks(stripComments(read('nginx/default.conf')));
const siteOf = (name) => blocks().find((b) => new RegExp(`server_name ${name.replace('.', '\\.')}`).test(b));

// location 머리 줄로 그 location 몸통 찾기, 예: '~* ^/admin-api(/|$)' → '{ ... }' 안 글자
const locationBody = (block, head) => {
    const at = block.indexOf(`location ${head} {`);
    if (at < 0) return null;
    return block.slice(at, block.indexOf('}', at) + 1);
};

const ADMIN_API = '~* ^/admin-api(/|$)';

test('AD-290 nginx: admin 사이트가 있고 https·진짜 IP 조각·Node 묶음($mmc_upstream)으로 넘김', () => {
    const admin = siteOf('admin.');
    assert.ok(admin, 'admin server 덩어리 없음');
    assert.match(admin, /server_name admin\.example\.com admin\.localhost;/);
    assert.match(admin, /include \/etc\/nginx\/tls\/\*\.conf;/);
    assert.match(admin, /include \/etc\/nginx\/snippets\/cloudflare-realip\.conf;/);
    const api = locationBody(admin, ADMIN_API);
    assert.ok(api, 'admin 사이트 /admin-api 자리 없음');
    assert.match(api, /proxy_pass http:\/\/\$mmc_upstream;/);
    assert.match(api, /proxy_set_header X-Forwarded-For \$remote_addr;/);
    assert.match(api, /proxy_set_header X-Forwarded-Proto \$scheme;/);
    // Node 묶음 조각은 맨 위에서 한 번 include (admin도 같은 map을 씀)
    assert.match(read('nginx/default.conf'), /^include \/etc\/nginx\/snippets\/mmc-upstreams\.conf;/m);
});

test('AD-291 nginx: admin 사이트 / = dist-admin(admin.html), api 사이트 /admin-api 404, 화면 사이트엔 관리자 없음', () => {
    const admin = siteOf('admin.');
    assert.match(admin, /root \/usr\/share\/nginx\/html\/admin;/);
    assert.match(admin, /index admin\.html;/);
    assert.match(locationBody(admin, '/'), /try_files \$uri \/admin\.html;/);
    // admin 사이트는 /admin-api 말고 백엔드로 안 넘김 (/internal·소켓 없음)
    assert.equal((admin.match(/proxy_pass/g) ?? []).length, 2, 'proxy_pass는 로그인 자리 + /admin-api 자리 둘만');
    assert.doesNotMatch(admin, /internal|socket\.io/);

    const api = siteOf('api.');
    const blocked = locationBody(api, ADMIN_API);
    assert.ok(blocked, 'api 사이트 /admin-api 막는 자리 없음');
    assert.match(blocked, /return 404;/);
    assert.doesNotMatch(blocked, /proxy_pass/);

    for (const name of ['example.com localhost', 'm.example.com']) {
        const site = blocks().find((b) => b.includes(`server_name ${name}`));
        assert.ok(site, name);
        assert.doesNotMatch(site, /admin/, `${name} 사이트에 관리자 글자`);
    }
});

test('AD-292 admin 머리글 조각: CSP default-src self·frame-ancestors none·X-Robots-Tag noindex, admin 사이트만 씀', () => {
    const snippet = stripComments(read('nginx/snippets/admin-security-headers.conf'));
    const csp = snippet.match(/add_header Content-Security-Policy "([^"]+)" always;/);
    assert.ok(csp, 'CSP 줄 없음');
    for (const part of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
        assert.ok(csp[1].includes(part), part);
    }
    assert.doesNotMatch(csp[1], /unsafe-inline|unsafe-eval|\*/);
    assert.match(snippet, /add_header X-Robots-Tag "noindex, nofollow" always;/);
    assert.match(snippet, /add_header X-Frame-Options "DENY" always;/);
    assert.match(snippet, /add_header X-Content-Type-Options "nosniff" always;/);
    assert.match(snippet, /add_header Referrer-Policy "no-referrer" always;/);
    assert.match(snippet, /add_header Strict-Transport-Security \$hsts_value always;/);

    const admin = siteOf('admin.');
    assert.match(admin, /include \/etc\/nginx\/snippets\/admin-security-headers\.conf;/);
    // location에 add_header가 있으면 서버 단계 머리글을 안 물려받음 → admin 사이트는 add_header를 안 씀 (캐시는 expires)
    assert.doesNotMatch(admin, /add_header/);
    for (const other of blocks().filter((b) => b !== admin)) assert.doesNotMatch(other, /admin-security-headers/);
});

test('AD-293 Dockerfile: 관리자 빌드(build:admin) 뒤 dist-admin을 admin 폴더로, 플레이어 폴더엔 안 넣음', () => {
    const docker = stripComments(read('frontend/Dockerfile'));
    const playerBuild = docker.indexOf('npm run build --prefix frontend');
    const adminBuild = docker.indexOf('npm run build:admin --prefix frontend');
    assert.ok(playerBuild >= 0 && adminBuild > playerBuild, '플레이어 빌드 뒤 관리자 빌드(섞임 검사가 dist도 봄)');
    assert.match(docker, /COPY --from=build \/app\/frontend\/dist-admin \/usr\/share\/nginx\/html\/admin\n/);
    const copies = docker.split('\n').filter((line) => line.startsWith('COPY --from=build'));
    for (const line of copies.filter((l) => l.includes('dist-admin'))) assert.doesNotMatch(line, /html\/(desktop|mobile)/);
    for (const line of copies.filter((l) => /html\/(desktop|mobile)/.test(l))) assert.doesNotMatch(line, /admin/);
});

test('AD-293 TLS 조각·env 예시: admin 이름이 인증서 설명에 있고 ADMIN_* 이름만(값 없음)', () => {
    assert.match(read('nginx/tls/ssl.conf'), /admin/);
    const env = read('.env.example');
    for (const name of ['ADMIN_ORIGIN', 'ADMIN_TOTP_KEY', 'ADMIN_ACCESS_MODE', 'ADMIN_ACCESS_TEAM_DOMAIN', 'ADMIN_ACCESS_AUD', 'ADMIN_SESSION_IDLE_MIN']) {
        const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
        assert.ok(line, `${name} 없음`);
        assert.equal(line, `${name}=`, `${name}엔 값 넣지 않기`);
    }
});
