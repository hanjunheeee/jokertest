'use strict';

// 밤 시험(서버 흐름, 가짜 소켓·가짜 시계) — 밤 차례 순서: 판 시작 때 직업 구성대로 광대 → 의사 → 경비원 → 마녀사냥꾼(둘째 밤부터)
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-101~124·131~140·182~187, 돌리기: node --env-file=.env.test --test tests/flow/a05a-turn-order.test.js
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
    const s = gf.startGame({ id: `a05a-fto-${seq}`, n, ...opts });
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

// 낮에 한 사람 재판 → 모두 유죄(guilty) 또는 무죄 → 밤
function tribunalDay(s, uuid, vote = 'GUILTY') {
    T.stopDayPhaseTimer(s.id);
    gf.toTribunal(s, uuid);
    const voters = aliveUuids(s).filter((u) => u !== uuid);
    for (const voter of voters) core.submitTribunalVote(voter, s.id, s.dayIndex, vote);
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(s.players.get(uuid).alive, vote !== 'GUILTY', '재판 결과가 다름 (준비 잘못)');
    assert.equal(s.phase, 'NIGHT', '재판 뒤 밤이 아님 (준비 잘못)');
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
    return { clock, replies };
}

// 그 사람이 그 밤(날짜)에 받은 차례 시작 직업 순서
const turnRoles = (world, uuid, dayIndex) => world.received(uuid, 'night_turn_started')
    .filter((e) => e.payload.dayIndex === dayIndex)
    .map((e) => e.payload.role);

const J = 'JOKER';
const D = 'DOCTOR';
const G = 'GUARD';
const W = 'WITCH_HUNTER';

// ── 자동 구성 판의 차례 순서 (아무도 안 냄, 가짜 시계로 마감) ──
const AUTO_FIRST = { 5: [J], 6: [J, D], 7: [J, D], 8: [J, D, G], 9: [J, D, G], 10: [J, D, G] };
const AUTO_SECOND = { 5: [J], 6: [J, D], 7: [J, D], 8: [J, D, G], 9: [J, D, G], 10: [J, D, G, W] };
const AUTO_CASES = [];
for (const n of [5, 6, 7, 8, 9, 10]) {
    AUTO_CASES.push({ n, night: 1, expected: AUTO_FIRST[n] }, { n, night: 2, expected: AUTO_SECOND[n] });
}
AUTO_CASES.forEach(({ n, night, expected }, i) => {
    const no = `A05-B-${String(101 + i).padStart(3, '0')}`;
    test(`${no} 자동 구성 ${n}명 ${night === 1 ? '첫' : '둘째'} 밤: 판 전원이 받은 차례 = [${expected.join(', ')}]`, async (t) => {
        const ctx = setup(t, n);
        passDay(ctx.s);
        if (night === 2) {
            await playNight(ctx);
            passDay(ctx.s);
        }
        await playNight(ctx);
        for (const uuid of ctx.s.players.keys()) assert.deepEqual(turnRoles(ctx.world, uuid, night), expected);
    });
});

