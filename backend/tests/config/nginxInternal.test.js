'use strict';

// nginx 관리자 통로(/internal) 막기 시험, 설정 글자 확인 (nginx 실제 동작은 docs/배포_설정.md의 docker nginx -t·curl로 확인)
// API 사이트에만 대소문자 안 가리는 /internal 자리 + 허용 ip 조각, 조각 기본은 전부 막기

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

const INTERNAL_LOCATION = /location ~\* \^\/internal\(\/\|\$\) \{([^}]*)\}/;

test('nginx: API 사이트에 대소문자 안 가리는 /internal 자리가 있고 허용 ip 조각을 먼저 include', () => {
    const blocks = serverBlocks(read('nginx/default.conf'));
    const api = blocks.find((b) => /server_name api\./.test(b));
    assert.ok(api, 'API server 덩어리가 없음');
    const match = api.match(INTERNAL_LOCATION);
    assert.ok(match, '/internal 자리가 없음');
    const body = match[1];
    const includeAt = body.indexOf('include /etc/nginx/snippets/internal-allow.conf;');
    assert.ok(includeAt >= 0, '허용 ip 조각 include 없음');
    assert.ok(includeAt < body.indexOf('proxy_pass'), 'include가 proxy_pass 뒤에 있음');
});

test('nginx: 화면 두 사이트는 /internal을 백엔드로 안 보냄 (API 사이트 하나만 proxy)', () => {
    const blocks = serverBlocks(read('nginx/default.conf'));
    const withInternal = blocks.filter((b) => INTERNAL_LOCATION.test(b));
    assert.equal(withInternal.length, 1);
    for (const block of blocks.filter((b) => !/server_name api\./.test(b))) {
        assert.doesNotMatch(block, /proxy_pass/);
    }
});

test('허용 ip 조각: 살아 있는 줄은 deny all; 하나, allow는 주석 자리로만', () => {
    const lines = read('nginx/snippets/internal-allow.conf').split(/\r?\n/).map((l) => l.trim());
    const live = lines.filter((l) => l && !l.startsWith('#'));
    assert.deepEqual(live, ['deny all;']);
    assert.ok(lines.some((l) => /^#\s*allow <관리자 서버 ip>;$/.test(l)), 'allow 자리 주석 없음');
});

test('허용 ip 조각은 Dockerfile이 snippets 폴더째 복사함', () => {
    assert.match(read('frontend/Dockerfile'), /COPY nginx\/snippets\/ \/etc\/nginx\/snippets\//);
});
