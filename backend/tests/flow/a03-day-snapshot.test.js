'use strict';

// 낮 투표 중·뒤 새로고침(get_session_snapshot)이 줄어든 마감·결과·내 표만 보이는지 서버 흐름 시험
// 목록 A03-낮투표.md 번호 A03-B-225~230, 301~302 (229·230은 정한 글 없어 지금 동작을 임시 정답으로 씀)
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

// A03-B-301~302 낮 판정 뒤 밤 스냅샷 (사용자 결정 2026-11-16: 새로고침해도 "왜 재판이 안 열렸나"가 나옴, 밤엔 낮 판정 칸만)
test('A03-B-301 6명 판: 동점으로 밤에 간 뒤 스냅샷 → phase NIGHT·dayVoteResolution TIE(수만), tribunal 칸 없음', async (t) => {
    const g = await sixAtVote(t, 'b301');
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 3], [Y, 3]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(5_000);
    const snap = await g.snapshot(g.ids[0]);
    assert.equal(snap.ok, true);
    assert.equal(snap.phase, 'NIGHT');
    assert.deepEqual(snap.dayVoteResolution, {
        round: 1, outcome: 'TIE', tribunalTargetUuid: null, publicVoteCount: 6, publicAbstainCount: 0, revoteExcludedUuids: [],
    });
    assert.equal(snap.tribunal, undefined);
});

test('A03-B-302 6명 판: 재판(무죄) 뒤 밤 스냅샷 → dayVoteResolution TRIBUNAL·그 피고, tribunal 칸은 없음', async (t) => {
    const g = await sixAtVote(t, 'b302');
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 5], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(5_000);
    assert.equal(g.session.phase, 'TRIBUNAL');
    // 재판 마감(낸 표 없음 → 무죄)까지 1초씩 넘김 (한 번에 넘기면 밤 차례까지 지나 다음 낮이 됨)
    for (let i = 0; i < 600 && g.session.phase === 'TRIBUNAL'; i += 1) g.advance(1_000);
    assert.equal(g.session.phase, 'NIGHT');
    const snap = await g.snapshot(g.ids[0]);
    assert.equal(snap.phase, 'NIGHT');
    assert.equal(snap.dayVoteResolution?.outcome, 'TRIBUNAL');
    assert.equal(snap.dayVoteResolution.tribunalTargetUuid, X);
    assert.equal(snap.tribunal, undefined);
});

// ---------- A03-B-306~309 5초 당김 중 새로고침: 스냅샷에 "지금 당김 중" 표시 (결정 2026-11-16 아침 8번이 새로고침 뒤에도 지켜지게) ----------
// 표시가 없으면 화면이 새로고침 뒤 "[5초 뒤 마감]" 글·시간 바 펼침을 못 살림 (남은 초만 줄어 보임)
async function sixAllVoted(t, id) {
    const g = await sixAtVote(t, id);
    g.advance(10_000);
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 5], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    return { g, pulled: g.now() + 5_000 };
}

test('A03-B-306 6명 판: 다 내 5초 당김 중 스냅샷 → phaseSettle = 낮·그날·직업 없음·당긴 마감(dayPhaseDeadline과 같음)', async (t) => {
    const { g, pulled } = await sixAllVoted(t, 'b306');
    g.advance(2_000);
    const snap = await g.snapshot(g.ids[1]);
    assert.equal(snap.ok, true);
    assert.deepEqual(snap.phaseSettle, { phase: 'DAY', dayIndex: 1, role: null, deadline: pulled });
    assert.equal(snap.dayPhaseDeadline, pulled);
});

test('A03-B-307 6명 판: 한 명 안 내 당김이 없는 투표 중 스냅샷 → phaseSettle 칸 없음', async (t) => {
    const g = await sixAtVote(t, 'b307');
    const [X, Y] = g.aliveNonJokers();
    const voters = g.alive().slice(0, -1);
    const { votes } = H.allocate(voters, { targets: [[X, 4], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    const snap = await g.snapshot(g.ids[1]);
    assert.equal(snap.ok, true);
    assert.equal(snap.dayPhase, 'DAY_VOTE');
    assert.equal(Object.hasOwn(snap, 'phaseSettle'), false);
});

test('A03-B-308 6명 판: 5초 당김 뒤 재판으로 넘어간 스냅샷 → 낮 당김 표시가 재판에 안 실림', async (t) => {
    const { g } = await sixAllVoted(t, 'b308');
    g.advance(5_000);
    assert.equal(g.session.phase, 'TRIBUNAL');
    const snap = await g.snapshot(g.ids[1]);
    assert.equal(snap.phase, 'TRIBUNAL');
    assert.equal(Object.hasOwn(snap, 'phaseSettle'), false);
});

test('A03-B-309 6명 판: 1일 5초 당김(전원 기권) 뒤 2일 투표 중 스냅샷 → 1일 당김 표시가 안 실림', async (t) => {
    const g = await sixAtVote(t, 'b309');
    const { votes } = H.allocate(g.alive(), { abstain: 6 });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    assert.equal(g.got(g.ids[0], 'phase_settle_started').length, 1, '1일 당김이 안 생김');
    g.advance(5_000);
    assert.equal(g.passNight().dayIndex, 2);
    g.toVote();
    const snap = await g.snapshot(g.ids[1]);
    assert.equal(snap.dayIndex, 2);
    assert.equal(snap.dayPhase, 'DAY_VOTE');
    assert.equal(Object.hasOwn(snap, 'phaseSettle'), false);
});
