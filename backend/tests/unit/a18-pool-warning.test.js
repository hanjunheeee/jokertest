'use strict';

// DB 연결 수 경고 시험 — Node 수 × 풀이 MySQL 한도 80%를 넘을 때만 경고, 딱 맞음·단일 모드는 경고 없음
// 목록 A18-B-042~044 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/unit/a18-pool-warning.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { describePoolWarning } = require('../../config/cluster');

// 한도 151 → 80% = 120, 풀 10
const envOf = (nodeCount) => ({ NODE_COUNT: String(nodeCount), DB_MAX_CONNECTIONS: '151' });

test('A18-B-042 Redis 모드, 풀 10 × Node 12 = 120 → 경고 없음 (딱 맞음)', () => {
    assert.equal(describePoolWarning({ env: envOf(12), mode: 'redis', poolMax: 10 }), null);
});

test('A18-B-043 Redis 모드, 풀 10 × Node 13 = 130 → 경고 글에 합 130·한도 120', () => {
    const warning = describePoolWarning({ env: envOf(13), mode: 'redis', poolMax: 10 });
    assert.equal(typeof warning, 'string');
    assert.match(warning, /130/);
    assert.match(warning, /120/);
});

test('A18-B-044 단일 모드, Node 16 → 경고 없음', () => {
    assert.equal(describePoolWarning({ env: envOf(16), mode: 'single', poolMax: 10 }), null);
});
