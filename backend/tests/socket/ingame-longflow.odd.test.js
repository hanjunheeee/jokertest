'use strict';

// 한 판을 처음부터 끝까지 가며 이상한 요청·동시 요청을 섞는 긴 흐름 시험 (소켓 핸들러 + 가짜 시계, 진짜 DB 안 붙음)
// 마지막 승패·죽은 이유·전적 저장 횟수·MVP 점수가 맞는지, 끝난 뒤 쏟아진 요청이 아무것도 안 바꾸는지 봄
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

const persisted = [];
let participationImpl = async () => ({ recorded: true });

const resetAll = () => {
    core.__resetStateForTests();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    persisted.length = 0;
    participationImpl = async () => ({ recorded: true });
    H.__setRecordVoteParticipationForTests((entry) => participationImpl(entry));
    H.__setEvaluateAchievementsForTests(async () => {});
    H.__setGameResultPersistForTests(async (record) => { persisted.push(record); });
};

// 시계는 전부 가짜: 역할 공개 마감·낮·재판·밤 턴·연출 대기·끝난 판 정리 모두 핸들러가 건 그대로 흉내
test.beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 3_000_000 });
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

// 상태 확인으로 기다림 (조금씩 시간 넘김, 최대 횟수 넘으면 실패)
const tickUntil = async (check, { step = 500, max = 2000, what = '조건' } = {}) => {
    for (let i = 0; i < max; i += 1) {
        if (check()) return;
        await tick(step);
    }
    assert.fail(`${what}이 끝내 안 됨`);
};

const deferred = () => {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
};

let seq = 0;
const newWorld = ({ n = 5, roleCounts = null } = {}) => {
    seq += 1;
    const session = F.startGame({ id: `lf${seq}`, n, ...(roleCounts ? { roleCounts } : {}) });
    const w = F.socketWorld(gs, session);
    return { session, ...w, uuids: [...session.players.keys()] };
};

// 핸들러 부르기 묶음 (답을 Promise로)
const api = (w) => {
    const gameId = w.session.id;
    const day = () => w.session.dayIndex;
    return {
        ready: (u) => F.call(H.handleAcknowledgeDayVoteReady, w.io, w.sock(u), u, { gameId }),
        ackRole: (u) => F.call(H.handleAcknowledgeRoleReveal, w.io, w.sock(u), u, { gameId }),
        vote: (u, targetId) => F.call(H.handleSubmitDayVote, w.io, w.sock(u), u, { gameId, targetId }),
        resolveDay: (u) => F.call(H.handleResolveDayVote, w.io, w.sock(u), u, { gameId, dayIndex: day() }),
        cast: (u, vote) => F.call(H.handleCastTribunalVote, w.io, w.sock(u), u, { gameId, dayIndex: day(), vote }),
        resolveTribunal: (u) => F.call(H.handleResolveTribunalVote, w.io, w.sock(u), u, { gameId, dayIndex: day() }),
        act: (u, targetId) => F.call(H.handleSubmitNightAction, w.sock(u), u, { gameId, targetId }),
        resolveNight: (u) => F.call(H.handleResolveNight, w.io, w.sock(u), u, { gameId }),
        chat: (u, text) => F.call(H.handleSubmitGameChatMessage, w.io, w.sock(u), u, { gameId, text }),
        jokerChat: (u, text) => F.call(H.handleSubmitJokerChatMessage, w.io, w.sock(u), u, { gameId, text }),
        emoji: (u, itemId) => F.call(H.handleSendEmoji, w.io, w.sock(u), u, { gameId, itemId }),
        leave: (u) => F.call(H.handleLeaveGameSession, w.io, w.sock(u), u, { gameId }),
    };
};

const rowOf = (record, uuid) => record.players.find((p) => p.user_id === uuid);
const seatOf = (session, uuid) => [...session.players.keys()].indexOf(uuid);
const totalReceived = (w) => [...w.sockets.values()].reduce((sum, s) => sum + s.received.length, 0);

