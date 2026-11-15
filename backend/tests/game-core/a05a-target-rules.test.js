'use strict';

// 밤 시험(판 규칙만) — 광대·의사·경비원·마녀사냥꾼이 밤에 고를 수 있는 대상, 받음·거절만 봄
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-001~022, 돌리기: node --test tests/game-core/a05a-target-rules.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 DB 주소를 닿지 않는 곳으로 막음 → 꼭 판 코드보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');

const core = gf.core;

// ── 판 차리기 도우미 (이 파일 안에서만 씀) ──
let seq = 0;

// 판 열기: 직업은 randomFn 0으로 늘 같게, 판 id는 시험마다 다르게 (같으면 "이미 다른 판"으로 터짐)
function open(t, n, opts = {}) {
    seq += 1;
    t.after(() => gf.resetCore());
    return gf.startGame({ id: `a05a-tr-${seq}`, n, ...opts });
}

const aliveUuids = (s) => [...s.players.values()].filter((p) => p.alive).map((p) => p.uuid);

// 낮을 모두 기권으로 넘김 → 재판 없이 밤
function passDay(s) {
    if (s.phase === 'ROLE_REVEAL') gf.toDay(s);
    gf.toVote(s);
    const voters = aliveUuids(s);
    for (const uuid of voters) core.submitDayVote(uuid, s.id, null);
    const prepared = core.prepareDayVoteResolution(voters[0], s.id, s.dayIndex);
    core.commitDayVoteResolution(prepared.session, prepared.resolution);
    assert.equal(s.phase, 'NIGHT', '기권 낮 뒤 밤이 아님 (준비 잘못)');
}

// 낮에 한 사람 재판 → 모두 유죄 → 처형 뒤 밤
function executeDay(s, uuid) {
    gf.toTribunal(s, uuid);
    const voters = aliveUuids(s).filter((u) => u !== uuid);
    for (const voter of voters) core.submitTribunalVote(voter, s.id, s.dayIndex, 'GUILTY');
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(s.players.get(uuid).alive, false, '처형 안 됨 (준비 잘못)');
    assert.equal(s.phase, 'NIGHT', '처형 뒤 밤이 아님 (준비 잘못)');
}

// 밤 아무도 안 고름(전원 건너뛰기) → 다음 낮
function quietNight(s) {
    gf.skipAllNight(s);
    const prepared = core.prepareNightResolution(aliveUuids(s)[0], s.id);
    assert.equal(prepared.ok, true, `밤 판정 준비 거절(${prepared.code})`);
    core.commitNightResolution(prepared.session, prepared.resolution);
}

// 밤 행동 하나 보내고 받음 여부만
const pick = (s, actor, target) => core.submitNightAction(actor, s.id, target).ok;

// ── 1-1 광대 대상 (7명 광대2·의사1·시민4, 시민 1명 첫날 처형, 첫 밤) ──
function jokerTable(t) {
    const s = open(t, 7, { jokerCount: 2 });
    const [jokerA, jokerB] = gf.byRole(s, 'JOKER');
    const [deadCitizen, aliveCitizen] = gf.byRole(s, 'CITIZEN');
    executeDay(s, deadCitizen);
    return { s, jokerA, jokerB, doctor: gf.firstOf(s, 'DOCTOR'), deadCitizen, aliveCitizen };
}

const JOKER_CASES = [
    ['A05-B-001', '자기', (g) => g.jokerA, false],
    ['A05-B-002', '동료 광대', (g) => g.jokerB, false],
    ['A05-B-003', '산 의사', (g) => g.doctor, true],
    ['A05-B-004', '죽은 시민', (g) => g.deadCitizen, false],
    ['A05-B-005', '산 시민', (g) => g.aliveCitizen, true],
];
for (const [no, label, target, ok] of JOKER_CASES) {
    test(`${no} 7명 광대2 첫 밤: 광대가 ${label} 고르면 ${ok ? '받음' : '거절'}`, (t) => {
        const g = jokerTable(t);
        assert.equal(pick(g.s, g.jokerA, target(g)), ok);
    });
}

// ── 의사 대상 (8명 직접{광대1·의사2}, 시민 1명 처형, 첫 밤) ──
function doctorTable(t) {
    const s = open(t, 8, { roleCounts: { JOKER: 1, DOCTOR: 2 } });
    const [doctorA, doctorB] = gf.byRole(s, 'DOCTOR');
    const [deadCitizen, aliveCitizen] = gf.byRole(s, 'CITIZEN');
    executeDay(s, deadCitizen);
    return { s, doctorA, doctorB, joker: gf.firstOf(s, 'JOKER'), deadCitizen, aliveCitizen };
}

