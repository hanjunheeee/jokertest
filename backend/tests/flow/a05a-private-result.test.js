'use strict';

// 밤 시험(서버 흐름, 가짜 소켓·가짜 시계) — 개인 결과(경비원 조사·마녀사냥꾼 확인·광대 암살 실패)는 쓴 사람 소켓에만
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-141~160·188~190, 돌리기: node --env-file=.env.test --test tests/flow/a05a-private-result.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 DB 주소를 닿지 않는 곳으로 막음 → 꼭 socket/gameSession보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const desertion = require('../../services/game/desertion');
const { assertNoForbiddenPrivateData, collectOtherPlayerRoleSecrets } = require('../helpers/gameSession.testUtils');

const core = gf.core;
const T = gs.__testables;

// ── 판 차리기 도우미 (이 파일 안에서만 씀) ──
let seq = 0;

// 판 하나 + 판 전원 가짜 소켓, DB에 쓰는 것(표 참여·업적·판 저장·탈주)은 아무것도 안 하는 함수로 (끝에 원래대로)
function setup(t, n, opts = {}) {
    gs.__resetStateForTests();
    gf.resetCore();
    T.__setRecordVoteParticipationForTests(async () => {});
    T.__setEvaluateAchievementsForTests(async () => {});
    T.__setGameResultPersistForTests(async () => ({ persisted: true }));
    desertion.__setRepositoryForTests({
        findDesertionsForWarmup: async () => [], countDesertionsSince: async () => 0,
        insertDesertion: async () => ({ created: true, row: null }),
    });
    t.after(() => {
        gs.__resetStateForTests();
        T.__setRecordVoteParticipationForTests(null);
        T.__setEvaluateAchievementsForTests(null);
        T.__setGameResultPersistForTests(null);
        desertion.__setRepositoryForTests(null);
        desertion.__resetForTests();
        gf.resetCore();
    });
    seq += 1;
    const s = gf.startGame({ id: `a05a-fpr-${seq}`, n, ...opts });
    return { s, world: gf.socketWorld(gs, s) };
}

const aliveUuids = (s) => [...s.players.values()].filter((p) => p.alive).map((p) => p.uuid);

// 낮을 모두 기권으로 넘김 → 재판 없이 밤 (밤 끝에 진짜 시계로 걸린 낮 타이머는 먼저 끔)
function passDay(s) {
    T.stopDayPhaseTimer(s.id);
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
    T.stopDayPhaseTimer(s.id);
    gf.toTribunal(s, uuid);
    const voters = aliveUuids(s).filter((u) => u !== uuid);
    for (const voter of voters) core.submitTribunalVote(voter, s.id, s.dayIndex, 'GUILTY');
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(s.players.get(uuid).alive, false, '처형 안 됨 (준비 잘못)');
}

// 화면처럼 밤 행동 보내고 답 받기 (target null = 건너뛰기)
const submit = (world, s, actor, target) => gf.call(
    T.handleSubmitNightAction, world.sock(actor), actor, { gameId: s.id, targetId: target },
);

// 밤 한 번 차례대로 끝까지: 차례가 열리면 그 직업 행동을 보내고, 가짜 시계를 차례 길이만큼씩 흘림
// plan: { JOKER: [[누가, 누구], …] } (안 적은 직업은 안 냄 = 시간 끝에 건너뛰기)
async function playNight({ s, world }, plan = {}, { turnMs = 30_000, watcher = [...s.players.keys()][0] } = {}) {
    const clock = gf.fakeClock();
    const doneBefore = world.received(watcher, 'night_result_applied').length;
    let handled = world.received(watcher, 'night_turn_started').length;
    T.startNightTurnSequence(world.io, s, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn,
        turnDurationMs: turnMs, randomFn: () => 0,
    });
    const replies = [];
    for (let i = 0; i < 12; i += 1) {
        const started = world.received(watcher, 'night_turn_started');
        for (; handled < started.length; handled += 1) {
            for (const [actor, target] of plan[started[handled].payload.role] ?? []) {
                replies.push(await submit(world, s, actor, target));
            }
        }
        if (world.received(watcher, 'night_result_applied').length > doneBefore || s.phase !== 'NIGHT') break;
        clock.advance(turnMs);
    }
    assert.ok(replies.every((r) => r.ok), `밤 행동 거절 (준비 잘못): ${JSON.stringify(replies)}`);
    return { clock, replies };
}

// 그 사람이 그 밤(날짜)에 받은 개인 결과 (판 id·날짜·효과음 칸은 빼고 결과 칸만)
function results(world, uuid, dayIndex) {
    return world.received(uuid, 'night_action_result')
        .filter((e) => e.payload.dayIndex === dayIndex)
        .map(({ payload }) => Object.fromEntries(
            Object.entries(payload).filter(([key]) => !['gameId', 'dayIndex', 'sfxEvent'].includes(key)),
        )); // 결과 칸만 → { actionType: 'INVESTIGATE', targetId: 'u-3', role: 'DOCTOR' }
}

