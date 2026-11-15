'use strict';

// 탈주 남은 시간 → 거절 안내 글 시험 ("탈주로 ○분 ○초 뒤에 참여할 수 있습니다.")
// 목록 A01-B-058~061 (docs/게임_의도_2026-11-15/시험목록/A01a-방만들기-설정-시작.md "탈주 남은 시간 글"), 돌리기: node --env-file=.env.test --test tests/unit/a01a-desertion-wait-text.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { desertionWaitMessage } = require('../../services/game/desertion');

// 남은 ms → 화면에 그대로 뜨는 글 (0초가 안 나오게 1ms도 1초)
const CASES = [
    ['A01-B-058', 299000, '탈주로 4분 59초 뒤에 참여할 수 있습니다.'],
    ['A01-B-059', 300000, '탈주로 5분 0초 뒤에 참여할 수 있습니다.'],
    ['A01-B-060', 1, '탈주로 1초 뒤에 참여할 수 있습니다.'],
    ['A01-B-061', 86400000, '탈주로 24시간 0분 0초 뒤에 참여할 수 있습니다.'],
];
for (const [no, ms, text] of CASES) {
    const tag = no === 'A01-B-061' ? ' [지금 동작]' : '';
    test(`${no}${tag} 남은 ${ms}ms → "${text}"`, () => {
        assert.equal(desertionWaitMessage(ms), text);
    });
}