const DOCTOR_CASES = [
    ['A05-B-006', '자기', (g) => g.doctorA, true],
    ['A05-B-007', '동료 의사', (g) => g.doctorB, true],
    ['A05-B-008', '산 광대', (g) => g.joker, true],
    ['A05-B-009', '죽은 시민', (g) => g.deadCitizen, false],
    ['A05-B-010', '산 시민', (g) => g.aliveCitizen, true],
];
for (const [no, label, target, ok] of DOCTOR_CASES) {
    test(`${no} 8명 의사2 첫 밤: 의사가 ${label} 고르면 ${ok ? '받음' : '거절'}`, (t) => {
        const g = doctorTable(t);
        assert.equal(pick(g.s, g.doctorA, target(g)), ok);
    });
}

// ── 경비원 대상 (8명 직접{광대1·경비원2}, 시민 1명 처형, 첫 밤) ──
function guardTable(t) {
    const s = open(t, 8, { roleCounts: { JOKER: 1, GUARD: 2 } });
    const [guardA, guardB] = gf.byRole(s, 'GUARD');
    const [deadCitizen, aliveCitizen] = gf.byRole(s, 'CITIZEN');
    executeDay(s, deadCitizen);
    return { s, guardA, guardB, joker: gf.firstOf(s, 'JOKER'), deadCitizen, aliveCitizen };
}

test('A05-B-011 [지금 동작] 8명 경비원2: 경비원이 자기를 고르면 거절', (t) => {
    const g = guardTable(t);
    assert.equal(pick(g.s, g.guardA, g.guardA), false);
});

const GUARD_CASES = [
    ['A05-B-012', '동료 경비원', (g) => g.guardB, true],
    ['A05-B-013', '산 광대', (g) => g.joker, true],
    ['A05-B-014', '죽은 시민', (g) => g.deadCitizen, false],
    ['A05-B-015', '산 시민', (g) => g.aliveCitizen, true],
];
for (const [no, label, target, ok] of GUARD_CASES) {
    test(`${no} 8명 경비원2 첫 밤: 경비원이 ${label} 고르면 ${ok ? '받음' : '거절'}`, (t) => {
        const g = guardTable(t);
        assert.equal(pick(g.s, g.guardA, target(g)), ok);
    });
}

// ── 마녀사냥꾼 대상 (10명 직접{광대1·의사1·경비원1·마녀사냥꾼2}, 시민 1명 처형, 둘째 밤) ──
function hunterTable(t) {
    const s = open(t, 10, { roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 2 } });
    const [hunterA, hunterB] = gf.byRole(s, 'WITCH_HUNTER');
    const [deadCitizen, aliveCitizen] = gf.byRole(s, 'CITIZEN');
    executeDay(s, deadCitizen);
    quietNight(s);
    passDay(s);
    assert.equal(s.dayIndex, 2, '둘째 밤이 아님 (준비 잘못)');
    return { s, hunterA, hunterB, joker: gf.firstOf(s, 'JOKER'), deadCitizen, aliveCitizen };
}

const HUNTER_CASES = [
    ['A05-B-016', '자기(산)', (g) => g.hunterA, false],
    ['A05-B-017', '산 동료 마녀사냥꾼', (g) => g.hunterB, false],
    ['A05-B-018', '산 광대', (g) => g.joker, false],
    ['A05-B-019', '죽은 시민', (g) => g.deadCitizen, true],
    ['A05-B-020', '산 시민', (g) => g.aliveCitizen, false],
];
for (const [no, label, target, ok] of HUNTER_CASES) {
    test(`${no} 10명 마녀사냥꾼2 둘째 밤: 마녀사냥꾼이 ${label} 고르면 ${ok ? '받음' : '거절'}`, (t) => {
        const g = hunterTable(t);
        assert.equal(pick(g.s, g.hunterA, target(g)), ok);
    });
}

// ── 마녀사냥꾼은 죽은 사람이면 직업 상관없이 (10명, 셋째 밤) ──
// 첫날 처형 → 밤·낮 조용히 두 번 → 셋째 밤
function toThirdNight(s, executed) {
    executeDay(s, executed);
    quietNight(s);
    passDay(s);
    quietNight(s);
    passDay(s);
    assert.equal(s.dayIndex, 3, '셋째 밤이 아님 (준비 잘못)');
}

test('A05-B-021 10명 광대2 셋째 밤: 마녀사냥꾼이 처형된 광대를 고르면 받음', (t) => {
    const s = open(t, 10, { jokerCount: 2 });
    const [deadJoker] = gf.byRole(s, 'JOKER');
    toThirdNight(s, deadJoker);
    assert.equal(pick(s, gf.firstOf(s, 'WITCH_HUNTER'), deadJoker), true);
});

test('A05-B-022 10명 마녀사냥꾼2 셋째 밤: 마녀사냥꾼이 죽은 동료 마녀사냥꾼을 고르면 받음', (t) => {
    const s = open(t, 10, { roleCounts: { JOKER: 1, WITCH_HUNTER: 2 } });
    const [deadHunter, hunter] = gf.byRole(s, 'WITCH_HUNTER');
    toThirdNight(s, deadHunter);
    assert.equal(pick(s, hunter, deadHunter), true);
});
