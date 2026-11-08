'use strict';

// 소켓 시험: 단계 타이머(역할 공개·낮·재판·밤 턴)·끊김 유예·전적 저장 재시도 (2차 묶음)
// 시계·타이머는 전부 가짜 주입 (시간 흐름에 안 흔들림), 진짜 DB 안 붙음
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./gameFixtures');

const { core } = F;
const gs = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');
const timers = require('../../socket/gameSession/core/timers');

const H = gs.__testables;
let persistImpl = async () => {};

const resetAll = () => {
    core.__resetStateForTests();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    persistImpl = async () => {};
    H.__setGameResultPersistForTests((record) => persistImpl(record));
    H.__setRecordVoteParticipationForTests(async () => ({ recorded: true }));
    H.__setEvaluateAchievementsForTests(async () => {});
};
test.beforeEach(resetAll);
test.afterEach(resetAll);

let seq = 0;
const world = ({ n = 5, phase = 'DAY', settings = {} } = {}) => {
    seq += 1;
    const session = F.startGame({ id: `st${seq}`, n, settings });
    if (phase !== 'ROLE_REVEAL') F.toDay(session);
    if (phase === 'DAY_VOTE') F.toVote(session);
    if (phase === 'NIGHT') F.toNight(session);
    const w = F.socketWorld(gs, session);
    return { session, ...w, uuids: [...session.players.keys()] };
};
const clockDeps = (clock, extra = {}) => ({ nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn, ...extra });

// ── 역할 공개 마감 ──

test('[규칙 변경] 역할 공개 마감 기본 길이는 10초', () => {
    const { session, io } = world({ phase: 'ROLE_REVEAL' });
    const clock = F.fakeClock();
    const run = H.ensureRoleRevealTimer(io, session, clockDeps(clock));
    assert.equal(run.deadline - clock.now(), 10_000);
});

test('[규칙 변경] 역할 공개: 아무도 확인 안 해도 10초 지나면 첫 낮, 단계 방송에 낮 마감 시각', () => {
    const { session, io, uuids, received } = world({ phase: 'ROLE_REVEAL' });
    const clock = F.fakeClock();
    H.ensureRoleRevealTimer(io, session, clockDeps(clock));
    clock.advance(9_999);
    assert.equal(session.phase, 'ROLE_REVEAL');
    clock.advance(1);
    assert.deepEqual([session.phase, session.dayIndex], ['DAY', 1]);
    const changed = received(uuids[0], 'game_phase_changed').at(-1).payload;
    assert.equal(changed.phase, 'DAY');
    assert.ok(Number.isFinite(changed.dayPhaseDeadline));
});

test('역할 공개 마감을 두 번 걸어도 처음 마감 그대로', () => {
    const { session, io } = world({ phase: 'ROLE_REVEAL' });
    const clock = F.fakeClock();
    const first = H.ensureRoleRevealTimer(io, session, clockDeps(clock, { durationMs: 5000 }));
    clock.advance(3000);
    const second = H.ensureRoleRevealTimer(io, session, clockDeps(clock, { durationMs: 5000 }));
    assert.equal(second, first);
    clock.advance(2000);
    assert.equal(session.phase, 'DAY');
});

test('역할 공개 마감을 끄면 시간이 지나도 안 넘어감', () => {
    const { session, io } = world({ phase: 'ROLE_REVEAL' });
    const clock = F.fakeClock();
    H.ensureRoleRevealTimer(io, session, clockDeps(clock, { durationMs: 5000 }));
    H.stopRoleRevealTimer(session.id);
    clock.advance(60_000);
    assert.equal(session.phase, 'ROLE_REVEAL');
});

test('역할 공개가 아닌 판엔 역할 공개 마감이 안 걸림', () => {
    const { session, io } = world({ phase: 'DAY' });
    assert.equal(H.ensureRoleRevealTimer(io, session), null);
});

// ── 낮 타이머 ──

test('낮 토론 마감: 방 설정 토론 시간(15초) 뒤 투표로, 방송에 새 마감 시각', () => {
    const { session, io, uuids, received } = world({ settings: { dayDiscussionTime: 15, dayVoteTime: 20 } });
    const clock = F.fakeClock();
    H.startDayPhaseTimer(io, session, clockDeps(clock));
    assert.equal(session.dayPhaseDeadline - clock.now(), 15_000);
    clock.advance(15_000);
    assert.equal(session.dayPhase, 'DAY_VOTE');
    const payload = received(uuids[0], 'day_phase_changed').at(-1).payload;
    assert.equal(payload.dayPhaseDeadline, clock.now() + 20_000);
});

