'use strict';

// 밤 시험(서버 흐름, 가짜 소켓·가짜 시계) — 밤 결과 방송: 판 전원이 받고 직업은 안 실림, 희생자·사망 공개·의사가 살렸나·다음 낮
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-161~171, 돌리기: node --env-file=.env.test --test tests/flow/a05a-night-applied.test.js
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
    const s = gf.startGame({ id: `a05a-fna-${seq}`, n, ...opts });
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

// 밤 한 번 차례대로 끝까지: 차례가 열리면 그 직업 행동을 보내고(during = 그 차례에 할 일), 가짜 시계를 차례 길이만큼씩 흘림
// plan: { JOKER: [[누가, 누구], …] } (안 적은 직업은 안 냄 = 시간 끝에 건너뛰기)
async function playNight({ s, world }, plan = {}, { turnMs = 30_000, watcher = [...s.players.keys()][0], during = {} } = {}) {
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
            const { role } = started[handled].payload;
            for (const [actor, target] of plan[role] ?? []) replies.push(await submit(world, s, actor, target));
            if (during[role]) await during[role]();
        }
        if (world.received(watcher, 'night_result_applied').length > doneBefore || s.phase !== 'NIGHT') break;
        clock.advance(turnMs);
    }
    assert.ok(replies.every((r) => r.ok), `밤 행동 거절 (준비 잘못): ${JSON.stringify(replies)}`);
    return { clock, replies };
}

// 그 사람이 받은 마지막 밤 결과 방송
const lastApplied = (world, uuid) => world.received(uuid, 'night_result_applied').at(-1)?.payload;

// ── 밤 결과는 판 전원이 받고 직업은 안 실림 (시민 1명 처형된 판, 첫 밤 광대 → 다른 시민) ──
const BROADCAST_SIZES = [['A05-B-161', 5], ['A05-B-162', 6], ['A05-B-163', 7], ['A05-B-164', 8], ['A05-B-165', 10]];
for (const [no, n] of BROADCAST_SIZES) {
    test(`${no} ${n}명 시민 1명 처형: 산·죽은 사람 모두 밤 결과 받음, 받은 값에 남의 직업 없음`, async (t) => {
        const ctx = setup(t, n);
        const [dead, victim] = gf.byRole(ctx.s, 'CITIZEN');
        executeDay(ctx.s, dead);
        await playNight(ctx, { JOKER: [[gf.firstOf(ctx.s, 'JOKER'), victim]] });
        for (const uuid of ctx.s.players.keys()) {
            const got = ctx.world.received(uuid, 'night_result_applied');
            assert.equal(got.length, 1, `${uuid}가 밤 결과를 못 받음`);
            // 사망 공개 source 'JOKER'는 "광대에게 죽음" 표시라 직업 공개가 아님 → 도우미의 밤 결과 자리(nightResult)에 넣어 검사
            assertNoForbiddenPrivateData({ nightResult: got[0].payload }, collectOtherPlayerRoleSecrets(ctx.s, uuid));
        }
    });
}

// 6명 자동(광대1·의사1·시민4) 첫 밤
function six(t) {
    const ctx = setup(t, 6);
    passDay(ctx.s);
    const [a, b] = gf.byRole(ctx.s, 'CITIZEN');
    return { ...ctx, joker: gf.firstOf(ctx.s, 'JOKER'), doctor: gf.firstOf(ctx.s, 'DOCTOR'), a, b };
}

test('A05-B-166 6명 암살 성공: victimUuid A, deathReveals [{ A, JOKER }], players에서 A 죽음', async (t) => {
    const g = six(t);
    await playNight(g, { JOKER: [[g.joker, g.a]] });
    const applied = lastApplied(g.world, g.b);
    assert.equal(applied.victimUuid, g.a);
    assert.deepEqual(applied.deathReveals, [{ victimUuid: g.a, source: 'JOKER' }]);
    assert.equal(applied.players.find((p) => p.uuid === g.a).alive, false);
});

test('A05-B-167 6명 의사가 살림: victimUuid null, deathReveals [], doctorSaved 칸 없음', async (t) => {
    const g = six(t);
    await playNight(g, { JOKER: [[g.joker, g.a]], DOCTOR: [[g.doctor, g.a]] });
    const applied = lastApplied(g.world, g.b);
    assert.equal(applied.victimUuid, null);
    assert.deepEqual(applied.deathReveals, []);
    assert.equal(Object.hasOwn(applied, 'doctorSaved'), false);
});

test('A05-B-168 6명 광대 건너뜀(아무 일 없음): victimUuid null, doctorSaved 칸 없음', async (t) => {
    const g = six(t);
    await playNight(g, { JOKER: [[g.joker, null]] });
    const applied = lastApplied(g.world, g.b);
    assert.equal(applied.victimUuid, null);
    assert.equal(Object.hasOwn(applied, 'doctorSaved'), false);
});

test('A05-B-169 7명 광대2 동률: victimUuid null, doctorSaved 칸 없음', async (t) => {
    const ctx = setup(t, 7, { jokerCount: 2 });
    passDay(ctx.s);
    const [jokerA, jokerB] = gf.byRole(ctx.s, 'JOKER');
    const [x, y] = gf.byRole(ctx.s, 'CITIZEN');
    await playNight(ctx, { JOKER: [[jokerA, x], [jokerB, y]] });
    const applied = lastApplied(ctx.world, jokerA);
    assert.equal(applied.victimUuid, null);
    assert.equal(Object.hasOwn(applied, 'doctorSaved'), false);
});

test('A05-B-170 6명 다음 낮 값: 단계 낮, 날짜 +1, 새 낮 마감 시각 실림', async (t) => {
    const g = six(t);
    await playNight(g, { JOKER: [[g.joker, g.a]] });
    const applied = lastApplied(g.world, g.b);
    assert.equal(applied.phase, 'DAY');
    assert.equal(applied.dayIndex, 2);
    assert.ok(Number.isFinite(applied.dayPhaseDeadline) && applied.dayPhaseDeadline > 0, '새 낮 마감 시각 없음');
});

test('A05-B-171 6명: 광대 → A, 의사 차례 중 A가 게임 나가기 → victimUuid null, 밤에 죽은 사람 없음', async (t) => {
    const g = six(t);
    const leave = async () => {
        const reply = await gf.call(T.handleLeaveGameSession, g.world.io, g.world.sock(g.a), g.a, { gameId: g.s.id });
        assert.equal(reply.ok, true, '나가기 거절 (준비 잘못)');
    };
    await playNight(g, { JOKER: [[g.joker, g.a]] }, { watcher: g.b, during: { DOCTOR: leave } });
    const applied = lastApplied(g.world, g.b);
    assert.ok(applied, '밤 결과를 못 받음');
    assert.equal(applied.victimUuid, null);
    assert.deepEqual(applied.deathReveals, []);
});