// ── 직접 구성 판의 차례 순서 (기준은 판 시작 때 직업 구성) ──
const CUSTOM_CASES = [
    ['A05-B-113', 5, { JOKER: 1, WITCH_HUNTER: 1 }, 1, [J]],
    ['A05-B-114', 5, { JOKER: 1, WITCH_HUNTER: 1 }, 2, [J, W]],
    ['A05-B-115', 6, { JOKER: 1, GUARD: 1 }, 1, [J, G]],
    ['A05-B-116', 7, { JOKER: 2, DOCTOR: 2 }, 1, [J, D]],
    ['A05-B-117', 10, { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, 2, [J, D, G, W]],
    ['A05-B-118', 5, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, 1, [J, D, G]],
    ['A05-B-119', 5, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, 3, [J, D, G, W]],
    ['A05-B-120', 8, { JOKER: 1 }, 1, [J]],
];
for (const [no, n, roleCounts, night, expected] of CUSTOM_CASES) {
    const label = Object.entries(roleCounts).map(([r, c]) => `${r}${c}`).join('·');
    test(`${no} 직접 구성 ${n}명 {${label}} ${night}번째 밤: 차례 = [${expected.join(', ')}]`, async (t) => {
        const ctx = setup(t, n, { roleCounts });
        passDay(ctx.s);
        for (let d = 1; d < night; d += 1) {
            await playNight(ctx);
            passDay(ctx.s);
        }
        await playNight(ctx);
        for (const uuid of ctx.s.players.keys()) assert.deepEqual(turnRoles(ctx.world, uuid, night), expected);
    });
}

// ── 구성에 있는데 다 죽은 직업도 차례가 열림 ──
test('A05-B-121 6명: 의사 1명 첫날 처형 → 첫 밤에도 의사 차례 시작을 받음', async (t) => {
    const ctx = setup(t, 6);
    tribunalDay(ctx.s, gf.firstOf(ctx.s, 'DOCTOR'));
    await playNight(ctx);
    for (const uuid of ctx.s.players.keys()) assert.deepEqual(turnRoles(ctx.world, uuid, 1), [J, D]);
});

test('A05-B-122 8명: 경비원 첫날 처형 → 첫 밤에도 경비원 차례 시작을 받음', async (t) => {
    const ctx = setup(t, 8);
    tribunalDay(ctx.s, gf.firstOf(ctx.s, 'GUARD'));
    await playNight(ctx);
    for (const uuid of ctx.s.players.keys()) assert.deepEqual(turnRoles(ctx.world, uuid, 1), [J, D, G]);
});

test('A05-B-123 10명: 마녀사냥꾼이 첫 밤 암살됨 → 둘째 밤 마녀사냥꾼 차례 열림', async (t) => {
    const ctx = setup(t, 10);
    const hunter = gf.firstOf(ctx.s, 'WITCH_HUNTER');
    passDay(ctx.s);
    await playNight(ctx, { JOKER: [[gf.firstOf(ctx.s, 'JOKER'), hunter]] });
    assert.equal(ctx.s.players.get(hunter).alive, false, '마녀사냥꾼이 안 죽음 (준비 잘못)');
    passDay(ctx.s);
    await playNight(ctx);
    for (const uuid of ctx.s.players.keys()) assert.deepEqual(turnRoles(ctx.world, uuid, 2), [J, D, G, W]);
});

test('A05-B-124 8명 직접{광대1·의사2}: 의사 둘 다 죽음 → 그 밤에도 의사 차례 열림', async (t) => {
    const ctx = setup(t, 8, { roleCounts: { JOKER: 1, DOCTOR: 2 } });
    const [doctorA, doctorB] = gf.byRole(ctx.s, 'DOCTOR');
    tribunalDay(ctx.s, doctorA);
    await playNight(ctx, { JOKER: [[gf.firstOf(ctx.s, 'JOKER'), doctorB]] });
    assert.equal(ctx.s.players.get(doctorB).alive, false, '의사 B가 안 죽음 (준비 잘못)');
    passDay(ctx.s);
    await playNight(ctx);
    for (const uuid of ctx.s.players.keys()) assert.deepEqual(turnRoles(ctx.world, uuid, 2), [J, D]);
});

test('A05-B-131 10명 첫 밤: 마녀사냥꾼 차례 시작 없이 경비원 차례 끝 뒤 바로 밤 판정 끝', async (t) => {
    const ctx = setup(t, 10);
    passDay(ctx.s);
    const watcher = gf.firstOf(ctx.s, 'CITIZEN');
    await playNight(ctx, {}, { watcher });
    const steps = ctx.world.sock(watcher).received
        .filter((e) => ['night_turn_started', 'night_turn_ended', 'night_actions_resolved'].includes(e.event))
        .map((e) => (e.event === 'night_actions_resolved' ? e.event : `${e.event}:${e.payload.role}`));
    assert.equal(steps.includes('night_turn_started:WITCH_HUNTER'), false);
    assert.deepEqual(steps.slice(-2), ['night_turn_ended:GUARD', 'night_actions_resolved']);
});

test('A05-B-132 10명: 첫날 무죄·첫 밤 의사가 살려 죽은 사람 없어도 둘째 밤 마녀사냥꾼 차례 열림, 안 내면 결과 없음', async (t) => {
    const ctx = setup(t, 10);
    const { s, world } = ctx;
    const [a, b] = gf.byRole(s, 'CITIZEN');
    tribunalDay(s, a, 'NOT_GUILTY');
    await playNight(ctx, { JOKER: [[gf.firstOf(s, 'JOKER'), b]], DOCTOR: [[gf.firstOf(s, 'DOCTOR'), b]] });
    assert.equal(aliveUuids(s).length, 10, '죽은 사람이 생김 (준비 잘못)');
    passDay(s);
    await playNight(ctx);
    const hunter = gf.firstOf(s, 'WITCH_HUNTER');
    assert.deepEqual(turnRoles(world, hunter, 2), [J, D, G, W]);
    assert.equal(world.received(hunter, 'night_action_result').length, 0);
});

test('A05-B-133 6명: 광대가 시간 끝까지 안 고름 → 의사 차례 열림, 밤 끝 희생자 없음', async (t) => {
    const ctx = setup(t, 6);
    passDay(ctx.s);
    const joker = gf.firstOf(ctx.s, 'JOKER');
    await playNight(ctx);
    assert.deepEqual(turnRoles(ctx.world, joker, 1), [J, D]);
    const [applied] = ctx.world.received(joker, 'night_result_applied');
    assert.equal(applied.payload.victimUuid, null);
});

test('A05-B-134 8명: 경비원이 시간 끝까지 안 고름 → 경비원 결과 없음', async (t) => {
    const ctx = setup(t, 8);
    passDay(ctx.s);
    const guard = gf.firstOf(ctx.s, 'GUARD');
    await playNight(ctx);
    assert.equal(ctx.world.received(guard, 'night_actions_resolved').length, 1, '밤이 안 끝남 (준비 잘못)');
    assert.equal(ctx.world.received(guard, 'night_action_result').length, 0);
});

// 방 설정 밤 시간으로 차례 열기 (시험이 차례 길이를 안 넣음)
function startWithRoomTime(ctx) {
    const clock = gf.fakeClock();
    T.startNightTurnSequence(ctx.world.io, ctx.s, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn, randomFn: () => 0,
    });
    return clock;
}

