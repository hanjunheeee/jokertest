'use strict';

// 밤 시험(판 규칙) — 밤 판정: 죽음 공개엔 직업 없음, 판정 전 나간 사람, 직업 넷 다 있는 판 한 밤
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-081~083·095~100, 돌리기: node --test tests/game-core/a05a-night-resolve.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 DB 주소를 닿지 않는 곳으로 막음 → 꼭 판 코드보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const desertion = require('../../services/game/desertion');

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
    return gf.startGame({ id: `a05a-nr-${seq}`, n, ...opts });
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
// 돌려줌: 방송 값(희생자·사망 공개·생존) + 개인 결과(받는 사람 uuid → 결과)
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

const isAlive = (view, uuid) => view.players.find((p) => p.uuid === uuid).alive;

// 차례대로 도는 밤 열기 (나가기는 차례 중에 일어나야 해서): 가짜 소켓·가짜 시계, 차례 30초
// 산 채로 나가면 탈주 기록을 DB에 씀 → 가짜 저장소로 바꿔 끼움 (끝에 원래대로)
function openTurns(t, s) {
    desertion.__setRepositoryForTests({
        findDesertionsForWarmup: async () => [],
        countDesertionsSince: async () => 0,
        insertDesertion: async () => ({ created: true, row: null }),
    });
    t.after(() => {
        desertion.__setRepositoryForTests(null);
        desertion.__resetForTests();
    });
    const world = gf.socketWorld(gs, s);
    const clock = gf.fakeClock();
    ST.startNightTurnSequence(world.io, s, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn,
        turnDurationMs: 30_000, randomFn: () => 0,
    });
    return { world, clock };
}

// 화면이 보내는 것처럼 "게임 나가기"
const leave = (world, s, uuid) => gf.call(ST.handleLeaveGameSession, world.io, world.sock(uuid), uuid, { gameId: s.id });

// 지금 열린 차례 (받은 시작이 끝보다 많으면 마지막 시작 직업)
function openTurn(world, uuid) {
    const started = world.received(uuid, 'night_turn_started');
    const ended = world.received(uuid, 'night_turn_ended');
    return started.length > ended.length ? started.at(-1).payload.role : null;
}

test('A05-B-081 6명: 광대 → A 죽음 공개는 [{ victimUuid: A, source: JOKER }], 직업 칸 없음', (t) => {
    const s = open(t, 6);
    passDay(s);
    const [a] = gf.byRole(s, 'CITIZEN');
    const { view } = runNight(s, [[gf.firstOf(s, 'JOKER'), a]]);
    assert.deepEqual(view.deathReveals, [{ victimUuid: a, source: 'JOKER' }]);
    for (const reveal of view.deathReveals) assert.equal('role' in reveal, false);
});

test('A05-B-082 6명: 광대 → A, 의사 차례 중 A가 나감 → 밤 희생자 없음', async (t) => {
    const s = open(t, 6);
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const [a] = gf.byRole(s, 'CITIZEN');
    const { world, clock } = openTurns(t, s);
    assert.equal(core.submitNightAction(joker, s.id, a).ok, true);
    clock.advance(30_000);
    assert.equal(openTurn(world, joker), 'DOCTOR', '의사 차례가 아님 (준비 잘못)');
    assert.equal((await leave(world, s, a)).ok, true);
    clock.advance(30_000);
    const [applied] = world.received(joker, 'night_result_applied');
    assert.ok(applied, '밤 결과를 못 받음');
    assert.equal(applied.payload.victimUuid, null);
    assert.deepEqual(applied.payload.deathReveals, []);
});

// 암살을 고른 광대가 빠져도 암살은 남음 (사용자 결정 2026-11-16 낮, 전엔 [지금 동작]이던 줄)
test('A05-B-083 7명 광대2: 광대 A → X 정해진 뒤 A가 나가도 X 죽음', async (t) => {
    const s = open(t, 7, { jokerCount: 2 });
    passDay(s);
    const [jokerA, jokerB] = gf.byRole(s, 'JOKER');
    const [x] = gf.byRole(s, 'CITIZEN');
    const { world, clock } = openTurns(t, s);
    assert.equal(core.submitNightAction(jokerA, s.id, x).ok, true);
    assert.equal(core.submitNightAction(jokerB, s.id, null).ok, true);
    clock.advance(30_000);
    assert.equal(openTurn(world, jokerB), 'DOCTOR', '광대 차례가 안 닫힘 (준비 잘못)');
    assert.equal((await leave(world, s, jokerA)).ok, true);
    clock.advance(30_000);
    const [applied] = world.received(jokerB, 'night_result_applied');
    assert.ok(applied, '밤 결과를 못 받음');
    assert.equal(applied.payload.victimUuid, x);
});

