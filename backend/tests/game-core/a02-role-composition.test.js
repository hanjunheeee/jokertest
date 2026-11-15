'use strict';

// 판 시작 역할 구성 시험 — 자동·직접 구성이 인원별로 몇 명씩 나오는지, 안 되는 구성은 거절되는지
// 목록 A02-B-001~055 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "역할 구성 계산")
const test = require('node:test');
const assert = require('node:assert/strict');

const gameSession = require('../../game-core/gameSession');

const { buildSessionCandidate } = gameSession.__testables;

// 구성 줄임 글자 → 역할 이름
const LETTER_TO_ROLE = { J: 'JOKER', D: 'DOCTOR', G: 'GUARD', W: 'WITCH_HUNTER', C: 'CITIZEN' };

// 'J1D1C4' → { JOKER:1, DOCTOR:1, GUARD:0, WITCH_HUNTER:0, CITIZEN:4 } (빠진 직업은 0)
function parseComposition(text) {
    const counts = { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 0 };
    for (const [, letter, num] of text.matchAll(/([JDGWC])(\d+)/g)) counts[LETTER_TO_ROLE[letter]] = Number(num);
    return counts;
}

// 지정 줄임 글자 → 직접 구성 칸 (네 직업만, 시민은 안 넣음) 예: 'J2D2' → { JOKER:2, DOCTOR:2, GUARD:0, WITCH_HUNTER:0 }
function customCounts(text) {
    const counts = parseComposition(text);
    delete counts.CITIZEN;
    return counts;
}

// 사람 n명 방 하나 (uuid는 시험마다 달라지게 앞글자 붙임)
function makeRoom(id, n, settings) {
    const players = Array.from({ length: n }, (_, i) => ({ uuid: `${id}-${i}`, nickname: `닉${id}${i}`, isReady: true }));
    return { id, players: new Map(players.map((p) => [p.uuid, p])), settings };
}

// 방 설정으로 판 후보를 만들어 실제로 나뉜 직업 수를 셈 (거절이면 ok:false)
function compose(id, n, settings) {
    const candidate = buildSessionCandidate(makeRoom(id, n, settings), { randomFn: () => 0, gameIdFn: () => `g-${id}` });
    if (!candidate.ok) return { ok: false, reason: candidate.reason };
    const counts = { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 0 };
    for (const p of candidate.session.players.values()) counts[p.role] += 1;
    return { ok: true, counts };
}

// 자동 구성 방 설정 (정원은 따로 안 주면 지금 인원)
const autoSettings = (jokerCount, maxPlayers) => ({ maxPlayers, jokerCount, roleCompositionMode: 'auto' });

// 직접 구성 방 설정 (광대 수 칸은 지정 광대 수와 같게, 방 만들기가 그렇게 저장함)
const customSettings = (roleCounts, maxPlayers = 10) => ({
    maxPlayers,
    jokerCount: roleCounts.JOKER,
    roleCompositionMode: 'custom',
    roleCounts,
});

// A02-B-001~006 자동 구성, 광대 1명
const AUTO_ONE_JOKER = [
    ['A02-B-001', 5, 'J1C4'],
    ['A02-B-002', 6, 'J1D1C4'],
    ['A02-B-003', 7, 'J1D1C5'],
    ['A02-B-004', 8, 'J1D1G1C5'],
    ['A02-B-005', 9, 'J1D1G1C6'],
    ['A02-B-006', 10, 'J1D1G1W1C6'],
];
for (const [no, n, expected] of AUTO_ONE_JOKER) {
    test(`${no} 자동 구성 광대 1명, ${n}명 → ${expected}`, () => {
        const r = compose(no, n, autoSettings(1, n));
        assert.equal(r.ok, true, `거절됨(${r.reason})`);
        assert.deepEqual(r.counts, parseComposition(expected));
    });
}

// A02-B-007~012 자동 구성, 광대 2명
const AUTO_TWO_JOKERS = [
    ['A02-B-007', 5, 'J2C3'],
    ['A02-B-008', 6, 'J2D1C3'],
    ['A02-B-009', 7, 'J2D1C4'],
    ['A02-B-010', 8, 'J2D1G1C4'],
    ['A02-B-011', 9, 'J2D1G1C5'],
    ['A02-B-012', 10, 'J2D1G1W1C5'],
];
for (const [no, n, expected] of AUTO_TWO_JOKERS) {
    test(`${no} 자동 구성 광대 2명, ${n}명 → ${expected}`, () => {
        const r = compose(no, n, autoSettings(2, n));
        assert.equal(r.ok, true, `거절됨(${r.reason})`);
        assert.deepEqual(r.counts, parseComposition(expected));
    });
}

// A02-B-013~016 자동 구성 광대 수 거절 (0명·3명)
const AUTO_JOKER_REJECT = [
    ['A02-B-013', 0, 5],
    ['A02-B-014', 0, 10],
    ['A02-B-015', 3, 5],
    ['A02-B-016', 3, 10],
];
for (const [no, jokers, n] of AUTO_JOKER_REJECT) {
    test(`${no} 자동 구성 광대 ${jokers}명 × ${n}명 → 거절`, () => {
        assert.equal(compose(no, n, autoSettings(jokers, n)).ok, false);
    });
}

