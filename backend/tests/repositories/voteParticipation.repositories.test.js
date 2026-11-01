'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { __internal } = require('../../repositories/voteParticipation.repositories');
const { isEligibleGameResult } = __internal;

test('AC-02: 정상 확정(completed:true)·비개발 운영 경기는 자격이 있다', () => {
    assert.equal(isEligibleGameResult({ completed: true, settings: { gameSource: { value: 'production' } } }), true);
});

test('AC-02: 중단 경기(completed:false)는 자격이 없다', () => {
    assert.equal(isEligibleGameResult({ completed: false, settings: { gameSource: { value: 'production' } } }), false);
});

test('AC-02: 개발 경기(gameSource:development)는 정상 확정이어도 자격이 없다', () => {
    assert.equal(isEligibleGameResult({ completed: true, settings: { gameSource: { value: 'development' } } }), false);
});

test('AC-02: raw MySQL 조회에서 completed가 TINYINT(1) 1/0으로 돌아와도(JS boolean이 아니어도) 정확히 판정한다', () => {
    assert.equal(isEligibleGameResult({ completed: 1, settings: { gameSource: { value: 'production' } } }), true);
    assert.equal(isEligibleGameResult({ completed: 0, settings: { gameSource: { value: 'production' } } }), false);
});

test('AC-02: gameSource 필드 자체가 없는(이 필드 도입 이전) 정상 확정 과거 경기는 소급으로 자격이 있다', () => {
    assert.equal(isEligibleGameResult({ completed: true, settings: {} }), true);
    assert.equal(isEligibleGameResult({ completed: true, settings: null }), true);
    assert.equal(isEligibleGameResult({ completed: true }), true);
});

test('AC-02: game_results 행 자체가 없으면(진행 중인 경기의 사건) 자격이 없다', () => {
    assert.equal(isEligibleGameResult(undefined), false);
    assert.equal(isEligibleGameResult(null), false);
});

test('AC-02: 자동 시험 경기(gameSource:test)는 정상 확정이어도 자격이 없다', () => {
    assert.equal(isEligibleGameResult({ completed: true, settings: { gameSource: { value: 'test' } } }), false);
});