// 그 밤 개인 결과를 받은 사람 목록
const receivers = (s, world, dayIndex) => [...s.players.keys()].filter((u) => results(world, u, dayIndex).length > 0);

const FULL = { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 };

// ── 경비원 조사 결과 (10명 직접{광대1·의사1·경비원1·마녀사냥꾼1}, 첫 밤) ──
const INVESTIGATE_CASES = [
    ['A05-B-141', '광대', 'JOKER'],
    ['A05-B-142', '시민', 'CITIZEN'],
    ['A05-B-143', '의사', 'DOCTOR'],
    ['A05-B-144', '마녀사냥꾼', 'WITCH_HUNTER'],
];
for (const [no, label, role] of INVESTIGATE_CASES) {
    test(`${no} 10명 넷 다: 경비원이 ${label} 조사 → 경비원 소켓만 INVESTIGATE·직업 ${role}, 그 밖 0개`, async (t) => {
        const ctx = setup(t, 10, { roleCounts: FULL });
        passDay(ctx.s);
        const guard = gf.firstOf(ctx.s, 'GUARD');
        const target = gf.firstOf(ctx.s, role);
        await playNight(ctx, { GUARD: [[guard, target]] });
        assert.deepEqual(results(ctx.world, guard, 1), [{ actionType: 'INVESTIGATE', targetId: target, role }]);
        assert.deepEqual(receivers(ctx.s, ctx.world, 1), [guard]);
    });
}

test('A05-B-145 10명 넷 다: 경비원이 시민 A 조사 → 결과 targetId = A', async (t) => {
    const ctx = setup(t, 10, { roleCounts: FULL });
    passDay(ctx.s);
    const guard = gf.firstOf(ctx.s, 'GUARD');
    const [, a] = gf.byRole(ctx.s, 'CITIZEN');
    await playNight(ctx, { GUARD: [[guard, a]] });
    assert.equal(results(ctx.world, guard, 1)[0]?.targetId, a);
});

// ── 마녀사냥꾼 확인 결과 (10명, 셋째 밤) — 첫날 처형 → 조용한 밤·낮 두 번 → 셋째 밤 확인 ──
const CONFIRM_CASES = [
    ['A05-B-146', '광대(광대 2명 판)', { jokerCount: 2 }, 'JOKER'],
    ['A05-B-147', '시민', { roleCounts: FULL }, 'CITIZEN'],
    ['A05-B-148', '의사', { roleCounts: FULL }, 'DOCTOR'],
    ['A05-B-149', '경비원', { roleCounts: FULL }, 'GUARD'],
    ['A05-B-150', '마녀사냥꾼(2명 판 동료)', { roleCounts: { JOKER: 1, WITCH_HUNTER: 2 } }, 'WITCH_HUNTER'],
];
for (const [no, label, opts, role] of CONFIRM_CASES) {
    test(`${no} 10명 셋째 밤: 마녀사냥꾼이 죽은 ${label} 확인 → 마녀사냥꾼 소켓만 CONFIRM·직업 ${role}`, async (t) => {
        const ctx = setup(t, 10, opts);
        const dead = gf.firstOf(ctx.s, role);
        executeDay(ctx.s, dead);
        await playNight(ctx);
        passDay(ctx.s);
        await playNight(ctx);
        passDay(ctx.s);
        assert.equal(ctx.s.dayIndex, 3, '셋째 밤이 아님 (준비 잘못)');
        const hunter = gf.byRole(ctx.s, 'WITCH_HUNTER').find((u) => u !== dead);
        await playNight(ctx, { WITCH_HUNTER: [[hunter, dead]] });
        assert.deepEqual(results(ctx.world, hunter, 3), [{ actionType: 'CONFIRM', targetId: dead, role }]);
        assert.deepEqual(receivers(ctx.s, ctx.world, 3), [hunter]);
    });
}

test('A05-B-151 6명: 의사가 막음 → 광대 소켓만 { ASSASSINATE, success: false }', async (t) => {
    const ctx = setup(t, 6);
    passDay(ctx.s);
    const joker = gf.firstOf(ctx.s, 'JOKER');
    const [a] = gf.byRole(ctx.s, 'CITIZEN');
    await playNight(ctx, { JOKER: [[joker, a]], DOCTOR: [[gf.firstOf(ctx.s, 'DOCTOR'), a]] });
    assert.deepEqual(results(ctx.world, joker, 1), [{ actionType: 'ASSASSINATE', success: false }]);
    assert.deepEqual(receivers(ctx.s, ctx.world, 1), [joker]);
});

