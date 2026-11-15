'use strict';

// 밤 시험(판 규칙) — 광대에게 찍힌 사람의 그 밤 능력: 못 살면 능력 안 먹힘, 의사가 살리면 먹힘, 의사는 찍혀도 먹힘
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-049~064, 돌리기: node --test tests/game-core/a05a-marked-ability.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 DB 주소를 닿지 않는 곳으로 막음 → 꼭 판 코드보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');

const core = gf.core;

// ── 판 차리기 도우미 (이 파일 안에서만 씀) ──
let seq = 0;

// 판 열기: 직업은 randomFn 0으로 늘 같게, 판 id는 시험마다 다르게
function open(t, n, opts = {}) {
    seq += 1;
    t.after(() => gf.resetCore());
    return gf.startGame({ id: `a05a-mk-${seq}`, n, ...opts });
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
}

// 밤 한 번: 준 행동을 내고 나머지 산 사람은 건너뛰기 → 판정·확정
// 돌려줌: 방송 값(누가 살았나·희생자) + 개인 결과(받는 사람 uuid → 결과)
function runNight(s, actions = []) {
    for (const [actor, target] of actions) {
        const reply = core.submitNightAction(actor, s.id, target);
        assert.equal(reply.ok, true, `밤 행동 거절(${reply.code}) (준비 잘못)`);
    }
    gf.skipAllNight(s);
    const prepared = core.prepareNightResolution(aliveUuids(s)[0], s.id);
    assert.equal(prepared.ok, true, `밤 판정 준비 거절(${prepared.code})`);
    const committed = core.commitNightResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `밤 확정 거절(${committed.code})`);
    const view = core.buildNightResultAppliedPayload(s, committed.victimUuid, prepared.resolution.publicDeathReveals, {
        doctorSaved: prepared.resolution.doctorSaved,
    });
    return { view, results: prepared.resolution.privateResults };
}

// 방송 값에서 그 사람이 살았나
const isAlive = (view, uuid) => view.players.find((p) => p.uuid === uuid).alive;

// 첫날 시민 처형 → 조용한 첫 밤 → 기권 낮 → 둘째 밤, 처형된 시민 돌려줌
function toSecondNightWithDead(s) {
    const [dead] = gf.byRole(s, 'CITIZEN');
    executeDay(s, dead);
    runNight(s);
    passDay(s);
    assert.equal(s.dayIndex, 2, '둘째 밤이 아님 (준비 잘못)');
    return dead;
}

test('A05-B-049 5명 직접{광대1·경비원1}: 찍힌 경비원이 광대 조사, 의사 없음 → 결과 없음·경비원 죽음', (t) => {
    const s = open(t, 5, { roleCounts: { JOKER: 1, GUARD: 1 } });
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const guard = gf.firstOf(s, 'GUARD');
    const { view, results } = runNight(s, [[joker, guard], [guard, joker]]);
    assert.equal(results.has(guard), false);
    assert.equal(isAlive(view, guard), false);
});

test('A05-B-050 6명 직접{광대1·의사1·경비원1}: 찍힌 경비원을 의사가 살림 → 경비원 결과(광대)·삶', (t) => {
    const s = open(t, 6, { roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1 } });
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const guard = gf.firstOf(s, 'GUARD');
    const { view, results } = runNight(s, [[joker, guard], [gf.firstOf(s, 'DOCTOR'), guard], [guard, joker]]);
    assert.deepEqual(results.get(guard), { actionType: 'INVESTIGATE', targetId: joker, role: 'JOKER' });
    assert.equal(isAlive(view, guard), true);
});

test('A05-B-051 6명 같은 구성: 찍힌 경비원, 의사가 딴 사람 지킴 → 결과 없음·경비원 죽음', (t) => {
    const s = open(t, 6, { roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1 } });
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const guard = gf.firstOf(s, 'GUARD');
    const [citizen] = gf.byRole(s, 'CITIZEN');
    const { view, results } = runNight(s, [[joker, guard], [gf.firstOf(s, 'DOCTOR'), citizen], [guard, joker]]);
    assert.equal(results.has(guard), false);
    assert.equal(isAlive(view, guard), false);
});