// 직접 구성 표 돌리기: 지정은 같고 인원만 5~10 (남는 자리 시민)
function customByPlayerCount(firstNo, spec, fixedCount) {
    for (let i = 0; i < 6; i += 1) {
        const n = 5 + i;
        const no = `A02-B-${String(firstNo + i).padStart(3, '0')}`;
        const expected = `${spec}C${n - fixedCount}`;
        test(`${no} 직접 구성 ${spec}, ${n}명 → ${expected}`, () => {
            const r = compose(no, n, customSettings(customCounts(spec)));
            assert.equal(r.ok, true, `거절됨(${r.reason})`);
            assert.deepEqual(r.counts, parseComposition(expected));
        });
    }
}

// A02-B-017~022 광대 1명만 지정 → 시민 4~9명
customByPlayerCount(17, 'J1', 1);
// A02-B-023~028 네 직업 1명씩 → 시민 1~6명
customByPlayerCount(23, 'J1D1G1W1', 4);
// A02-B-029~034 광대 2·의사 2 → 시민 1~6명
customByPlayerCount(29, 'J2D2', 4);

// A02-B-035~040 시민 가장 적게 (시민 0명도 됨)
const FEWEST_CITIZENS = [
    ['A02-B-035', 5, 'J2D1G1W1', 'J2D1G1W1C0'],
    ['A02-B-036', 6, 'J2D2G1W1', 'J2D2G1W1C0'],
    ['A02-B-037', 7, 'J2D2G2W1', 'J2D2G2W1C0'],
    ['A02-B-038', 8, 'J2D2G2W2', 'J2D2G2W2C0'],
    ['A02-B-039', 9, 'J2D2G2W2', 'J2D2G2W2C1'],
    ['A02-B-040', 10, 'J2D2G2W2', 'J2D2G2W2C2'],
];
for (const [no, n, spec, expected] of FEWEST_CITIZENS) {
    test(`${no} 직접 구성 ${spec}, ${n}명 → ${expected}`, () => {
        const r = compose(no, n, customSettings(customCounts(spec)));
        assert.equal(r.ok, true, `거절됨(${r.reason})`);
        assert.deepEqual(r.counts, parseComposition(expected));
    });
}

test('A02-B-041 직접 구성 광대 0명(J0D1), 5명 → 거절', () => {
    assert.equal(compose('A02-B-041', 5, customSettings({ JOKER: 0, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })).ok, false);
});

// A02-B-042~045 직업마다 3명 지정 (나머지 직업 1명씩), 10명 → 거절
const THREE_OF_ONE = [
    ['A02-B-042', '광대', { JOKER: 3, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }],
    ['A02-B-043', '의사', { JOKER: 1, DOCTOR: 3, GUARD: 1, WITCH_HUNTER: 1 }],
    ['A02-B-044', '경비원', { JOKER: 1, DOCTOR: 1, GUARD: 3, WITCH_HUNTER: 1 }],
    ['A02-B-045', '마녀사냥꾼', { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 3 }],
];
for (const [no, label, roleCounts] of THREE_OF_ONE) {
    test(`${no} 직접 구성 ${label} 3명, 10명 → 거절`, () => {
        assert.equal(compose(no, 10, customSettings(roleCounts)).ok, false);
    });
}

// A02-B-046~048 지정 합(8명분)이 지금 인원보다 많음 → 거절
for (const [no, n] of [['A02-B-046', 5], ['A02-B-047', 6], ['A02-B-048', 7]]) {
    test(`${no} 직접 구성 J2D2G2W2(8명분), 지금 ${n}명 → 거절`, () => {
        assert.equal(compose(no, n, customSettings(customCounts('J2D2G2W2'))).ok, false);
    });
}

// A02-B-049~051 의사 수 값 모양이 틀림
const BAD_SHAPES = [
    ['A02-B-049', '-1', -1],
    ['A02-B-050', '1.5', 1.5],
    ['A02-B-051', '글자 "1"', '1'],
];
for (const [no, label, value] of BAD_SHAPES) {
    test(`${no} 직접 구성 의사 수 ${label}, 6명 → 거절`, () => {
        const roleCounts = { JOKER: 1, DOCTOR: value, GUARD: 0, WITCH_HUNTER: 0 };
        assert.equal(compose(no, 6, customSettings(roleCounts)).ok, false);
    });
}

test('A02-B-052 직접 구성에 시민 수 칸(CITIZEN: 3)을 끼움, 6명 → 거절', () => {
    const roleCounts = { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 3 };
    assert.equal(compose('A02-B-052', 6, customSettings(roleCounts)).ok, false);
});

test('A02-B-053 정원 10 직접 구성 J1D1, 지금 5명 → J1D1C3', () => {
    const r = compose('A02-B-053', 5, customSettings(customCounts('J1D1'), 10));
    assert.equal(r.ok, true, `거절됨(${r.reason})`);
    assert.deepEqual(r.counts, parseComposition('J1D1C3'));
});

// A02-B-054~055 자동은 정원이 아니라 지금 인원 기준
test('A02-B-054 정원 10 자동 광대 1, 지금 6명 → J1D1C4', () => {
    const r = compose('A02-B-054', 6, autoSettings(1, 10));
    assert.equal(r.ok, true, `거절됨(${r.reason})`);
    assert.deepEqual(r.counts, parseComposition('J1D1C4'));
});

test('A02-B-055 정원 10 자동 광대 1, 지금 9명 → 마녀사냥꾼 0명', () => {
    const r = compose('A02-B-055', 9, autoSettings(1, 10));
    assert.equal(r.ok, true, `거절됨(${r.reason})`);
    assert.equal(r.counts.WITCH_HUNTER, 0);
});