test('A05-B-152 8명 광대2: 의사가 막으면 두 광대 소켓 각각 실패 결과 1개', async (t) => {
    const ctx = setup(t, 8, { jokerCount: 2 });
    passDay(ctx.s);
    const [jokerA, jokerB] = gf.byRole(ctx.s, 'JOKER');
    const [x] = gf.byRole(ctx.s, 'CITIZEN');
    await playNight(ctx, { JOKER: [[jokerA, x], [jokerB, x]], DOCTOR: [[gf.firstOf(ctx.s, 'DOCTOR'), x]] });
    for (const joker of [jokerA, jokerB]) {
        assert.deepEqual(results(ctx.world, joker, 1), [{ actionType: 'ASSASSINATE', success: false }]);
    }
});

test('A05-B-153 [지금 동작] 8명 광대2, 하나 처형: 의사가 막으면 산 광대만 실패 결과 받음', async (t) => {
    const ctx = setup(t, 8, { jokerCount: 2 });
    const [deadJoker, jokerB] = gf.byRole(ctx.s, 'JOKER');
    executeDay(ctx.s, deadJoker);
    const [x] = gf.byRole(ctx.s, 'CITIZEN');
    await playNight(ctx, { JOKER: [[jokerB, x]], DOCTOR: [[gf.firstOf(ctx.s, 'DOCTOR'), x]] });
    assert.equal(results(ctx.world, jokerB, 1).length, 1);
    assert.equal(results(ctx.world, deadJoker, 1).length, 0);
});

test('A05-B-154 8명 경비원 소켓: 판정 끝 → 개인 결과 → 밤 결과 순서로 받음', async (t) => {
    const ctx = setup(t, 8);
    passDay(ctx.s);
    const guard = gf.firstOf(ctx.s, 'GUARD');
    await playNight(ctx, { GUARD: [[guard, gf.firstOf(ctx.s, 'JOKER')]] });
    const order = ctx.world.sock(guard).received
        .map((e) => e.event)
        .filter((e) => ['night_actions_resolved', 'night_action_result', 'night_result_applied'].includes(e));
    assert.deepEqual(order, ['night_actions_resolved', 'night_action_result', 'night_result_applied']);
});

test('A05-B-155 8명 둘째 밤: 개인 결과 날짜 = 2', async (t) => {
    const ctx = setup(t, 8);
    passDay(ctx.s);
    await playNight(ctx);
    passDay(ctx.s);
    const guard = gf.firstOf(ctx.s, 'GUARD');
    await playNight(ctx, { GUARD: [[guard, gf.firstOf(ctx.s, 'JOKER')]] });
    const got = ctx.world.received(guard, 'night_action_result');
    assert.equal(got.length, 1);
    assert.equal(got[0].payload.dayIndex, 2);
});

test('A05-B-156 8명 경비원2 같은 대상 → 두 소켓 각 1개, 같은 값', async (t) => {
    const ctx = setup(t, 8, { roleCounts: { JOKER: 1, GUARD: 2 } });
    passDay(ctx.s);
    const [guardA, guardB] = gf.byRole(ctx.s, 'GUARD');
    const joker = gf.firstOf(ctx.s, 'JOKER');
    await playNight(ctx, { GUARD: [[guardA, joker], [guardB, joker]] });
    const a = results(ctx.world, guardA, 1);
    const b = results(ctx.world, guardB, 1);
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.deepEqual(a, b);
});

test('A05-B-157 5명 직접{광대1·경비원1}: 찍혀 죽은 경비원 소켓엔 개인 결과 0개', async (t) => {
    const ctx = setup(t, 5, { roleCounts: { JOKER: 1, GUARD: 1 } });
    passDay(ctx.s);
    const joker = gf.firstOf(ctx.s, 'JOKER');
    const guard = gf.firstOf(ctx.s, 'GUARD');
    await playNight(ctx, { JOKER: [[joker, guard]], GUARD: [[guard, joker]] }, { watcher: joker });
    assert.equal(ctx.world.received(guard, 'night_actions_resolved').length, 1, '밤이 안 끝남 (준비 잘못)');
    assert.equal(ctx.world.received(guard, 'night_action_result').length, 0);
});

test('A05-B-158 6명 직접{광대1·의사1·경비원1}: 찍혔다 살아난 경비원 소켓엔 개인 결과 1개', async (t) => {
    const ctx = setup(t, 6, { roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1 } });
    passDay(ctx.s);
    const joker = gf.firstOf(ctx.s, 'JOKER');
    const guard = gf.firstOf(ctx.s, 'GUARD');
    await playNight(ctx, { JOKER: [[joker, guard]], DOCTOR: [[gf.firstOf(ctx.s, 'DOCTOR'), guard]], GUARD: [[guard, joker]] });
    assert.equal(ctx.world.received(guard, 'night_action_result').length, 1);
});

