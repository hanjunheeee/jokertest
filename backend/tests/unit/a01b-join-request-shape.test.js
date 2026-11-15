'use strict';

// 코드 입장 요청 모양 검사·사라진 방 까닭 고르기 순수 시험 — 객체·허용 키·roomId 모양만 통과, 끝난 판은 SESSION_ENDED·진행 판은 ROOM_ALREADY_STARTED
// 목록 A01-B-515~521·529~530 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "백엔드 — 순수"), 돌리기: node --env-file=.env.test --test tests/unit/a01b-join-request-shape.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateJoinRoomByCodeRequest, describeJoinFailure } = require('../../socket/matchmaking/join/guards');

const INVALID_MESSAGE = '잘못된 참가 요청입니다. 방 코드로는 일반 참가만 할 수 있습니다.';

// A01-B-515~520 틀린 모양 → INVALID_REQUEST
const BAD = [
    ['A01-B-515', 'null', null],
    ['A01-B-516', '배열', ['ABC234']],
    ['A01-B-517', "글자 'ABC234'", 'ABC234'],
    ['A01-B-518', '{ roomCode, uuid }(다른 키)', { roomCode: 'ABC234', uuid: 'someone-else' }],
    ['A01-B-519', "roomId: ''", { roomCode: 'ABC234', roomId: '' }],
    ['A01-B-520', 'roomId: 123', { roomCode: 'ABC234', roomId: 123 }],
];
for (const [no, label, payload] of BAD) {
    test(`${no} join_room_by_code 보내는 값 ${label} → INVALID_REQUEST "${INVALID_MESSAGE}"`, () => {
        const r = validateJoinRoomByCodeRequest(payload);
        assert.equal(r.ok, false);
        assert.equal(r.code, 'INVALID_REQUEST');
        assert.equal(r.message, INVALID_MESSAGE);
    });
}

test("A01-B-521 { roomCode: 'ABC234' } → 통과", () => {
    const r = validateJoinRoomByCodeRequest({ roomCode: 'ABC234' });
    assert.equal(r.ok, true);
    assert.equal(r.roomCode, 'ABC234');
});

test('A01-B-529 판 단계 ENDED → SESSION_ENDED "이미 끝난 게임의 방입니다."', () => {
    assert.deepEqual(describeJoinFailure('ENDED'), ['SESSION_ENDED', '이미 끝난 게임의 방입니다.']);
});

test('A01-B-530 진행 단계 DAY → ROOM_ALREADY_STARTED "이미 게임이 시작된 방입니다."', () => {
    assert.deepEqual(describeJoinFailure('DAY'), ['ROOM_ALREADY_STARTED', '이미 게임이 시작된 방입니다.']);
});
