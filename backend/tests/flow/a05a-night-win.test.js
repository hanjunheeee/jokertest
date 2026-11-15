'use strict';

// 밤 시험(서버 흐름, 가짜 소켓·가짜 시계) — 밤 결과로 판 끝: 밤 결과 방송에 승자 실림, 끝난 뒤엔 밤·낮 안 열리고 밤 행동 거절
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-172~178, 돌리기: node --env-file=.env.test --test tests/flow/a05a-night-win.test.js
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
    const s = gf.startGame({ id: `a05a-fnw-${seq}`, n, ...opts });
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

// 밤 전 산 사람 수가 값대로인지 (준비 확인)
function assertBeforeNight(s, jokers, others) {
    const alive = [...s.players.values()].filter((p) => p.alive);
    assert.equal(alive.filter((p) => p.role === 'JOKER').length, jokers, '밤 전 산 광대 수가 다름 (준비 잘못)');
    assert.equal(alive.filter((p) => p.role !== 'JOKER').length, others, '밤 전 산 나머지 수가 다름 (준비 잘못)');
}

// 값마다 판 만들기: 밤 전 산 광대·나머지 수를 맞춘 뒤 그 밤 행동 계획을 돌려줌
const END_CASES = [
    {
        no: 'A05-B-172', label: '1·2·암살', win: true,
        async build(t) {
            const ctx = setup(t, 5);
            const [c1, c2, c3] = gf.byRole(ctx.s, 'CITIZEN');
            const joker = gf.firstOf(ctx.s, 'JOKER');
            executeDay(ctx.s, c1);
            await playNight(ctx, { JOKER: [[joker, c2]] });
            passDay(ctx.s);
            assertBeforeNight(ctx.s, 1, 2);
            return { ctx, plan: { JOKER: [[joker, c3]] }, watcher: joker };
        },
    },
    {
        no: 'A05-B-173', label: '2·3·암살', win: true,
        async build(t) {
            const ctx = setup(t, 5, { jokerCount: 2 });
            passDay(ctx.s);
            assertBeforeNight(ctx.s, 2, 3);
            const [jA, jB] = gf.byRole(ctx.s, 'JOKER');
            const [c1] = gf.byRole(ctx.s, 'CITIZEN');
            return { ctx, plan: { JOKER: [[jA, c1], [jB, c1]] }, watcher: jA };
        },
    },
    {
        no: 'A05-B-174', label: '1·3·암살', win: false,
        async build(t) {
            const ctx = setup(t, 5);
            const [c1, c2] = gf.byRole(ctx.s, 'CITIZEN');
            const joker = gf.firstOf(ctx.s, 'JOKER');
            executeDay(ctx.s, c1);
            assertBeforeNight(ctx.s, 1, 3);
            return { ctx, plan: { JOKER: [[joker, c2]] }, watcher: joker };
        },
    },
    {
        no: 'A05-B-175', label: '2·4·암살', win: false,
        async build(t) {
            const ctx = setup(t, 6, { jokerCount: 2 });
            passDay(ctx.s);
            assertBeforeNight(ctx.s, 2, 4);
            const [jA, jB] = gf.byRole(ctx.s, 'JOKER');
            const [c1] = gf.byRole(ctx.s, 'CITIZEN');
            return { ctx, plan: { JOKER: [[jA, c1], [jB, c1]] }, watcher: jA };
        },
    },
    {
        no: 'A05-B-176', label: '2·3·의사가 막음', win: false,
        async build(t) {
            const ctx = setup(t, 6, { jokerCount: 2 });
            const [c1, c2] = gf.byRole(ctx.s, 'CITIZEN');
            executeDay(ctx.s, c1);
            assertBeforeNight(ctx.s, 2, 3);
            const [jA, jB] = gf.byRole(ctx.s, 'JOKER');
            return { ctx, plan: { JOKER: [[jA, c2], [jB, c2]], DOCTOR: [[gf.firstOf(ctx.s, 'DOCTOR'), c2]] }, watcher: jA };
        },
    },
];
for (const { no, label, win, build } of END_CASES) {
    test(`${no} 밤 결과로 판 끝? (산 광대·밤 전 산 나머지·밤 일 = ${label}) → ${win ? 'winResult 광대·단계 끝' : 'winResult 없음·낮'}`, async (t) => {
        const { ctx, plan, watcher } = await build(t);
        await playNight(ctx, plan, { watcher });
        const applied = ctx.world.received(watcher, 'night_result_applied').at(-1).payload;
        if (win) {
            assert.equal(applied.winResult?.winner, 'JOKER');
            assert.equal(applied.phase, 'ENDED');
        } else {
            assert.equal('winResult' in applied, false);
            assert.equal(applied.phase, 'DAY');
        }
    });
}

// 5명 광대2 첫 밤 암살로 판 끝
async function endedOnFirstNight(t) {
    const ctx = setup(t, 5, { jokerCount: 2 });
    passDay(ctx.s);
    const [jA, jB] = gf.byRole(ctx.s, 'JOKER');
    const [c1] = gf.byRole(ctx.s, 'CITIZEN');
    const { clock } = await playNight(ctx, { JOKER: [[jA, c1], [jB, c1]] }, { watcher: jA });
    const applied = ctx.world.received(jA, 'night_result_applied').at(-1).payload;
    assert.equal(applied.winResult?.winner, 'JOKER', '판이 안 끝남 (준비 잘못)');
    return { ...ctx, clock, jA, jB, c1 };
}

test('A05-B-177 5명 광대2 첫 밤 암살로 끝 → 가짜 시계 3분 흘려도 차례 시작·낮 단계 알림 0개', async (t) => {
    const g = await endedOnFirstNight(t);
    const countAfter = (uuid) => g.world.sock(uuid).received.length;
    const before = new Map([...g.s.players.keys()].map((u) => [u, countAfter(u)]));
    g.clock.advance(180_000);
    for (const uuid of g.s.players.keys()) {
        const later = g.world.sock(uuid).received.slice(before.get(uuid)).map((e) => e.event);
        assert.equal(later.filter((e) => e === 'night_turn_started').length, 0, `${uuid}가 끝난 뒤 밤 차례를 받음`);
        // 낮 단계·마감 알림 (day_phase_changed 등 day_로 시작, 마감 당김 phase_settle_started)
        assert.equal(later.filter((e) => e.startsWith('day_') || e === 'phase_settle_started').length, 0, `${uuid}가 끝난 뒤 낮 알림을 받음`);
    }
});

test('A05-B-178 5명 광대2 끝난 판에 밤 행동 보내기 → 거절 답', async (t) => {
    const g = await endedOnFirstNight(t);
    const [, c2] = gf.byRole(g.s, 'CITIZEN');
    const reply = await submit(g.world, g.s, g.jA, c2);
    assert.equal(reply.ok, false);
});
