'use strict';

// 밤 시험(판 규칙) — 같은 직업 2명일 때: 광대는 많이 받은 쪽, 의사·경비원·마녀사냥꾼은 같은 사람을 골라야 됨
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-032~048, 돌리기: node --test tests/game-core/a05a-same-role.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 DB 주소를 닿지 않는 곳으로 막음 → 꼭 판 코드보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');

const core = gf.core;
const ST = gs.__testables;

// ── 판 차리기 도우미 (이 파일 안에서만 씀) ──
let seq = 0;

// 판 열기: 직업은 randomFn 0으로 늘 같게, 판 id는 시험마다 다르게
function open(t, n, opts = {}) {
    seq += 1;
    t.after(() => {
        gs.__resetStateForTests();
        gf.resetCore();
    });
    return gf.startGame({ id: `a05a-sm-${seq}`, n, ...opts });
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

// ── 광대 2명 표 세기 (7명 광대2·의사1·시민4, 의사 건너뜀, 첫 밤) ──
function jokerPair(t) {
    const s = open(t, 7, { jokerCount: 2 });
    passDay(s);
    const [jokerA, jokerB] = gf.byRole(s, 'JOKER');
    const [citizenA, citizenB] = gf.byRole(s, 'CITIZEN');
    return { s, jokerA, jokerB, citizenA, citizenB };
}

test('A05-B-032 광대 2명이 둘 다 시민 A → A 죽음', (t) => {
    const g = jokerPair(t);
    const { view } = runNight(g.s, [[g.jokerA, g.citizenA], [g.jokerB, g.citizenA]]);
    assert.equal(view.victimUuid, g.citizenA);
    assert.equal(isAlive(view, g.citizenA), false);
});

test('A05-B-033 광대 2명이 A·B 따로 → 아무도 안 죽음', (t) => {
    const g = jokerPair(t);
    const { view } = runNight(g.s, [[g.jokerA, g.citizenA], [g.jokerB, g.citizenB]]);
    assert.equal(view.victimUuid, null);
    assert.equal(view.players.every((p) => p.alive), true);
});

test('A05-B-034 광대 하나 A·하나 건너뜀 → A 죽음', (t) => {
    const g = jokerPair(t);
    const { view } = runNight(g.s, [[g.jokerA, g.citizenA], [g.jokerB, null]]);
    assert.equal(view.victimUuid, g.citizenA);
});

test('A05-B-035 광대 하나 A·하나 안 냄(차례 시간 끝) → A 죽음', (t) => {
    const g = jokerPair(t);
    // 차례대로 도는 밤: 광대 B는 끝까지 안 냄, 의사도 안 냄 (시간 끝 = 건너뛰기)
    const world = gf.socketWorld(gs, g.s);
    const clock = gf.fakeClock();
    ST.startNightTurnSequence(world.io, g.s, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn,
        turnDurationMs: 30_000, randomFn: () => 0,
    });
    assert.equal(core.submitNightAction(g.jokerA, g.s.id, g.citizenA).ok, true);
    clock.advance(30_000); // 광대 차례 끝
    clock.advance(30_000); // 의사 차례 끝 → 밤 결과
    const [applied] = world.received(g.jokerA, 'night_result_applied');
    assert.ok(applied, '밤 결과를 못 받음');
    assert.equal(applied.payload.victimUuid, g.citizenA);
});

test('A05-B-036 광대 2명 둘 다 건너뜀 → 아무도 안 죽음', (t) => {
    const g = jokerPair(t);
    const { view } = runNight(g.s, [[g.jokerA, null], [g.jokerB, null]]);
    assert.equal(view.victimUuid, null);
});

// ── 의사 2명 (8명 직접{광대1·의사2}, 광대가 시민 A 노림, 첫 밤) ──
function doctorPair(t) {
    const s = open(t, 8, { roleCounts: { JOKER: 1, DOCTOR: 2 } });
    passDay(s);
    const [doctorA, doctorB] = gf.byRole(s, 'DOCTOR');
    const [citizenA, citizenB] = gf.byRole(s, 'CITIZEN');
    return { s, joker: gf.firstOf(s, 'JOKER'), doctorA, doctorB, citizenA, citizenB };
}

const DOCTOR_PAIR = [
    ['A05-B-037', '둘 다 A', (g) => [g.citizenA, g.citizenA], true],
    ['A05-B-038', '하나 A·하나 B', (g) => [g.citizenA, g.citizenB], false],
    ['A05-B-039', '하나 A·하나 건너뜀(건너뛴 사람은 안 셈)', (g) => [g.citizenA, null], true],
    ['A05-B-040', '둘 다 건너뜀', () => [null, null], false],
];
for (const [no, label, picks, survives] of DOCTOR_PAIR) {
    test(`${no} 의사 2명 ${label} → 노린 시민 A ${survives ? '삶' : '죽음'}`, (t) => {
        const g = doctorPair(t);
        const [pickA, pickB] = picks(g);
        const { view } = runNight(g.s, [[g.joker, g.citizenA], [g.doctorA, pickA], [g.doctorB, pickB]]);
        assert.equal(isAlive(view, g.citizenA), survives);
        assert.equal(view.victimUuid, survives ? null : g.citizenA);
    });
}

