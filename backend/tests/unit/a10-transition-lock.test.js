'use strict';

// 같은 사람 처리 중 잠금 시험 — 잠금은 사람마다 하나만 (두 번 누름 막기)
// 목록 A10-B-010 [지금 동작] (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --env-file=.env.test --test tests/unit/a10-transition-lock.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// 모델이 DB에 안 붙게
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const matchmaking = require('../../socket/matchmaking');
const { acquireRoomTransition, releaseRoomTransition } = require('../../socket/matchmaking/join/transition');

test('A10-B-010 같은 uuid로 잠금 두 번 → 첫째 토큰, 둘째 null', (t) => {
    matchmaking.__resetStateForTests();
    t.after(() => matchmaking.__resetStateForTests());
    const first = acquireRoomTransition('b010-a');
    const second = acquireRoomTransition('b010-a');
    assert.equal(typeof first, 'string');
    assert.ok(first.length > 0);
    assert.equal(second, null);
    releaseRoomTransition('b010-a', first);
});
