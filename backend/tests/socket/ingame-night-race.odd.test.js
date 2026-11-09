'use strict';

// 밤 행동 이상한 순서·여러 명 동시 시험 (소켓 핸들러 + 밤 턴 순서, 진짜 DB 안 붙음)
// 광대 둘 바꾸기·턴 마감 1ms 전후·의사 마감 직전 치료·수동 밤 판정 겹침에서 죽음·점수가 한 번만 맞게 되는지 봄
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../audit-2026-11-09/gameFixtures');

const { mock } = test;
const { core } = F;
const gs = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');

const H = gs.__testables;
const persisted = [];

const resetAll = () => {
    core.__resetStateForTests();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    persisted.length = 0;
    H.__setRecordVoteParticipationForTests(async () => ({ recorded: true }));
    H.__setEvaluateAchievementsForTests(async () => {});
    H.__setGameResultPersistForTests(async (record) => { persisted.push(record); });
};

// 시계는 전부 가짜 (밤 턴·연출 대기·다음 낮 타이머 모두)
test.beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 2_000_000 });
    resetAll();
});
test.afterEach(() => {
    resetAll();
    mock.timers.reset();
});

const tick = async (ms) => {
    mock.timers.tick(ms);
    await F.flush();
};

// 상태 확인으로 기다림: 조건이 맞을 때까지 조금씩 시간 넘김 (최대 횟수 넘으면 실패)
const tickUntil = async (check, { step = 100, max = 2000, what = '조건' } = {}) => {
    for (let i = 0; i < max; i += 1) {
        if (check()) return;
        await tick(step);
    }
    assert.fail(`${what}이 끝내 안 됨`);
};

let seq = 0;
// 광대 둘 + 의사 하나 + 시민 셋, 첫 밤 (경비원·마녀사냥꾼 없음)
const nightWorld = ({ jokers = 2, n = 6, turnDurationMs = 5000 } = {}) => {
    seq += 1;
    const session = F.startGame({ id: `nr${seq}`, n, roleCounts: { JOKER: jokers, DOCTOR: 1 } });
    F.toDay(session);
    F.toNight(session);
    const w = F.socketWorld(gs, session);
    H.startNightTurnSequence(w.io, session, { turnDurationMs, presentationWaitTimeoutMs: 1000 });
    return {
        session,
        ...w,
        uuids: [...session.players.keys()],
        jokers: F.byRole(session, 'JOKER'),
        doctor: F.firstOf(session, 'DOCTOR'),
        citizens: F.byRole(session, 'CITIZEN'),
    };
};

const act = (w, uuid, targetId) =>
    F.call(H.handleSubmitNightAction, w.sock(uuid), uuid, { gameId: w.session.id, targetId });
const resolveNight = (w, uuid) =>
    F.call(H.handleResolveNight, w.io, w.sock(uuid), uuid, { gameId: w.session.id });
const turnEndedCount = (w, uuid, role) =>
    w.received(uuid, 'night_turn_ended').filter((e) => e.payload.role === role).length;
const toNextDay = (w) => tickUntil(() => w.session.phase !== 'NIGHT', { what: '낮으로 넘어가기' });

test('[바꾸기 + 동시] 광대 하나가 A→C로 바꾼 뒤 다른 광대가 C를 고르면 → C만 죽음, 턴 닫힌 뒤 늦은 바꾸기 거절, 두 광대 점수 1씩', async () => {
    const w = nightWorld();
    const [j1, j2] = w.jokers;
    const [a, , c] = w.citizens;

    assert.equal((await act(w, j1, a)).ok, true);
    assert.equal((await act(w, j1, c)).ok, true);
    assert.equal(w.session.nightActions.get(j1), c);
    assert.equal(w.session.nightTurnRole, 'JOKER');

    assert.equal((await act(w, j2, c)).ok, true);
    const lateChange = await act(w, j1, a);
    assert.equal(lateChange.ok, false);

    await toNextDay(w);
    assert.deepEqual([w.session.phase, w.session.dayIndex], ['DAY', 2]);
    assert.equal(w.session.players.get(c).alive, false);
    assert.equal(w.session.players.get(c).deathReason, 'ASSASSINATION');
    assert.equal(w.session.players.get(a).alive, true);
    assert.equal(turnEndedCount(w, w.uuids[0], 'JOKER'), 1);
    assert.deepEqual([w.session.mvpScores.get(j1), w.session.mvpScores.get(j2)], [1, 1]);
});