test('A05-B-052 6명 직접{광대1·마녀사냥꾼1} 둘째 밤: 찍힌 마녀사냥꾼, 의사 없음 → 결과 없음·죽음', (t) => {
    const s = open(t, 6, { roleCounts: { JOKER: 1, WITCH_HUNTER: 1 } });
    const dead = toSecondNightWithDead(s);
    const joker = gf.firstOf(s, 'JOKER');
    const hunter = gf.firstOf(s, 'WITCH_HUNTER');
    const { view, results } = runNight(s, [[joker, hunter], [hunter, dead]]);
    assert.equal(results.has(hunter), false);
    assert.equal(isAlive(view, hunter), false);
});

test('A05-B-053 7명 직접{광대1·의사1·마녀사냥꾼1} 둘째 밤: 찍힌 마녀사냥꾼을 의사가 살림 → 결과 받음·삶', (t) => {
    const s = open(t, 7, { roleCounts: { JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 } });
    const dead = toSecondNightWithDead(s);
    const joker = gf.firstOf(s, 'JOKER');
    const hunter = gf.firstOf(s, 'WITCH_HUNTER');
    const { view, results } = runNight(s, [[joker, hunter], [gf.firstOf(s, 'DOCTOR'), hunter], [hunter, dead]]);
    assert.deepEqual(results.get(hunter), { actionType: 'CONFIRM', targetId: dead, role: 'CITIZEN' });
    assert.equal(isAlive(view, hunter), true);
});

test('A05-B-054 6명: 찍힌 의사가 자기를 지킴 → 의사 삶, 광대에게 암살 실패 결과', (t) => {
    const s = open(t, 6);
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const doctor = gf.firstOf(s, 'DOCTOR');
    const { view, results } = runNight(s, [[joker, doctor], [doctor, doctor]]);
    assert.equal(isAlive(view, doctor), true);
    assert.deepEqual(results.get(joker), { actionType: 'ASSASSINATE', success: false });
});

test('A05-B-055 6명: 찍힌 의사가 딴 사람을 지킴 → 의사 죽음', (t) => {
    const s = open(t, 6);
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const doctor = gf.firstOf(s, 'DOCTOR');
    const [citizen] = gf.byRole(s, 'CITIZEN');
    const { view } = runNight(s, [[joker, doctor], [doctor, citizen]]);
    assert.equal(isAlive(view, doctor), false);
});

test('A05-B-056 6명: 찍힌 의사가 건너뜀 → 의사 죽음', (t) => {
    const s = open(t, 6);
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const doctor = gf.firstOf(s, 'DOCTOR');
    const { view } = runNight(s, [[joker, doctor], [doctor, null]]);
    assert.equal(isAlive(view, doctor), false);
});

// 8명 직접{광대1·의사2}
function doctorPair(t) {
    const s = open(t, 8, { roleCounts: { JOKER: 1, DOCTOR: 2 } });
    passDay(s);
    const [doctorA, doctorB] = gf.byRole(s, 'DOCTOR');
    return { s, joker: gf.firstOf(s, 'JOKER'), doctorA, doctorB, citizen: gf.byRole(s, 'CITIZEN')[0] };
}

test('A05-B-057 의사 2명 중 찍힌 A도 셈에 들어감: 둘 다 A 지킴 → A 삶', (t) => {
    const g = doctorPair(t);
    const { view } = runNight(g.s, [[g.joker, g.doctorA], [g.doctorA, g.doctorA], [g.doctorB, g.doctorA]]);
    assert.equal(isAlive(view, g.doctorA), true);
});

test('A05-B-058 의사 2명이 갈림(A→자기, B→시민) → 찍힌 A 죽음', (t) => {
    const g = doctorPair(t);
    const { view } = runNight(g.s, [[g.joker, g.doctorA], [g.doctorA, g.doctorA], [g.doctorB, g.citizen]]);
    assert.equal(isAlive(view, g.doctorA), false);
});

