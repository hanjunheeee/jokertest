'use strict';

// 낮 투표·재판 이상한 순서·여러 명 동시 시험 (소켓 핸들러 단, 진짜 DB 안 붙음)
// 저장 기다리는 틈·마감 1ms 전후·따닥·새 탭·피고 나가기가 겹칠 때 표·판정·방송이 한 번만 맞게 되는지 봄
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../audit-2026-11-09/gameFixtures');

const { mock } = test;
const { core } = F;
const gs = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');

const H = gs.__testables;

// 대기방 정리가 DB 쪽으로 안 가게 막음 (나가기 길이 부름)
matchmaking.__setGameResultRepositoryForTests({
    getAccountRecordSummaries: async (ids) => new Map(ids.map((id) => [id, { totalGames: 0, winRate: 0 }])),
});
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} });

// 투표 참여 기록 저장: 시험마다 바꿔 끼움 (기다리게 하거나 실패시키기)
const participationCalls = [];
let participationImpl = async () => ({ recorded: true });
const persisted = [];

const resetAll = () => {
    core.__resetStateForTests();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    participationCalls.length = 0;
    persisted.length = 0;
    participationImpl = async () => ({ recorded: true });
    H.__setRecordVoteParticipationForTests((entry) => {
        participationCalls.push(entry);
        return participationImpl(entry);
    });
    H.__setEvaluateAchievementsForTests(async () => {});
    H.__setGameResultPersistForTests(async (record) => { persisted.push(record); });
};

// 시계는 전부 가짜 (핸들러가 거는 타이머도 가짜 시계로 감)
test.beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    resetAll();
});
test.afterEach(() => {
    resetAll();
    mock.timers.reset();
});

// 시간 넘기고 비동기 꼬리까지 흘려보냄
const tick = async (ms) => {
    mock.timers.tick(ms);
    await F.flush();
};

// 밖에서 풀거나 실패시키는 약속 (저장 기다리는 틈 만들기)
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

// 저장이 부를 때마다 문 하나씩 만들어 줄 세움
const gateParticipation = () => {
    const gates = [];
    participationImpl = (entry) => {
        const gate = deferred();
        gates.push({ entry, ...gate });
        return gate.promise;
    };
    return gates;
};

let seq = 0;
const world = ({ n = 5, phase = 'DAY_VOTE', jokerCount = 1, settings = {} } = {}) => {
    seq += 1;
    const session = F.startGame({ id: `vr${seq}`, n, jokerCount, settings });
    if (phase !== 'ROLE_REVEAL') F.toDay(session);
    if (phase === 'DAY_VOTE') F.toVote(session);
    const w = F.socketWorld(gs, session);
    return { session, ...w, uuids: [...session.players.keys()] };
};

const vote = (w, uuid, targetId, socket = w.sock(uuid)) =>
    F.call(H.handleSubmitDayVote, w.io, socket, uuid, { gameId: w.session.id, targetId });
const resolveDay = (w, uuid) =>
    F.call(H.handleResolveDayVote, w.io, w.sock(uuid), uuid, { gameId: w.session.id, dayIndex: w.session.dayIndex });
const castTribunal = (w, uuid, choice) =>
    F.call(H.handleCastTribunalVote, w.io, w.sock(uuid), uuid, { gameId: w.session.id, dayIndex: w.session.dayIndex, vote: choice });
const resolveTribunal = (w, uuid) =>
    F.call(H.handleResolveTribunalVote, w.io, w.sock(uuid), uuid, { gameId: w.session.id, dayIndex: w.session.dayIndex });
const countFor = (w, uuids, event) => uuids.map((u) => w.received(u, event).length);

// ── 여러 명 동시 ──