test('A05-B-159 8명: 조사한 사람이 그 밤 죽어도 결과 1개, 대상 직업 시민', async (t) => {
    const ctx = setup(t, 8);
    passDay(ctx.s);
    const guard = gf.firstOf(ctx.s, 'GUARD');
    const [a] = gf.byRole(ctx.s, 'CITIZEN');
    await playNight(ctx, { JOKER: [[gf.firstOf(ctx.s, 'JOKER'), a]], GUARD: [[guard, a]] });
    assert.deepEqual(results(ctx.world, guard, 1), [{ actionType: 'INVESTIGATE', targetId: a, role: 'CITIZEN' }]);
});

test('A05-B-160 10명 넷 다: 경비원 결과엔 대상 직업 하나만, 다른 사람 직업 안 섞임', async (t) => {
    const ctx = setup(t, 10, { roleCounts: FULL });
    passDay(ctx.s);
    const guard = gf.firstOf(ctx.s, 'GUARD');
    const target = gf.firstOf(ctx.s, 'DOCTOR');
    await playNight(ctx, { GUARD: [[guard, target]] });
    const [got] = ctx.world.received(guard, 'night_action_result');
    const { role, ...rest } = got.payload;
    assert.equal(role, 'DOCTOR');
    // 직업 칸 빼고 나머지엔 직업 이름·직업 칸이 하나도 없어야 함
    assertNoForbiddenPrivateData(rest, collectOtherPlayerRoleSecrets(ctx.s, guard));
});

test('A05-B-188 10명 자동 둘째 밤: 의사가 막고 경비원이 광대 조사 → 희생자 없음, 광대 실패·경비원 결과 각자 소켓', async (t) => {
    const ctx = setup(t, 10);
    passDay(ctx.s);
    await playNight(ctx);
    passDay(ctx.s);
    const joker = gf.firstOf(ctx.s, 'JOKER');
    const guard = gf.firstOf(ctx.s, 'GUARD');
    const [a] = gf.byRole(ctx.s, 'CITIZEN');
    await playNight(ctx, { JOKER: [[joker, a]], DOCTOR: [[gf.firstOf(ctx.s, 'DOCTOR'), a]], GUARD: [[guard, joker]] });
    const [applied] = ctx.world.received(joker, 'night_result_applied').filter((e) => e.payload.dayIndex === 3);
    assert.equal(applied.payload.victimUuid, null);
    assert.deepEqual(results(ctx.world, joker, 2), [{ actionType: 'ASSASSINATE', success: false }]);
    assert.deepEqual(results(ctx.world, guard, 2), [{ actionType: 'INVESTIGATE', targetId: joker, role: 'JOKER' }]);
    assert.deepEqual(receivers(ctx.s, ctx.world, 2).sort(), [joker, guard].sort());
});

test('A05-B-189 8명 직접{광대2·마녀사냥꾼1} 둘째 밤: 광대 하나 건너뜀·하나 마녀 노림, 의사 없음 → 마녀 죽음·결과 없음', async (t) => {
    const ctx = setup(t, 8, { roleCounts: { JOKER: 2, WITCH_HUNTER: 1 } });
    const [z] = gf.byRole(ctx.s, 'CITIZEN');
    executeDay(ctx.s, z);
    await playNight(ctx);
    passDay(ctx.s);
    const [jokerA, jokerB] = gf.byRole(ctx.s, 'JOKER');
    const hunter = gf.firstOf(ctx.s, 'WITCH_HUNTER');
    await playNight(ctx, { JOKER: [[jokerA, null], [jokerB, hunter]], WITCH_HUNTER: [[hunter, z]] }, { watcher: jokerA });
    const [applied] = ctx.world.received(jokerA, 'night_result_applied').filter((e) => e.payload.dayIndex === 3);
    assert.equal(applied.payload.players.find((p) => p.uuid === hunter).alive, false);
    assert.equal(results(ctx.world, hunter, 2).length, 0);
});

test('A05-B-190 6명: 찍힌 의사 자기 보호 → 의사 삶, 의사 소켓 개인 결과 0개, 광대 소켓 실패 1개', async (t) => {
    const ctx = setup(t, 6);
    passDay(ctx.s);
    const joker = gf.firstOf(ctx.s, 'JOKER');
    const doctor = gf.firstOf(ctx.s, 'DOCTOR');
    await playNight(ctx, { JOKER: [[joker, doctor]], DOCTOR: [[doctor, doctor]] });
    const [applied] = ctx.world.received(doctor, 'night_result_applied');
    assert.equal(applied.payload.players.find((p) => p.uuid === doctor).alive, true);
    assert.equal(ctx.world.received(doctor, 'night_action_result').length, 0);
    assert.deepEqual(results(ctx.world, joker, 1), [{ actionType: 'ASSASSINATE', success: false }]);
});
