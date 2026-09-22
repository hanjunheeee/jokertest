'use strict';

// F-11/F-12 voteParticipation.repositories.js의 순수 판정 로직 단위 시험. 실제 MySQL 없이도
// AC-02(정상 확정 경기의 유효 투표만 F-12 업적 집계에 반영된다)를 검증한다 —
// countEligibleDayVoteParticipations 자체는 db.VoteParticipation.findAll을 거쳐야 하므로
// F01_TEST_DATABASE_URL 없이는 실행할 수 없지만(backend/tests/voteParticipation.persistence.test.js가
// 그 경로를 DB로 검증한다), 그 안에서 실제 배제 판정을 하는 isEligibleGameResult는 순수
// 함수라 여기서 직접 검증할 수 있다(CODEX-1 재검토: 본문 자체를 확인할 근거가 부족하다는
// 지적에 대응).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { __internal } = require('./voteParticipation.repositories');
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

// 2026-09-22: 자동 시험 출처(test)도 development와 같이 자격이 없다.
test('AC-02: 자동 시험 경기(gameSource:test)는 정상 확정이어도 자격이 없다', () => {
    assert.equal(isEligibleGameResult({ completed: true, settings: { gameSource: { value: 'test' } } }), false);
});
