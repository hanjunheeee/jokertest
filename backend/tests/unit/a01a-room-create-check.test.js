'use strict';

// 방 만들기 값 검사 시험 — 정원·광대 수·시간 칸·공개 방식·지운 3칸·모르는 칸·직업별 밤 시간
// 목록 A01-B-001~045 (docs/게임_의도_2026-11-15/시험목록/A01a-방만들기-설정-시작.md "방 만들기 값 검사"), 돌리기: node --env-file=.env.test --test tests/unit/a01a-room-create-check.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateCreateRoomPayload } = require('../../validations/room/create');

// 통과하는 방 만들기 값 (칸 하나씩 바꿔 봄)
const base = (overrides = {}) => ({
    accessType: 'open',
    maxPlayers: 10,
    jokerCount: 1,
    dayDiscussionTime: 60,
    dayVoteTime: 60,
    nightActionTime: 60,
    ...overrides,
});

// ── 정원 경계 (5~10만 통과) ──
const MAX_PLAYERS_CASES = [
    ['A01-B-001', 4, false],
    ['A01-B-002', 5, true],
    ['A01-B-003', 6, true],
    ['A01-B-004', 7, true],
    ['A01-B-005', 8, true],
    ['A01-B-006', 9, true],
    ['A01-B-007', 10, true],
    ['A01-B-008', 11, false],
    ['A01-B-009', '5', false],
    ['A01-B-010', null, false],
];
for (const [no, value, pass] of MAX_PLAYERS_CASES) {
    test(`${no} 정원 ${JSON.stringify(value)} → ${pass ? '통과' : '"최대 플레이어 수가 올바르지 않습니다."'}`, () => {
        const r = validateCreateRoomPayload(base({ maxPlayers: value }));
        if (pass) {
            assert.equal(r.ok, true, r.message);
            assert.equal(r.value.settings.maxPlayers, value);
        } else {
            assert.equal(r.ok, false);
            assert.equal(r.message, '최대 플레이어 수가 올바르지 않습니다.');
        }
    });
}

// ── 광대 수 경계 (1·2만 통과) ──
const JOKER_CASES = [
    ['A01-B-011', 0, false],
    ['A01-B-012', 1, true],
    ['A01-B-013', 2, true],
    ['A01-B-014', 3, false],
];
for (const [no, value, pass] of JOKER_CASES) {
    test(`${no} 광대 ${value} → ${pass ? '통과' : '"광대 플레이어 수가 올바르지 않습니다."'}`, () => {
        const r = validateCreateRoomPayload(base({ jokerCount: value }));
        if (pass) {
            assert.equal(r.ok, true, r.message);
            assert.equal(r.value.settings.jokerCount, value);
        } else {
            assert.equal(r.ok, false);
            assert.equal(r.message, '광대 플레이어 수가 올바르지 않습니다.');
        }
    });
}

// ── 시간 칸 경계 (칸마다 가운데 둘만 통과) ──
// 토론 30~150 · 투표 30~90 · 재판 15~120 · 밤 30~120
const TIME_CASES = [
    ['A01-B-015', '토론', 'dayDiscussionTime', 29, false],
    ['A01-B-016', '토론', 'dayDiscussionTime', 30, true],
    ['A01-B-017', '토론', 'dayDiscussionTime', 150, true],
    ['A01-B-018', '토론', 'dayDiscussionTime', 151, false],
    ['A01-B-019', '투표', 'dayVoteTime', 29, false],
    ['A01-B-020', '투표', 'dayVoteTime', 30, true],
    ['A01-B-021', '투표', 'dayVoteTime', 90, true],
    ['A01-B-022', '투표', 'dayVoteTime', 91, false],
    ['A01-B-023', '재판', 'tribunalTime', 14, false],
    ['A01-B-024', '재판', 'tribunalTime', 15, true],
    ['A01-B-025', '재판', 'tribunalTime', 120, true],
    ['A01-B-026', '재판', 'tribunalTime', 121, false],
    ['A01-B-027', '밤', 'nightActionTime', 29, false],
    ['A01-B-028', '밤', 'nightActionTime', 30, true],
    ['A01-B-029', '밤', 'nightActionTime', 120, true],
    ['A01-B-030', '밤', 'nightActionTime', 121, false],
];
for (const [no, label, key, value, pass] of TIME_CASES) {
    test(`${no} ${label} ${value}초 → ${pass ? '통과' : '거절'}`, () => {
        const r = validateCreateRoomPayload(base({ [key]: value }));
        assert.equal(r.ok, pass, r.message);
        if (pass) assert.equal(r.value.settings[key], value);
    });
}