// 8명 직접{광대1·경비원2}
function guardPair(t, n = 8, roleCounts = { JOKER: 1, GUARD: 2 }) {
    const s = open(t, n, { roleCounts });
    passDay(s);
    const [guardA, guardB] = gf.byRole(s, 'GUARD');
    return { s, joker: gf.firstOf(s, 'JOKER'), guardA, guardB, citizen: gf.byRole(s, 'CITIZEN')[0] };
}

test('A05-B-059 경비원 2명 중 A 찍힘(못 살림), 둘 다 광대 조사 → B만 결과, A 결과 없음·죽음', (t) => {
    const g = guardPair(t);
    const { view, results } = runNight(g.s, [[g.joker, g.guardA], [g.guardA, g.joker], [g.guardB, g.joker]]);
    assert.deepEqual(results.get(g.guardB), { actionType: 'INVESTIGATE', targetId: g.joker, role: 'JOKER' });
    assert.equal(results.has(g.guardA), false);
    assert.equal(isAlive(view, g.guardA), false);
});

test('A05-B-060 경비원 2명 중 A 찍힘(못 살림), A→시민·B→광대 → A 고름은 빠져 B가 광대 결과, A 결과 없음', (t) => {
    const g = guardPair(t);
    const { results } = runNight(g.s, [[g.joker, g.guardA], [g.guardA, g.citizen], [g.guardB, g.joker]]);
    assert.deepEqual(results.get(g.guardB), { actionType: 'INVESTIGATE', targetId: g.joker, role: 'JOKER' });
    assert.equal(results.has(g.guardA), false);
});

test('A05-B-061 9명 직접{광대1·의사1·경비원2}: 찍힌 A를 의사가 살림, A→시민·B→광대 → 갈려서 둘 다 결과 없음', (t) => {
    const g = guardPair(t, 9, { JOKER: 1, DOCTOR: 1, GUARD: 2 });
    const doctor = gf.firstOf(g.s, 'DOCTOR');
    const { results } = runNight(g.s, [
        [g.joker, g.guardA], [doctor, g.guardA], [g.guardA, g.citizen], [g.guardB, g.joker],
    ]);
    assert.equal(results.has(g.guardA), false);
    assert.equal(results.has(g.guardB), false);
});

test('A05-B-062 10명 직접{광대1·마녀사냥꾼2} 둘째 밤: 찍힌 A(못 살림), 같은 대상 → B만 결과, A 죽음', (t) => {
    const s = open(t, 10, { roleCounts: { JOKER: 1, WITCH_HUNTER: 2 } });
    const dead = toSecondNightWithDead(s);
    const joker = gf.firstOf(s, 'JOKER');
    const [hunterA, hunterB] = gf.byRole(s, 'WITCH_HUNTER');
    const { view, results } = runNight(s, [[joker, hunterA], [hunterA, dead], [hunterB, dead]]);
    assert.deepEqual(results.get(hunterB), { actionType: 'CONFIRM', targetId: dead, role: 'CITIZEN' });
    assert.equal(results.has(hunterA), false);
    assert.equal(isAlive(view, hunterA), false);
});

test('A05-B-063 8명: 경비원이 조사한 시민 A가 그 밤 죽음 → 경비원 결과(시민) 받음, A 죽음', (t) => {
    const s = open(t, 8);
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const guard = gf.firstOf(s, 'GUARD');
    const [citizen] = gf.byRole(s, 'CITIZEN');
    const { view, results } = runNight(s, [[joker, citizen], [guard, citizen]]);
    assert.deepEqual(results.get(guard), { actionType: 'INVESTIGATE', targetId: citizen, role: 'CITIZEN' });
    assert.equal(isAlive(view, citizen), false);
});

test('A05-B-064 5명: 찍힌 사람이 시민이면 그냥 죽음, 개인 결과 0개', (t) => {
    const s = open(t, 5);
    passDay(s);
    const [citizen] = gf.byRole(s, 'CITIZEN');
    const { view, results } = runNight(s, [[gf.firstOf(s, 'JOKER'), citizen]]);
    assert.equal(isAlive(view, citizen), false);
    assert.equal(results.size, 0);
});
