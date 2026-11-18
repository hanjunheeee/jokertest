'use strict';

// 밤 시험(서버 흐름, 가짜 소켓·가짜 시계) — 연달아 고르기·다시 내기를 화면이 보내는 길(소켓)로 봄
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-179~181, 돌리기: node --env-file=.env.test --test tests/flow/a05a-repeat-pick.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 DB 주소를 닿지 않는 곳으로 막음 → 꼭 socket/gameSession보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const desertion = require('../../services/game/desertion');

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
    const s = gf.startGame({ id: `a05a-frp-${seq}`, n, ...opts });
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

// 그 사람이 그 밤(날짜)에 받은 것
const gotOn = (world, uuid, event, dayIndex) => world.received(uuid, event).filter((e) => e.payload.dayIndex === dayIndex);

test('A05-B-179 7명 소켓 길: 의사 자기 보호 두 밤 연달아, 둘째 밤 광대 → 의사 → 둘째 밤 doctorSaved 칸 없음', async (t) => {
    const ctx = setup(t, 7);
    const joker = gf.firstOf(ctx.s, 'JOKER');
    const doctor = gf.firstOf(ctx.s, 'DOCTOR');
    passDay(ctx.s);
    await playNight(ctx, { DOCTOR: [[doctor, doctor]] });
    passDay(ctx.s);
    await playNight(ctx, { JOKER: [[joker, doctor]], DOCTOR: [[doctor, doctor]] });
    // 둘째 밤 결과 방송은 다음 낮(날짜 3)으로 실려 옴
    const [second] = gotOn(ctx.world, joker, 'night_result_applied', 3);
    assert.ok(second, '둘째 밤 결과를 못 받음');
    assert.equal(Object.hasOwn(second.payload, 'doctorSaved'), false);
});

test('A05-B-180 8명 소켓 길: 경비원이 같은 사람을 두 밤 조사 → 두 밤 각각 개인 결과 1개', async (t) => {
    const ctx = setup(t, 8);
    const guard = gf.firstOf(ctx.s, 'GUARD');
    const [a] = gf.byRole(ctx.s, 'CITIZEN');
    passDay(ctx.s);
    await playNight(ctx, { GUARD: [[guard, a]] });
    passDay(ctx.s);
    await playNight(ctx, { GUARD: [[guard, a]] });
    assert.equal(gotOn(ctx.world, guard, 'night_action_result', 1).length, 1);
    assert.equal(gotOn(ctx.world, guard, 'night_action_result', 2).length, 1);
});

test('A05-B-181 8명 소켓 길: 경비원이 A → B 순으로 다시 냄 → 결과 대상 B', async (t) => {
    const ctx = setup(t, 8);
    const guard = gf.firstOf(ctx.s, 'GUARD');
    const [a, b] = gf.byRole(ctx.s, 'CITIZEN');
    passDay(ctx.s);
    await playNight(ctx, { GUARD: [[guard, a], [guard, b]] });
    const got = ctx.world.received(guard, 'night_action_result');
    assert.equal(got.length, 1);
    assert.equal(got[0].payload.targetId, b);
});
