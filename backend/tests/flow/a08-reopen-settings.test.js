'use strict';

// 판 끝 순간 다시 열린 대기방 설정 시험 — 코드·공개 방식·정원·광대 수·구성 방식·직접 구성·시간 4칸·직업별 밤 시간·방 이름이 그대로
// 목록 A08-B-021~044 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-reopen-settings.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a08-world');

// 판 하나 열고 광대를 처형해 끝냄 → 판 내용 + 장부에 다시 열린 같은 코드 방
async function playAndReopen(t, opts) {
    const w = makeWorld(t);
    const g = await w.openAndStart(opts);
    await w.endGame(g, 'citizenWin');
    const room = w.roomByCode(g.roomCode);
    assert.ok(room, '같은 코드 대기방이 안 열림');
    return { w, g, room };
}

// ── 코드·공개 방식·정원 (판 인원 = 정원) ──
const ACCESS_CASES = [
    ['open', 5], ['open', 7], ['open', 10],
    ['code', 5], ['code', 7], ['code', 10],
];
ACCESS_CASES.forEach(([accessType, max], i) => {
    test(`A08-B-${String(21 + i).padStart(3, '0')} ${accessType} 방·정원 ${max}(${max}명 판) 판 끝 → 같은 코드·${accessType}·정원 ${max} 대기방`, async (t) => {
        const { w, g, room } = await playAndReopen(t, { prefix: `b${21 + i}`, n: max, accessType });
        assert.equal(room.code, g.roomCode);
        assert.equal(room.accessType, accessType);
        assert.equal(room.settings.maxPlayers, max);
        // 들어간 사람이 받는 방 내용도 같음
        const r = await w.ret(g.uuids[1], g.gameId);
        assert.equal(r.ok, true, `대기방으로 실패: ${r.code}`);
        assert.equal(r.room.roomCode, g.roomCode);
        assert.equal(r.room.accessType, accessType);
        assert.equal(r.room.settings.maxPlayers, max);
    });
});

// ── 광대 수·구성 방식 (8명 판) ──
const COMPOSITION_CASES = [
    { label: '광대 1·자동', jokerCount: 1, roleCounts: null },
    { label: '광대 2·자동', jokerCount: 2, roleCounts: null },
    { label: '광대 1·직접(의사1·경비원1·마녀사냥꾼1)', jokerCount: 1, roleCounts: { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } },
    { label: '광대 2·직접(의사2·경비원1·마녀사냥꾼1)', jokerCount: 2, roleCounts: { DOCTOR: 2, GUARD: 1, WITCH_HUNTER: 1 } },
];
COMPOSITION_CASES.forEach((c, i) => {
    test(`A08-B-${String(27 + i).padStart(3, '0')} 8명 판 ${c.label} → 다시 연 방 jokerCount·roleCompositionMode·roleCounts 같음`, async (t) => {
        const { g, room } = await playAndReopen(t, { prefix: `b${27 + i}`, n: 8, jokerCount: c.jokerCount, roleCounts: c.roleCounts });
        assert.equal(room.settings.jokerCount, c.jokerCount);
        assert.equal(room.settings.roleCompositionMode, c.roleCounts ? 'custom' : 'auto');
        if (c.roleCounts) {
            assert.deepEqual(room.settings.roleCounts, { JOKER: c.jokerCount, ...c.roleCounts });
        } else {
            assert.equal(room.settings.roleCounts, undefined);
        }
        assert.deepEqual(room.settings, g.roomBefore.settings);
    });
});

// ── 직접 지정 구성 숫자 하나하나 ──
const CUSTOM_CASES = [
    { label: '광대2·의사2·경비원1 (8명 판)', n: 8, jokerCount: 2, roleCounts: { DOCTOR: 2, GUARD: 1, WITCH_HUNTER: 0 } },
    { label: '광대1·의사2·경비원1·마녀사냥꾼1 시민 0명 (5명 판)', n: 5, jokerCount: 1, roleCounts: { DOCTOR: 2, GUARD: 1, WITCH_HUNTER: 1 } },
    { label: '광대2 (5명 판)', n: 5, jokerCount: 2, roleCounts: { DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } },
    { label: '광대2·의사2·경비원2·마녀사냥꾼2 (10명 판)', n: 10, jokerCount: 2, roleCounts: { DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } },
];
CUSTOM_CASES.forEach((c, i) => {
    test(`A08-B-${String(31 + i).padStart(3, '0')} 직접 구성 ${c.label} → 다시 연 방 roleCounts 숫자 하나하나 같음`, async (t) => {
        const { room } = await playAndReopen(t, { prefix: `b${31 + i}`, n: c.n, jokerCount: c.jokerCount, roleCounts: c.roleCounts });
        const want = { JOKER: c.jokerCount, ...c.roleCounts };
        for (const role of ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
            assert.equal(room.settings.roleCounts?.[role], want[role], `${role} 수`);
        }
    });
});

// ── 시간 4칸 경계값 (6명 판) ──
const TIME_CASES = [
    ['dayDiscussionTime', 30], ['dayDiscussionTime', 150],
    ['dayVoteTime', 30], ['dayVoteTime', 90],
    ['tribunalTime', 15], ['tribunalTime', 120],
    ['nightActionTime', 30], ['nightActionTime', 120],
];
TIME_CASES.forEach(([field, value], i) => {
    test(`A08-B-${String(35 + i).padStart(3, '0')} 6명 판 ${field} ${value}초 → 다시 연 방 같은 값`, async (t) => {
        const { w, g, room } = await playAndReopen(t, { prefix: `b${35 + i}`, n: 6, times: { [field]: value } });
        assert.equal(room.settings[field], value);
        const r = await w.ret(g.uuids[1], g.gameId);
        assert.equal(r.ok, true, `대기방으로 실패: ${r.code}`);
        assert.equal(r.room.settings[field], value);
    });
});

test('A08-B-043 8명 판 직업마다 다른 밤 시간 → 다시 연 방 같은 값', async (t) => {
    const roleTimes = { JOKER: 60, DOCTOR: 90, GUARD: 120, WITCH_HUNTER: 30 };
    const { room } = await playAndReopen(t, { prefix: 'b043', n: 8, roleNightActionTimes: roleTimes });
    assert.deepEqual(room.settings.roleNightActionTimes, roleTimes);
});

test('A08-B-044 5명 판 "닉네임의 방" → 다시 연 방 이름 같음 [지금 동작]', async (t) => {
    const { g, room } = await playAndReopen(t, { prefix: 'b044', n: 5 });
    assert.equal(room.title, `닉-${g.host}의 방`);
    assert.equal(room.title, g.roomBefore.title);
});
