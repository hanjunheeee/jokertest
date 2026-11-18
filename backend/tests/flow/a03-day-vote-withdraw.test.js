'use strict';

// 낮 표 거두기("투표취소", withdraw_day_vote) 서버 흐름 시험 — 내 표 칸이 없어져 "안 낸 사람"으로 돌아가는지
// 진행 수 줄어듦·판 전원에게 감·표 대상 안 샘·다시 낼 수 있음·마감 때 기권으로 채워짐·5초 당김 뒤 규칙·거절까지 봄 (사용자 결정 2026-11-18)
// 목록 A03-낮투표.md 번호 A03-B-331~341
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 그 사람이 받은 진행 알림 (지금까지)
const progressOf = (g, uuid) => g.got(uuid, 'session_self_progress');
// 전원 받은 알림 수 적어 두기 (뒤에 새로 받은 것만 보려고)
const countsOf = (g) => new Map(g.ids.map((u) => [u, progressOf(g, u).length]));
// 적어 둔 뒤 새로 받은 진행 알림
const addedSince = (g, before, uuid) => progressOf(g, uuid).slice(before.get(uuid));

// 거둘 땐 효과음 없음·효과음 번호도 안 올림 (2026-11-18 정함), 다시 내면 효과음 울림
test('A03-B-331 6명 판 A가 X 찍음(1/6) → 거둠 → 답 ok·효과음 없음(번호 그대로), 판 전원 진행 알림 1번 0/6, A 자기 칸 "안 냄"', async (t) => {
    const g = H.setup(t, { id: 'b331', n: 6 });
    g.toVote();
    const [A, X] = g.aliveNonJokers();
    assert.equal((await g.vote(A, X)).ok, true);
    const sfxBefore = g.session.dayVoteSfx.get(A);
    const before = countsOf(g);
    const ack = await g.withdraw(A);
    assert.equal(ack.ok, true);
    assert.equal(ack.sfxEvent, null);
    assert.equal(g.session.dayVoteSfx.get(A), sfxBefore, '효과음 번호가 바뀜');
    assert.equal(g.session.dayVotes.has(A), false);
    for (const uuid of g.ids) {
        const added = addedSince(g, before, uuid);
        assert.equal(added.length, 1, `${uuid} 받은 수`);
        assert.deepEqual(added[0].progress, { kind: 'DAY_VOTE', doneCount: 0, requiredCount: 6 }, `${uuid} 숫자`);
    }
    const mine = addedSince(g, before, A)[0].self;
    assert.equal(mine.hasSubmittedDayVote, false);
    assert.equal(mine.dayVoteTargetUuid, null);
    // 같은 X로 다시 내면 효과음 울림 (번호 +1)
    const again = await g.vote(A, X);
    assert.equal(again.sfxEvent?.kind, 'day-vote-submitted');
    assert.equal(g.session.dayVoteSfx.get(A).revision, sfxBefore.revision + 1);
});

test('A03-B-332 7명 판 두 명 냄(2/7) → A가 거둠 → 다른 사람 숫자 1/7, 받은 알림에 A·표 대상 X uuid 없음', async (t) => {
    const g = H.setup(t, { id: 'b332', n: 7 });
    g.toVote();
    const [A, B, X] = g.aliveNonJokers();
    await g.vote(A, X);
    await g.vote(B, null);
    const before = countsOf(g);
    assert.equal((await g.withdraw(A)).ok, true);
    for (const uuid of g.ids.filter((u) => u !== A && u !== X)) {
        const added = addedSince(g, before, uuid);
        assert.equal(added.length, 1, `${uuid} 받은 수`);
        assert.deepEqual(added[0].progress, { kind: 'DAY_VOTE', doneCount: 1, requiredCount: 7 }, `${uuid} 숫자`);
        assert.deepEqual(H.pathsOf(added[0], A), [], `${uuid} 알림에 거둔 사람 A`);
        assert.deepEqual(H.pathsOf(added[0], X), [], `${uuid} 알림에 표 대상 X`);
    }
    // X는 자기 uuid가 자기 칸에 있을 수 있어 숫자만 봄
    assert.deepEqual(addedSince(g, before, X)[0].progress, { kind: 'DAY_VOTE', doneCount: 1, requiredCount: 7 });
});

