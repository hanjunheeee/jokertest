'use strict';

// 운영인지 판정 시험 — 정확히 production만 운영, 빈 글자는 개발이고 모르는 값 아님, 오타는 운영 아님 + 모르는 값
// 목록 A18-B-015~018 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/unit/a18-node-env.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { isProduction, isUnknownNodeEnv } = require('../../config/nodeEnv');

// 판정은 환경값 묶음을 받아서 봄 → 진짜 process.env는 안 건드림
[
    ['015', 'production', true, false],
    ['016', 'development', false, false],
    ['017', '', false, false],
    ['018', 'prod', false, true],
].forEach(([no, value, prod, unknown]) => {
    test(`A18-B-${no} NODE_ENV="${value}" → 운영 ${prod ? '맞음' : '아님'}, 모르는 값 ${unknown ? '맞음' : '아님'}`, () => {
        const env = { NODE_ENV: value };
        assert.equal(isProduction(env), prod);
        assert.equal(isUnknownNodeEnv(env), unknown);
    });
});
