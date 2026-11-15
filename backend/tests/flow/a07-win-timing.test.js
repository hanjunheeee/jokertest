'use strict';

// 승패 확인하는 때 서버 흐름 시험 — 밤 끝·재판 끝·산 사람 나감·60초 탈락 직후에만 승패 확인, 낮 투표 뒤·무죄·의사 살림·죽은 사람 나감은 계속
// 목록 A07-B-122~142 (B-121은 안 씀: 밤에 광대가 0명이 되는 길이 없음 — 보고 참고), 돌리기: node --env-file=.env.test --test tests/flow/a07-win-timing.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음 → 꼭 socket 쪽보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const persistModule = require('../../services/game/record/persist');
const desertion = require('../../services/game/desertion');

const { core } = gf;
const T = gs.__testables;

// ── 이 파일 안 작은 도우미 (공용 도우미는 안 고침) ──

let seq = 0;
// 판 하나 + 가짜 소켓 + 가짜 시계 + 가짜 저장·장부·탈주 기록 (DB 안 감)
function setup(t, { n, jokerCount, roleCounts, goldReward = 1 } = {}) {
    gf.resetCore();
    gs.__resetStateForTests();
    const clock = gf.fakeClock();
    const fakes = { records: [], grants: [], signals: [], deserted: [] };
    T.__setRecordVoteParticipationForTests(async () => {});
    T.__setEvaluateAchievementsForTests(async () => {});
    T.__setGameResultPersistForTests(async (record) => { fakes.records.push(record); });
    persistModule.__setGameGoldGrantForTests(async (grant) => { fakes.grants.push(grant); });
    T.__setTerminalPersistTimersForTests({ setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });
    desertion.__setRepositoryForTests({
        findDesertionsForWarmup: async () => [],
        countDesertionsSince: async () => 0,
        insertDesertion: async (row) => { fakes.deserted.push(row); return { created: true, row }; },
    });
    seq += 1;
    const s = gf.startGame({ id: `a07t-${seq}`, n, jokerCount, roleCounts });
    // 판 시작 때 적히는 골드 값 (이 파일은 값 자체를 안 봄)
    s.goldReward = goldReward;
    gf.toDay(s);
    const world = gf.socketWorld(gs, s);
    gs.setEmitToUser((uuid, event, payload) => fakes.signals.push({ uuid, event, payload }));
    t.after(() => {
        gs.__resetStateForTests();
        T.__setRecordVoteParticipationForTests(null);
        T.__setEvaluateAchievementsForTests(null);
        T.__setGameResultPersistForTests(null);
        persistModule.__setGameGoldGrantForTests(null);
        desertion.__setRepositoryForTests(null);
        desertion.__resetForTests();
        gf.resetCore();
    });
    return { s, world, clock, fakes };
}

const clockFns = (clock) => ({ nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });

// 앞선 죽음은 상태로 줌 (이 시험은 그 뒤 한 번의 일만 봄)
function dies(s, uuid, reason = 'EXECUTION') {
    s.players.get(uuid).alive = false;
    s.players.get(uuid).deathReason = reason;
}

// 재판: 피고 세우고 산 사람 전원이 표(유죄·무죄) → 다 내면 5초 뒤 판정 (재판 마감은 가짜 시계)
async function tribunal({ s, world, clock }, defendant, vote = 'GUILTY') {
    gf.toTribunal(s, defendant);
    T.startTribunalTimer(world.io, s, { ...clockFns(clock), durationMs: 15_000 });
    for (const p of [...s.players.values()]) {
        if (!p.alive || p.uuid === defendant) continue;
        const r = await gf.call(T.handleCastTribunalVote, world.io, world.sock(p.uuid), p.uuid, { gameId: s.id, dayIndex: s.dayIndex, vote });
        assert.equal(r.ok, true, `재판 표 거절: ${r.code}`);
    }
    clock.advance(5_000);
}

// 밤: 준 행동만 내고 나머지 건너뛰기 → 밤 마무리(판정·방송)
function night({ s, world }, actions = {}) {
    T.stopNightTurnSequence(s.id);
    gf.toNight(s);
    for (const [actor, target] of Object.entries(actions)) {
        assert.equal(core.submitNightAction(actor, s.id, target).ok, true);
    }
    gf.skipAllNight(s);
    const r = T.finalizeNightForSession(world.io, s);
    assert.equal(r.ok, true, `밤 마무리 실패: ${r.code}`);
    return r;
}