// ── 경비원 2명 (8명 직접{광대1·경비원2}, 첫 밤) ──
function guardPair(t) {
    const s = open(t, 8, { roleCounts: { JOKER: 1, GUARD: 2 } });
    passDay(s);
    const [guardA, guardB] = gf.byRole(s, 'GUARD');
    return { s, joker: gf.firstOf(s, 'JOKER'), guardA, guardB, citizen: gf.byRole(s, 'CITIZEN')[0] };
}

test('A05-B-041 경비원 2명이 둘 다 광대 조사 → 두 경비원 모두 결과', (t) => {
    const g = guardPair(t);
    const { results } = runNight(g.s, [[g.guardA, g.joker], [g.guardB, g.joker]]);
    for (const guard of [g.guardA, g.guardB]) {
        assert.deepEqual(results.get(guard), { actionType: 'INVESTIGATE', targetId: g.joker, role: 'JOKER' });
    }
});

test('A05-B-042 경비원 2명이 따로 고름 → 둘 다 결과 없음', (t) => {
    const g = guardPair(t);
    const { results } = runNight(g.s, [[g.guardA, g.joker], [g.guardB, g.citizen]]);
    assert.equal(results.has(g.guardA), false);
    assert.equal(results.has(g.guardB), false);
});

test('A05-B-043 [지금 동작] 경비원 A가 광대 조사·B 건너뜀 → 두 경비원 모두 결과', (t) => {
    const g = guardPair(t);
    const { results } = runNight(g.s, [[g.guardA, g.joker], [g.guardB, null]]);
    for (const guard of [g.guardA, g.guardB]) {
        assert.deepEqual(results.get(guard), { actionType: 'INVESTIGATE', targetId: g.joker, role: 'JOKER' });
    }
});

test('A05-B-044 경비원 2명 둘 다 건너뜀 → 둘 다 결과 없음', (t) => {
    const g = guardPair(t);
    const { results } = runNight(g.s, [[g.guardA, null], [g.guardB, null]]);
    assert.equal(results.has(g.guardA), false);
    assert.equal(results.has(g.guardB), false);
});

// ── 마녀사냥꾼 2명 (10명 직접{광대1·마녀사냥꾼2}, 둘째 밤, 처형된 시민 X·Y) ──
function hunterPair(t) {
    const s = open(t, 10, { roleCounts: { JOKER: 1, WITCH_HUNTER: 2 } });
    const [deadX, deadY] = gf.byRole(s, 'CITIZEN');
    executeDay(s, deadX);
    runNight(s);
    executeDay(s, deadY);
    assert.equal(s.dayIndex, 2, '둘째 밤이 아님 (준비 잘못)');
    const [hunterA, hunterB] = gf.byRole(s, 'WITCH_HUNTER');
    return { s, hunterA, hunterB, deadX, deadY };
}

test('A05-B-045 마녀사냥꾼 2명이 둘 다 시민 X → 둘 다 결과', (t) => {
    const g = hunterPair(t);
    const { results } = runNight(g.s, [[g.hunterA, g.deadX], [g.hunterB, g.deadX]]);
    for (const hunter of [g.hunterA, g.hunterB]) {
        assert.deepEqual(results.get(hunter), { actionType: 'CONFIRM', targetId: g.deadX, role: 'CITIZEN' });
    }
});

test('A05-B-046 마녀사냥꾼 2명이 따로 고름 → 둘 다 결과 없음', (t) => {
    const g = hunterPair(t);
    const { results } = runNight(g.s, [[g.hunterA, g.deadX], [g.hunterB, g.deadY]]);
    assert.equal(results.has(g.hunterA), false);
    assert.equal(results.has(g.hunterB), false);
});

test('A05-B-047 [지금 동작] 마녀사냥꾼 A가 X·B 건너뜀 → 둘 다 결과', (t) => {
    const g = hunterPair(t);
    const { results } = runNight(g.s, [[g.hunterA, g.deadX], [g.hunterB, null]]);
    for (const hunter of [g.hunterA, g.hunterB]) {
        assert.deepEqual(results.get(hunter), { actionType: 'CONFIRM', targetId: g.deadX, role: 'CITIZEN' });
    }
});

test('A05-B-048 마녀사냥꾼 2명 둘 다 건너뜀 → 둘 다 결과 없음', (t) => {
    const g = hunterPair(t);
    const { results } = runNight(g.s, [[g.hunterA, null], [g.hunterB, null]]);
    assert.equal(results.has(g.hunterA), false);
    assert.equal(results.has(g.hunterB), false);
});
