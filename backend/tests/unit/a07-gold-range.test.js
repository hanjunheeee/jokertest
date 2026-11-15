'use strict';

// 판 골드 값 범위 순수 시험 — 0~100 정수만 "됨", 경계 밖·소수·글자·null은 "아님"
// 목록 A07-B-112~120 (docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md)
const test = require('node:test');
const assert = require('node:assert/strict');

// 판 설정 값 파일은 DB 저장소를 불러옴 → 닿지 않는 주소로 막아 DB에 안 붙게 (불러오기 전에)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const { isValidGoldReward } = require('../../services/ops/gameSettings');

[
    { id: 'A07-B-112', label: '−1', value: -1, ok: false },
    { id: 'A07-B-113', label: '0', value: 0, ok: true },
    { id: 'A07-B-114', label: '1', value: 1, ok: true },
    { id: 'A07-B-115', label: '99', value: 99, ok: true },
    { id: 'A07-B-116', label: '100', value: 100, ok: true },
    { id: 'A07-B-117', label: '101', value: 101, ok: false },
    { id: 'A07-B-118', label: '1.5', value: 1.5, ok: false },
    { id: 'A07-B-119', label: '글자 "2"', value: '2', ok: false },
    { id: 'A07-B-120', label: 'null', value: null, ok: false },
].forEach(({ id, label, value, ok }) => {
    test(`${id} 판 골드 값 ${label} → ${ok ? '됨' : '아님'}`, () => {
        assert.equal(isValidGoldReward(value), ok);
    });
});
