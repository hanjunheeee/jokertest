'use strict';

// 낮 투표 "산 사람 표가 다 차면 5초 뒤 판정" 서버 흐름 시험 (메모리, 가짜 소켓·가짜 시계)
// 목록 A03-낮투표.md 번호 A03-B-121~132, 253~255, 281, 285, 290
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

const SIZES = [5, 6, 7, 8, 9, 10];

// 판 전원이 받은 당김 알림이 한 번씩이고 마감이 그 시각인지
function assertSettleToAll(g, deadline, uuids = g.ids) {
    for (const uuid of uuids) {
        const got = g.got(uuid, 'phase_settle_started');
        assert.equal(got.length, 1, `${uuid}: 당김 알림 수`);
        assert.equal(got[0].deadline, deadline, `${uuid}: 당김 마감`);
    }
}

// A03-B-121~126 산 사람 표가 다 차면 5초 뒤 판정 (인원 5~10)
SIZES.forEach((n, i) => {
    test(`A03-B-${121 + i} ${n}명 판: 남은 20초에 마지막 표 → 판 전원 "지금+5초" 알림, 5초 뒤 판정`, async (t) => {
        const g = H.setup(t, { id: `b121-${n}`, n });
        const voteEnd = g.toVote();
        g.advance(10_000);
        assert.equal(voteEnd - g.now(), 20_000, '남은 시간 20초에서 시작');

        const [X, Y] = g.aliveNonJokers();
        const { votes } = H.allocate(g.alive(), { targets: [[X, n - 1], [Y, 1]] });
        for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
        const lastAt = g.now();

        assertSettleToAll(g, lastAt + 5_000);
        g.advance(5_000);
        assert.deepEqual(g.missing('day_vote_resolved', 1), [], '판정 알림 못 받은 사람');
    });
});

// A03-B-127~132 하나 모자라면 당기지 않음 (인원 5~10)
SIZES.forEach((n, i) => {
    test(`A03-B-${127 + i} ${n}명 판: 산 사람 1명만 안 냄 → 당김 알림 없음, 원래 마감에 판정·안 낸 사람 기권`, async (t) => {
        const g = H.setup(t, { id: `b127-${n}`, n });
        const voteEnd = g.toVote();
        const [X, Y] = g.aliveNonJokers();
        const skipper = g.aliveNonJokers().at(-1);
        const voters = g.alive().filter((u) => u !== skipper);
        const { votes } = H.allocate(voters, { targets: [[X, n - 2], [Y, 1]] });
        for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);

        assert.deepEqual(g.missing('phase_settle_started', 0), [], '당김 알림 받은 사람');
        g.advance(voteEnd - g.now() - 1);
        assert.deepEqual(g.missing('day_vote_resolved', 0), [], '마감 전 판정');
        g.advance(1);
        assert.deepEqual(g.missing('day_vote_resolved', 1), []);
        const [resolved] = g.got(g.ids[0], 'day_vote_resolved');
        // 안 낸 1명이 기권으로 셈 → X n-2표 > 기권 1 → X 재판
        assert.equal(resolved.publicAbstainCount, 1);
        assert.equal(resolved.outcome, 'TRIBUNAL');
        assert.equal(resolved.tribunalTargetUuid, X);
    });
});

// A03-B-253~255 마감 당김 알림 받는 사람 (7명 판, 2명 죽음)
async function fillSevenWithTwoDead(t, id) {
    const g = H.setup(t, { id, n: 7, deaths: 2 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 4], [Y, 1]] });
    await g.voteAll(votes);
    return { g, lastAt: g.now() };
}

test('A03-B-253 7명 판(2명 죽음): 산 사람 전원이 당김 알림 받음', async (t) => {
    const { g, lastAt } = await fillSevenWithTwoDead(t, 'b253');
    assert.equal(g.alive().length, 5);
    assertSettleToAll(g, lastAt + 5_000, g.alive());
});

test('A03-B-254 7명 판(2명 죽음): 죽은 사람도 당김 알림 받음', async (t) => {
    const { g, lastAt } = await fillSevenWithTwoDead(t, 'b254');
    assert.equal(g.dead().length, 2);
    assertSettleToAll(g, lastAt + 5_000, g.dead());
});

test('A03-B-255 7명 판(2명 죽음): 두 사람이 같은 순간 마지막 표 → 알림 한 번', async (t) => {
    const g = H.setup(t, { id: 'b255', n: 7, deaths: 2 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 4], [Y, 1]] });
    const lastTwo = votes.slice(-2);
    await g.voteAll(votes.slice(0, -2));
    // 답을 기다리지 않고 두 표를 같이 보냄
    const acks = await Promise.all(lastTwo.map(([voter, target]) => g.vote(voter, target)));
    for (const ack of acks) assert.equal(ack.ok, true);
    assertSettleToAll(g, g.now() + 5_000);
});

test('A03-B-281 6명 판: 기권(null) 표를 내면 답 ok true', async (t) => {
    const g = H.setup(t, { id: 'b281', n: 6 });
    g.toVote();
    const ack = await g.vote(g.ids[0], null);
    assert.equal(ack.ok, true);
});

test('A03-B-285 6명 판: 당김 알림 모양 = { gameId, phase DAY, dayIndex, role null, deadline }, 투표 대상 칸 없음', async (t) => {
    const g = H.setup(t, { id: 'b285', n: 6 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 5], [Y, 1]] });
    await g.voteAll(votes);
    const lastAt = g.now();
    for (const uuid of g.ids) {
        assert.deepEqual(g.got(uuid, 'phase_settle_started'), [
            { gameId: g.gameId, phase: 'DAY', dayIndex: 1, role: null, deadline: lastAt + 5_000 },
        ]);
    }
});

test('A03-B-290 10명 판 투표 90초: 열리자마자 1초 안 전원 냄 → 지금+5초로 당김', async (t) => {
    const g = H.setup(t, { id: 'b290', n: 10, settings: { dayVoteTime: 90 } });
    const voteEnd = g.toVote();
    const openedAt = g.now();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 9], [Y, 1]] });
    for (const [voter, target] of votes) {
        assert.equal((await g.vote(voter, target)).ok, true);
        if (voter !== votes.at(-1)[0]) g.advance(100);
    }
    const lastAt = g.now();
    assert.ok(lastAt - openedAt < 1_000, '1초 안에 다 냄');
    assert.equal(voteEnd - openedAt, 90_000);
    assertSettleToAll(g, lastAt + 5_000);
    g.advance(4_999);
    assert.deepEqual(g.missing('day_vote_resolved', 0), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1), []);
});
