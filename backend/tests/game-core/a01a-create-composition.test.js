'use strict';

// 방 만들 때 역할 구성 검사 시험 — 직접 지정 합·범위, 시민 0명, 광대 칸 어긋남, 자동인데 직업 수, 구성 방식 안 보냄
// 목록 A01-B-046~057 (docs/게임_의도_2026-11-15/시험목록/A01a-방만들기-설정-시작.md "방 만들 때 역할 구성 검사"), 돌리기: node --test tests/game-core/a01a-create-composition.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateCreateRoomPayload } = require('../../validations/room/create');
const { validateCreateRoomRoleComposition } = require('../../game-core/core/rules/roleComposition');

// 방 만들기와 같은 차례로 검사: 칸 값 → 역할 구성 (방 만들기 처리가 이 순서로 부름)
function checkCreate(payload) {
    const values = validateCreateRoomPayload(payload);
    if (!values.ok) return values;
    const composition = validateCreateRoomRoleComposition(payload, values.value.settings);
    if (!composition.ok) return composition;
    return { ok: true, settings: { ...values.value.settings, ...composition.value } };
}

// 직접 지정 방 만들기 값 (역할 수는 빠진 칸 0)
const custom = ({ maxPlayers = 10, jokerCount, roleCounts }) => ({
    accessType: 'open',
    maxPlayers,
    jokerCount,
    dayDiscussionTime: 60,
    dayVoteTime: 60,
    nightActionTime: 60,
    roleCompositionMode: 'custom',
    roleCounts: { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts },
});

const J2D2G2W2 = { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 };
const OVER_MESSAGE = '지정한 역할 인원의 합이 최대 플레이어 수를 넘습니다.';

// ── 직접 지정 합(8명분)이 정원을 넘으면 거절 ──
const SUM_CASES = [
    ['A01-B-046', 5, false],
    ['A01-B-047', 6, false],
    ['A01-B-048', 7, false],
    ['A01-B-049', 8, true],
    ['A01-B-050', 9, true],
    ['A01-B-051', 10, true],
];
for (const [no, maxPlayers, pass] of SUM_CASES) {
    test(`${no} J2D2G2W2 × 정원 ${maxPlayers} → ${pass ? '통과' : `"${OVER_MESSAGE}"`}`, () => {
        const r = checkCreate(custom({ maxPlayers, jokerCount: 2, roleCounts: J2D2G2W2 }));
        if (pass) {
            assert.equal(r.ok, true, r.message);
            assert.deepEqual(r.settings.roleCounts, J2D2G2W2);
        } else {
            assert.equal(r.ok, false);
            assert.equal(r.message, OVER_MESSAGE);
        }
    });
}

// ── 직접 지정 범위 밖 (0~2명, 광대 1명 이상) ──
test('A01-B-052 정원 10, 직접 광대 0 → "광대는 최소 1명이어야 합니다."', () => {
    const r = checkCreate(custom({ jokerCount: 1, roleCounts: { JOKER: 0 } }));
    assert.equal(r.ok, false);
    assert.equal(r.message, '광대는 최소 1명이어야 합니다.');
});
test('A01-B-053 정원 10, 직접 의사 3 → "역할별 인원은 최대 2명까지…"', () => {
    const r = checkCreate(custom({ jokerCount: 1, roleCounts: { JOKER: 1, DOCTOR: 3 } }));
    assert.equal(r.ok, false);
    assert.match(r.message, /^역할별 인원은 최대 2명까지/);
});

test('A01-B-054 정원 5, J2D1G1W1(시민 0명) → 통과', () => {
    const r = checkCreate(custom({ maxPlayers: 5, jokerCount: 2, roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } }));
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(r.settings.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 });
});

test('A01-B-055 [지금 동작] jokerCount 2 + roleCounts.JOKER 1 → "광대 수 설정이 서로 어긋났습니다."', () => {
    const r = checkCreate(custom({ jokerCount: 2, roleCounts: { JOKER: 1 } }));
    assert.equal(r.ok, false);
    assert.equal(r.message, '광대 수 설정이 서로 어긋났습니다.');
});

test('A01-B-056 [지금 동작] 자동인데 roleCounts 보냄 → "자동 구성에서는 역할별 인원을 지정할 수 없습니다."', () => {
    const payload = { ...custom({ jokerCount: 1, roleCounts: { JOKER: 1 } }), roleCompositionMode: 'auto' };
    const r = checkCreate(payload);
    assert.equal(r.ok, false);
    assert.equal(r.message, '자동 구성에서는 역할별 인원을 지정할 수 없습니다.');
});

test('A01-B-057 구성 방식 안 보냄 → 통과, \'auto\'로 저장', () => {
    const r = checkCreate({
        accessType: 'open', maxPlayers: 10, jokerCount: 2, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60,
    });
    assert.equal(r.ok, true, r.message);
    assert.equal(r.settings.roleCompositionMode, 'auto');
    assert.equal(Object.hasOwn(r.settings, 'roleCounts'), false);
});
