'use strict';

// 밤 시험(판 규칙) — 밤 고름을 낸 뒤 판에서 빠진 사람: 이미 낸 고름은 남아 밤 판정에 그대로 쓰임
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-201~215, 돌리기: node --test tests/game-core/a05a-departed-pick.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 DB 주소를 닿지 않는 곳으로 막음 → 꼭 판 코드보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');

const core = gf.core;

// ── 판 차리기 도우미 (이 파일 안에서만 씀) ──
let seq = 0;

// 판 열기: 직업은 randomFn 0으로 늘 같게, 판 id는 시험마다 다르게
function open(t, n, opts = {}) {
    seq += 1;
    t.after(() => {
        gs.__resetStateForTests();
        gf.resetCore();
    });
    return gf.startGame({ id: `a05a-dp-${seq}`, n, ...opts });
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

// 밤 고름 내기 (받아야 함)
function pick(s, actor, target) {
    const reply = core.submitNightAction(actor, s.id, target);
    assert.equal(reply.ok, true, `밤 행동 거절(${reply.code}) (준비 잘못)`);
}

// 판에서 빠짐: PLAYER_LEFT = 스스로 나감, DISCONNECT_GRACE_EXPIRED = 끊겨 60초 못 돌아옴
function depart(s, uuid, reason = 'PLAYER_LEFT') {
    const departed = core.commitParticipantDeparture(s, uuid, { reason });
    assert.equal(departed.ok, true, `빠지기 거절(${departed.code}) (준비 잘못)`);
    assert.equal(departed.terminal, null, '빠지자 판이 끝남 (준비 잘못)');
    assert.equal(s.players.get(uuid).alive, false, '빠진 사람이 아직 산 사람 (준비 잘못)');
}

// 남은 산 사람은 건너뛰기 → 판정·확정
// 돌려줌: 방송 값(희생자·생존·의사가 살렸나) + 개인 결과(받는 사람 uuid → 결과)
function settleNight(s) {
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

// ── 의사 1명 (6명 광대1·의사1·시민4, 첫 밤): 보호를 고른 의사가 빠져도 보호는 남음 (사용자 결정 2026-11-16 아침 3번) ──
for (const [no, label, reason] of [
    ['A05-B-201', '스스로 나감', 'PLAYER_LEFT'],
    ['A05-B-202', '끊겨 60초 탈락', 'DISCONNECT_GRACE_EXPIRED'],
]) {
    test(`${no} 6명: 의사가 A 보호를 고른 뒤 ${label} → 광대가 A를 골라도 A 삶, "의사가 살렸다" 참`, (t) => {
        const s = open(t, 6);
        passDay(s);
        const doctor = gf.firstOf(s, 'DOCTOR');
        const [a] = gf.byRole(s, 'CITIZEN');
        pick(s, doctor, a);
        depart(s, doctor, reason);
        pick(s, gf.firstOf(s, 'JOKER'), a);
        const { view } = settleNight(s);
        assert.equal(view.victimUuid, null);
        assert.equal(view.doctorSaved, true);
        assert.equal(s.players.get(a).alive, true);
    });
}

// ── 광대 2명 (7명 광대2·의사1·시민4, 첫 밤): 암살을 고른 광대가 빠져도 그 암살은 남음 (사용자 결정 2026-11-16 낮 6번) ──
function jokerPair(t) {
    const s = open(t, 7, { jokerCount: 2 });
    passDay(s);
    const [jokerA, jokerB] = gf.byRole(s, 'JOKER');
    const [x, y] = gf.byRole(s, 'CITIZEN');
    return { s, jokerA, jokerB, x, y };
}

test('A05-B-203 7명 광대2: 광대 A가 X를 고른 뒤 빠지고 광대 B는 건너뜀 → X 죽음', (t) => {
    const g = jokerPair(t);
    pick(g.s, g.jokerA, g.x);
    depart(g.s, g.jokerA);
    pick(g.s, g.jokerB, null);
    const { view } = settleNight(g.s);
    assert.equal(view.victimUuid, g.x);
    assert.deepEqual(view.deathReveals, [{ victimUuid: g.x, source: 'JOKER' }]);
});

test('A05-B-204 7명 광대2: 광대 A가 X를 고른 뒤 빠지고 광대 B도 X → X 죽음', (t) => {
    const g = jokerPair(t);
    pick(g.s, g.jokerA, g.x);
    depart(g.s, g.jokerA, 'DISCONNECT_GRACE_EXPIRED');
    pick(g.s, g.jokerB, g.x);
    const { view } = settleNight(g.s);
    assert.equal(view.victimUuid, g.x);
});

// 둘 다 살아서 X·Y로 갈렸을 때(A05-B-033)와 같은 규칙: 같은 표 수면 아무도 안 죽음
test('A05-B-205 7명 광대2: 광대 A가 X를 고른 뒤 빠지고 광대 B는 Y → 1:1이라 죽은 사람 없음', (t) => {
    const g = jokerPair(t);
    pick(g.s, g.jokerA, g.x);
    depart(g.s, g.jokerA);
    pick(g.s, g.jokerB, g.y);
    const { view } = settleNight(g.s);
    assert.equal(view.victimUuid, null);
    assert.equal(g.s.players.get(g.x).alive, true);
    assert.equal(g.s.players.get(g.y).alive, true);
});

// 지키기: 안 낸 사람이 빠지면 "다 냈나"는 남은 사람만 셈
test('A05-B-206 7명 광대2: 안 고른 광대 A가 빠짐 → 광대 B만 고르면 광대 차례 다 낸 것, B가 고른 X 죽음', (t) => {
    const g = jokerPair(t);
    pick(g.s, g.jokerB, g.x);
    assert.equal(core.isRoleTurnComplete(g.s, 'JOKER'), false, '광대 A가 안 냈는데 다 낸 것으로 봄 (준비 잘못)');
    depart(g.s, g.jokerA);
    assert.equal(core.isRoleTurnComplete(g.s, 'JOKER'), true);
    const { view } = settleNight(g.s);
    assert.equal(view.victimUuid, g.x);
});

// 지키기: 빠진 사람을 고른 고름은 빈 값 — 빠진 사람이 남긴 고름도 똑같이
test('A05-B-207 7명 광대2: 광대 A가 X를 고르고 빠진 뒤 X도 나감 → 남은 고름이 빈 값, 죽은 사람 없음', (t) => {
    const g = jokerPair(t);
    pick(g.s, g.jokerA, g.x);
    depart(g.s, g.jokerA);
    depart(g.s, g.x);
    const { view } = settleNight(g.s);
    assert.equal(view.victimUuid, null);
    assert.deepEqual(view.deathReveals, []);
});

test('A05-B-208 6명: 의사가 자기 보호를 고르고 빠짐 → 그 고름은 빈 값, 광대가 고른 A 죽음·"의사가 살렸다" 거짓', (t) => {
    const s = open(t, 6);
    passDay(s);
    const doctor = gf.firstOf(s, 'DOCTOR');
    const [a] = gf.byRole(s, 'CITIZEN');
    pick(s, doctor, doctor);
    depart(s, doctor);
    pick(s, gf.firstOf(s, 'JOKER'), a);
    const { view } = settleNight(s);
    assert.equal(view.victimUuid, a);
    assert.equal(view.doctorSaved, false);
});

// ── 의사 2명 (8명 직접{광대1·의사2}, 첫 밤): 둘 다 살아 있을 때와 같은 규칙 (같은 사람이어야 보호, A05-B-037~040) ──
function doctorPair(t) {
    const s = open(t, 8, { roleCounts: { JOKER: 1, DOCTOR: 2 } });
    passDay(s);
    const [doctorA, doctorB] = gf.byRole(s, 'DOCTOR');
    const [a, b] = gf.byRole(s, 'CITIZEN');
    return { s, joker: gf.firstOf(s, 'JOKER'), doctorA, doctorB, a, b };
}

test('A05-B-209 8명 의사2: 의사 A가 X 보호를 고른 뒤 빠지고 의사 B는 건너뜀 → 광대가 X를 골라도 X 삶', (t) => {
    const g = doctorPair(t);
    pick(g.s, g.doctorA, g.a);
    depart(g.s, g.doctorA, 'DISCONNECT_GRACE_EXPIRED');
    pick(g.s, g.joker, g.a);
    pick(g.s, g.doctorB, null);
    const { view } = settleNight(g.s);
    assert.equal(view.victimUuid, null);
    assert.equal(view.doctorSaved, true);
});

test('A05-B-210 8명 의사2: 의사 A가 X 보호를 고른 뒤 빠지고 의사 B는 Y 보호 → 갈려서 보호 없음, 광대가 고른 X 죽음', (t) => {
    const g = doctorPair(t);
    pick(g.s, g.doctorA, g.a);
    depart(g.s, g.doctorA);
    pick(g.s, g.joker, g.a);
    pick(g.s, g.doctorB, g.b);
    const { view } = settleNight(g.s);
    assert.equal(view.victimUuid, g.a);
    assert.equal(view.doctorSaved, false);
});

// ── 경비원·마녀사냥꾼: 결과는 그 직업 산 사람에게만 감 — 받을 사람이 없으면 판에 영향 없음 ──
test('A05-B-211 8명: 경비원 1명이 광대 조사를 고른 뒤 빠짐 → 조사 결과 받는 사람 없음, 광대가 고른 A는 그대로 죽음', (t) => {
    const s = open(t, 8);
    passDay(s);
    const guard = gf.firstOf(s, 'GUARD');
    const joker = gf.firstOf(s, 'JOKER');
    const [a] = gf.byRole(s, 'CITIZEN');
    pick(s, guard, joker);
    depart(s, guard);
    pick(s, joker, a);
    const { view, results } = settleNight(s);
    assert.equal(view.victimUuid, a);
    assert.deepEqual([...results.values()].filter((r) => r.actionType === 'INVESTIGATE'), []);
    assert.equal(results.has(guard), false);
});

// 둘 다 살아서 한쪽만 고르고 한쪽이 건너뛴 때(A05-B-043)와 같은 규칙: 남은 경비원이 결과를 받음
test('A05-B-212 8명 경비원2: 경비원 A가 광대 조사를 고른 뒤 빠지고 경비원 B는 건너뜀 → B만 결과 받음', (t) => {
    const s = open(t, 8, { roleCounts: { JOKER: 1, GUARD: 2 } });
    passDay(s);
    const [guardA, guardB] = gf.byRole(s, 'GUARD');
    const joker = gf.firstOf(s, 'JOKER');
    pick(s, guardA, joker);
    depart(s, guardA);
    pick(s, guardB, null);
    const { results } = settleNight(s);
    assert.deepEqual(results.get(guardB), { actionType: 'INVESTIGATE', targetId: joker, role: 'JOKER' });
    assert.equal(results.has(guardA), false);
});

test('A05-B-213 8명 경비원2: 경비원 A가 광대 조사를 고른 뒤 빠지고 경비원 B는 시민 조사 → 갈려서 B도 결과 없음', (t) => {
    const s = open(t, 8, { roleCounts: { JOKER: 1, GUARD: 2 } });
    passDay(s);
    const [guardA, guardB] = gf.byRole(s, 'GUARD');
    pick(s, guardA, gf.firstOf(s, 'JOKER'));
    depart(s, guardA);
    pick(s, guardB, gf.byRole(s, 'CITIZEN')[0]);
    const { results } = settleNight(s);
    assert.equal(results.has(guardB), false);
    assert.equal(results.has(guardA), false);
});

test('A05-B-214 10명 둘째 밤: 마녀사냥꾼 1명이 죽은 Z 확인을 고른 뒤 빠짐 → 확인 결과 받는 사람 없음, 광대가 고른 A는 그대로 죽음', (t) => {
    const s = open(t, 10, { roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } });
    const [z, a] = gf.byRole(s, 'CITIZEN');
    executeDay(s, z);
    settleNight(s);
    passDay(s);
    assert.equal(s.dayIndex, 2, '둘째 밤이 아님 (준비 잘못)');
    const hunter = gf.firstOf(s, 'WITCH_HUNTER');
    pick(s, hunter, z);
    depart(s, hunter);
    pick(s, gf.firstOf(s, 'JOKER'), a);
    const { view, results } = settleNight(s);
    assert.equal(view.victimUuid, a);
    assert.deepEqual([...results.values()].filter((r) => r.actionType === 'CONFIRM'), []);
});

// ── 차례대로 도는 밤: 광대에게 찍힌 사람의 능력은 안 됨 — 고른 뒤 빠져도 그 고름은 안 셈 (찍힌 사람 규칙 그대로) ──
test('A05-B-215 8명 경비원2 (차례대로): 광대에게 찍힌 경비원 A가 광대 조사를 고른 뒤 빠지고 경비원 B는 건너뜀 → B 결과 없음', (t) => {
    const s = open(t, 8, { roleCounts: { JOKER: 1, GUARD: 2 } });
    passDay(s);
    const [guardA, guardB] = gf.byRole(s, 'GUARD');
    const joker = gf.firstOf(s, 'JOKER');
    assert.equal(core.markNightSequenced(s), true, '차례대로 도는 밤 표시 실패 (준비 잘못)');
    pick(s, joker, guardA);
    assert.equal(core.completeNightRole(s, 'JOKER').ok, true);
    assert.equal(core.completeNightRole(s, 'DOCTOR').ok, true);
    pick(s, guardA, joker);
    depart(s, guardA);
    pick(s, guardB, null);
    const closed = core.completeNightRole(s, 'GUARD');
    assert.equal(closed.ok, true, `경비원 차례 닫기 거절(${closed.code})`);
    assert.equal(closed.step.targetId, null);
    assert.equal(core.completeNightRole(s, 'WITCH_HUNTER').ok, true);
    const { results } = settleNight(s);
    assert.equal(results.has(guardB), false);
});