// ── 간격 밖 값 (토론 30초 간격·재판 15초 간격) ──
test('A01-B-031 토론 45초(30초 간격 밖) → 거절', () => {
    assert.equal(validateCreateRoomPayload(base({ dayDiscussionTime: 45 })).ok, false);
});
test('A01-B-032 재판 20초(15초 간격 밖) → 거절', () => {
    assert.equal(validateCreateRoomPayload(base({ tribunalTime: 20 })).ok, false);
});

// ── 재판 시간이 투표 시간을 따라감 ──
test('A01-B-033 재판 60 = 투표 60 → 저장 설정에 tribunalTime 없음', () => {
    const r = validateCreateRoomPayload(base({ dayVoteTime: 60, tribunalTime: 60 }));
    assert.equal(r.ok, true, r.message);
    assert.equal(Object.hasOwn(r.value.settings, 'tribunalTime'), false);
});
test('A01-B-034 재판 안 보냄 → 저장 설정에 tribunalTime 없음', () => {
    const r = validateCreateRoomPayload(base());
    assert.equal(r.ok, true, r.message);
    assert.equal(Object.hasOwn(r.value.settings, 'tribunalTime'), false);
});
test('A01-B-035 재판 30·투표 60 → tribunalTime: 30', () => {
    const r = validateCreateRoomPayload(base({ dayVoteTime: 60, tribunalTime: 30 }));
    assert.equal(r.ok, true, r.message);
    assert.equal(r.value.settings.tribunalTime, 30);
});

// ── 공개 방식 ──
const ACCESS_CASES = [
    ['A01-B-036', 'open', true],
    ['A01-B-037', 'code', true],
    ['A01-B-038', 'private', false],
];
for (const [no, value, pass] of ACCESS_CASES) {
    test(`${no} 공개 방식 '${value}' → ${pass ? '통과' : '"공개 방식 값이 올바르지 않습니다."'}`, () => {
        const r = validateCreateRoomPayload(base({ accessType: value }));
        if (pass) {
            assert.equal(r.ok, true, r.message);
            assert.equal(r.value.accessType, value);
        } else {
            assert.equal(r.ok, false);
            assert.equal(r.message, '공개 방식 값이 올바르지 않습니다.');
        }
    });
}

// ── 지운 3칸은 받아도 버림 ──
const REMOVED_CASES = [
    ['A01-B-039', 'lightsOut', true],
    ['A01-B-040', 'soulBetting', true],
    ['A01-B-041', 'voteReveal', false],
];
for (const [no, key, value] of REMOVED_CASES) {
    test(`${no} 지운 칸 ${key}: ${value} 실음 → 통과, 돌려준 설정에 ${key} 없음`, () => {
        const r = validateCreateRoomPayload(base({ [key]: value }));
        assert.equal(r.ok, true, r.message);
        assert.equal(Object.hasOwn(r.value.settings, key), false);
        assert.equal(Object.hasOwn(r.value, key), false);
    });
}

test('A01-B-042 [지금 동작] 모르는 칸 foo: 1 → 통과, 설정에 foo 없음', () => {
    const r = validateCreateRoomPayload(base({ foo: 1 }));
    assert.equal(r.ok, true, r.message);
    assert.equal(Object.hasOwn(r.value.settings, 'foo'), false);
});

test('A01-B-043 [지금 동작] 본문 null → "잘못된 요청입니다."', () => {
    const r = validateCreateRoomPayload(null);
    assert.equal(r.ok, false);
    assert.equal(r.message, '잘못된 요청입니다.');
});

// ── 직업별 밤 시간 칸 (시민은 밤 행동 없음) ──
test('A01-B-044 roleNightActionTimes { DOCTOR: 60 } → 통과, 그대로 저장', () => {
    const r = validateCreateRoomPayload(base({ roleNightActionTimes: { DOCTOR: 60 } }));
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(r.value.settings.roleNightActionTimes, { DOCTOR: 60 });
});
test('A01-B-045 roleNightActionTimes { CITIZEN: 60 } → 거절', () => {
    assert.equal(validateCreateRoomPayload(base({ roleNightActionTimes: { CITIZEN: 60 } })).ok, false);
});