test('[동시 5명 + 판정 버튼 3명 + 마감] 전원이 같은 순간 낸 표가 저장 기다리는 중에 판정 버튼 셋이 같이 눌리면 → 판정·결과 방송 한 번, 표 5개 그대로', async () => {
    const w = world({ n: 5 });
    const { session, uuids } = w;
    H.startDayPhaseTimer(w.io, session, { voteDurationMs: 10_000 });
    const gates = gateParticipation();
    const target = uuids[2];

    // 5명 동시 제출 (target은 다른 사람 찍음)
    const voteAcks = uuids.map((u) => vote(w, u, u === target ? uuids[0] : target));
    // 저장 기다리는 중에도 표는 이미 들어가 있음
    assert.equal(session.dayVotes.size, 5);
    assert.equal(gates.length, 5);

    // 판정 버튼 셋이 같은 순간
    const resolved = await Promise.all([uuids[0], uuids[1], uuids[3]].map((u) => resolveDay(w, u)));
    assert.deepEqual(resolved.map((r) => [r.ok, r.outcome, r.tribunalTargetUuid]), Array(3).fill([true, 'TRIBUNAL', target]));

    // 저장은 거꾸로 끝남
    for (const gate of [...gates].reverse()) gate.resolve({ recorded: true });
    const acks = await Promise.all(voteAcks);
    assert.deepEqual(acks.map((a) => a.ok), Array(5).fill(true));

    // 마감 시각이 지나도 같은 낮을 또 판정하지 않음
    await tick(10_000);
    assert.deepEqual(countFor(w, uuids, 'day_vote_resolved'), Array(5).fill(1));
    assert.equal(session.phase, 'TRIBUNAL');
    assert.equal(session.tribunal.defendantUuid, target);
    assert.equal(participationCalls.length, 5);
});

test('[10명 끝값 + 저장 중간 실패 + 따닥] 10명 동시 표 중 3명 저장 실패 → 그 3명 다시 내도 표 10개, 10명 동시 판정은 한 번, 재판 9명 동시+따닥은 한 표씩', async () => {
    const w = world({ n: 10 });
    const { session, uuids } = w;
    const gates = gateParticipation();
    const accused = uuids[5];
    const failing = new Set([uuids[1], uuids[2], uuids[3]]);

    const voteAcks = uuids.map((u) => vote(w, u, u === accused ? uuids[0] : accused));
    assert.equal(gates.length, 10);
    for (const gate of gates) {
        if (failing.has(gate.entry.userId)) gate.reject(new Error('DB 잠깐 끊김'));
        else gate.resolve({ recorded: true });
    }
    const acks = await Promise.all(voteAcks);
    const failedUuids = uuids.filter((u, i) => acks[i].code === 'VOTE_PERSIST_FAILED');
    assert.deepEqual(new Set(failedUuids), failing);
    assert.equal(acks.filter((a) => a.ok === true).length, 7);

    // 실패한 셋이 같은 표를 다시 냄 (이번엔 저장 성공)
    participationImpl = async () => ({ recorded: true });
    const retried = await Promise.all(failedUuids.map((u) => vote(w, u, accused)));
    assert.deepEqual(retried.map((a) => a.ok), [true, true, true]);
    assert.equal(session.dayVotes.size, 10);
    assert.equal([...session.dayVotes.values()].filter((t) => t === accused).length, 9);

    // 10명이 같은 순간 판정 버튼
    const resolved = await Promise.all(uuids.map((u) => resolveDay(w, u)));
    assert.ok(resolved.every((r) => r.ok === true && r.outcome === 'TRIBUNAL' && r.tribunalTargetUuid === accused));
    assert.deepEqual(countFor(w, uuids, 'day_vote_resolved'), Array(10).fill(1));
    assert.equal(session.dayVoteResolution.publicVoteCount, 10);

    // 재판: 피고 뺀 9명이 같은 순간 내고, 모두 한 번 더 따닥 (유죄 5 · 무죄 4)
    const voters = uuids.filter((u) => u !== accused);
    const choiceOf = (i) => (i < 5 ? 'GUILTY' : 'NOT_GUILTY');
    const firstCasts = voters.map((u, i) => castTribunal(w, u, choiceOf(i)));
    const doubleCasts = voters.map((u, i) => castTribunal(w, u, choiceOf(i) === 'GUILTY' ? 'NOT_GUILTY' : 'GUILTY'));
    const defendantCast = castTribunal(w, accused, 'NOT_GUILTY');
    assert.ok((await Promise.all(firstCasts)).every((a) => a.ok === true));
    assert.ok((await Promise.all(doubleCasts)).every((a) => a.code === 'TRIBUNAL_VOTE_ALREADY_SUBMITTED'));
    assert.equal((await defendantCast).code, 'DEFENDANT_CANNOT_VOTE');
    assert.equal(session.tribunal.votes.size, 9);

    // 9명이 같은 순간 재판 판정 버튼 → 확정은 하나
    const tribunalResolved = await Promise.all(voters.map((u) => resolveTribunal(w, u)));
    assert.equal(tribunalResolved.filter((r) => r.ok === true).length, 1);
    assert.deepEqual(tribunalResolved.find((r) => r.ok).counts, { guilty: 5, notGuilty: 4 });
    assert.deepEqual(countFor(w, uuids, 'tribunal_vote_resolved'), Array(10).fill(1));
    assert.equal(session.players.get(accused).alive, false);
    assert.equal(session.players.get(accused).deathReason, 'EXECUTION');
    assert.equal(session.phase, 'NIGHT');
});

