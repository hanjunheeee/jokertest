'use strict';

// 추방 요청 모양 검사 순수 시험 — 7칸 전부 필수, 칸 빠짐·다른 칸·숫자·빈 글자·129자는 거절, 128자까지 통과
// 목록 A01-B-522~528 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "백엔드 — 순수"), 돌리기: node --env-file=.env.test --test tests/unit/a01b-kick-request-shape.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateKickPayload } = require('../../socket/kickReceiptStore');

// 7칸 다 있는 요청
const full = () => ({
    requestId: 'req-1',
    bootEpoch: 'boot-1',
    roomId: 'room-1',
    roomInstanceId: 'inst-1',
    requesterMembershipId: 'mem-host',
    targetUuid: 'target-uuid',
    targetMembershipId: 'mem-target',
});

// 칸 하나 뺀 요청
const without = (key) => {
    const payload = full();
    delete payload[key];
    return payload;
};

// A01-B-522~526 거절
const BAD = [
    ['A01-B-522', '칸 하나 빠짐(targetMembershipId)', without('targetMembershipId')],
    ['A01-B-523', '다른 칸 더함', { ...full(), extra: 'x' }],
    ['A01-B-524', '값이 숫자', { ...full(), requestId: 123 }],
    ['A01-B-525', '빈 글자', { ...full(), roomId: '' }],
    ['A01-B-526', '129자', { ...full(), requestId: 'r'.repeat(129) }],
];
for (const [no, label, payload] of BAD) {
    test(`${no} 추방 요청 ${label} → INVALID_REQUEST`, () => {
        const r = validateKickPayload(payload);
        assert.equal(r.ok, false);
        assert.equal(r.code, 'INVALID_REQUEST');
    });
}

test('A01-B-527 추방 요청 128자 → 통과', () => {
    const r = validateKickPayload({ ...full(), requestId: 'r'.repeat(128) });
    assert.equal(r.ok, true);
    assert.equal(r.value.requestId.length, 128);
});

test('A01-B-528 7칸(requestId·bootEpoch·roomId·roomInstanceId·requesterMembershipId·targetUuid·targetMembershipId) 다 있음 → 통과', () => {
    const r = validateKickPayload(full());
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, full());
});