// 게임 중 나가기 (화면 "나가기" 단추와 같은 요청)
const leave = ({ s, world }, uuid) => gf.call(T.handleLeaveGameSession, world.io, world.sock(uuid), uuid, { gameId: s.id });

// 끊김 60초: 소켓 끊고 유예 시작 → 60초 지남
function graceExpire({ s, world, clock }, uuid) {
    world.sock(uuid).connected = false;
    T.beginDisconnectGrace(world.io, s, uuid, clockFns(clock));
    clock.advance(60_000);
}

// 그 사람이 받은 알림 중 판 끝 칸(winResult)이 실린 것
const endEvents = (world, uuid) => world.sockets.get(uuid).received.filter((e) => e.payload && typeof e.payload === 'object' && 'winResult' in e.payload);

// 판 전원(나간 사람 빼고)이 같은 승자 판 끝 알림을 그 사건으로 받았는지
function assertEveryoneGot(ctx, event, winner, { except = null } = {}) {
    for (const uuid of ctx.s.players.keys()) {
        if (uuid === except) continue;
        const got = ctx.world.received(uuid, event).filter((e) => e.payload.winResult);
        assert.equal(got.length, 1, `${uuid}가 ${event} 판 끝 알림을 ${got.length}번 받음`);
        assert.equal(got[0].payload.winResult.winner, winner);
    }
    assert.equal(ctx.s.phase, 'ENDED');
}

// 판 끝 칸이 아무에게도 안 감
function assertNoEnd(ctx) {
    assert.notEqual(ctx.s.phase, 'ENDED');
    for (const uuid of ctx.s.players.keys()) assert.equal(endEvents(ctx.world, uuid).length, 0, `${uuid}가 판 끝 칸을 받음`);
}

// ── A07-B-122~132: 확인하는 때 4 × 그 일 뒤 산 (광대, 나머지) ──

// 밤 끝 (5명 판, 광대 1)
test('A07-B-122 5명 판 밤 끝 광대 = 나머지 → 판 전원에게 광대 승', async (t) => {
    const ctx = setup(t, { n: 5 });
    const joker = gf.firstOf(ctx.s, 'JOKER');
    const [a, b, c] = gf.nonJokers(ctx.s);
    dies(ctx.s, a);
    dies(ctx.s, b);
    night(ctx, { [joker]: c });
    assertEveryoneGot(ctx, 'night_result_applied', 'JOKER');
});

test('A07-B-123 5명 판 밤 끝 광대 = 나머지 −1 → 판 계속, 낮 시작 알림', async (t) => {
    const ctx = setup(t, { n: 5 });
    const joker = gf.firstOf(ctx.s, 'JOKER');
    const [a, b] = gf.nonJokers(ctx.s);
    dies(ctx.s, a);
    night(ctx, { [joker]: b });
    assertNoEnd(ctx);
    assert.equal(ctx.s.phase, 'DAY');
    for (const uuid of ctx.s.players.keys()) {
        const [applied] = ctx.world.received(uuid, 'night_result_applied');
        assert.ok(applied, `${uuid}가 밤 결과를 못 받음`);
        assert.equal(applied.payload.victimUuid, b);
    }
});

// 재판 끝 (6명 판)
test('A07-B-124 6명 판 재판 끝 광대 0 → 판 전원에게 시민 승', async (t) => {
    const ctx = setup(t, { n: 6 });
    await tribunal(ctx, gf.firstOf(ctx.s, 'JOKER'));
    assertEveryoneGot(ctx, 'tribunal_vote_resolved', 'CITIZEN');
});

test('A07-B-125 6명 판 재판 끝 광대 = 나머지 → 판 전원에게 광대 승', async (t) => {
    const ctx = setup(t, { n: 6 });
    const [a, b, c, d] = gf.nonJokers(ctx.s);
    for (const u of [a, b, c]) dies(ctx.s, u, 'ASSASSINATION');
    await tribunal(ctx, d);
    assertEveryoneGot(ctx, 'tribunal_vote_resolved', 'JOKER');
});

