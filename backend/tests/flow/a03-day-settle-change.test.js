'use strict';

// 낮 투표 다 찬 뒤 5초 안에 표를 바꾸거나 더 낼 때 서버 흐름 시험 (바뀐 표로 판정, 마감은 처음 당긴 시각 그대로)
// 목록 A03-낮투표.md 번호 A03-B-176~181, 277~279, 286, 287
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 그 대상을 찍은 사람들 (except 빼고)
const votersOf = (votes, target, except = []) => votes.filter(([v, tg]) => tg === target && !except.includes(v)).map(([v]) => v);

// 7명 판 첫 낮 투표를 모양대로 다 냄 → 다 찬 시각·표 목록
async function fullSeven(t, id, spec) {
    const g = H.setup(t, { id, n: 7 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), spec(X, Y));
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    return { g, X, Y, votes, fullAt: g.now() };
}

// 5초 안 바꾼 뒤: 당김 알림은 처음 것 하나, 판정은 처음 당긴 시각에 (그 1ms 전엔 없음)
function assertSettledAtFirstDeadline(g, fullAt) {
    for (const uuid of g.ids) {
        const got = g.got(uuid, 'phase_settle_started');
        assert.equal(got.length, 1, `${uuid}: 당김 알림 수`);
        assert.equal(got[0].deadline, fullAt + 5_000);
    }
    g.advance(fullAt + 4_999 - g.now());
    assert.deepEqual(g.missing('day_vote_resolved', 0), [], '처음 마감 전 판정');
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1), []);
    return g.got(g.ids[0], 'day_vote_resolved')[0];
}

const CHANGES = [
    {
        no: 176,
        name: 'X 4·기권 3에서 한 명 X→기권 → 밤 기권 다수',
        spec: (X) => ({ targets: [[X, 4]], abstain: 3 }),
        change: ({ votes, X }) => [[votersOf(votes, X)[0], null]],
        want: () => ({ outcome: 'ABSTAIN_MAJORITY', target: null }),
    },
    {
        no: 177,
        name: '몰표 X에서 한 명 X→Y → 여전히 X 재판',
        spec: (X, Y) => ({ targets: [[X, 6], [Y, 1]] }),
        change: ({ votes, X, Y }) => [[votersOf(votes, X, [Y])[0], Y]],
        want: ({ X }) => ({ outcome: 'TRIBUNAL', target: X }),
    },
    {
        no: 178,
        name: 'X 3·Y 2·기권 2에서 기권→Y 두 명 → Y 재판',
        spec: (X, Y) => ({ targets: [[X, 3], [Y, 2]], abstain: 2 }),
        change: ({ votes, Y }) => votersOf(votes, null, [Y]).slice(0, 2).map((v) => [v, Y]),
        want: ({ Y }) => ({ outcome: 'TRIBUNAL', target: Y }),
    },
    {
        no: 179,
        name: 'X 4·Y 2·기권 1에서 두 사람이 X→Y → 바뀐 표로 Y 재판',
        spec: (X, Y) => ({ targets: [[X, 4], [Y, 2]], abstain: 1 }),
        change: ({ votes, X, Y }) => votersOf(votes, X, [Y]).slice(0, 2).map((v) => [v, Y]),
        want: ({ Y }) => ({ outcome: 'TRIBUNAL', target: Y }),
    },
    {
        no: 180,
        name: 'X 4·기권 3에서 같은 표 다시 냄 → 그대로 X 재판',
        spec: (X) => ({ targets: [[X, 4]], abstain: 3 }),
        change: ({ votes, X }) => [[votersOf(votes, X)[0], X]],
        want: ({ X }) => ({ outcome: 'TRIBUNAL', target: X }),
    },
    {
        no: 181,
        name: 'X 4·Y 2·기권 1에서 한 명 X→Y → 동점 → 밤',
        spec: (X, Y) => ({ targets: [[X, 4], [Y, 2]], abstain: 1 }),
        change: ({ votes, X, Y }) => [[votersOf(votes, X, [Y])[0], Y]],
        want: () => ({ outcome: 'TIE', target: null }),
    },
];

