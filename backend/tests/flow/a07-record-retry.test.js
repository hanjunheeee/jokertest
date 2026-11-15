'use strict';

// 전적 저장 다시 하기 서버 흐름 시험 — 저장 실패면 1초·5초·30초·그 뒤 60초마다 다시, 다시 해도 안 될 실패면 그만, 저장이 늦어도 판 끝 방송은 바로
// 목록 A07-B-179~184, 돌리기: node --env-file=.env.test --test tests/flow/a07-record-retry.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음 → 꼭 socket 쪽보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const persistModule = require('../../services/game/record/persist');
const desertion = require('../../services/game/desertion');

const T = gs.__testables;

// ── 이 파일 안 작은 도우미 (공용 도우미는 안 고침) ──

const clockFns = (clock) => ({ nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });

let seq = 0;
// 판 하나 + 가짜 소켓 + 가짜 시계 + 가짜 저장(persist로 실패 흉내)·장부·업적 (DB 안 감)
function setup(t, { n, persist }) {
    gf.resetCore();
    gs.__resetStateForTests();
    const clock = gf.fakeClock();
    const fakes = { tries: 0, saved: 0, grants: [], evaluated: [] };
    T.__setRecordVoteParticipationForTests(async () => {});
    T.__setEvaluateAchievementsForTests(async (userId) => { fakes.evaluated.push(userId); });
    T.__setGameResultPersistForTests((record) => {
        fakes.tries += 1;
        return Promise.resolve(persist(record, fakes.tries)).then(() => { fakes.saved += 1; });
    });
    persistModule.__setGameGoldGrantForTests(async (grant) => { fakes.grants.push(grant); });
    T.__setTerminalPersistTimersForTests({ setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });
    desertion.__setRepositoryForTests({
        findDesertionsForWarmup: async () => [],
        countDesertionsSince: async () => 0,
        insertDesertion: async (row) => ({ created: true, row }),
    });
    seq += 1;
    const s = gf.startGame({ id: `a07rr-${seq}`, n });
    s.goldReward = 1;
    gf.toDay(s);
    const world = gf.socketWorld(gs, s);
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

// 광대 재판 처형으로 시민 승 (다 내면 5초 뒤 판정, 가짜 시계)
async function endByTribunal({ s, world, clock }) {
    const joker = gf.firstOf(s, 'JOKER');
    gf.toTribunal(s, joker);
    T.startTribunalTimer(world.io, s, { ...clockFns(clock), durationMs: 15_000 });
    for (const uuid of gf.nonJokers(s)) {
        const r = await gf.call(T.handleCastTribunalVote, world.io, world.sock(uuid), uuid, { gameId: s.id, dayIndex: s.dayIndex, vote: 'GUILTY' });
        assert.equal(r.ok, true, `재판 표 거절: ${r.code}`);
    }
    clock.advance(5_000);
}

async function settle() {
    for (let i = 0; i < 10; i += 1) await gf.flush();
}

// 시간을 넘기고 비동기 꼬리까지 흘려보냄
async function advance(clock, ms) {
    clock.advance(ms);
    await settle();
}

// 계속 실패하는 저장 (잠깐 끊김 모양, 다시 하면 될 수도 있는 실패)
const alwaysFails = () => Promise.reject(new Error('DB 잠깐 끊김'));

// 판 끝까지 가서 첫 저장 시도까지 (시도 1번)
async function endedWithFailingSave(t) {
    const ctx = setup(t, { n: 5, persist: alwaysFails });
    await endByTribunal(ctx);
    await settle();
    assert.equal(ctx.s.phase, 'ENDED');
    assert.equal(ctx.fakes.tries, 1);
    return ctx;
}

// ── A07-B-179~182: 늘어나는 간격 ──

test('A07-B-179 저장 계속 실패 → 1초 뒤 다시 (0.999초엔 1번, 1초에 2번)', async (t) => {
    const ctx = await endedWithFailingSave(t);
    await advance(ctx.clock, 999);
    assert.equal(ctx.fakes.tries, 1);
    await advance(ctx.clock, 1);
    assert.equal(ctx.fakes.tries, 2);
});

test('A07-B-180 저장 계속 실패 → 그다음 5초 뒤 (4.999초엔 2번, 5초에 3번)', async (t) => {
    const ctx = await endedWithFailingSave(t);
    await advance(ctx.clock, 1_000);
    assert.equal(ctx.fakes.tries, 2);
    await advance(ctx.clock, 4_999);
    assert.equal(ctx.fakes.tries, 2);
    await advance(ctx.clock, 1);
    assert.equal(ctx.fakes.tries, 3);
});

test('A07-B-181 저장 계속 실패 → 그다음 30초 뒤 (29.999초엔 3번, 30초에 4번)', async (t) => {
    const ctx = await endedWithFailingSave(t);
    await advance(ctx.clock, 1_000);
    await advance(ctx.clock, 5_000);
    assert.equal(ctx.fakes.tries, 3);
    await advance(ctx.clock, 29_999);
    assert.equal(ctx.fakes.tries, 3);
    await advance(ctx.clock, 1);
    assert.equal(ctx.fakes.tries, 4);
});

test('A07-B-182 저장 계속 실패 → 그 뒤로는 60초마다 (59.999초엔 그대로, 60초마다 1번씩)', async (t) => {
    const ctx = await endedWithFailingSave(t);
    await advance(ctx.clock, 1_000);
    await advance(ctx.clock, 5_000);
    await advance(ctx.clock, 30_000);
    assert.equal(ctx.fakes.tries, 4);
    await advance(ctx.clock, 59_999);
    assert.equal(ctx.fakes.tries, 4);
    await advance(ctx.clock, 1);
    assert.equal(ctx.fakes.tries, 5);
    await advance(ctx.clock, 60_000);
    assert.equal(ctx.fakes.tries, 6);
});

test('A07-B-183 저장이 제약 위반 오류 → 10분 지나도 시도 1번, 골드·업적 없음', async (t) => {
    const ctx = setup(t, {
        n: 5,
        persist: () => Promise.reject(Object.assign(new Error('같은 판 줄 있음'), { name: 'SequelizeUniqueConstraintError' })),
    });
    await endByTribunal(ctx);
    await settle();
    for (let i = 0; i < 10; i += 1) await advance(ctx.clock, 60_000);
    assert.equal(ctx.fakes.tries, 1);
    assert.equal(ctx.fakes.saved, 0);
    assert.equal(ctx.fakes.grants.length, 0);
    assert.equal(ctx.fakes.evaluated.length, 0);
});

test('A07-B-184 6명 판 저장이 멈춰 있어도 판 끝 알림은 같은 차례에 감', async (t) => {
    // 끝나지 않는 저장 (답이 안 옴)
    const ctx = setup(t, { n: 6, persist: () => new Promise(() => {}) });
    const joker = gf.firstOf(ctx.s, 'JOKER');
    gf.toTribunal(ctx.s, joker);
    T.startTribunalTimer(ctx.world.io, ctx.s, { ...clockFns(ctx.clock), durationMs: 15_000 });
    for (const uuid of gf.nonJokers(ctx.s)) {
        await gf.call(T.handleCastTribunalVote, ctx.world.io, ctx.world.sock(uuid), uuid, { gameId: ctx.s.id, dayIndex: ctx.s.dayIndex, vote: 'GUILTY' });
    }
    // 판정 시각을 넘기는 이 한 줄 안에서 알림까지 가야 함 (기다리지 않고 바로 봄)
    ctx.clock.advance(5_000);
    for (const uuid of ctx.s.players.keys()) {
        const got = ctx.world.received(uuid, 'tribunal_vote_resolved').filter((e) => e.payload.winResult);
        assert.equal(got.length, 1, `${uuid}가 판 끝 알림을 못 받음`);
    }
    assert.equal(ctx.fakes.tries, 1);
    assert.equal(ctx.fakes.saved, 0);
});