test('A03-B-333 6명 판 거둔 뒤 다시 냄·기권 → 받음, 숫자 0→1, 기권도 낸 것으로 셈', async (t) => {
    const g = H.setup(t, { id: 'b333', n: 6 });
    g.toVote();
    const [A, X, Y] = g.aliveNonJokers();
    const watcher = g.jokers()[0];
    const seen = [];
    for (const step of [['vote', X], ['withdraw'], ['vote', Y], ['withdraw'], ['vote', null]]) {
        const ack = step[0] === 'vote' ? await g.vote(A, step[1]) : await g.withdraw(A);
        assert.equal(ack.ok, true, step.join(' '));
        seen.push(progressOf(g, watcher).at(-1).progress.doneCount);
    }
    assert.deepEqual(seen, [1, 0, 1, 0, 1]);
    assert.equal(g.session.dayVotes.get(A), null, '마지막은 기권 표');
});

test('A03-B-334 6명 판 안 낸 채 거둠 → 답 ok·효과음 없음, 아무에게도 진행 알림 안 감', async (t) => {
    const g = H.setup(t, { id: 'b334', n: 6 });
    g.toVote();
    const [A, X, B] = g.aliveNonJokers();
    await g.vote(B, X);
    const before = countsOf(g);
    const ack = await g.withdraw(A);
    assert.deepEqual(ack, { ok: true, sfxEvent: null });
    for (const uuid of g.ids) assert.equal(addedSince(g, before, uuid).length, 0, `${uuid} 받은 수`);
    assert.equal(g.session.dayVotes.has(B), true, '남의 표는 그대로');
});

test('A03-B-335 6명 판 A만 X 찍었다 거두고 나머지 기권 → 마감 전 판정 없음, 마감 때 A 기권으로 채워져 전원 기권 밤', async (t) => {
    const g = H.setup(t, { id: 'b335', n: 6 });
    const voteEnd = g.toVote();
    const [A, X] = g.aliveNonJokers();
    assert.equal((await g.vote(A, X)).ok, true);
    assert.equal((await g.withdraw(A)).ok, true);
    for (const uuid of g.alive().filter((u) => u !== A)) assert.equal((await g.vote(uuid, null)).ok, true);
    // 5명만 냄 → 다 찬 게 아님 → 당김 없음
    assert.deepEqual(g.missing('phase_settle_started', 0), []);
    g.advance(voteEnd - g.now() - 1);
    assert.deepEqual(g.missing('day_vote_resolved', 0), [], '마감 전 판정');
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1), []);
    const resolved = g.got(g.ids[0], 'day_vote_resolved')[0];
    assert.equal(resolved.outcome, 'ABSTAINED');
    assert.equal(resolved.publicAbstainCount, 6);
});