test('[긴 흐름 5명: 역할 공개 중 표 → 준비 따닥 → 표 따닥(저장 대기)+나가기+바로 판정 → 재판 동시+따닥 → 판정 버튼 둘+마감] 한 판 끝까지 → 시민 승, 전적 1번, 승패·MVP 맞음', async () => {
    const w = newWorld({ n: 5 });
    const { session } = w;
    const A = api(w);
    const J = F.firstOf(session, 'JOKER');
    const [c1, c2, c3, c4] = F.byRole(session, 'CITIZEN');

    // 역할 공개: 마감 타이머 + 이상한 요청 (아직 낮 아님)
    H.ensureRoleRevealTimer(w.io, session);
    assert.equal((await A.vote(c1, J)).ok, false);
    assert.deepEqual([(await A.ackRole(c1)).ok, (await A.ackRole(c1)).ok], [true, true]);
    await tick(10_000);
    assert.deepEqual([session.phase, session.dayIndex, session.dayPhase], ['DAY', 1, 'DAY_DISCUSSION']);

    // 토론: c1 따닥 준비는 한 번만 셈
    const [r1, r1b] = await Promise.all([A.ready(c1), A.ready(c1)]);
    assert.deepEqual([r1.readyCount, r1b.readyCount], [1, 1]);
    await Promise.all([J, c2, c3, c4].map((u) => A.ready(u)));
    assert.equal(session.dayPhase, 'DAY_VOTE');

    // 투표: c1 따닥(저장 대기) → c2 나감 → 나머지 냄 → 저장 끝나는 순간 바로 판정
    const gates = [];
    participationImpl = () => { const d = deferred(); gates.push(d); return d.promise; };
    const v1 = A.vote(c1, J);
    const v1b = A.vote(c1, J);
    assert.equal((await A.leave(c2)).ok, true);
    const rest = [A.vote(c3, J), A.vote(c4, J), A.vote(J, c1)];
    assert.equal(session.phase, 'DAY');
    for (const gate of gates) gate.resolve({ recorded: true });
    const voteAcks = await Promise.all([v1, v1b, ...rest]);
    assert.ok(voteAcks.every((a) => a.ok === true));
    assert.equal(session.phase, 'TRIBUNAL');
    assert.equal(session.tribunal.defendantUuid, J);
    assert.deepEqual([J, c1, c3, c4].map((u) => w.received(u, 'day_vote_resolved').length), [1, 1, 1, 1]);
    assert.equal(w.received(c2, 'day_vote_resolved').length, 0);

    // 재판: 동시에 내고 c1 따닥, 피고 표 거절
    const casts = await Promise.all([A.cast(c1, 'GUILTY'), A.cast(c1, 'GUILTY'), A.cast(c3, 'GUILTY'), A.cast(c4, 'NOT_GUILTY'), A.cast(J, 'NOT_GUILTY')]);
    assert.deepEqual(casts.map((r) => r.ok ? 'ok' : r.code),
        ['ok', 'TRIBUNAL_VOTE_ALREADY_SUBMITTED', 'ok', 'ok', 'DEFENDANT_CANNOT_VOTE']);

    // 판정 버튼 둘이 같은 순간 + 그 뒤 마감 시각
    const resolved = await Promise.all([A.resolveTribunal(c3), A.resolveTribunal(c4)]);
    assert.equal(resolved.filter((r) => r.ok).length, 1);
    await tick(60_000);

    // 끝 상태
    assert.equal(session.phase, 'ENDED');
    assert.equal(session.winResult.winner, 'CITIZEN');
    assert.equal(session.players.get(J).deathReason, 'EXECUTION');
    assert.deepEqual([J, c1, c3, c4].map((u) => w.received(u, 'tribunal_vote_resolved').length), [1, 1, 1, 1]);
    assert.equal(persisted.length, 1);
    const record = persisted[0];
    assert.deepEqual([record.result.winner, record.result.completed, record.result.day_index], ['CITIZEN', true, 1]);
    assert.deepEqual([J, c1, c2, c3, c4].map((u) => rowOf(record, u).won), [false, true, false, true, true]);
    assert.equal(rowOf(record, c2).death_reason, 'DISCONNECT');
    assert.equal(rowOf(record, J).death_reason, 'EXECUTION');

    // MVP: 광대에게 유죄 낸 시민만 1점 (따닥은 한 번만), 둘 중 앞자리
    assert.deepEqual([c1, c3, c4].map((u) => session.mvpScores.get(u) ?? 0), [1, 1, 0]);
    const expectedMvp = seatOf(session, c1) < seatOf(session, c3) ? c1 : c3;
    const ended = w.received(c1, 'tribunal_vote_resolved')[0].payload;
    assert.equal(ended.winResult.mvp.uuid, expectedMvp);
});

