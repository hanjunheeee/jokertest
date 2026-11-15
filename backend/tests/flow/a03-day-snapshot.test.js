'use strict';

// 낮 투표 중·뒤 새로고침(get_session_snapshot)이 줄어든 마감·결과·내 표만 보이는지 서버 흐름 시험
// 목록 A03-낮투표.md 번호 A03-B-225~230 (229·230은 정한 글 없어 지금 동작을 임시 정답으로 씀)
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

async function sixAtVote(t, id) {
    const g = H.setup(t, { id, n: 6 });
    g.toVote();
    return g;
}

test('A03-B-225 6명 판: 마감 당긴 뒤 스냅샷 → dayPhaseDeadline = 당긴 시각', async (t) => {
    const g = await sixAtVote(t, 'b225');
    g.advance(10_000);
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 5], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    const pulled = g.now() + 5_000;
    g.advance(1_000);
    const snap = await g.snapshot(g.ids[1]);
    assert.equal(snap.ok, true);
    assert.equal(snap.dayPhaseDeadline, pulled);
});

test('A03-B-226 6명 판: 판정 뒤(1표 5기권) 스냅샷 → dayVoteResolution.outcome ABSTAIN_MAJORITY', async (t) => {
    const g = await sixAtVote(t, 'b226');
    const [X] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 1]], abstain: 5 });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(5_000);
    assert.equal(g.got(g.ids[0], 'day_vote_resolved').length, 1);
    const snap = await g.snapshot(g.ids[0]);
    assert.equal(snap.ok, true);
    assert.equal(snap.dayVoteResolution?.outcome, 'ABSTAIN_MAJORITY');
});

test('A03-B-227 6명 판: 2일 낮 스냅샷에 1일 투표 결과 없음', async (t) => {
    const g = await sixAtVote(t, 'b227');
    const [X] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 1]], abstain: 5 });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(5_000);
    const applied = g.passNight();
    assert.equal(applied.dayIndex, 2);
    const snap = await g.snapshot(g.ids[0]);
    assert.equal(snap.ok, true);
    assert.equal(snap.dayIndex, 2);
    assert.equal(snap.dayVoteResolution, undefined);
});

test('A03-B-228 6명 판: 남의 스냅샷에 내 표 대상 없음 (사람 목록 uuid 칸만)', async (t) => {
    const g = await sixAtVote(t, 'b228');
    const [X, Z, A, B] = g.aliveNonJokers();
    assert.equal((await g.vote(A, Z)).ok, true);
    assert.equal((await g.vote(B, X)).ok, true);
    const snap = await g.snapshot(B);
    assert.equal(snap.ok, true);
    const leaks = H.pathsOf(snap, Z).filter((p) => !/^players\.\d+\.uuid$/.test(p));
    assert.deepEqual(leaks, []);
    assert.equal(snap.self.dayVoteTargetUuid, X);
});

test('A03-B-229 6명 판 [지금 동작]: 표 낸 뒤 내 스냅샷 self.hasSubmittedDayVote true·대상 그 사람', async (t) => {
    const g = await sixAtVote(t, 'b229');
    const [X, A] = g.aliveNonJokers();
    assert.equal((await g.vote(A, X)).ok, true);
    const snap = await g.snapshot(A);
    assert.equal(snap.self.hasSubmittedDayVote, true);
    assert.equal(snap.self.dayVoteTargetUuid, X);
});

test('A03-B-230 6명 판 [지금 동작]: 기권 낸 뒤 내 스냅샷 self.hasSubmittedDayVote true·대상 null', async (t) => {
    const g = await sixAtVote(t, 'b230');
    const [A] = g.aliveNonJokers();
    assert.equal((await g.vote(A, null)).ok, true);
    const snap = await g.snapshot(A);
    assert.equal(snap.self.hasSubmittedDayVote, true);
    assert.equal(snap.self.dayVoteTargetUuid, null);
});
