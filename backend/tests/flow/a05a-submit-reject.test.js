'use strict';

// 밤 시험(서버 흐름, 가짜 소켓·가짜 시계) — 화면이 보내는 길(submit_night_action)의 거절 답: 동료 광대·첫 밤 마녀사냥꾼·남의 차례·시민·죽은 사람
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-191~195, 돌리기: node --env-file=.env.test --test tests/flow/a05a-submit-reject.test.js
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
    const s = gf.startGame({ id: `a05a-fsr-${seq}`, n, ...opts });
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
// plan: { JOKER: [[누가, 누구], …] } (그 직업 차례가 열렸을 때 보냄, 남의 직업 사람도 넣을 수 있음)
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
    // 이 파일은 거절을 보는 시험이라 답은 그대로 돌려줌 (시험에서 확인)
    return { clock, replies };
}

test('A05-B-191 7명 광대2 소켓 길: 광대가 동료 광대를 고르면 { ok: false } + 동료 거절 코드', async (t) => {
    const ctx = setup(t, 7, { jokerCount: 2 });
    passDay(ctx.s);
    const [jokerA, jokerB] = gf.byRole(ctx.s, 'JOKER');
    const { replies: [reply] } = await playNight(ctx, { JOKER: [[jokerA, jokerB]] });
    assert.equal(reply.ok, false);
    // 화면(frontend utils/nightPatches.js)이 이 코드로 "동료 광대는 고를 수 없습니다." 글을 고름
    assert.equal(reply.code, 'TARGET_IS_ALLY');
});

test('A05-B-192 10명 소켓 길: 첫 밤 마녀사냥꾼이 보내면 { ok: false }, 마녀 차례 안 열림', async (t) => {
    const ctx = setup(t, 10);
    const [dead] = gf.byRole(ctx.s, 'CITIZEN');
    executeDay(ctx.s, dead);
    const hunter = gf.firstOf(ctx.s, 'WITCH_HUNTER');
    const { replies: [reply] } = await playNight(ctx, { JOKER: [[hunter, dead]] });
    assert.equal(reply.ok, false);
    const roles = ctx.world.received(hunter, 'night_turn_started').map((e) => e.payload.role);
    assert.equal(ctx.world.received(hunter, 'night_actions_resolved').length, 1, '첫 밤이 안 끝남 (준비 잘못)');
    assert.equal(roles.includes('WITCH_HUNTER'), false);
});

test('A05-B-193 6명 소켓 길: 광대 차례 중 의사가 보내면 { ok: false }, 의사 대상 기록 안 됨(의사 차례에 안 내면 건너뛰기)', async (t) => {
    const ctx = setup(t, 6);
    passDay(ctx.s);
    const joker = gf.firstOf(ctx.s, 'JOKER');
    const doctor = gf.firstOf(ctx.s, 'DOCTOR');
    const [a] = gf.byRole(ctx.s, 'CITIZEN');
    const { replies } = await playNight(ctx, { JOKER: [[joker, a], [doctor, a]] }, { watcher: joker });
    assert.equal(replies[0].ok, true, '광대 행동 거절 (준비 잘못)');
    assert.equal(replies[1].ok, false);
    // 의사 고름이 남았다면 A가 살았을 것 → 안 남았으니 A 죽음
    const applied = ctx.world.received(joker, 'night_result_applied').at(-1).payload;
    assert.equal(applied.victimUuid, a);
    assert.equal(applied.doctorSaved, false);
});

test('A05-B-194 5명 소켓 길: 시민이 보내면 { ok: false }', async (t) => {
    const ctx = setup(t, 5);
    passDay(ctx.s);
    const [citizen, other] = gf.byRole(ctx.s, 'CITIZEN');
    const { replies: [reply] } = await playNight(ctx, { JOKER: [[citizen, other]] });
    assert.equal(reply.ok, false);
});

test('A05-B-195 8명 소켓 길: 첫날 처형된 경비원이 경비원 차례에 보내면 { ok: false }', async (t) => {
    const ctx = setup(t, 8);
    const guard = gf.firstOf(ctx.s, 'GUARD');
    executeDay(ctx.s, guard);
    const { replies: [reply] } = await playNight(ctx, { GUARD: [[guard, gf.firstOf(ctx.s, 'JOKER')]] });
    assert.ok(reply, '경비원 차례가 안 열림 (준비 잘못)');
    assert.equal(reply.ok, false);
});