test('A03-B-336 6명 판 다 차서 5초 당김 → 2초 뒤 X 찍은 사람이 거둠 → 받음, 숫자 5/6, 당김 알림 한 번, 처음 당긴 시각에 거둔 사람 기권으로 판정', async (t) => {
    const g = H.setup(t, { id: 'b336', n: 6 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    // X 3·Y 3 동점 모양으로 다 냄
    const { votes } = H.allocate(g.alive(), { targets: [[X, 3], [Y, 3]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    const fullAt = g.now();
    g.advance(2_000);
    const withdrawer = votes.find(([v, tg]) => tg === X && v !== Y)[0];
    assert.equal((await g.withdraw(withdrawer)).ok, true);
    assert.deepEqual(progressOf(g, g.ids[0]).at(-1).progress, { kind: 'DAY_VOTE', doneCount: 5, requiredCount: 6 });
    for (const uuid of g.ids) {
        const got = g.got(uuid, 'phase_settle_started');
        assert.equal(got.length, 1, `${uuid} 당김 알림 수`);
        assert.equal(got[0].deadline, fullAt + 5_000);
    }
    g.advance(fullAt + 4_999 - g.now());
    assert.deepEqual(g.missing('day_vote_resolved', 0), [], '처음 마감 전 판정');
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1), []);
    const resolved = g.got(g.ids[0], 'day_vote_resolved')[0];
    // X 2·Y 3·기권 1 → Y 재판 (거둔 표가 X로 안 셈)
    assert.equal(resolved.outcome, 'TRIBUNAL');
    assert.equal(resolved.tribunalTargetUuid, Y);
    assert.equal(resolved.publicAbstainCount, 1);
});

test('A03-B-337 6명 판 5초 중 거두고 다시 냄 → 당김 알림 다시 안 옴, 처음 당긴 시각에 다시 낸 표로 판정', async (t) => {
    const g = H.setup(t, { id: 'b337', n: 6 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 3], [Y, 3]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    const fullAt = g.now();
    const changer = votes.find(([v, tg]) => tg === X && v !== Y)[0];
    g.advance(1_000);
    assert.equal((await g.withdraw(changer)).ok, true);
    g.advance(1_000);
    assert.equal((await g.vote(changer, Y)).ok, true);
    for (const uuid of g.ids) assert.equal(g.got(uuid, 'phase_settle_started').length, 1, `${uuid} 당김 알림 수`);
    g.advance(fullAt + 5_000 - g.now());
    const resolved = g.got(g.ids[0], 'day_vote_resolved')[0];
    assert.equal(resolved.outcome, 'TRIBUNAL');
    assert.equal(resolved.tribunalTargetUuid, Y);
    assert.equal(resolved.publicAbstainCount, 0);
});

test('A03-B-338 6명 판 거둔 뒤 스냅샷 → 내 칸 "안 냄"(대상 null·이미 함 false), 숫자 줄어든 값', async (t) => {
    const g = H.setup(t, { id: 'b338', n: 6 });
    g.toVote();
    const [A, B, X] = g.aliveNonJokers();
    await g.vote(A, X);
    await g.vote(B, X);
    await g.withdraw(A);
    const snap = await g.snapshot(A);
    assert.equal(snap.ok, true);
    assert.equal(snap.self.hasSubmittedDayVote, false);
    assert.equal(snap.self.dayVoteTargetUuid, null);
    assert.equal(snap.self.hasActedThisPhase, false);
    assert.deepEqual(snap.progress, { kind: 'DAY_VOTE', doneCount: 1, requiredCount: 6 });
});

test('A03-B-339 7명 판(1명 죽음) 거절: 죽은 사람 → ACTOR_NOT_ALIVE, 토론 중 → INVALID_DAY_PHASE, 판 id가 숫자 → INVALID_PAYLOAD, 표는 그대로', async (t) => {
    const g = H.setup(t, { id: 'b339', n: 7, deaths: 1 });
    const [A, X] = g.aliveNonJokers();
    // 토론 중
    const early = await g.withdraw(A);
    assert.equal(early.ok, false);
    assert.equal(early.code, 'INVALID_DAY_PHASE');
    g.toVote();
    await g.vote(A, X);
    const [deadUuid] = g.dead();
    const dead = await g.withdraw(deadUuid);
    assert.equal(dead.ok, false);
    assert.equal(dead.code, 'ACTOR_NOT_ALIVE');
    const bad = await H.gf.call(H.T.handleWithdrawDayVote, g.io, g.world.sockets.get(A), A, { gameId: 7 });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'INVALID_PAYLOAD');
    assert.equal(g.session.dayVotes.get(A), X, '거절 뒤 표 그대로');
});

test('A03-B-340 6명 판 판정 뒤(재판으로 감) 거둠 → DAY_VOTE_ALREADY_RESOLVED, 재판 그대로', async (t) => {
    const g = H.setup(t, { id: 'b340', n: 6 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 5], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(5_000);
    assert.equal(g.got(g.ids[0], 'day_vote_resolved')[0].phase, 'TRIBUNAL');
    const ack = await g.withdraw(Y);
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'DAY_VOTE_ALREADY_RESOLVED');
    assert.equal(g.session.phase, 'TRIBUNAL');
});

test('A03-B-341 6명 판 1회차 진짜 표 낸 뒤 거둠 → 투표 참여 기록 저장은 한 번 그대로(안 지움), 연결 사건 withdraw_day_vote로 답 옴', async (t) => {
    const recorded = [];
    const g = H.setup(t, { id: 'b341', n: 6, persist: async ({ userId }) => { recorded.push(userId); } });
    for (const [uuid, s] of g.world.sockets) H.gs.registerGameHandlers(g.io, s, uuid);
    g.toVote();
    const [A, X] = g.aliveNonJokers();
    assert.equal((await g.vote(A, X)).ok, true);
    assert.deepEqual(recorded, [A]);
    // 진짜 연결처럼 사건 이름으로 보냄
    const ack = await new Promise((resolve) => {
        g.world.sockets.get(A).trigger('withdraw_day_vote', { gameId: g.gameId }, resolve);
    });
    assert.equal(ack.ok, true);
    assert.equal(g.session.dayVotes.has(A), false);
    assert.deepEqual(recorded, [A], '거둬도 참여 기록 저장·지우기 없음');
});