test('낮 투표 마감: 안 낸 사람은 기권으로 채워 판정, 전원 기권이면 밤', () => {
    const { session, io, uuids, received } = world({ phase: 'DAY_VOTE' });
    const clock = F.fakeClock();
    H.startDayPhaseTimer(io, session, clockDeps(clock, { voteDurationMs: 1000 }));
    clock.advance(1000);
    assert.equal(session.phase, 'NIGHT');
    assert.equal(received(uuids[1], 'day_vote_resolved')[0].payload.outcome, 'ABSTAINED');
});

test('낮 투표 마감: 낸 표만으로 최다 1명이면 재판, 재판 마감이 걸림', () => {
    const { session, io, uuids } = world({ phase: 'DAY_VOTE' });
    core.submitDayVote(uuids[0], session.id, uuids[2]);
    const clock = F.fakeClock();
    H.startDayPhaseTimer(io, session, clockDeps(clock, { voteDurationMs: 1000 }));
    clock.advance(1000);
    assert.equal(session.phase, 'TRIBUNAL');
    assert.equal(session.tribunal.defendantUuid, uuids[2]);
    assert.notEqual(H.__getTribunalRunForTests(session.id), null);
});

test('[규칙 변경] 낮 투표 마감: 동률이면 재투표 없이 밤', () => {
    const { session, io, uuids } = world({ phase: 'DAY_VOTE' });
    core.submitDayVote(uuids[0], session.id, uuids[1]);
    core.submitDayVote(uuids[1], session.id, uuids[0]);
    const clock = F.fakeClock();
    H.startDayPhaseTimer(io, session, clockDeps(clock, { voteDurationMs: 1000 }));
    clock.advance(1000);
    assert.equal(session.phase, 'NIGHT');
});

test('낮 타이머가 걸린 뒤 판이 밤으로 바뀌었으면 마감 때 아무것도 안 함', () => {
    const { session, io, uuids, received } = world({ phase: 'DAY_VOTE' });
    const clock = F.fakeClock();
    H.startDayPhaseTimer(io, session, clockDeps(clock, { voteDurationMs: 1000 }));
    F.toNight(session);
    clock.advance(5000);
    assert.equal(received(uuids[0], 'day_vote_resolved').length, 0);
    assert.equal(session.dayVotes.size, 0);
});

test('낮 타이머 멈춤: 판에 적은 낮 마감 시각도 지움', () => {
    const { session, io } = world();
    const clock = F.fakeClock();
    H.startDayPhaseTimer(io, session, clockDeps(clock));
    assert.ok(session.dayPhaseDeadline > 0);
    H.stopDayPhaseTimer(session.id);
    assert.equal(session.dayPhaseDeadline, null);
});

// ── 재판 타이머 ──

const tribunalWorld = (settings = {}) => {
    const w = world({ settings });
    const defendant = F.byRole(w.session, 'CITIZEN')[0];
    F.toTribunal(w.session, defendant);
    return { ...w, defendant, voters: w.uuids.filter((u) => u !== defendant) };
};

test('재판 마감 길이는 방 설정 낮 투표 시간을 따름, 판에 재판 마감 시각 적힘', () => {
    const { session, io } = tribunalWorld({ dayVoteTime: 25 });
    const clock = F.fakeClock();
    const run = H.startTribunalTimer(io, session, clockDeps(clock));
    assert.equal(run.deadline - clock.now(), 25_000);
    assert.equal(session.tribunalDeadline, run.deadline);
});

test('재판 마감: 안 낸 사람은 기권, 유죄 1 무죄 0이면 처형하고 밤으로', () => {
    const { session, io, voters, defendant, received } = tribunalWorld();
    core.submitTribunalVote(voters[0], session.id, 1, 'GUILTY');
    const clock = F.fakeClock();
    H.startTribunalTimer(io, session, clockDeps(clock, { durationMs: 2000 }));
    clock.advance(2000);
    assert.equal(session.players.get(defendant).alive, false);
    assert.equal(session.phase, 'NIGHT');
    assert.equal(received(voters[1], 'tribunal_vote_resolved')[0].payload.counts.guilty, 1);
});

test('재판 마감: 아무도 안 냈으면 무죄로 밤', () => {
    const { session, io, defendant } = tribunalWorld();
    const clock = F.fakeClock();
    H.startTribunalTimer(io, session, clockDeps(clock, { durationMs: 2000 }));
    clock.advance(2000);
    assert.deepEqual([session.players.get(defendant).alive, session.phase], [true, 'NIGHT']);
});