// ── 직업 넷 다 있는 판 한 밤 (10명 직접{광대1·의사1·경비원1·마녀사냥꾼1}, 둘째 밤, 첫날 처형된 시민 Z) ──
function fullTable(t) {
    const s = open(t, 10, { roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } });
    const [z, a, b] = gf.byRole(s, 'CITIZEN');
    executeDay(s, z);
    runNight(s);
    passDay(s);
    assert.equal(s.dayIndex, 2, '둘째 밤이 아님 (준비 잘못)');
    return {
        s, z, a, b,
        joker: gf.firstOf(s, 'JOKER'),
        doctor: gf.firstOf(s, 'DOCTOR'),
        guard: gf.firstOf(s, 'GUARD'),
        hunter: gf.firstOf(s, 'WITCH_HUNTER'),
    };
}

test('A05-B-095 넷 다 ①: 광대→A·의사→A·경비원→광대·마녀→Z → 희생자 없음, 광대 실패·경비원 광대·마녀 시민', (t) => {
    const g = fullTable(t);
    const { view, results } = runNight(g.s, [[g.joker, g.a], [g.doctor, g.a], [g.guard, g.joker], [g.hunter, g.z]]);
    assert.equal(view.victimUuid, null);
    assert.deepEqual(results.get(g.joker), { actionType: 'ASSASSINATE', success: false });
    assert.deepEqual(results.get(g.guard), { actionType: 'INVESTIGATE', targetId: g.joker, role: 'JOKER' });
    assert.deepEqual(results.get(g.hunter), { actionType: 'CONFIRM', targetId: g.z, role: 'CITIZEN' });
});

test('A05-B-096 넷 다 ②: 광대→경비원·의사→자기·경비원→광대·마녀→Z → 경비원 죽음·경비원 결과 없음·마녀 결과 있음', (t) => {
    const g = fullTable(t);
    const { view, results } = runNight(g.s, [[g.joker, g.guard], [g.doctor, g.doctor], [g.guard, g.joker], [g.hunter, g.z]]);
    assert.equal(isAlive(view, g.guard), false);
    assert.equal(results.has(g.guard), false);
    assert.deepEqual(results.get(g.hunter), { actionType: 'CONFIRM', targetId: g.z, role: 'CITIZEN' });
});

test('A05-B-097 넷 다 ③: 광대→마녀·의사→마녀·마녀→Z → 마녀 삶·마녀 결과 있음', (t) => {
    const g = fullTable(t);
    const { view, results } = runNight(g.s, [[g.joker, g.hunter], [g.doctor, g.hunter], [g.hunter, g.z]]);
    assert.equal(isAlive(view, g.hunter), true);
    assert.deepEqual(results.get(g.hunter), { actionType: 'CONFIRM', targetId: g.z, role: 'CITIZEN' });
});

test('A05-B-098 넷 다 ④: 광대→의사·의사→경비원·경비원→광대 → 의사 죽음·경비원 결과 있음', (t) => {
    const g = fullTable(t);
    const { view, results } = runNight(g.s, [[g.joker, g.doctor], [g.doctor, g.guard], [g.guard, g.joker]]);
    assert.equal(isAlive(view, g.doctor), false);
    assert.deepEqual(results.get(g.guard), { actionType: 'INVESTIGATE', targetId: g.joker, role: 'JOKER' });
});

test('A05-B-099 넷 다 ⑤: 전원 건너뜀 → 희생자 없음·개인 결과 0개', (t) => {
    const g = fullTable(t);
    const { view, results } = runNight(g.s, [[g.joker, null], [g.doctor, null], [g.guard, null], [g.hunter, null]]);
    assert.equal(view.victimUuid, null);
    assert.equal(results.size, 0);
});

test('A05-B-100 넷 다 ⑥: 광대→시민 B·의사→광대·경비원→A·마녀→Z → B 죽음·개인 결과는 경비원·마녀만', (t) => {
    const g = fullTable(t);
    const { view, results } = runNight(g.s, [[g.joker, g.b], [g.doctor, g.joker], [g.guard, g.a], [g.hunter, g.z]]);
    assert.equal(view.victimUuid, g.b);
    assert.deepEqual([...results.keys()].sort(), [g.guard, g.hunter].sort());
});