test('[마감 순간] 광대 턴 마감 1ms 전 제출은 셈 + 안 낸 광대는 기권으로 채움, 마감 직후 그 광대 제출은 거절', async () => {
    const w = nightWorld({ turnDurationMs: 5000 });
    const [j1, j2] = w.jokers;
    const [a, b] = w.citizens;

    await tick(4999);
    assert.equal((await act(w, j1, a)).ok, true);
    assert.equal(w.session.nightTurnRole, 'JOKER');

    await tick(1);
    assert.equal(turnEndedCount(w, w.uuids[0], 'JOKER'), 1);
    const late = await act(w, j2, b);
    assert.equal(late.ok, false);

    await toNextDay(w);
    assert.equal(w.session.players.get(a).alive, false);
    assert.equal(w.session.players.get(b).alive, true);
    assert.equal(w.session.mvpScores.get(j1), 1);
    assert.equal(w.session.mvpScores.get(j2) ?? 0, 0);
});

test('[동시 + 의사 마감 1ms 전] 광대 둘이 같은 순간 A를 고르고 의사가 자기 턴 마감 1ms 전에 A를 고치면 → A 살고 의사 점수 1, 광대 점수 0', async () => {
    const w = nightWorld({ turnDurationMs: 5000 });
    const [j1, j2] = w.jokers;
    const [a] = w.citizens;
    const run = () => H.__getNightTurnRunForTests(w.session.id);

    const both = await Promise.all([act(w, j1, a), act(w, j2, a)]);
    assert.deepEqual(both.map((r) => r.ok), [true, true]);

    await tickUntil(() => w.session.nightTurnRole === 'DOCTOR' && run()?.stage === H.NIGHT_TURN_STAGES.SUBMITTING,
        { step: 50, what: '의사 턴 열리기' });
    const deadline = w.session.nightTurnDeadline;
    await tick(deadline - Date.now() - 1);
    assert.equal((await act(w, w.doctor, a)).ok, true);
    assert.equal(turnEndedCount(w, w.uuids[0], 'DOCTOR'), 1);
    const lateDoctor = await act(w, w.doctor, w.citizens[1]);
    assert.equal(lateDoctor.ok, false);

    await toNextDay(w);
    assert.equal(w.session.players.get(a).alive, true);
    assert.ok([...w.session.players.values()].every((p) => p.alive));
    assert.equal(w.session.mvpScores.get(w.doctor), 1);
    assert.equal(w.session.mvpScores.get(j1) ?? 0, 0);
    assert.equal(w.session.mvpScores.get(j2) ?? 0, 0);
});

test('[겹침: 수동 밤 판정 여럿 + 자동 마무리] 마지막 턴이 닫히는 순간과 그 뒤에 밤 판정 버튼을 셋이 같이 눌러도 → 죽음·결과 방송·광대 점수 한 번', async () => {
    const w = nightWorld({ jokers: 1, n: 5, turnDurationMs: 5000 });
    const [j] = w.jokers;
    const [a, b, c] = w.citizens;

    assert.equal((await act(w, j, a)).ok, true);
    await tickUntil(() => w.session.nightTurnRole === 'DOCTOR'
        && H.__getNightTurnRunForTests(w.session.id)?.stage === H.NIGHT_TURN_STAGES.SUBMITTING, { step: 50, what: '의사 턴 열리기' });

    // 의사가 엉뚱한 사람을 고쳐 턴이 닫히는 그 순간 셋이 판정 버튼
    assert.equal((await act(w, w.doctor, b)).ok, true);
    const sameMoment = await Promise.all([a, b, c].map((u) => resolveNight(w, u)));
    await toNextDay(w);
    const afterward = await Promise.all([b, c, j].map((u) => resolveNight(w, u)));

    assert.ok(afterward.every((r) => r.ok === false));
    // 같은 순간 누른 것도 확정을 두 번 만들지 않음 (성공이어도 결과는 한 번)
    assert.ok(sameMoment.filter((r) => r.ok === true).length <= 1);
    assert.equal(w.session.players.get(a).alive, false);
    assert.equal([...w.session.players.values()].filter((p) => !p.alive).length, 1);
    assert.equal(w.session.mvpScores.get(j), 1);
    for (const u of w.uuids) assert.equal(w.received(u, 'night_result_applied').length, 1, `${u} 결과 방송 수`);
    assert.deepEqual([w.session.phase, w.session.dayIndex], ['DAY', 2]);
});