test('재판이 버튼으로 먼저 끝났으면 마감 타이머는 아무것도 안 함', () => {
    const { session, io, voters, received } = tribunalWorld();
    const clock = F.fakeClock();
    H.startTribunalTimer(io, session, clockDeps(clock, { durationMs: 2000 }));
    for (const v of voters) core.submitTribunalVote(v, session.id, 1, 'NOT_GUILTY');
    const p = core.prepareTribunalVoteResolution(voters[0], session.id, 1);
    core.commitTribunalVoteResolution(p.session, p.resolution);
    clock.advance(5000);
    assert.equal(received(voters[0], 'tribunal_vote_resolved').length, 0);
    assert.equal(session.phase, 'NIGHT');
});

test('재판 아닌 판엔 재판 마감이 안 걸림', () => {
    const { session, io } = world();
    assert.equal(H.startTribunalTimer(io, session), null);
});

// ── 밤 턴 ──

test('밤 턴: 광대 턴부터 열리고 방송에 마감 시각, 판에 지금 차례 적힘', () => {
    const { session, io, uuids, received } = world({ n: 10, phase: 'NIGHT' });
    const clock = F.fakeClock();
    H.startNightTurnSequence(io, session, clockDeps(clock, { turnDurationMs: 5000 }));
    const started = received(uuids[0], 'night_turn_started')[0].payload;
    assert.deepEqual([started.role, started.deadline], ['JOKER', clock.now() + 5000]);
    assert.equal(session.nightTurnRole, 'JOKER');
});

test('밤 턴: 아무도 안 내도 마감마다 기권 채워 밤이 끝나고 다음 낮', () => {
    const { session, io } = world({ n: 10, phase: 'NIGHT' });
    const clock = F.fakeClock();
    H.startNightTurnSequence(io, session, clockDeps(clock, { turnDurationMs: 5000, presentationWaitTimeoutMs: 1000 }));
    for (let i = 0; i < 10 && session.phase === 'NIGHT'; i += 1) clock.advance(10_000);
    assert.deepEqual([session.phase, session.dayIndex], ['DAY', 2]);
    assert.ok([...session.players.values()].every((p) => p.alive));
});

test('밤 턴: 첫날 밤엔 마녀사냥꾼 턴 방송이 안 나감', () => {
    const { session, io, uuids, received } = world({ n: 10, phase: 'NIGHT' });
    const clock = F.fakeClock();
    H.startNightTurnSequence(io, session, clockDeps(clock, { turnDurationMs: 5000, presentationWaitTimeoutMs: 1000 }));
    for (let i = 0; i < 10 && session.phase === 'NIGHT'; i += 1) clock.advance(10_000);
    const roles = received(uuids[0], 'night_turn_started').map((e) => e.payload.role);
    assert.deepEqual(roles, ['JOKER', 'DOCTOR', 'GUARD']);
});

test('밤 턴: 광대가 내면 마감 안 기다리고 광대 턴이 닫힘', async () => {
    const { session, io, sock, uuids, received } = world({ n: 10, phase: 'NIGHT' });
    const clock = F.fakeClock();
    H.startNightTurnSequence(io, session, clockDeps(clock, { turnDurationMs: 30_000 }));
    const joker = F.firstOf(session, 'JOKER');
    const res = await F.call(H.handleSubmitNightAction, sock(joker), joker, { gameId: session.id, targetId: F.byRole(session, 'CITIZEN')[0] });
    assert.equal(res.ok, true);
    assert.equal(received(uuids[0], 'night_turn_ended')[0].payload.role, 'JOKER');
});

test('밤 턴: 내 차례가 아닌 역할의 제출은 NOT_YOUR_TURN', async () => {
    const { session, io, sock } = world({ n: 10, phase: 'NIGHT' });
    const clock = F.fakeClock();
    H.startNightTurnSequence(io, session, clockDeps(clock, { turnDurationMs: 30_000 }));
    const doctor = F.firstOf(session, 'DOCTOR');
    const res = await F.call(H.handleSubmitNightAction, sock(doctor), doctor, { gameId: session.id, targetId: doctor });
    assert.equal(res.code, 'NOT_YOUR_TURN');
});

test('밤 턴 마감이 지나 확정된 광대 대상이 낮에 죽어 있음', () => {
    const { session, io } = world({ n: 10, phase: 'NIGHT' });
    const joker = F.firstOf(session, 'JOKER');
    const victim = F.byRole(session, 'CITIZEN')[0];
    const clock = F.fakeClock();
    H.startNightTurnSequence(io, session, clockDeps(clock, { turnDurationMs: 5000, presentationWaitTimeoutMs: 1000 }));
    core.submitNightAction(joker, session.id, victim);
    for (let i = 0; i < 10 && session.phase === 'NIGHT'; i += 1) clock.advance(10_000);
    assert.equal(session.players.get(victim).alive, false);
    assert.equal(session.phase, 'DAY');
});

