'use strict';

// A05b 다 고르면 5초 마감 당김 규칙 시험 — 남은 시간 경계·한 단계 한 번·다 냈나 판단을 마감 당김 함수만으로 봄
// 목록 A05-B-532~542 (docs/게임_의도_2026-11-15/시험목록/A05b-밤-알림-낮연출.md B-2), 돌리기: node --env-file=.env.test --test tests/unit/a05b-settle-pull.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음 (마감 파일이 판 코드를 불러도 DB에 안 붙게)
require('../audit-2026-11-09/gameFixtures');
const { pullRunDeadline, hasAllSubmitted } = require('../../socket/gameSession/phase/settle');

const NOW = 1_000_000;

// 마감 당김 함수가 받는 차례 묶음: 지금 시각·원래 마감·끌 타이머만 (5초는 기본값 그대로)
function turnRun(remainingMs, now = NOW) {
    const clock = { now };
    return {
        clock,
        nowFn: () => clock.now,
        deadline: now + remainingMs,
        timerId: null,
        clearTimeoutFn: () => {},
    };
}

// ---------- A05-B-532~537 남은 시간 경계에서 마감 당기기 ----------
// 5초보다 길 때만 지금+5초로, 5초 이하면 원래 마감 그대로
for (const [no, remaining, expected] of [
    [532, 10_000, NOW + 5_000],
    [533, 5_001, NOW + 5_000],
    [534, 5_000, NOW + 5_000],
    [535, 4_999, NOW + 4_999],
    [536, 1, NOW + 1],
    [537, 0, NOW],
]) {
    test(`A05-B-${no} 다 찬 때 남은 시간 ${remaining}ms → 마감 ${expected - NOW}ms 뒤`, () => {
        const run = turnRun(remaining);
        const pulled = pullRunDeadline(run, 'NIGHT:1:JOKER');
        assert.equal(run.deadline, expected);
        // 당겼으면 새 마감을 돌려주고, 안 당겼으면 null
        if (remaining > 5_000) assert.deepEqual(pulled, { deadline: NOW + 5_000, delayMs: 5_000 });
        else assert.equal(pulled, null);
    });
}

test('A05-B-538 같은 차례에서 두 번째로 불러도 마감이 안 늘어남', () => {
    const run = turnRun(20_000);
    assert.notEqual(pullRunDeadline(run, 'NIGHT:1:JOKER'), null);
    const first = run.deadline;
    // 당긴 바로 뒤(남은 5초) 같은 차례로 다시 불림
    assert.equal(pullRunDeadline(run, 'NIGHT:1:JOKER'), null);
    assert.equal(run.deadline, first);
});

test('A05-B-539 다음 차례(다른 단계 키)에서는 다시 당김', () => {
    const run = turnRun(20_000);
    pullRunDeadline(run, 'NIGHT:1:JOKER');
    // 광대 차례가 닫히고 의사 차례가 열림: 새 마감 남은 20초
    run.clock.now += 5_000;
    run.deadline = run.clock.now + 20_000;
    const pulled = pullRunDeadline(run, 'NIGHT:1:DOCTOR');
    assert.deepEqual(pulled, { deadline: run.clock.now + 5_000, delayMs: 5_000 });
    assert.equal(run.deadline, run.clock.now + 5_000);
});

// ---------- A05-B-540~542 "다 냈나" 판단 ----------
for (const [no, label, voters, submitted, expected] of [
    [540, '낼 사람 0명 → 다 찬 것 아님', [], [], false],
    [541, '전원 냄 → 다 참', ['u1', 'u2'], ['u1', 'u2'], true],
    [542, '한 명 빠짐 → 아님', ['u1', 'u2', 'u3'], ['u1', 'u3'], false],
]) {
    test(`A05-B-${no} 다 냈나 판단: ${label}`, () => {
        const done = new Set(submitted);
        assert.equal(hasAllSubmitted(voters, (uuid) => done.has(uuid)), expected);
    });
}
