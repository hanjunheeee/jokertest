'use strict';

// 밤 시험(서버 흐름, 가짜 소켓·가짜 시계) — 다 죽은 직업 차례: 바로 안 닫고 차례 길이의 20~60% 무작위로 기다렸다 닫음, 알림 모양은 같음
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-125~130, 돌리기: node --env-file=.env.test --test tests/flow/a05a-empty-turn.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 DB 주소를 닿지 않는 곳으로 막음 → 꼭 socket/gameSession보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');

const core = gf.core;
const T = gs.__testables;

// ── 판 차리기 도우미 (이 파일 안에서만 씀) ──
let seq = 0;

// 6명 판(광대1·의사1·시민4), 첫날 의사 처형 → 첫 밤, 판 전원 가짜 소켓
// 밤 끝에 진짜 시계로 걸리는 낮 타이머·판 기록은 시험 끝에 정리 (프로세스가 안 끝나는 것 막기)
function setupDeadDoctor(t) {
    gs.__resetStateForTests();
    gf.resetCore();
    T.__setGameResultPersistForTests(async () => ({ persisted: true }));
    t.after(() => {
        gs.__resetStateForTests();
        T.__setGameResultPersistForTests(null);
        gf.resetCore();
    });
    seq += 1;
    const s = gf.startGame({ id: `a05a-fet-${seq}`, n: 6 });
    const doctor = gf.firstOf(s, 'DOCTOR');
    gf.toTribunal(s, doctor);
    const voters = [...s.players.keys()].filter((u) => u !== doctor);
    for (const voter of voters) core.submitTribunalVote(voter, s.id, s.dayIndex, 'GUILTY');
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(s.players.get(doctor).alive, false, '의사 처형 안 됨 (준비 잘못)');
    return { s, world: gf.socketWorld(gs, s), watcher: gf.firstOf(s, 'JOKER') };
}

// 차례 길이·무작위 수를 정해 밤 시작 → 광대 차례 마감까지 흘려 의사(빈) 차례가 막 열린 때로
function openEmptyDoctorTurn({ s, world, watcher }, { turnMs, random }) {
    const clock = gf.fakeClock();
    T.startNightTurnSequence(world.io, s, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn,
        turnDurationMs: turnMs, randomFn: () => random,
    });
    clock.advance(turnMs);
    const doctorStart = world.received(watcher, 'night_turn_started').find((e) => e.payload.role === 'DOCTOR');
    assert.ok(doctorStart, '의사 차례가 안 열림 (준비 잘못)');
    // 의사 차례가 지금 막 열렸는지 (마감 = 지금 + 차례 길이)
    assert.equal(doctorStart.payload.deadline, clock.now() + turnMs, '의사 차례가 지금 열린 게 아님 (준비 잘못)');
    return { clock, doctorStart };
}

const doctorEnded = (world, uuid) => world.received(uuid, 'night_turn_ended').filter((e) => e.payload.role === 'DOCTOR').length;

// 값: 차례 길이 · 무작위 수 · 의사 차례 열린 뒤 지난 시간 → 끝났나
const EMPTY_CASES = [
    ['A05-B-125', 30_000, 0, 5_999, false],
    ['A05-B-126', 30_000, 0, 6_000, true],
    ['A05-B-127', 30_000, 1, 17_999, false],
    ['A05-B-128', 30_000, 1, 18_000, true],
    ['A05-B-129', 60_000, 0.5, 24_000, true],
];
for (const [no, turnMs, random, elapsed, ended] of EMPTY_CASES) {
    test(`${no} 6명 죽은 의사 차례: ${turnMs / 1000}초·무작위 ${random}·${elapsed / 1000}초 지남 → ${ended ? '차례 끝 알림' : '아직'}`, (t) => {
        const ctx = setupDeadDoctor(t);
        const { clock } = openEmptyDoctorTurn(ctx, { turnMs, random });
        clock.advance(elapsed);
        assert.equal(doctorEnded(ctx.world, ctx.watcher), ended ? 1 : 0);
    });
}

test('A05-B-130 6명: 죽은 의사 차례 시작 알림도 산 직업 차례와 같은 칸(판 id·날짜·직업·마감)', (t) => {
    const ctx = setupDeadDoctor(t);
    const { doctorStart } = openEmptyDoctorTurn(ctx, { turnMs: 30_000, random: 0 });
    const jokerStart = ctx.world.received(ctx.watcher, 'night_turn_started').find((e) => e.payload.role === 'JOKER');
    const keys = (payload) => Object.keys(payload).sort();
    assert.deepEqual(keys(doctorStart.payload), ['dayIndex', 'deadline', 'gameId', 'role']);
    assert.deepEqual(keys(doctorStart.payload), keys(jokerStart.payload));
    assert.equal(doctorStart.payload.gameId, ctx.s.id);
    assert.equal(doctorStart.payload.dayIndex, 1);
});