test('밤 턴 길이: 시험 주입 → 역할별 설정 → 밤 공통 설정 → 기본 30초', () => {
    const run = (durationMs, timerSettings) => ({ durationMs, session: { timerSettings } });
    assert.equal(timers.resolveNightTurnDurationMs(run(1234, {}), 'JOKER'), 1234);
    assert.equal(timers.resolveNightTurnDurationMs(run(null, { roleNightActionTimes: { JOKER: 7 }, nightActionTime: 9 }), 'JOKER'), 7000);
    assert.equal(timers.resolveNightTurnDurationMs(run(null, { roleNightActionTimes: { JOKER: 7 }, nightActionTime: 9 }), 'DOCTOR'), 9000);
    assert.equal(timers.resolveNightTurnDurationMs(run(null, null), 'GUARD'), 30_000);
});

test('빈 턴 대기: 턴 길이의 20~60% 안, 이상한 난수면 20%', () => {
    assert.equal(timers.computeEmptyTurnDelayMs(10_000, () => 0), 2000);
    assert.equal(timers.computeEmptyTurnDelayMs(10_000, () => 1), 6000);
    assert.equal(timers.computeEmptyTurnDelayMs(10_000, () => 5), 6000);
    assert.equal(timers.computeEmptyTurnDelayMs(10_000, () => NaN), 2000);
});

test('연출 대기 상한: 주입 값이 범위 밖이면 버리고 기본 12초', () => {
    assert.equal(timers.resolveNightWaitMs({ presentationWaitTimeoutMs: 500 }), 500);
    assert.equal(timers.resolveNightWaitMs({ presentationWaitTimeoutMs: 0 }), 12_000);
    assert.equal(timers.resolveNightWaitMs({ presentationWaitTimeoutMs: 2 ** 31 }), 12_000);
});

// ── 끊김 유예 ──

test('주인 소켓이 아닌 소켓의 끊김은 무시 (유예 안 걸림)', async () => {
    const { session, io, sock, registry, uuids } = world();
    registry.set(uuids[0], 'newer-socket');
    await gs.onDisconnect(io, sock(uuids[0]), uuids[0]);
    assert.equal(H.getDisconnectGraceRun(session.id, uuids[0]), undefined);
});

test('산 참가자가 끊기면 유예만 걸리고 판·채널은 그대로', async () => {
    const { session, io, sock, uuids } = world();
    await gs.onDisconnect(io, sock(uuids[0]), uuids[0]);
    assert.notEqual(H.getDisconnectGraceRun(session.id, uuids[0]), undefined);
    assert.equal(session.players.get(uuids[0]).alive, true);
    assert.equal(core.getActiveSessionRoutingInfo(uuids[0]).gameId, session.id);
});

test('죽은 참가자가 끊기면 유예 없음, 자리 그대로', async () => {
    const { session, io, sock, uuids } = world();
    session.players.get(uuids[0]).alive = false;
    await gs.onDisconnect(io, sock(uuids[0]), uuids[0]);
    assert.equal(H.getDisconnectGraceRun(session.id, uuids[0]), undefined);
    assert.equal(core.getActiveSessionRoutingInfo(uuids[0]).gameId, session.id);
});

test('끊긴 채 단계가 바뀌면 유예 만료 → 탈락·기권 (낮 토론 → 투표)', () => {
    const { session, io, sock } = world();
    const c0 = F.byRole(session, 'CITIZEN')[0];
    H.beginDisconnectGrace(io, session, c0);
    sock(c0).connected = false;
    session.phase = 'NIGHT';
    F.toNight(session);
    H.syncSessionPhaseTimers(io, session);
    const p = session.players.get(c0);
    assert.deepEqual([p.alive, p.deathReason, core.isForfeitedFromSession(session.id, c0)], [false, 'DISCONNECT', true]);
});

test('단계가 바뀌어도 그사이 다시 붙어 있으면 탈락 안 함', () => {
    const { session, io } = world();
    const c0 = F.byRole(session, 'CITIZEN')[0];
    H.beginDisconnectGrace(io, session, c0);
    F.toNight(session);
    H.syncSessionPhaseTimers(io, session);
    assert.equal(session.players.get(c0).alive, true);
    assert.equal(H.getDisconnectGraceRun(session.id, c0), undefined);
});

