'use strict';

// 판 끝 알림 서버 흐름 시험 — 판을 끝낸 사건에 판 끝 칸(승자·공개 줄)이 실림, 산 사람·죽은 사람·다시 붙은 사람 모두 같은 값, MVP 없음, 끝난 판 요청 거절
// 목록 A07-B-143~155, 돌리기: node --env-file=.env.test --test tests/flow/a07-end-payload.test.js
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
    const s = gf.startGame({ id: `a07p-${seq}`, n, jokerCount, roleCounts });
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

// 그 사람이 받은 알림 중 판 끝 칸(winResult)이 실린 것
const endEvents = (world, uuid) => world.sockets.get(uuid).received.filter((e) => e.payload && typeof e.payload === 'object' && 'winResult' in e.payload);

// 값 안 모든 칸 이름 (깊이 들어가며) → MVP 칸 찾기용
function allKeys(value, out = []) {
    if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
    else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            out.push(k);
            allKeys(v, out);
        }
    }
    return out;
}
const assertNoMvp = (value, where) => {
    for (const key of allKeys(value)) assert.doesNotMatch(key, /mvp/i, `${where}에 ${key} 칸`);
};

// 새로고침한 사람처럼 판 상태 요청
const snapshot = ({ s, world }, uuid) => gf.call(T.handleGetSessionSnapshot, world.io, world.sock(uuid), uuid, { gameId: s.id });

// 그 사람이 받은 판 끝 칸 (한 번만 받아야 함)
function winResultOf(ctx, uuid) {
    const got = endEvents(ctx.world, uuid);
    assert.equal(got.length, 1, `${uuid}가 판 끝 칸을 ${got.length}번 받음`);
    return got[0].payload.winResult;
}

// 광대를 처형해 시민 승으로 끝냄 (광대 2명이면 사이 밤은 아무도 안 죽음)
async function endCitizenWin(ctx) {
    const jokers = gf.byRole(ctx.s, 'JOKER').filter((u) => ctx.s.players.get(u).alive);
    for (const [i, j] of jokers.entries()) {
        await tribunal(ctx, j);
        if (i < jokers.length - 1) night(ctx);
    }
    assert.equal(ctx.s.winResult?.winner, 'CITIZEN');
}

// ── A07-B-143~145: 판을 끝낸 길마다 그 사건에 판 끝 칸 ──

test('A07-B-143 6명 판 밤으로 끝남 → night_result_applied에 winResult.winner·reveals', async (t) => {
    const ctx = setup(t, { n: 6 });
    const joker = gf.firstOf(ctx.s, 'JOKER');
    const [a, b, c, d] = gf.nonJokers(ctx.s);
    for (const u of [a, b, c]) dies(ctx.s, u);
    night(ctx, { [joker]: d });
    const [applied] = ctx.world.received(joker, 'night_result_applied');
    assert.equal(applied.payload.winResult.winner, 'JOKER');
    assert.equal(applied.payload.winResult.reveals.length, 6);
});

test('A07-B-144 7명 판 재판으로 끝남 → tribunal_vote_resolved에 winResult.winner·reveals', async (t) => {
    const ctx = setup(t, { n: 7 });
    await tribunal(ctx, gf.firstOf(ctx.s, 'JOKER'));
    const [resolved] = ctx.world.received(gf.nonJokers(ctx.s)[0], 'tribunal_vote_resolved');
    assert.equal(resolved.payload.winResult.winner, 'CITIZEN');
    assert.equal(resolved.payload.winResult.reveals.length, 7);
});

test('A07-B-145 5명 판 나감으로 끝남 → player_eliminated에 winResult.winner·reveals', async (t) => {
    const ctx = setup(t, { n: 5 });
    const joker = gf.firstOf(ctx.s, 'JOKER');
    assert.equal((await leave(ctx, joker)).ok, true);
    const [eliminated] = ctx.world.received(gf.nonJokers(ctx.s)[0], 'player_eliminated');
    assert.equal(eliminated.payload.winResult.winner, 'CITIZEN');
    assert.equal(eliminated.payload.winResult.reveals.length, 5);
});

test('A07-B-146 8명 판 죽은 사람 3 → 판 채널 8명이 받은 winResult 모두 같음', async (t) => {
    const ctx = setup(t, { n: 8, jokerCount: 2 });
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    const [a, b] = gf.nonJokers(ctx.s);
    for (const u of [j2, a, b]) dies(ctx.s, u);
    await tribunal(ctx, j1);
    const first = winResultOf(ctx, gf.nonJokers(ctx.s)[2]);
    assert.equal(first.winner, 'CITIZEN');
    for (const uuid of ctx.s.players.keys()) assert.deepEqual(winResultOf(ctx, uuid), first, uuid);
});

test('A07-B-147 6명 판 판 끝 뒤 결과 화면 사람이 판 상태 요청 → 스냅샷 winResult = 방송 값', async (t) => {
    const ctx = setup(t, { n: 6 });
    await endCitizenWin(ctx);
    for (const uuid of ctx.s.players.keys()) {
        const reply = await snapshot(ctx, uuid);
        assert.equal(reply.ok, true, `${uuid} 스냅샷 거절: ${reply.code}`);
        assert.deepEqual(reply.winResult, winResultOf(ctx, uuid));
    }
});

