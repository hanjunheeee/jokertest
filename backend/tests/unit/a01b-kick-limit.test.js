'use strict';

// 같은 방에서 쫓겨난 횟수로 입장 막기 순수 시험 — 0·1·2번은 안 막힘, 3·4번은 막힘, 방마다·사람마다 따로, 방이 없어지면 셈도 없어짐
// 목록 A01-B-501~508 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "백엔드 — 순수"), 돌리기: node --env-file=.env.test --test tests/unit/a01b-kick-limit.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const test = require('node:test');
const assert = require('node:assert/strict');

const { recordRoomKick, isKickLimitReached } = require('../../socket/matchmaking/room/kickLimit');

// 방 객체 하나 (셈은 방 객체에 묶임, 칸 값은 상관없음)
const newRoom = (code) => ({ id: `room-${code}`, code, players: new Map() });

// n번 쫓겨나게 함
const kickN = (room, uuid, n) => { for (let i = 0; i < n; i += 1) recordRoomKick(room, uuid); };

// A01-B-501~505 쫓겨난 횟수 0~4
for (const [no, n, blocked] of [['A01-B-501', 0, false], ['A01-B-502', 1, false], ['A01-B-503', 2, false], ['A01-B-504', 3, true], ['A01-B-505', 4, true]]) {
    test(`${no} 같은 방에서 쫓겨난 횟수 ${n} → ${blocked ? '막힘' : '막히지 않음'}`, () => {
        const room = newRoom('AAA111');
        kickN(room, 'gap', n);
        assert.equal(isKickLimitReached(room, 'gap'), blocked);
    });
}

test('A01-B-506 정원 6, A방에서 3번·B방 0번 → B방은 안 막힘', () => {
    const a = newRoom('AAA222');
    const b = newRoom('BBB222');
    kickN(a, 'gap', 3);
    assert.equal(isKickLimitReached(a, 'gap'), true);
    assert.equal(isKickLimitReached(b, 'gap'), false);
});

test('A01-B-507 정원 8, 같은 방에서 갑 3번·을 1번 → 갑만 막힘', () => {
    const room = newRoom('CCC333');
    kickN(room, 'gap', 3);
    kickN(room, 'eul', 1);
    assert.equal(isKickLimitReached(room, 'gap'), true);
    assert.equal(isKickLimitReached(room, 'eul'), false);
});

test('A01-B-508 3번 센 방 객체를 버리고 새 방 객체(새 코드) → 그 사람 안 막힘', () => {
    let room = newRoom('DDD444');
    kickN(room, 'gap', 3);
    assert.equal(isKickLimitReached(room, 'gap'), true);
    room = newRoom('EEE555');
    assert.equal(isKickLimitReached(room, 'gap'), false);
});
