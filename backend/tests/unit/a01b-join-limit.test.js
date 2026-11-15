'use strict';

// 코드 입장 시도 횟수 제한 순수 시험 — 1분에 20번까지 됨, 21번째부터 막힘, 첫 시도에서 60초가 지나면 셈 새로, 사람마다 따로
// 목록 A01-B-509~514 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "백엔드 — 순수"), 돌리기: node --env-file=.env.test --test tests/unit/a01b-join-limit.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const test = require('node:test');
const assert = require('node:assert/strict');

const { takeJoinAttempt, __resetEntryLimitsForTests } = require('../../socket/matchmaking/join/entryLimits');

// 첫 시도 시각 (아무 값)
const T0 = 1_800_000_000_000;

// 같은 시각에 n번 시도, 마지막 시도의 결과
function attemptsAt(uuid, n, now = T0) {
    let ok = null;
    for (let i = 0; i < n; i += 1) ok = takeJoinAttempt(uuid, now);
    return ok;
}

// A01-B-509~511 1분 안 19·20·21번째
for (const [no, nth, ok] of [['A01-B-509', 19, true], ['A01-B-510', 20, true], ['A01-B-511', 21, false]]) {
    test(`${no} 한 사람이 1분 안 ${nth}번째 시도 → ${ok ? '됨' : '막힘'}`, () => {
        __resetEntryLimitsForTests();
        assert.equal(attemptsAt('gap', nth), ok);
    });
}

test('A01-B-512 첫 시도에서 59.999초 뒤 22번째 → 막힘', () => {
    __resetEntryLimitsForTests();
    attemptsAt('gap', 21);
    assert.equal(takeJoinAttempt('gap', T0 + 59_999), false);
});

test('A01-B-513 첫 시도에서 60.000초 뒤 → 됨(셈 새로)', () => {
    __resetEntryLimitsForTests();
    attemptsAt('gap', 21);
    assert.equal(takeJoinAttempt('gap', T0 + 60_000), true);
    // 셈이 새로 시작해 그 뒤 19번 더 됨 (새 셈 20번째까지)
    assert.equal(attemptsAt('gap', 19, T0 + 60_000), true);
});

test('A01-B-514 갑이 20번 쓴 뒤 을의 첫 시도 → 됨', () => {
    __resetEntryLimitsForTests();
    attemptsAt('gap', 20);
    assert.equal(takeJoinAttempt('gap', T0), false);
    assert.equal(takeJoinAttempt('eul', T0), true);
});
