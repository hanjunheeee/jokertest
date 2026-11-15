'use strict';

// 만 14세 셈 시험: 생일이 바뀌는 날을 한국 날짜로 봄 (UTC 15시 = 한국 0시)
// 목록 A11-B-028~031 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: node --env-file=.env.test --test tests/unit/a11a-age-check.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { isOldEnoughToSignup } = require('../../validations/auth/terms');

// 생일 2012-11-16 (가입 검사가 넘기는 모양 = UTC 0시)
const BIRTH = new Date(Date.UTC(2012, 10, 16));

// 같은 순간을 한국 시각·UTC 시각 두 말로 적은 목록 그대로
const cases = [
    { id: 'A11-B-028', label: '한국 2026-11-15 23:59:59', now: '2026-11-15T23:59:59+09:00', ok: false },
    { id: 'A11-B-029', label: '한국 2026-11-16 00:00:00', now: '2026-11-16T00:00:00+09:00', ok: true },
    { id: 'A11-B-030', label: 'UTC 2026-11-15 14:59:59', now: '2026-11-15T14:59:59Z', ok: false },
    { id: 'A11-B-031', label: 'UTC 2026-11-15 15:00:00', now: '2026-11-15T15:00:00Z', ok: true },
];
for (const { id, label, now, ok } of cases) {
    test(`${id} 생일 2012-11-16 × 지금 ${label} → ${ok ? '만 14세 됨' : '아직 아님'}`, () => {
        assert.equal(isOldEnoughToSignup(BIRTH, new Date(now)), ok);
    });
}