test('[동시 나가기 셋 + 저장 대기 표] 시민 셋이 같은 순간 나가 광대 수가 같아지면 → 광대 승 한 번, 전적 1번, 끝난 뒤 나가기·표는 판을 안 바꿈', async () => {
    const w = newWorld({ n: 5 });
    const { session } = w;
    const A = api(w);
    F.toDay(session);
    F.toVote(session);
    const J = F.firstOf(session, 'JOKER');
    const [c1, c2, c3, c4] = F.byRole(session, 'CITIZEN');

    const gate = deferred();
    participationImpl = () => gate.promise;
    const pendingVote = A.vote(c4, J);

    const leaves = await Promise.all([A.leave(c1), A.leave(c2), A.leave(c3)]);
    assert.deepEqual(leaves.map((r) => r.ok), [true, true, true]);
    assert.equal(session.phase, 'ENDED');
    assert.equal(session.winResult.winner, 'JOKER');

    const afterEnd = await A.vote(c4, J);
    assert.equal(afterEnd.ok, false);
    assert.equal((await A.leave(c4)).ok, true);
    gate.resolve({ recorded: true });
    assert.equal((await pendingVote).ok, true);
    await tick(1000);

    assert.equal(persisted.length, 1);
    const record = persisted[0];
    assert.deepEqual([record.result.winner, record.result.completed], ['JOKER', true]);
    assert.deepEqual([J, c1, c2, c3, c4].map((u) => rowOf(record, u).won), [true, false, false, false, false]);
    assert.equal(w.received(J, 'player_eliminated').length, 3);
    const lastElimination = w.received(J, 'player_eliminated').at(-1).payload;
    assert.equal(lastElimination.winResult.winner, 'JOKER');
    assert.equal(session.winResult.winner, 'JOKER');
});

test('[끝난 뒤 쏟아짐] 처형으로 판이 끝난 직후 남은 사람 전원이 모든 종류 요청을 같은 순간 보내면 → 전부 거절, 방송·전적·생사 그대로', async () => {
    const w = newWorld({ n: 5 });
    const { session } = w;
    const A = api(w);
    const J = F.firstOf(session, 'JOKER');
    F.toTribunal(session, J);
    const voters = w.uuids.filter((u) => u !== J);
    for (const u of voters) assert.equal((await A.cast(u, 'GUILTY')).ok, true);
    assert.equal((await A.resolveTribunal(voters[0])).ok, true);
    assert.equal(session.phase, 'ENDED');
    await F.flush();

    const receivedBefore = totalReceived(w);
    const aliveBefore = [...session.players.values()].map((p) => p.alive);
    const flood = [];
    for (const u of w.uuids) {
        flood.push(['낮 표', A.vote(u, voters[1])]);
        flood.push(['낮 판정', A.resolveDay(u)]);
        flood.push(['재판 표', A.cast(u, 'NOT_GUILTY')]);
        flood.push(['재판 판정', A.resolveTribunal(u)]);
        flood.push(['밤 행동', A.act(u, voters[2])]);
        flood.push(['밤 판정', A.resolveNight(u)]);
        flood.push(['투표 준비', A.ready(u)]);
        flood.push(['낮 채팅', A.chat(u, '끝났나요')]);
        flood.push(['광대 채팅', A.jokerChat(u, '몰래')]);
        flood.push(['이모티콘', A.emoji(u, 'emoji-1')]);
    }
    const answers = await Promise.all(flood.map(([, p]) => p));
    const accepted = flood.filter((_, i) => answers[i].ok !== false).map(([label]) => label);
    assert.deepEqual(accepted, []);
    await tick(1000);

    assert.equal(totalReceived(w), receivedBefore);
    assert.deepEqual([...session.players.values()].map((p) => p.alive), aliveBefore);
    assert.equal(session.winResult.winner, 'CITIZEN');
    assert.equal(persisted.length, 1);
});