test('유예를 풀면(재접속) 단계가 바뀌어도 탈락 안 함', () => {
    const { session, io, sock } = world();
    const c0 = F.byRole(session, 'CITIZEN')[0];
    H.beginDisconnectGrace(io, session, c0);
    sock(c0).connected = false;
    assert.equal(H.cancelDisconnectGrace(session.id, c0), true);
    F.toNight(session);
    H.syncSessionPhaseTimers(io, session);
    assert.equal(session.players.get(c0).alive, true);
});

test('같은 단계 안에서 유예를 또 걸면 처음 run 그대로', () => {
    const { session, io, uuids } = world();
    const first = H.beginDisconnectGrace(io, session, uuids[0]);
    assert.equal(H.beginDisconnectGrace(io, session, uuids[0]), first);
});

test('내 밤 턴에 끊기면 그 턴 마감에 맞춰 유예가 끝나고, 안 붙었으면 탈락', () => {
    const { session, io, sock } = world({ n: 10, phase: 'NIGHT' });
    const clock = F.fakeClock();
    H.startNightTurnSequence(io, session, clockDeps(clock, { turnDurationMs: 5000 }));
    const joker = F.firstOf(session, 'JOKER');
    const grace = H.beginDisconnectGrace(io, session, joker, clockDeps(clock));
    assert.equal(grace.deadline, clock.now() + 5000);
    sock(joker).connected = false;
    clock.advance(5000);
    assert.equal(session.players.get(joker).alive, false);
    assert.equal(session.phase, 'ENDED');
});

// ── 전적 저장 재시도 ──

test('전적 저장: 실패하면 1초 뒤 다시, 성공하면 작업이 사라짐', async () => {
    const clock = F.fakeClock();
    H.__setTerminalPersistTimersForTests({ setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });
    const session = F.toDay(F.startGame({ id: 'persist-r', n: 5 }));
    core.commitParticipantDeparture(session, F.firstOf(session, 'JOKER'));
    let calls = 0;
    persistImpl = async () => { calls += 1; if (calls === 1) throw new Error('잠깐 끊김'); };
    H.persistTerminalSession(session, { completed: true });
    await F.flush();
    assert.equal(H.__getTerminalPersistRunsForTests().length, 1);
    clock.advance(1000);
    await F.flush();
    assert.equal(H.__getTerminalPersistRunsForTests().length, 0);
});

test('전적 저장: 같은 판은 한 번만 시작 (두 번 불러도 작업 하나)', async () => {
    const session = F.toDay(F.startGame({ id: 'persist-once', n: 5 }));
    core.commitParticipantDeparture(session, F.firstOf(session, 'JOKER'));
    const records = [];
    persistImpl = async (r) => { records.push(r); };
    H.persistTerminalSession(session, { completed: true });
    H.persistTerminalSession(session, { completed: true });
    await F.flush();
    assert.equal(records.length, 1);
    H.persistTerminalSession(session, { completed: true });
    await F.flush();
    assert.equal(records.length, 1);
});

test('전적 저장: 제약 위반처럼 다시 해도 안 되는 실패면 재시도 안 함', async () => {
    const clock = F.fakeClock();
    H.__setTerminalPersistTimersForTests({ setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });
    const session = F.toDay(F.startGame({ id: 'persist-perm', n: 5 }));
    core.commitParticipantDeparture(session, F.firstOf(session, 'JOKER'));
    persistImpl = async () => { const e = new Error('dup'); e.name = 'SequelizeUniqueConstraintError'; throw e; };
    H.persistTerminalSession(session, { completed: true });
    await F.flush();
    assert.equal(H.__getTerminalPersistRunsForTests().length, 0);
    assert.equal(clock.pending(), 0);
});

test('전적 저장 기록은 얼려 있어 재시도 사이에 판이 바뀌어도 같은 기록', async () => {
    const clock = F.fakeClock();
    H.__setTerminalPersistTimersForTests({ setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });
    const session = F.toDay(F.startGame({ id: 'persist-frozen', n: 5 }));
    core.commitParticipantDeparture(session, F.firstOf(session, 'JOKER'));
    const seen = [];
    persistImpl = async (r) => { seen.push(r); if (seen.length === 1) throw new Error('x'); };
    H.persistTerminalSession(session, { completed: true });
    await F.flush();
    session.players.get([...session.players.keys()][1]).nickname = '바뀐 닉';
    clock.advance(1000);
    await F.flush();
    assert.equal(seen[0], seen[1]);
    assert.ok(Object.isFrozen(seen[0].players[0]));
});