test('A07-B-148 10명 판 판 끝 방송·스냅샷 어디에도 mvp 없음', async (t) => {
    const ctx = setup(t, { n: 10, jokerCount: 2 });
    await endCitizenWin(ctx);
    for (const uuid of ctx.s.players.keys()) {
        assertNoMvp(endEvents(ctx.world, uuid)[0].payload, `${uuid} 방송`);
        assertNoMvp(await snapshot(ctx, uuid), `${uuid} 스냅샷`);
    }
});

test('A07-B-149 8명 판 재판 유죄 2번·밤 암살 2번 뒤 끝 → 판 끝 칸·스냅샷·전적 기록에 MVP 점수 없음', async (t) => {
    const ctx = setup(t, { n: 8, jokerCount: 2 });
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    const pick = () => gf.nonJokers(ctx.s).find((u) => ctx.s.players.get(u).alive);
    await tribunal(ctx, pick());
    let target = pick();
    night(ctx, { [j1]: target, [j2]: target });
    await tribunal(ctx, pick());
    target = pick();
    night(ctx, { [j1]: target, [j2]: target });
    // 8 − 처형 2 − 암살 2 = 산 (광대 2, 나머지 2) → 광대 승
    assert.equal(ctx.s.winResult?.winner, 'JOKER');
    await gf.flush();
    for (const uuid of ctx.s.players.keys()) {
        assertNoMvp(endEvents(ctx.world, uuid)[0].payload, `${uuid} 방송`);
        assertNoMvp(await snapshot(ctx, uuid), `${uuid} 스냅샷`);
    }
    assert.equal(ctx.fakes.records.length, 1);
    assertNoMvp(ctx.fakes.records[0], '전적 기록');
});

test('A07-B-150 7명 판 판 값 1 → reveals[i].goldReward 전원 1', async (t) => {
    const ctx = setup(t, { n: 7, goldReward: 1 });
    await endCitizenWin(ctx);
    const reveals = winResultOf(ctx, gf.nonJokers(ctx.s)[0]).reveals;
    assert.equal(reveals.length, 7);
    for (const row of reveals) assert.equal(row.goldReward, 1, row.uuid);
});

test('A07-B-151 7명 판 1명 산 채로 나감, 값 1 → 그 사람 줄 goldReward 0, 나머지 6명 1', async (t) => {
    const ctx = setup(t, { n: 7, goldReward: 1 });
    const [left, watcher] = gf.nonJokers(ctx.s);
    assert.equal((await leave(ctx, left)).ok, true);
    await endCitizenWin(ctx);
    const reveals = winResultOf(ctx, watcher).reveals;
    assert.equal(reveals.length, 7);
    for (const row of reveals) assert.equal(row.goldReward, row.uuid === left ? 0 : 1, row.uuid);
});

// ── A07-B-152~155: 판 끝 뒤 소켓 요청은 거절 답, 판 채널에 새 알림 없음 ──

// 5명 판을 광대 승으로 끝냄 (광대·시민이 살아 있어야 요청을 낼 수 있음)
async function endedGame(t) {
    const ctx = setup(t, { n: 5 });
    const [a, b, c] = gf.nonJokers(ctx.s);
    dies(ctx.s, a, 'ASSASSINATION');
    dies(ctx.s, b, 'ASSASSINATION');
    await tribunal(ctx, c);
    assert.equal(ctx.s.phase, 'ENDED');
    return { ...ctx, joker: gf.firstOf(ctx.s, 'JOKER'), alive: gf.nonJokers(ctx.s)[3] };
}
const receivedCount = (world) => [...world.sockets.values()].reduce((sum, sk) => sum + sk.received.length, 0);

[
    { id: 'A07-B-152', name: '낮 투표', send: (c) => gf.call(T.handleSubmitDayVote, c.world.io, c.world.sock(c.alive), c.alive, { gameId: c.s.id, targetId: c.joker }) },
    { id: 'A07-B-153', name: '재판 표', send: (c) => gf.call(T.handleCastTribunalVote, c.world.io, c.world.sock(c.alive), c.alive, { gameId: c.s.id, dayIndex: c.s.dayIndex, vote: 'GUILTY' }) },
    { id: 'A07-B-154', name: '밤 대상', send: (c) => gf.call(T.handleSubmitNightAction, c.world.sock(c.joker), c.joker, { gameId: c.s.id, targetId: c.alive }) },
    { id: 'A07-B-155', name: '판 채팅', send: (c) => gf.call(T.handleSubmitGameChatMessage, c.world.io, c.world.sock(c.alive), c.alive, { gameId: c.s.id, text: '안녕' }) },
].forEach(({ id, name, send }) => {
    test(`${id} 5명 판 끝난 뒤 ${name} 요청 → 답 GAME_ALREADY_ENDED, 판 채널에 새 알림 없음`, async (t) => {
        const ctx = await endedGame(t);
        const before = receivedCount(ctx.world);
        const reply = await send(ctx);
        await gf.flush();
        assert.equal(reply.ok, false);
        assert.equal(reply.code, 'GAME_ALREADY_ENDED');
        assert.equal(receivedCount(ctx.world), before);
    });
});