test('[긴 흐름 10명 전 역할: 준비 동시+따닥 → 전원 기권 → 밤(남의 턴 제출·의사 헛치료·경비원 광대 조사) → 죽은 사람 표·이모티콘·채팅 → 재판 동시 → 마감 처형] 끝까지 → 시민 승, 전적·MVP 점수 맞음', async () => {
    const w = newWorld({ n: 10 });
    const { session } = w;
    const A = api(w);
    const J = F.firstOf(session, 'JOKER');
    const D = F.firstOf(session, 'DOCTOR');
    const G = F.firstOf(session, 'GUARD');
    const W = F.firstOf(session, 'WITCH_HUNTER');
    const C = F.byRole(session, 'CITIZEN');
    const all = w.uuids;
    const run = () => H.__getNightTurnRunForTests(session.id);
    const turnOpen = (role) => () => session.nightTurnRole === role && run()?.stage === H.NIGHT_TURN_STAGES.SUBMITTING;

    H.ensureRoleRevealTimer(w.io, session);
    await tick(10_000);
    assert.equal(session.phase, 'DAY');

    // 1일 낮: 셋은 따닥(두 번째도 같은 수), 나머지 동시 준비 → 투표 방송 한 번, 넘어간 뒤 따닥은 INVALID_DAY_PHASE
    const doubled = [C[0], C[1], C[2]];
    const readyOrder = [...doubled.flatMap((u) => [u, u]), ...all.filter((u) => !doubled.includes(u))];
    const readies = await Promise.all(readyOrder.map((u) => A.ready(u)));
    assert.ok(readies.every((r) => r.ok));
    assert.deepEqual(readies.slice(0, 6).map((r) => r.readyCount), [1, 1, 2, 2, 3, 3]);
    assert.equal(readies.at(-1).readyCount, 10);
    assert.equal(session.dayPhase, 'DAY_VOTE');
    assert.equal((await A.ready(C[0])).code, 'INVALID_DAY_PHASE');
    assert.deepEqual(all.map((u) => w.received(u, 'day_phase_changed').length), Array(10).fill(1));

    // 전원 기권 동시 + 셋이 동시에 판정 버튼 → 밤
    assert.ok((await Promise.all(all.map((u) => A.vote(u, null)))).every((r) => r.ok));
    const dayResolved = await Promise.all([C[3], D, J].map((u) => A.resolveDay(u)));
    assert.ok(dayResolved.every((r) => r.ok && r.outcome === dayResolved[0].outcome));
    assert.equal(session.phase, 'NIGHT');

    // 1일 밤: 광대 턴에 의사가 먼저 냄(거절) → 광대가 C0 → 의사가 C1(헛치료) → 경비원이 광대 조사
    await tickUntil(turnOpen('JOKER'), { what: '광대 턴' });
    assert.equal((await A.act(D, C[1])).code, 'NOT_YOUR_TURN');
    assert.equal((await A.act(J, C[0])).ok, true);
    await tickUntil(turnOpen('DOCTOR'), { what: '의사 턴' });
    assert.equal((await A.act(D, C[1])).ok, true);
    await tickUntil(turnOpen('GUARD'), { what: '경비원 턴' });
    assert.equal((await A.act(G, J)).ok, true);
    await tickUntil(() => session.phase === 'DAY', { what: '2일 낮' });
    assert.equal(session.dayIndex, 2);
    assert.deepEqual([session.players.get(C[0]).alive, session.players.get(C[0]).deathReason], [false, 'ASSASSINATION']);
    assert.equal(session.players.get(C[1]).alive, true);

    // 2일 낮: 죽은 C0의 준비·표·이모티콘은 거절, 채팅은 죽은 사람 채널로만
    assert.equal((await A.ready(C[0])).ok, false);
    assert.equal((await A.vote(C[0], J)).ok, false);
    assert.equal((await A.emoji(C[0], 'emoji-1')).code, 'PLAYER_NOT_ALIVE');
    assert.equal((await A.chat(C[0], '나 죽었어')).ok, true);
    assert.equal(w.received(C[1], 'dead_chat_message_received').length, 0);
    assert.equal(w.received(C[1], 'day_chat_message_received').length, 0);
    assert.equal(w.received(C[0], 'dead_chat_message_received').length, 1);

    const alive = all.filter((u) => u !== C[0]);
    await Promise.all(alive.map((u) => A.ready(u)));
    assert.equal(session.dayPhase, 'DAY_VOTE');
    const votes = await Promise.all(alive.map((u) => A.vote(u, u === J ? C[1] : J)));
    assert.ok(votes.every((r) => r.ok));
    const toTribunal = await Promise.all([G, W].map((u) => A.resolveDay(u)));
    assert.ok(toTribunal.every((r) => r.ok && r.tribunalTargetUuid === J));
    assert.equal(session.phase, 'TRIBUNAL');

    // 재판: 8명 동시 유죄 + 마녀사냥꾼 따닥, 판정은 버튼 없이 마감으로
    const voters = alive.filter((u) => u !== J);
    const casts = await Promise.all([...voters.map((u) => A.cast(u, 'GUILTY')), A.cast(W, 'NOT_GUILTY')]);
    assert.equal(casts.filter((r) => r.ok).length, 8);
    assert.equal(casts.at(-1).code, 'TRIBUNAL_VOTE_ALREADY_SUBMITTED');
    await tickUntil(() => session.phase === 'ENDED', { what: '재판 마감 처형' });

    // 끝 상태: 시민 승, 전적 한 번
    assert.equal(session.winResult.winner, 'CITIZEN');
    await tick(1000);
    assert.equal(persisted.length, 1);
    const record = persisted[0];
    assert.deepEqual([record.result.completed, record.result.day_index, record.result.player_count], [true, 2, 10]);
    assert.deepEqual([rowOf(record, J).won, rowOf(record, J).death_reason], [false, 'EXECUTION']);
    assert.deepEqual([rowOf(record, C[0]).won, rowOf(record, C[0]).is_alive, rowOf(record, C[0]).death_reason], [true, false, 'ASSASSINATION']);
    assert.ok([D, G, W, ...C.slice(1)].every((u) => rowOf(record, u).won === true && rowOf(record, u).is_alive === true));

    // MVP 점수: 광대 죽임 1, 경비원 광대 조사 1, 유죄 낸 산 시민 1씩, 의사 헛치료·마녀사냥꾼 0
    const scoreOf = (u) => session.mvpScores.get(u) ?? 0;
    assert.deepEqual([scoreOf(J), scoreOf(G), scoreOf(D), scoreOf(W), scoreOf(C[0])], [1, 1, 0, 0, 0]);
    assert.deepEqual(C.slice(1).map(scoreOf), [1, 1, 1, 1, 1]);
    // 1점 동점 중 산 사람 앞자리 (이긴 편만)
    const top = [G, ...C.slice(1)].sort((x, y) => seatOf(session, x) - seatOf(session, y))[0];
    const snap = await F.call(H.handleGetSessionSnapshot, w.io, w.sock(C[1]), C[1], { gameId: session.id });
    assert.equal(snap.winResult.mvp.uuid, top);
});