// ── 이상한 순서 ──

test('[따닥 + 저장 순서 뒤바뀜] 저장 기다리는 중에 B→C로 바꿔 두 번 내고 두 번째 저장이 먼저 끝나면 → 남는 표는 마지막 C, 내 진행 상태도 C', async () => {
    const w = world({ n: 5 });
    const { session, uuids } = w;
    const [a, b, c] = uuids;
    const gates = gateParticipation();

    const first = vote(w, a, b);
    const second = vote(w, a, c);
    assert.equal(session.dayVotes.get(a), c);

    gates[1].resolve({ recorded: true });
    const secondAck = await second;
    gates[0].resolve({ recorded: true });
    const firstAck = await first;

    assert.deepEqual([firstAck.ok, secondAck.ok], [true, true]);
    assert.notEqual(firstAck.sfxEvent.eventId, secondAck.sfxEvent.eventId);
    assert.equal(session.dayVotes.get(a), c);
    // 늦게 끝난 첫 번째 저장이 보낸 진행 상태도 지금 표(C)를 보여야 함
    const lastProgress = w.received(a, 'session_self_progress').at(-1).payload;
    assert.equal(lastProgress.self.dayVoteTargetUuid, c);
    // 같은 사람·같은 날 저장 열쇠는 둘이 같음 (DB 쪽이 한 번만 남김)
    assert.deepEqual(participationCalls.map((e) => [e.userId, e.dayIndex]), [[a, 1], [a, 1]]);
});

test('[마감 순간 + 저장 대기] 투표 마감 1ms 전에 낸 표는 저장 기다리는 중이어도 판정에 셈, 마감 직후 낸 표는 거절되고 결과가 안 바뀜', async () => {
    const w = world({ n: 5 });
    const { session, uuids } = w;
    const [a, b, accused] = uuids;
    H.startDayPhaseTimer(w.io, session, { voteDurationMs: 1000 });
    const gates = gateParticipation();

    await tick(999);
    const early = vote(w, a, accused);
    assert.equal(session.phase, 'DAY');

    await tick(1);
    assert.equal(session.phase, 'TRIBUNAL');
    assert.equal(session.tribunal.defendantUuid, accused);
    assert.deepEqual([session.dayVoteResolution.publicVoteCount, session.dayVoteResolution.publicAbstainCount], [5, 4]);

    const late = await vote(w, b, accused);
    assert.equal(late.ok, false);
    assert.equal(late.code, 'DAY_VOTE_ALREADY_RESOLVED');
    assert.notEqual(session.dayVotes.get(b), accused);

    gates[0].resolve({ recorded: true });
    assert.equal((await early).ok, true);
    assert.deepEqual(countFor(w, uuids, 'day_vote_resolved'), Array(5).fill(1));
});