test('A07-B-126 6명 판 재판 끝 광대 = 나머지 −1 → 판 계속, 밤 시작', async (t) => {
    const ctx = setup(t, { n: 6 });
    const [a, b, c] = gf.nonJokers(ctx.s);
    for (const u of [a, b]) dies(ctx.s, u, 'ASSASSINATION');
    await tribunal(ctx, c);
    assertNoEnd(ctx);
    assert.equal(ctx.s.phase, 'NIGHT');
    for (const uuid of ctx.s.players.keys()) {
        const [resolved] = ctx.world.received(uuid, 'tribunal_vote_resolved');
        assert.ok(resolved, `${uuid}가 재판 결과를 못 받음`);
        assert.equal(resolved.payload.executedUuid, c);
    }
});

// 산 사람 나감 (7명 판)
test('A07-B-127 7명 판 산 광대가 나가 광대 0 → 판 전원에게 시민 승', async (t) => {
    const ctx = setup(t, { n: 7 });
    const joker = gf.firstOf(ctx.s, 'JOKER');
    assert.equal((await leave(ctx, joker)).ok, true);
    assertEveryoneGot(ctx, 'player_eliminated', 'CITIZEN', { except: joker });
});

test('A07-B-128 7명 판 산 시민이 나가 광대 = 나머지 → 판 전원에게 광대 승', async (t) => {
    const ctx = setup(t, { n: 7 });
    const [a, b, c, d, e] = gf.nonJokers(ctx.s);
    for (const u of [a, b, c, d]) dies(ctx.s, u, 'ASSASSINATION');
    assert.equal((await leave(ctx, e)).ok, true);
    assertEveryoneGot(ctx, 'player_eliminated', 'JOKER', { except: e });
});

test('A07-B-129 7명 판 산 시민이 나가 광대 = 나머지 −1 → 판 계속, 탈락·참여 변경 알림', async (t) => {
    const ctx = setup(t, { n: 7 });
    const [a, b, c, d] = gf.nonJokers(ctx.s);
    for (const u of [a, b, c]) dies(ctx.s, u, 'ASSASSINATION');
    assert.equal((await leave(ctx, d)).ok, true);
    assertNoEnd(ctx);
    assert.equal(ctx.s.phase, 'DAY');
    const other = gf.firstOf(ctx.s, 'JOKER');
    assert.equal(ctx.world.received(other, 'player_eliminated').length, 1);
    assert.equal(ctx.world.received(other, 'session_participation_changed').length, 1);
});

// 60초 탈락 (8명 판, 광대 2, 가짜 시계)
test('A07-B-130 8명 판 60초 탈락으로 광대 0 → 판 전원에게 시민 승', async (t) => {
    const ctx = setup(t, { n: 8, jokerCount: 2 });
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    dies(ctx.s, j2);
    graceExpire(ctx, j1);
    for (const uuid of ctx.s.players.keys()) {
        if (uuid === j1) continue;
        const got = ctx.world.received(uuid, 'player_eliminated').filter((e) => e.payload.winResult);
        assert.equal(got.length, 1, `${uuid}`);
        assert.equal(got[0].payload.winResult.winner, 'CITIZEN');
    }
    assert.equal(ctx.s.phase, 'ENDED');
});

test('A07-B-131 8명 판 60초 탈락으로 광대 = 나머지 → 판 전원에게 광대 승', async (t) => {
    const ctx = setup(t, { n: 8, jokerCount: 2 });
    const [a, b, c, d] = gf.nonJokers(ctx.s);
    for (const u of [a, b, c]) dies(ctx.s, u, 'ASSASSINATION');
    graceExpire(ctx, d);
    for (const uuid of ctx.s.players.keys()) {
        if (uuid === d) continue;
        const got = ctx.world.received(uuid, 'player_eliminated').filter((e) => e.payload.winResult);
        assert.equal(got.length, 1, `${uuid}`);
        assert.equal(got[0].payload.winResult.winner, 'JOKER');
    }
    assert.equal(ctx.s.phase, 'ENDED');
});

test('A07-B-132 8명 판 60초 탈락으로 광대 = 나머지 −1 → 판 계속, 탈락 알림', async (t) => {
    const ctx = setup(t, { n: 8, jokerCount: 2 });
    const [a, b, c] = gf.nonJokers(ctx.s);
    for (const u of [a, b]) dies(ctx.s, u, 'ASSASSINATION');
    graceExpire(ctx, c);
    assertNoEnd(ctx);
    assert.equal(ctx.s.players.get(c).alive, false);
    const joker = gf.firstOf(ctx.s, 'JOKER');
    assert.equal(ctx.world.received(joker, 'player_eliminated').length, 1);
});

// ── 계속되는 길 ──

