'use strict';

// 탈주 대기 시간·한국 자정·안내 글 순수 시험 (탈주 서비스 계산 함수에 값 넣고 돌려준 값만 봄)
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-001~025, 돌리기: node --env-file=.env.test --test tests/unit/a09-desertion-cooldown.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// 탈주 서비스는 저장소를 늦게 부름 → 계산 함수만 쓰면 DB에 안 붙음, 그래도 모델 주소는 닿지 않는 곳으로 막음
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const desertion = require('../../services/game/desertion');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// 한국 시각 글 → ms (서버 시간대와 상관없게 +09:00 붙임), 예: '2026-11-16 23:50:00' → 그 순간 ms
const kst = (text) => new Date(`${text.replace(' ', 'T')}+09:00`).getTime();
// ms → 한국 시각 글 (틀렸을 때 읽기 쉽게), 예: 그 ms → '2026-11-17 23:50:00'
const kstText = (ms) => new Date(ms + 9 * HOUR).toISOString().replace('T', ' ').slice(0, 19);

// A09-B-001~004 그날 몇 번째 탈주인지별 대기 시간
for (const [no, nth, expected, label] of [
    ['A09-B-001', 1, 5 * MIN, '5분'],
    ['A09-B-002', 2, 30 * MIN, '30분'],
    ['A09-B-003', 3, DAY, '24시간'],
    ['A09-B-004', 4, DAY, '24시간'],
]) {
    test(`${no} 그날 ${nth}번째 탈주 → 대기 ${label}`, () => {
        assert.equal(desertion.cooldownMsFor(nth), expected);
    });
}

// A09-B-005~006 4번째 넘어도 1일 그대로 (임시 5)
for (const [no, nth] of [['A09-B-005', 5], ['A09-B-006', 10]]) {
    test(`${no} 그날 ${nth}번째 탈주 → 대기 24시간 그대로`, () => {
        assert.equal(desertion.cooldownMsFor(nth), DAY);
    });
}

// A09-B-007~010 막힘 끝 = 탈주 시각 + 대기 시간 (탈주한 시각부터 셈)
const T0 = kst('2026-11-16 14:00:00');
for (const [no, prior, nth, wait, label] of [
    ['A09-B-007', 0, 1, 5 * MIN, '5분'],
    ['A09-B-008', 1, 2, 30 * MIN, '30분'],
    ['A09-B-009', 2, 3, DAY, '24시간'],
    ['A09-B-010', 3, 4, DAY, '24시간'],
]) {
    test(`${no} 그날 앞선 탈주 ${prior}번 → ${nth}번째, 막힘 끝 = 탈주 시각 + ${label}`, () => {
        const block = desertion.computeBlock(T0, prior);
        assert.equal(block.nth, nth);
        assert.equal(block.blockedUntilMs, T0 + wait);
    });
}

// A09-B-011~014 하루 경계는 한국 시간 자정
for (const [no, at, dayStart, label] of [
    ['A09-B-011', '2026-11-16 23:59:59', '2026-11-16 00:00:00', '한국 23:59:59 → 그날 0시'],
    ['A09-B-012', '2026-11-17 00:00:00', '2026-11-17 00:00:00', '한국 00:00:00 → 새 날 0시'],
    ['A09-B-013', '2026-11-17 08:59:59', '2026-11-17 00:00:00', '한국 08:59:59(세계 표준시 전날 23:59:59) → 그날 0시'],
    ['A09-B-014', '2026-11-17 09:00:00', '2026-11-17 00:00:00', '한국 09:00:00(세계 표준시 0시) → 같은 날 0시'],
]) {
    test(`${no} ${label}`, () => {
        assert.equal(kstText(desertion.kstDayStart(kst(at))), dayStart);
    });
}

// A09-B-015~018 막힘 끝은 자정이 지나도 그대로 (몇 번째 = 앞선 수 + 1)
for (const [no, at, nth, until] of [
    ['A09-B-015', '2026-11-16 23:50:00', 3, '2026-11-17 23:50:00'],
    ['A09-B-016', '2026-11-16 23:59:59', 2, '2026-11-17 00:29:59'],
    ['A09-B-017', '2026-11-16 23:58:00', 1, '2026-11-17 00:03:00'],
    ['A09-B-018', '2026-11-17 00:00:00', 1, '2026-11-17 00:05:00'],
]) {
    test(`${no} 한국 ${at.slice(11)} ${nth}번째 탈주 → 막힘 끝 ${until}`, () => {
        const block = desertion.computeBlock(kst(at), nth - 1);
        assert.equal(kstText(block.blockedUntilMs), until);
    });
}

// A09-B-019~022 안내 글 "탈주로 ○분 ○초 뒤에 참여할 수 있습니다."
for (const [no, remaining, text] of [
    ['A09-B-019', 300000, '5분 0초'],
    ['A09-B-020', 299000, '4분 59초'],
    ['A09-B-021', 1800000, '30분 0초'],
    ['A09-B-022', 61000, '1분 1초'],
]) {
    test(`${no} 남은 ${remaining}ms → "탈주로 ${text} 뒤에 참여할 수 있습니다."`, () => {
        assert.equal(desertion.desertionWaitMessage(remaining), `탈주로 ${text} 뒤에 참여할 수 있습니다.`);
    });
}

// A09-B-023~025 1분 아래·시간 단위 글 [지금 동작]
for (const [no, remaining, text] of [
    ['A09-B-023', 1, '1초'],
    ['A09-B-024', 59000, '59초'],
    ['A09-B-025', 86400000, '24시간 0분 0초'],
]) {
    test(`${no} [지금 동작] 남은 ${remaining}ms → "탈주로 ${text} 뒤에…" ("0초" 안 나옴)`, () => {
        assert.equal(desertion.desertionWaitMessage(remaining), `탈주로 ${text} 뒤에 참여할 수 있습니다.`);
    });
}
