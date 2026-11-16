'use strict';

// DB 표 준비 판정 시험 — 마이그레이션 이력이 0001~0034 다 올라가야 준비 됨, 0034만 안 돌렸으면 준비 안 됨 + 그 이름
// 목록 A18-B-045~046 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/unit/a18-schema-summary.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { summarize } = require('../../db/schemaReadiness');
const { MIGRATIONS } = require('../../scripts/migrate-db');

// 이력 줄 모양 (이름·상태·파일 그대로인지)
const rowsWith = (statusOf) => MIGRATIONS.map((m) => ({ name: m.name, status: statusOf(m.name), checksumMatches: true }));

test('A18-B-045 0001~0034 다 applied → 준비 됨', () => {
    assert.equal(MIGRATIONS.length, 34);
    assert.match(MIGRATIONS[0].name, /^0001-/);
    assert.match(MIGRATIONS.at(-1).name, /^0034-/);
    assert.equal(summarize(rowsWith(() => 'applied')).ready, true);
});

test('A18-B-046 0034만 pending → 준비 안 됨, 안 돌린 목록 = 0034 이름', () => {
    const last = MIGRATIONS.at(-1).name;
    const summary = summarize(rowsWith((name) => (name === last ? 'pending' : 'applied')));
    assert.equal(summary.ready, false);
    assert.deepEqual(summary.pending, [last]);
    assert.match(last, /^0034-/);
});