test('A07-B-133 7명 판 재판 무죄 → 판 끝 칸 없음, 밤 시작', async (t) => {
    const ctx = setup(t, { n: 7 });
    await tribunal(ctx, gf.firstOf(ctx.s, 'JOKER'), 'NOT_GUILTY');
    assertNoEnd(ctx);
    assert.equal(ctx.s.phase, 'NIGHT');
});

test('A07-B-134 8명 판 광대 대상 = 의사 대상 → 아무도 안 죽음, 판 끝 칸 없음, 낮 시작', async (t) => {
    const ctx = setup(t, { n: 8, jokerCount: 2 });
    const jokers = gf.byRole(ctx.s, 'JOKER');
    const doctor = gf.firstOf(ctx.s, 'DOCTOR');
    const target = gf.byRole(ctx.s, 'CITIZEN')[0];
    // 앞선 죽음으로 (광대 2, 나머지 3)을 만들어 둠 → 죽었으면 광대 승이 났을 자리
    gf.byRole(ctx.s, 'CITIZEN').slice(1, 4).forEach((u) => dies(ctx.s, u, 'ASSASSINATION'));
    const actions = { [doctor]: target };
    for (const j of jokers) actions[j] = target;
    const r = night(ctx, actions);
    assert.equal(r.victimUuid, null);
    assert.equal(ctx.s.players.get(target).alive, true);
    assertNoEnd(ctx);
    assert.equal(ctx.s.phase, 'DAY');
});

// A07-B-135~137: 낮 투표 판정 뒤엔 승패 확인 없음 (10명 판, 광대 2)
async function dayVote(t, ballotsOf) {
    const ctx = setup(t, { n: 10, jokerCount: 2 });
    T.startDayPhaseTimer(ctx.world.io, ctx.s, { ...clockFns(ctx.clock), discussionDurationMs: 30_000, voteDurationMs: 30_000 });
    ctx.clock.advance(30_000);
    // 앞선 죽음으로 (광대 2, 나머지 3) — 낮 투표 뒤 승패를 봤다면 이미 광대 승인 자리
    const others = gf.nonJokers(ctx.s);
    others.slice(0, 5).forEach((u) => dies(ctx.s, u, 'ASSASSINATION'));
    const alive = [...ctx.s.players.values()].filter((p) => p.alive).map((p) => p.uuid);
    for (const [voter, target] of ballotsOf(ctx, alive)) {
        const r = await gf.call(T.handleSubmitDayVote, ctx.world.io, ctx.world.sock(voter), voter, { gameId: ctx.s.id, targetId: target });
        assert.equal(r.ok, true, `낮 표 거절: ${r.code}`);
    }
    ctx.clock.advance(5_000);
    return ctx;
}

test('A07-B-135 10명 판 낮 판정 최다 1명 → 재판, 판 끝 칸 없음', async (t) => {
    const ctx = await dayVote(t, (c, alive) => {
        const target = alive.find((u) => c.s.players.get(u).role !== 'JOKER');
        return alive.map((u) => [u, u === target ? null : target]);
    });
    assert.equal(ctx.s.phase, 'TRIBUNAL');
    assertNoEnd(ctx);
});

test('A07-B-136 10명 판 낮 판정 동점 → 밤, 판 끝 칸 없음', async (t) => {
    const ctx = await dayVote(t, (c, alive) => {
        // 산 5명: 광대 2 · 나머지 3 → 두 사람이 2표씩, 한 명 기권
        const [j1, j2] = gf.byRole(c.s, 'JOKER');
        const [x, y, z] = alive.filter((u) => c.s.players.get(u).role !== 'JOKER');
        return [[j1, x], [j2, x], [x, y], [z, y], [y, null]];
    });
    assert.equal(ctx.s.phase, 'NIGHT');
    assertNoEnd(ctx);
});

test('A07-B-137 10명 판 낮 판정 기권이 더 많음 → 밤, 판 끝 칸 없음', async (t) => {
    const ctx = await dayVote(t, (c, alive) => {
        const [first, ...rest] = alive;
        return [[first, alive[1]], ...rest.map((u) => [u, null])];
    });
    assert.equal(ctx.s.phase, 'NIGHT');
    assertNoEnd(ctx);
});

