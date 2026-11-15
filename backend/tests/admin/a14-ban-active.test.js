'use strict';

// 정지 중인지 판단 시험: 시작 전·기간 끝남은 아님, 영구·기간 안은 맞음 (정지 줄 하나와 지금 시각을 넣어 봄)
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-B-027~030 (돌리기: node --env-file=.env.test --test)
const test = require('node:test');
const assert = require('node:assert/strict');

const { isBanActive } = require('../../admin/services/members/detail');

// 고정 지금 시각 (진짜 시계 안 씀)
const NOW = new Date('2026-11-16T03:00:00.000Z');
const at = (sec) => new Date(NOW.getTime() + sec * 1000);

test('A14-B-027 시작 시각이 1초 뒤 → 정지 아님', () => {
    const row = { start_at: at(1), end_at: at(3600), is_permanent: false };
    assert.equal(isBanActive(row, NOW), false);
});

test('A14-B-028 영구 정지 → 정지 중', () => {
    const row = { start_at: at(-3600), end_at: null, is_permanent: true };
    assert.equal(isBanActive(row, NOW), true);
});

test('A14-B-029 끝 시각이 1초 전에 지남 → 정지 아님', () => {
    const row = { start_at: at(-3600), end_at: at(-1), is_permanent: false };
    assert.equal(isBanActive(row, NOW), false);
});

test('A14-B-030 끝 시각이 1초 뒤 → 정지 중', () => {
    const row = { start_at: at(-3600), end_at: at(1), is_permanent: false };
    assert.equal(isBanActive(row, NOW), true);
});
