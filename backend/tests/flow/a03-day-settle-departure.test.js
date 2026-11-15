'use strict';

// 낮 투표 중 누가 나가서 표가 다 찬 때·5초 중 나간 때 서버 흐름 시험 (나가서 다 차도 5초 뒤, 승부 나면 판정 없음)
// 목록 A03-낮투표.md 번호 A03-B-187~195
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 남아 있는 사람 (나간 사람·끊긴 사람 빼고)
const remaining = (g, gone) => g.ids.filter((u) => !gone.includes(u));

// 남은 사람 전원이 당김 알림을 한 번, 그 마감으로 받았는지
function assertSettle(g, uuids, deadline) {
    for (const uuid of uuids) {
        const got = g.got(uuid, 'phase_settle_started');
        assert.equal(got.length, 1, `${uuid}: 당김 알림 수`);
        assert.equal(got[0].deadline, deadline);
    }
}

test('A03-B-187 7명 판: 안 낸 사람이 나감 → 남은 산 사람 다 냄 → 그때+5초 알림·판정', async (t) => {
    const g = H.setup(t, { id: 'b187', n: 7 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const leaver = g.aliveNonJokers().at(-1);
    const { votes } = H.allocate(g.alive().filter((u) => u !== leaver), { targets: [[X, 5], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    assert.deepEqual(g.missing('phase_settle_started', 0), [], '나가기 전 당김');
    g.advance(10_000);
    assert.equal((await g.leave(leaver)).ok, true);
    const leftAt = g.now();
    const rest = remaining(g, [leaver]);
    assertSettle(g, rest, leftAt + 5_000);
    g.advance(4_999);
    assert.deepEqual(g.missing('day_vote_resolved', 0, rest), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1, rest), []);
});

test('A03-B-188 7명 판 투표 90초: 안 낸 사람이 끊긴 뒤 60초 지나 탈락 → 그때+5초 판정', async (t) => {
    const g = H.setup(t, { id: 'b188', n: 7, settings: { dayVoteTime: 90 } });
    const voteEnd = g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const gone = g.aliveNonJokers().at(-1);
    await g.disconnect(gone);
    const goneAt = g.now();
    const { votes } = H.allocate(g.alive().filter((u) => u !== gone), { targets: [[X, 5], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    const rest = remaining(g, [gone]);
    g.advance(goneAt + 59_999 - g.now());
    assert.deepEqual(g.missing('phase_settle_started', 0, rest), [], '60초 전 당김');
    g.advance(1);
    assertSettle(g, rest, goneAt + 65_000);
    g.advance(5_000);
    assert.deepEqual(g.missing('day_vote_resolved', 1, rest), []);
    assert.ok(goneAt + 65_000 < voteEnd, '원래 마감보다 먼저 판정');
});

test('A03-B-189 7명 판: 찍힌 사람이 나감 → 그 표는 기권, 남은 사람 다 냈으면 5초 뒤 판정', async (t) => {
    const g = H.setup(t, { id: 'b189', n: 7 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    // X는 안 냄, 나머지 6명: X 3·Y 2·기권 1 → X가 나가면 Y 2·기권 4
    const { votes } = H.allocate(g.alive().filter((u) => u !== X), { targets: [[X, 3], [Y, 2]], abstain: 1 });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(10_000);
    assert.equal((await g.leave(X)).ok, true);
    const rest = remaining(g, [X]);
    assertSettle(g, rest, g.now() + 5_000);
    g.advance(5_000);
    const [resolved] = g.got(rest[0], 'day_vote_resolved');
    assert.equal(resolved.outcome, 'ABSTAIN_MAJORITY');
    assert.equal(resolved.publicVoteCount, 6);
    assert.equal(resolved.publicAbstainCount, 4);
});

// 7명 판 몰표 등으로 다 냄 → 다 찬 시각
async function fullSeven(t, id, spec, opts = {}) {
    const g = H.setup(t, { id, n: 7, ...opts });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), spec(X, Y));
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    return { g, X, Y, votes, fullAt: g.now() };
}

test('A03-B-190 7명 판: 이미 당긴 5초 중 한 사람이 나감 → 마감 안 늘어남', async (t) => {
    const { g, X, Y, fullAt } = await fullSeven(t, 'b190', (x, y) => ({ targets: [[x, 6], [y, 1]] }));
    g.advance(2_000);
    const leaver = g.aliveNonJokers().find((u) => u !== X && u !== Y);
    assert.equal((await g.leave(leaver)).ok, true);
    const rest = remaining(g, [leaver]);
    assertSettle(g, rest, fullAt + 5_000);
    g.advance(fullAt + 4_999 - g.now());
    assert.deepEqual(g.missing('day_vote_resolved', 0, rest), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1, rest), []);
});

test('A03-B-191 7명 판: 5초 중 나간 사람 표는 안 셈 (X 4·기권 3에서 X 찍은 사람 나감 → 밤)', async (t) => {
    const { g, X, votes } = await fullSeven(t, 'b191', (x) => ({ targets: [[x, 4]], abstain: 3 }));
    g.advance(1_000);
    const leaver = votes.find(([v, target]) => target === X && v !== g.joker)[0];
    assert.equal((await g.leave(leaver)).ok, true);
    g.advance(4_000);
    const [resolved] = g.got(remaining(g, [leaver])[0], 'day_vote_resolved');
    assert.equal(resolved.outcome, 'ABSTAIN_MAJORITY');
    assert.equal(resolved.publicVoteCount, 6);
    assert.equal(resolved.publicAbstainCount, 3);
});

test('A03-B-192 7명 판: 남은 3초에 안 낸 사람이 나가 다 참 → 당기지 않고 원래 마감에 판정', async (t) => {
    const g = H.setup(t, { id: 'b192', n: 7 });
    const voteEnd = g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const leaver = g.aliveNonJokers().at(-1);
    const { votes } = H.allocate(g.alive().filter((u) => u !== leaver), { targets: [[X, 5], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(voteEnd - 3_000 - g.now());
    assert.equal((await g.leave(leaver)).ok, true);
    const rest = remaining(g, [leaver]);
    assert.deepEqual(g.missing('phase_settle_started', 0, rest), [], '당김 알림 받은 사람');
    g.advance(2_999);
    assert.deepEqual(g.missing('day_vote_resolved', 0, rest), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1, rest), []);
});

test('A03-B-193 7명 판: 5초 중 광대(1명)가 나감 → 판 끝 시민 승, 낮 판정 알림 안 옴', async (t) => {
    const { g } = await fullSeven(t, 'b193', (x, y) => ({ targets: [[x, 6], [y, 1]] }));
    g.advance(1_000);
    const joker = g.joker;
    assert.equal((await g.leave(joker)).ok, true);
    const rest = remaining(g, [joker]);
    const eliminated = g.got(rest[0], 'player_eliminated');
    assert.equal(eliminated.length, 1);
    assert.equal(eliminated[0].winResult?.winner, 'CITIZEN');
    g.advance(10_000);
    assert.deepEqual(g.missing('day_vote_resolved', 0, rest), []);
});

test('A03-B-194 7명 판: 5초 중 3표 받은 X가 나감 → X 표는 기권으로 다시 셈 (밤)', async (t) => {
    const g = H.setup(t, { id: 'b194', n: 7 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const others = g.alive().filter((u) => u !== X && u !== Y);
    // X 3·Y 2·기권 2 (X는 Y, Y는 기권) → X가 나가면 Y 1·기권 5
    const votes = [[X, Y], [Y, null], [others[0], X], [others[1], X], [others[2], X], [others[3], Y], [others[4], null]];
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(1_000);
    assert.equal((await g.leave(X)).ok, true);
    g.advance(4_000);
    const [resolved] = g.got(Y, 'day_vote_resolved');
    assert.equal(resolved.outcome, 'ABSTAIN_MAJORITY');
    assert.equal(resolved.tribunalTargetUuid, null);
    assert.equal(resolved.publicVoteCount, 6);
    assert.equal(resolved.publicAbstainCount, 5);
});

test('A03-B-195 7명 판(광대 2·2명 죽음): 5초 중 시민이 나가 광대 ≥ 나머지 → 광대 승, 낮 판정 알림 안 옴', async (t) => {
    const { g } = await fullSeven(t, 'b195', () => ({ abstain: 5 }), { roleCounts: { JOKER: 2 }, deaths: 2 });
    assert.equal(g.alive().length, 5);
    g.advance(1_000);
    const leaver = g.aliveNonJokers()[0];
    assert.equal((await g.leave(leaver)).ok, true);
    const rest = remaining(g, [leaver]);
    const eliminated = g.got(rest[0], 'player_eliminated');
    assert.equal(eliminated.length, 1);
    assert.equal(eliminated[0].winResult?.winner, 'JOKER');
    g.advance(10_000);
    assert.deepEqual(g.missing('day_vote_resolved', 0, rest), []);
});