test('[10명 동시 채팅 + 따닥] 낮에 10명이 같은 순간 두 번씩 보내면 → 사람마다 첫 글만 통과, 모두가 같은 10개를 같은 순서로 받음, 0.5초 뒤엔 다시 됨', async () => {
    const w = newWorld({ n: 10 });
    const { session } = w;
    const A = api(w);
    F.toDay(session);

    const sends = [];
    for (const u of w.uuids) sends.push(A.chat(u, `안녕 ${u}`), A.chat(u, `또 ${u}`));
    const answers = await Promise.all(sends);
    assert.deepEqual(answers.map((r) => r.ok ? 'ok' : r.code),
        w.uuids.flatMap(() => ['ok', 'RATE_LIMITED']));

    const orderOf = (u) => w.received(u, 'day_chat_message_received').map((e) => e.payload.messageId);
    const reference = orderOf(w.uuids[0]);
    assert.equal(reference.length, 10);
    assert.equal(new Set(reference).size, 10);
    for (const u of w.uuids) assert.deepEqual(orderOf(u), reference, `${u} 받은 순서`);
    assert.ok(w.received(w.uuids[0], 'day_chat_message_received').every((e) => !e.payload.text.startsWith('또')));

    await tick(500);
    assert.ok((await Promise.all(w.uuids.map((u) => A.chat(u, '다시')))).every((r) => r.ok));
    assert.equal(orderOf(w.uuids[9]).length, 20);
});
