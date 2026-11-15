'use strict';

// 밤 시험(판 규칙) — 죽은 사람·시민·남의 차례·늦게 냄·낮·판 밖 대상 거절, 건너뛰기·다시 내기
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-023~031, 돌리기: node --test tests/game-core/a05a-submit-reject.test.js
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
    return gf.startGame({ id: `a05a-sr-${seq}`, n, ...opts });
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

// 차례대로 도는 밤 열기: 가짜 소켓·가짜 시계, 차례 30초 (차례 규칙은 소켓 쪽 순서가 정함)
function openTurns(s) {
    const world = gf.socketWorld(gs, s);
    const clock = gf.fakeClock();
    ST.startNightTurnSequence(world.io, s, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn,
        turnDurationMs: 30_000, randomFn: () => 0,
    });
    return { world, clock };
}

// 지금 열린 차례: 받은 "차례 시작"이 "차례 끝"보다 많으면 마지막 시작 직업, 아니면 없음
function openTurn(world, uuid) {
    const started = world.received(uuid, 'night_turn_started');
    const ended = world.received(uuid, 'night_turn_ended');
    return started.length > ended.length ? started.at(-1).payload.role : null;
}

test('A05-B-023 6명 처형된 의사: 의사 차례에 죽은 의사가 보내면 거절', (t) => {
    const s = open(t, 6);
    const doctor = gf.firstOf(s, 'DOCTOR');
    const joker = gf.firstOf(s, 'JOKER');
    executeDay(s, doctor);
    const { world, clock } = openTurns(s);
    // 광대 차례 마감 30초 → 의사 차례 열림 (빈 차례라 무작위 0이면 6초 뒤 닫힘)
    clock.advance(30_000);
    assert.equal(openTurn(world, joker), 'DOCTOR', '의사 차례가 안 열림 (준비 잘못)');
    assert.equal(core.submitNightAction(doctor, s.id, joker).ok, false);
});

test('A05-B-024 5명: 광대 차례에 시민이 보내면 거절', (t) => {
    const s = open(t, 5);
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const [citizen, other] = gf.byRole(s, 'CITIZEN');
    const { world } = openTurns(s);
    assert.equal(openTurn(world, joker), 'JOKER');
    assert.equal(core.submitNightAction(citizen, s.id, other).ok, false);
});

test('A05-B-025 10명: 첫날 시민 처형 뒤 첫 밤 마녀사냥꾼이 죽은 시민을 고르면 거절', (t) => {
    const s = open(t, 10);
    const [deadCitizen] = gf.byRole(s, 'CITIZEN');
    executeDay(s, deadCitizen);
    assert.equal(s.dayIndex, 1, '첫 밤이 아님 (준비 잘못)');
    assert.equal(core.submitNightAction(gf.firstOf(s, 'WITCH_HUNTER'), s.id, deadCitizen).ok, false);
});

test('A05-B-026 6명: 광대 차례 중 의사가 보내면 거절', (t) => {
    const s = open(t, 6);
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const [citizen] = gf.byRole(s, 'CITIZEN');
    const { world } = openTurns(s);
    assert.equal(openTurn(world, joker), 'JOKER');
    assert.equal(core.submitNightAction(gf.firstOf(s, 'DOCTOR'), s.id, citizen).ok, false);
});

test('A05-B-027 6명: 광대 차례가 닫히고 의사 차례 중 광대가 늦게 보내면 거절', (t) => {
    const s = open(t, 6);
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const [citizenA, citizenB] = gf.byRole(s, 'CITIZEN');
    const { world, clock } = openTurns(s);
    assert.equal(core.submitNightAction(joker, s.id, citizenA).ok, true);
    // 광대 차례 마감 30초 → 의사 차례 열림 (의사 차례 마감은 그 뒤 30초)
    clock.advance(30_000);
    assert.equal(openTurn(world, joker), 'DOCTOR', '의사 차례가 아님 (준비 잘못)');
    assert.equal(core.submitNightAction(joker, s.id, citizenB).ok, false);
});

test('A05-B-028 6명: 첫 낮 토론 중 광대가 보내면 거절 (낮엔 직업 능력 없음)', (t) => {
    const s = open(t, 6);
    gf.toDay(s);
    const [citizen] = gf.byRole(s, 'CITIZEN');
    assert.equal(core.submitNightAction(gf.firstOf(s, 'JOKER'), s.id, citizen).ok, false);
});

test('A05-B-029 [지금 동작] 5명: 광대가 판에 없는 사람을 고르면 거절', (t) => {
    const s = open(t, 5);
    passDay(s);
    assert.equal(core.submitNightAction(gf.firstOf(s, 'JOKER'), s.id, 'a05a-not-in-game').ok, false);
});

test('A05-B-030 5명: 광대 건너뛰기는 받고 낸 사람으로 셈 → 밤 판정 됨, 희생자 없음', (t) => {
    const s = open(t, 5);
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    assert.equal(core.submitNightAction(joker, s.id, null).ok, true);
    // 5명 판은 광대만 밤 행동 → 광대가 냈으면 더 기다릴 사람 없음
    const prepared = core.prepareNightResolution(joker, s.id);
    assert.equal(prepared.ok, true, `광대 차례가 다 낸 상태가 아님(${prepared.code})`);
    const committed = core.commitNightResolution(prepared.session, prepared.resolution);
    assert.equal(committed.victimUuid, null);
    assert.equal(aliveUuids(s).length, 5);
});

test('A05-B-031 8명: 경비원이 시민 → 의사 순으로 다시 내면 밤 결과는 의사', (t) => {
    const s = open(t, 8);
    passDay(s);
    const guard = gf.firstOf(s, 'GUARD');
    const doctor = gf.firstOf(s, 'DOCTOR');
    const [citizen] = gf.byRole(s, 'CITIZEN');
    assert.equal(core.submitNightAction(guard, s.id, citizen).ok, true);
    assert.equal(core.submitNightAction(guard, s.id, doctor).ok, true);
    gf.skipAllNight(s);
    const prepared = core.prepareNightResolution(guard, s.id);
    assert.equal(prepared.ok, true);
    core.commitNightResolution(prepared.session, prepared.resolution);
    const result = prepared.resolution.privateResults.get(guard);
    assert.equal(result?.targetId, doctor);
    assert.equal(result?.role, 'DOCTOR');
});
