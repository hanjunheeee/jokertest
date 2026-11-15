'use strict';

// 낮 투표 "다 내면 5초" 남은 시간 경계 서버 흐름 시험 (남은 5초 이하면 안 당김, 4.999초·5초 경계, 판정 한 번)
// 목록 A03-낮투표.md 번호 A03-B-133~151, 259
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 7명 판 몰표(X 6·Y 1)로 마지막 한 표만 남기고 냄 → 남은 표 [찍는 사람, 대상] 돌려줌
async function allButLast(g) {
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, g.alive().length - 1], [Y, 1]] });
    for (const ack of await g.voteAll(votes.slice(0, -1))) assert.equal(ack.ok, true);
    return votes.at(-1);
}

// A03-B-133~147 투표 시간 30·60·90초 × 다 찬 때 남은 25·6·5·4·1초 (7명 판)
// 5초보다 길게 남으면 지금+5초로 당기고 알림, 5초 이하면 알림 없이 원래 마감 (고2-3 "≤ 5초면 그대로")
const VOTE_TIMES = [30, 60, 90];
const REMAINS = [25, 6, 5, 4, 1];
VOTE_TIMES.forEach((voteSec, vi) => {
    REMAINS.forEach((remainSec, ri) => {
        const no = 133 + vi * REMAINS.length + ri;
        const pulls = remainSec > 5;
        const what = pulls ? '지금+5초로 당김·알림' : '알림 없음·원래 마감에 판정';
        test(`A03-B-${no} 7명 판 투표 ${voteSec}초: 남은 ${remainSec}초에 다 참 → ${what}`, async (t) => {
            const g = H.setup(t, { id: `b${no}`, n: 7, settings: { dayVoteTime: voteSec } });
            const voteEnd = g.toVote();
            const last = await allButLast(g);
            g.advance(voteEnd - remainSec * 1_000 - g.now());
            assert.equal((await g.vote(...last)).ok, true);
            const fullAt = g.now();

            if (pulls) {
                for (const uuid of g.ids) {
                    const got = g.got(uuid, 'phase_settle_started');
                    assert.equal(got.length, 1, `${uuid}: 당김 알림 수`);
                    assert.equal(got[0].deadline, fullAt + 5_000);
                }
                g.advance(4_999);
            } else {
                assert.deepEqual(g.missing('phase_settle_started', 0), [], '당김 알림 받은 사람');
                g.advance(remainSec * 1_000 - 1);
            }
            assert.deepEqual(g.missing('day_vote_resolved', 0), [], '마감 1ms 전 판정');
            g.advance(1);
            assert.deepEqual(g.missing('day_vote_resolved', 1), []);
        });
    });
});

// A03-B-148~151 5초 경계를 시계로 (6명 판, 남은 20초에 다 참)
async function fullSixAtTwenty(t, id) {
    const g = H.setup(t, { id, n: 6 });
    const voteEnd = g.toVote();
    g.advance(10_000);
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 5], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    return { g, voteEnd, fullAt: g.now() };
}

test('A03-B-148 6명 판: 다 찬 뒤 4.999초엔 판정 알림 없음', async (t) => {
    const { g } = await fullSixAtTwenty(t, 'b148');
    g.advance(4_999);
    assert.deepEqual(g.missing('day_vote_resolved', 0), []);
});

test('A03-B-149 6명 판: 다 찬 뒤 5.000초에 판정 알림 있음', async (t) => {
    const { g } = await fullSixAtTwenty(t, 'b149');
    g.advance(5_000);
    assert.deepEqual(g.missing('day_vote_resolved', 1), []);
});

test('A03-B-150 6명 판: 판정 뒤 30초 더 흘려도 그날 판정은 한 번', async (t) => {
    const { g } = await fullSixAtTwenty(t, 'b150');
    g.advance(5_000);
    g.advance(30_000);
    assert.deepEqual(g.missing('day_vote_resolved', 1, g.ids, 1), []);
});

test('A03-B-151 6명 판: 원래 투표 마감 시각이 와도 두 번째 판정 없음', async (t) => {
    const { g, voteEnd } = await fullSixAtTwenty(t, 'b151');
    g.advance(5_000);
    g.advance(voteEnd - g.now() + 1);
    assert.deepEqual(g.missing('day_vote_resolved', 1, g.ids, 1), []);
});

test('A03-B-259 7명 판: 남은 5.5초에 다 참 → 5초로 당김, 0.5초 뒤 원래 마감이 와도 판정 한 번', async (t) => {
    const g = H.setup(t, { id: 'b259', n: 7 });
    const voteEnd = g.toVote();
    const last = await allButLast(g);
    g.advance(voteEnd - 5_500 - g.now());
    assert.equal((await g.vote(...last)).ok, true);
    const fullAt = g.now();
    for (const uuid of g.ids) assert.equal(g.got(uuid, 'phase_settle_started')[0]?.deadline, fullAt + 5_000);
    g.advance(4_999);
    assert.deepEqual(g.missing('day_vote_resolved', 0), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1), []);
    g.advance(500);
    g.advance(1_000);
    assert.deepEqual(g.missing('day_vote_resolved', 1, g.ids, 1), []);
});