test('A07-B-138 6명 판 처형된 사람이 나감 → 판 끝 칸 없음, 단계 그대로', async (t) => {
    const ctx = setup(t, { n: 6 });
    const [a, b, c] = gf.nonJokers(ctx.s);
    // 앞선 죽음으로 (광대 1, 나머지 2)를 만들고 하나 처형 → (1, 2)… 처형된 사람이 나가도 셈은 그대로
    dies(ctx.s, a, 'ASSASSINATION');
    dies(ctx.s, b, 'ASSASSINATION');
    await tribunal(ctx, c);
    assert.equal(ctx.s.phase, 'NIGHT');
    assert.equal((await leave(ctx, c)).ok, true);
    assertNoEnd(ctx);
    assert.equal(ctx.s.phase, 'NIGHT');
});

test('A07-B-139 5명 판 재판 피고 광대가 나감 → 탈락 알림에 시민 승, 재판 결과·밤 시작 없음', async (t) => {
    const ctx = setup(t, { n: 5 });
    const joker = gf.firstOf(ctx.s, 'JOKER');
    gf.toTribunal(ctx.s, joker);
    T.startTribunalTimer(ctx.world.io, ctx.s, { ...clockFns(ctx.clock), durationMs: 15_000 });
    assert.equal((await leave(ctx, joker)).ok, true);
    ctx.clock.advance(15_000);
    for (const uuid of gf.nonJokers(ctx.s)) {
        const got = ctx.world.received(uuid, 'player_eliminated').filter((e) => e.payload.winResult);
        assert.equal(got.length, 1, `${uuid}`);
        assert.equal(got[0].payload.winResult.winner, 'CITIZEN');
        assert.equal(ctx.world.received(uuid, 'tribunal_vote_resolved').length, 0);
        assert.equal(ctx.world.received(uuid, 'night_turn_started').length, 0);
    }
    assert.equal(ctx.s.phase, 'ENDED');
});

test('A07-B-140 10명 판 광대 2명 중 1명 처형 → 산 (1, 7) 계속, 밤 시작', async (t) => {
    const ctx = setup(t, { n: 10, jokerCount: 2 });
    await tribunal(ctx, gf.byRole(ctx.s, 'JOKER')[0]);
    assertNoEnd(ctx);
    assert.equal(ctx.s.phase, 'NIGHT');
    const alive = [...ctx.s.players.values()].filter((p) => p.alive);
    assert.equal(alive.filter((p) => p.role === 'JOKER').length, 1);
    assert.equal(alive.filter((p) => p.role !== 'JOKER').length, 8);
});

test('A07-B-141 8명 판 광대 둘이 다른 사람을 고름 → 아무도 안 죽음, 판 끝 칸 없음', async (t) => {
    const ctx = setup(t, { n: 8, jokerCount: 2 });
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    const [x, y] = gf.byRole(ctx.s, 'CITIZEN');
    // 앞선 죽음으로 (광대 2, 나머지 3) → 한 명이라도 죽었으면 광대 승 자리
    const others = gf.nonJokers(ctx.s).filter((u) => u !== x && u !== y);
    others.slice(0, others.length - 1).forEach((u) => dies(ctx.s, u, 'ASSASSINATION'));
    const r = night(ctx, { [j1]: x, [j2]: y });
    assert.equal(r.victimUuid, null);
    assert.equal(ctx.s.players.get(x).alive, true);
    assert.equal(ctx.s.players.get(y).alive, true);
    assertNoEnd(ctx);
});

test('A07-B-142 7명 판(광대 2) 산 시민 넷이 한꺼번에 나감 → 광대 승 판 끝 알림 사람마다 한 번, 전적 저장 한 번', async (t) => {
    const ctx = setup(t, { n: 7, jokerCount: 2 });
    const leavers = gf.nonJokers(ctx.s).slice(0, 4);
    // 같은 차례에 동시에 나가기 (셋째에 (2, 2)로 광대 승, 넷째는 끝난 판에서 나감)
    const replies = await Promise.all(leavers.map((u) => leave(ctx, u)));
    for (const r of replies) assert.equal(r.ok, true);
    await gf.flush();
    assert.equal(ctx.s.phase, 'ENDED');
    assert.equal(ctx.s.winResult.winner, 'JOKER');
    for (const uuid of ctx.s.players.keys()) {
        if (leavers.includes(uuid)) continue;
        assert.equal(endEvents(ctx.world, uuid).length, 1, `${uuid}가 판 끝 알림을 ${endEvents(ctx.world, uuid).length}번 받음`);
    }
    assert.equal(ctx.fakes.records.length, 1);
});
