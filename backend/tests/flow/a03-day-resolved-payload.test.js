'use strict';

// 낮 판정 알림 칸(산 사람 수·기권 수·피고·재판 마감)이 판 전원에게 맞게 가는지 서버 흐름 시험
// 목록 A03-낮투표.md 번호 A03-B-215~224, 282~284
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// A03-B-215~220 결과 알림 수 칸 (인원 5~10, 1명 죽은 판: 1표·1명 기권·나머지 안 냄 → 마감)
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    test(`A03-B-${215 + i} ${n}명 판(1명 죽음): 1표·나머지 기권 → 판 전원(산·죽은)에 산 사람 수·기권 수(안 낸 표 포함)·피고 null`, async (t) => {
        const g = H.setup(t, { id: `b${215 + i}`, n, deaths: 1 });
        const voteEnd = g.toVote();
        const alive = g.alive();
        const [X, voter, abstainer] = g.aliveNonJokers();
        assert.equal((await g.vote(voter, X)).ok, true);
        assert.equal((await g.vote(abstainer, null)).ok, true);
        g.advance(voteEnd - g.now());
        assert.equal(g.dead().length, 1);
        for (const uuid of g.ids) {
            const got = g.got(uuid, 'day_vote_resolved');
            assert.equal(got.length, 1, `${uuid}: 판정 알림 수`);
            assert.equal(got[0].publicVoteCount, alive.length);
            assert.equal(got[0].publicAbstainCount, alive.length - 1);
            assert.equal(got[0].tribunalTargetUuid, null);
        }
    });
});

// A03-B-221~223 재판으로 가면 재판 마감 실림 (6명 판 몰표, 재판 시간 15·60·120초)
[15, 60, 120].forEach((sec, i) => {
    test(`A03-B-${221 + i} 6명 판 재판 ${sec}초 방: 몰표 → 판정 알림 tribunalDeadline = 판정 시각+${sec}초`, async (t) => {
        const g = H.setup(t, { id: `b${221 + i}`, n: 6, settings: { tribunalTime: sec } });
        g.toVote();
        const [X, Y] = g.aliveNonJokers();
        const { votes } = H.allocate(g.alive(), { targets: [[X, 5], [Y, 1]] });
        for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
        g.advance(5_000);
        const resolvedAt = g.now();
        for (const uuid of g.ids) {
            const [payload] = g.got(uuid, 'day_vote_resolved');
            assert.equal(payload.outcome, 'TRIBUNAL');
            assert.equal(payload.tribunalDeadline, resolvedAt + sec * 1_000);
        }
    });
});

test('A03-B-224 6명 판: 밤으로 가면(1표 5기권) 판정 알림에 tribunalDeadline 없음', async (t) => {
    const g = H.setup(t, { id: 'b224', n: 6 });
    g.toVote();
    const [X] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 1]], abstain: 5 });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(5_000);
    for (const uuid of g.ids) {
        const [payload] = g.got(uuid, 'day_vote_resolved');
        assert.equal(payload.phase, 'NIGHT');
        assert.equal('tribunalDeadline' in payload, false);
    }
});

// A03-B-282~284 마감 때 기권 수 (8명 판, 안 낸 사람 1·3·7명)
[1, 3, 7].forEach((skip, i) => {
    test(`A03-B-${282 + i} 8명 판: 마감 때 안 낸 사람 ${skip}명 → 기권 수에 다 들어감`, async (t) => {
        const g = H.setup(t, { id: `b${282 + i}`, n: 8 });
        const voteEnd = g.toVote();
        const [X, Y] = g.aliveNonJokers();
        const voterCount = 8 - skip;
        // 내는 사람은 X를 찍음 (X 자신은 Y), 한 명만 내면 그 사람은 Y
        const voters = voterCount === 1 ? [Y] : [X, Y, ...g.alive().filter((u) => u !== X && u !== Y)].slice(0, voterCount);
        const spec = voterCount === 1 ? { targets: [[X, 1]] } : { targets: [[X, voterCount - 1], [Y, 1]] };
        const { votes } = H.allocate(voters, spec);
        for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
        g.advance(voteEnd - g.now());
        for (const uuid of g.ids) {
            const [payload] = g.got(uuid, 'day_vote_resolved');
            assert.equal(payload.publicVoteCount, 8);
            assert.equal(payload.publicAbstainCount, skip);
        }
    });
});