test('[다시 붙기 + 저장 대기] 표 저장 기다리는 중에 새 탭으로 다시 붙으면 → 옛 탭 답은 ok, 새 탭 스냅샷에 내 표, 옛 탭의 새 표는 STALE_SOCKET, 새 탭 재제출은 한 표로', async () => {
    const w = world({ n: 5 });
    const { session, uuids, io, registry } = w;
    const [a, target, other] = uuids;
    const gates = gateParticipation();
    const oldSocket = w.sock(a);

    const pending = vote(w, a, target);

    // 새 탭: 같은 계정 새 소켓이 판 채널에 들어오고 접속 목록이 새 소켓을 가리킴
    const fresh = F.createFakeSocket(a, { id: `sock-${a}-new` });
    fresh.rooms.add(session.channelId);
    fresh.data.activeGameId = session.id;
    io.sockets.sockets.set(fresh.id, fresh);
    registry.set(a, fresh.id);
    oldSocket.connected = false;
    await gs.onDisconnect(io, oldSocket, a);
    assert.equal(H.getDisconnectGraceRun(session.id, a), undefined);

    const snap = await F.call(H.handleGetSessionSnapshot, io, fresh, a, { gameId: session.id });
    assert.equal(snap.ok, true);
    assert.equal(snap.self.dayVoteTargetUuid, target);

    const stale = await vote(w, a, other, oldSocket);
    assert.equal(stale.code, 'STALE_SOCKET');
    assert.equal(session.dayVotes.get(a), target);

    gates[0].resolve({ recorded: true });
    assert.equal((await pending).ok, true);

    participationImpl = async () => ({ recorded: true });
    const again = await vote(w, a, target, fresh);
    assert.equal(again.ok, true);
    assert.equal(session.dayVotes.size, 1);
    assert.equal(session.dayVotes.get(a), target);
});

test('[재판 마감 순간 + 피고 나감] 재판 마감 1ms 전에 피고가 나가면 → 취소 방송 한 번, 마감 타이머는 아무것도 안 함, 늦은 유죄 표 거절', async () => {
    const w = world({ n: 5, phase: 'DAY' });
    const { session, uuids } = w;
    const defendant = F.byRole(session, 'CITIZEN')[0];
    F.toTribunal(session, defendant);
    H.startTribunalTimer(w.io, session, { durationMs: 2000 });
    const voters = uuids.filter((u) => u !== defendant);

    assert.equal((await castTribunal(w, voters[0], 'GUILTY')).ok, true);
    await tick(1999);
    const left = await F.call(H.handleLeaveGameSession, w.io, w.sock(defendant), defendant, { gameId: session.id });
    assert.equal(left.ok, true);
    assert.equal(session.phase, 'NIGHT');

    await tick(1);
    const late = await castTribunal(w, voters[1], 'GUILTY');
    assert.equal(late.ok, false);

    assert.deepEqual(countFor(w, voters, 'tribunal_vote_resolved'), Array(voters.length).fill(1));
    const cancel = w.received(voters[0], 'tribunal_vote_resolved')[0].payload;
    assert.equal(cancel.outcome, core.TRIBUNAL_CANCELLED);
    assert.equal(session.players.get(defendant).deathReason, 'DISCONNECT');
    assert.notEqual(session.players.get(defendant).deathReason, 'EXECUTION');
});

test('[토론 마감 순간 + 준비 따닥] 토론 마감 1ms 전 마지막 준비로 투표가 열리면 → 단계 방송 한 번, 투표 마감은 새로 20초, 그 뒤 따닥 준비는 INVALID_DAY_PHASE', async () => {
    const w = world({ n: 5, phase: 'DAY' });
    const { session, uuids } = w;
    H.startDayPhaseTimer(w.io, session, { discussionDurationMs: 15_000, voteDurationMs: 20_000 });
    const ready = (u) => F.call(H.handleAcknowledgeDayVoteReady, w.io, w.sock(u), u, { gameId: session.id });

    for (const u of uuids.slice(0, 4)) assert.equal((await ready(u)).ok, true);
    await tick(14_999);
    const last = await ready(uuids[4]);
    assert.deepEqual([last.ok, last.readyCount, last.requiredCount], [true, 5, 5]);
    assert.equal(session.dayPhase, 'DAY_VOTE');
    assert.equal(session.dayPhaseDeadline, Date.now() + 20_000);

    await tick(1);
    assert.deepEqual(countFor(w, uuids, 'day_phase_changed'), Array(5).fill(1));
    assert.equal((await ready(uuids[0])).code, 'INVALID_DAY_PHASE');

    // 새 투표 마감 1ms 전까진 투표 그대로, 그 순간 전원 기권으로 밤
    await tick(19_998);
    assert.equal(session.dayPhase, 'DAY_VOTE');
    await tick(1);
    assert.equal(session.phase, 'NIGHT');
    assert.deepEqual(countFor(w, uuids, 'day_vote_resolved'), Array(5).fill(1));
});