// A03-B-176~181 5초 안에 표 바꾸기 (7명 판)
CHANGES.forEach(({ no, name, spec, change, want }) => {
    test(`A03-B-${no} 7명 판 5초 안 바꿈: ${name}, 마감은 처음 당긴 시각·알림 다시 안 옴`, async (t) => {
        const ctx = await fullSeven(t, `b${no}`, spec);
        const { g, fullAt } = ctx;
        g.advance(2_000);
        for (const [voter, target] of change(ctx)) assert.equal((await g.vote(voter, target)).ok, true);
        const resolved = assertSettledAtFirstDeadline(g, fullAt);
        const expected = want(ctx);
        assert.equal(resolved.outcome, expected.outcome);
        assert.equal(resolved.tribunalTargetUuid, expected.target);
    });
});

// A03-B-277~279 판정 앞뒤 표 (6명 판)
async function fullSix(t, id, spec) {
    const g = H.setup(t, { id, n: 6 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), spec(X, Y));
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    return { g, X, Y };
}

test('A03-B-277 6명 판: 판정 뒤(밤으로 감) 낸 낮 표 → DAY_VOTE_ALREADY_RESOLVED', async (t) => {
    const { g, X } = await fullSix(t, 'b277', (x) => ({ targets: [[x, 1]], abstain: 5 }));
    g.advance(5_000);
    assert.equal(g.got(g.ids[0], 'day_vote_resolved').length, 1);
    const voter = g.alive().find((u) => u !== X);
    const ack = await g.vote(voter, X);
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'DAY_VOTE_ALREADY_RESOLVED');
});

test('A03-B-278 6명 판: 다 찬 뒤 5초 중 낸 표 → 받음', async (t) => {
    const { g, X } = await fullSix(t, 'b278', (x) => ({ targets: [[x, 1]], abstain: 5 }));
    g.advance(2_000);
    const voter = g.alive().find((u) => u !== X);
    const ack = await g.vote(voter, X);
    assert.equal(ack.ok, true);
});

test('A03-B-279 6명 판: 재판으로 넘어간 뒤 낸 낮 표 → INVALID_PHASE', async (t) => {
    const { g, X, Y } = await fullSix(t, 'b279', (x, y) => ({ targets: [[x, 5], [y, 1]] }));
    g.advance(5_000);
    assert.equal(g.got(g.ids[0], 'day_vote_resolved')[0].phase, 'TRIBUNAL');
    const ack = await g.vote(Y, X);
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'INVALID_PHASE');
});

test('A03-B-286 7명 판: 한 사람이 5초 안 세 번 바꿈 → 알림 한 번, 마지막 표(동점)로 판정', async (t) => {
    const ctx = await fullSeven(t, 'b286', (X, Y) => ({ targets: [[X, 3], [Y, 2]], abstain: 2 }));
    const { g, X, Y, votes, fullAt } = ctx;
    // 기권한 사람 하나가 X → 기권 → Y (중간 두 번은 X 재판 모양, 마지막만 X 3·Y 3·기권 1 동점)
    const changer = votersOf(votes, null, [X, Y])[0];
    for (const target of [X, null, Y]) {
        g.advance(1_000);
        assert.equal((await g.vote(changer, target)).ok, true);
    }
    const resolved = assertSettledAtFirstDeadline(g, fullAt);
    assert.equal(resolved.outcome, 'TIE');
    assert.equal(resolved.tribunalTargetUuid, null);
});

test('A03-B-287 7명 판(1명 죽음): 5초 중 죽은 사람이 낸 표 → ACTOR_NOT_ALIVE, 결과 그대로', async (t) => {
    const g = H.setup(t, { id: 'b287', n: 7, deaths: 1 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 5], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    const fullAt = g.now();
    g.advance(2_000);
    const [deadUuid] = g.dead();
    const ack = await g.vote(deadUuid, Y);
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'ACTOR_NOT_ALIVE');
    const resolved = assertSettledAtFirstDeadline(g, fullAt);
    assert.equal(resolved.outcome, 'TRIBUNAL');
    assert.equal(resolved.tribunalTargetUuid, X);
    assert.equal(resolved.publicVoteCount, 6);
    assert.equal(resolved.publicAbstainCount, 0);
});