test('A05-B-135 6명 방 설정 밤 60초: 광대 차례 시작 = { gameId, dayIndex: 1, role: JOKER, deadline: 지금+60초 }', (t) => {
    const ctx = setup(t, 6, { settings: { nightActionTime: 60 } });
    passDay(ctx.s);
    const clock = startWithRoomTime(ctx);
    const [started] = ctx.world.received(gf.firstOf(ctx.s, 'CITIZEN'), 'night_turn_started');
    assert.deepEqual(started.payload, { gameId: ctx.s.id, dayIndex: 1, role: 'JOKER', deadline: clock.now() + 60_000 });
});

const LENGTH_CASES = [['A05-B-136', 30], ['A05-B-137', 60], ['A05-B-138', 90], ['A05-B-139', 120]];
for (const [no, seconds] of LENGTH_CASES) {
    test(`${no} 6명 방 설정 밤 ${seconds}초: 차례 마감 = 지금 + ${seconds}초`, (t) => {
        const ctx = setup(t, 6, { settings: { nightActionTime: seconds } });
        passDay(ctx.s);
        const clock = startWithRoomTime(ctx);
        const [started] = ctx.world.received(gf.firstOf(ctx.s, 'JOKER'), 'night_turn_started');
        assert.equal(started.payload.deadline - clock.now(), seconds * 1000);
    });
}

test('A05-B-140 7명 시민 1명 처형: 광대 차례 끝 알림은 산 사람·죽은 사람 7명 모두 받음', async (t) => {
    const ctx = setup(t, 7);
    const [dead] = gf.byRole(ctx.s, 'CITIZEN');
    tribunalDay(ctx.s, dead);
    await playNight(ctx);
    assert.equal(ctx.s.players.size, 7);
    for (const uuid of ctx.s.players.keys()) {
        const ended = ctx.world.received(uuid, 'night_turn_ended').filter((e) => e.payload.role === 'JOKER');
        assert.equal(ended.length, 1, `${uuid}가 광대 차례 끝을 못 받음`);
    }
});

// ── 대표 판 한 밤 끝까지 (자동 구성, 광대 → 시민, 다른 직업 건너뜀) ──
const FULL_NIGHT = [
    ['A05-B-182', 5, 1], ['A05-B-183', 6, 2], ['A05-B-184', 7, 2],
    ['A05-B-185', 8, 3], ['A05-B-186', 9, 3], ['A05-B-187', 10, 3],
];
for (const [no, n, turns] of FULL_NIGHT) {
    test(`${no} 자동 구성 ${n}명 한 밤 끝까지: 차례 시작 ${turns}번, 희생자 그 시민, 다음 낮 날짜 2`, async (t) => {
        const ctx = setup(t, n);
        const { s, world } = ctx;
        passDay(s);
        const joker = gf.firstOf(s, 'JOKER');
        const [victim] = gf.byRole(s, 'CITIZEN');
        const skips = ['DOCTOR', 'GUARD'].map((role) => [role, gf.byRole(s, role).map((u) => [u, null])]);
        const { replies } = await playNight(ctx, { JOKER: [[joker, victim]], ...Object.fromEntries(skips) });
        assert.ok(replies.every((r) => r.ok), '밤 행동 거절 (준비 잘못)');
        assert.equal(world.received(joker, 'night_turn_started').length, turns);
        const [applied] = world.received(joker, 'night_result_applied');
        assert.equal(applied.payload.victimUuid, victim);
        assert.equal(applied.payload.phase, 'DAY');
        assert.equal(applied.payload.dayIndex, 2);
    });
}
