'use strict';

// 낮 투표 "다 찼나" 판단과 5초 중 끊김·다시 붙기 서버 흐름 시험 (끊긴 사람 안 냄 = 원래 마감, 저장 실패여도 표는 셈)
// 목록 A03-낮투표.md 번호 A03-B-182~186, 260, 280, 288, 289
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 끊긴 사람은 소켓이 꺼져 알림을 못 받음 → 붙어 있는 사람만 봄
const connected = (g, gone) => g.ids.filter((u) => !gone.includes(u));

test('A03-B-182 7명 판: 끊긴 사람(60초 기다림 중)이 안 냄 → 다 찬 것 아님, 원래 마감에 판정', async (t) => {
    const g = H.setup(t, { id: 'b182', n: 7 });
    const voteEnd = g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const gone = g.aliveNonJokers().at(-1);
    await g.disconnect(gone);
    const voters = g.alive().filter((u) => u !== gone);
    const { votes } = H.allocate(voters, { targets: [[X, 5], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);

    const others = connected(g, [gone]);
    assert.deepEqual(g.missing('phase_settle_started', 0, others), [], '당김 알림 받은 사람');
    g.advance(voteEnd - g.now() - 1);
    assert.deepEqual(g.missing('day_vote_resolved', 0, others), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1, others), []);
    assert.equal(g.got(others[0], 'day_vote_resolved')[0].publicAbstainCount, 1);
});

test('A03-B-183 7명 판: 끊기기 전에 낸 사람 표 → 다 찬 것으로 셈, 5초 뒤 판정에 그 표 들어감', async (t) => {
    const g = H.setup(t, { id: 'b183', n: 7 });
    g.toVote();
    const [X] = g.aliveNonJokers();
    // X 4·기권 3 → 끊긴 사람 표가 빠지면 X 3·기권 4로 밤이 됨
    const { votes } = H.allocate(g.alive(), { targets: [[X, 4]], abstain: 3 });
    const [early] = votes.find(([, target]) => target === X);
    assert.equal((await g.vote(early, X)).ok, true);
    await g.disconnect(early);
    for (const ack of await g.voteAll(votes.filter(([v]) => v !== early))) assert.equal(ack.ok, true);
    const fullAt = g.now();

    const others = connected(g, [early]);
    for (const uuid of others) assert.equal(g.got(uuid, 'phase_settle_started')[0]?.deadline, fullAt + 5_000);
    g.advance(5_000);
    assert.deepEqual(g.missing('day_vote_resolved', 1, others), []);
    const [resolved] = g.got(others[0], 'day_vote_resolved');
    assert.equal(resolved.outcome, 'TRIBUNAL');
    assert.equal(resolved.tribunalTargetUuid, X);
});

test('A03-B-184 7명 판(2명 죽음): 죽은 사람은 셈에서 빠짐 → 산 5명 다 내면 5초 뒤 판정', async (t) => {
    const g = H.setup(t, { id: 'b184', n: 7, deaths: 2 });
    g.toVote();
    assert.equal(g.alive().length, 5);
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 4], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    const fullAt = g.now();
    for (const uuid of g.ids) assert.equal(g.got(uuid, 'phase_settle_started')[0]?.deadline, fullAt + 5_000);
    g.advance(5_000);
    assert.deepEqual(g.missing('day_vote_resolved', 1), []);
});

test('A03-B-185 7명 판: 전원 기권으로 다 참 → 5초 뒤 전원 기권(ABSTAINED)', async (t) => {
    const g = H.setup(t, { id: 'b185', n: 7 });
    g.toVote();
    const { votes } = H.allocate(g.alive(), { abstain: 7 });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    const fullAt = g.now();
    for (const uuid of g.ids) assert.equal(g.got(uuid, 'phase_settle_started')[0]?.deadline, fullAt + 5_000);
    g.advance(4_999);
    assert.deepEqual(g.missing('day_vote_resolved', 0), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1), []);
    assert.equal(g.got(g.ids[0], 'day_vote_resolved')[0].outcome, 'ABSTAINED');
});

test('A03-B-186 7명 판: 마지막 표가 기권이어도 다 찬 것 → 5초 뒤 판정', async (t) => {
    const g = H.setup(t, { id: 'b186', n: 7 });
    g.toVote();
    const [X] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 4]], abstain: 3 });
    // 기권 하나를 맨 끝으로
    const lastAbstain = votes.findLast(([, target]) => target === null);
    const ordered = [...votes.filter((v) => v !== lastAbstain), lastAbstain];
    for (const ack of await g.voteAll(ordered)) assert.equal(ack.ok, true);
    const fullAt = g.now();
    for (const uuid of g.ids) assert.equal(g.got(uuid, 'phase_settle_started')[0]?.deadline, fullAt + 5_000);
    g.advance(5_000);
    assert.deepEqual(g.missing('day_vote_resolved', 1), []);
});

test('A03-B-260 6명 판: 마지막 진짜 표의 참여 기록 저장 실패 → 답 VOTE_PERSIST_FAILED, 그 표 그대로 세서 5초 뒤 판정', async (t) => {
    let failFor = null;
    const g = H.setup(t, {
        id: 'b260',
        n: 6,
        persist: async ({ userId }) => { if (userId === failFor) throw new Error('저장 실패 흉내'); },
    });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const others = g.alive().filter((u) => u !== X && u !== Y);
    // X 4·기권 2 (마지막 표가 X) → 그 표를 안 세면 X 3·기권 3으로 밤
    const last = others.at(-1);
    failFor = last;
    const votes = [[Y, X], [others[0], X], [others[1], X], [X, null], [others[2], null]];
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    const ack = await g.vote(last, X);
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'VOTE_PERSIST_FAILED');
    const fullAt = g.now();
    for (const uuid of g.ids) assert.equal(g.got(uuid, 'phase_settle_started')[0]?.deadline, fullAt + 5_000);
    g.advance(5_000);
    const [resolved] = g.got(g.ids[0], 'day_vote_resolved');
    assert.equal(resolved.outcome, 'TRIBUNAL');
    assert.equal(resolved.tribunalTargetUuid, X);
    assert.equal(resolved.publicAbstainCount, 2);
});

test('A03-B-280 7명 판: 5초 중 끊겼다 새 소켓으로 다시 붙음 → 그 새 소켓이 판정 알림 받음', async (t) => {
    const g = H.setup(t, { id: 'b280', n: 7 });
    g.toVote();
    const [X, Y, A] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 6], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(1_000);
    await g.disconnect(A);
    g.advance(1_000);
    const again = await g.reconnect(A);
    g.advance(3_000);
    assert.equal(again.received.filter((e) => e.event === 'day_vote_resolved').length, 1);
});

test('A03-B-288 7명 판: 마지막 표를 낸 사람이 5초 중 끊김 → 판정 그대로 5초 뒤, 그 표 셈', async (t) => {
    const g = H.setup(t, { id: 'b288', n: 7 });
    g.toVote();
    const [X] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 4]], abstain: 3 });
    // X 표 하나를 맨 끝으로 (그 표가 빠지면 X 3·기권 4로 밤)
    const lastX = votes.findLast(([, target]) => target === X);
    const ordered = [...votes.filter((v) => v !== lastX), lastX];
    for (const ack of await g.voteAll(ordered)) assert.equal(ack.ok, true);
    const fullAt = g.now();
    g.advance(1_000);
    await g.disconnect(lastX[0]);
    const others = connected(g, [lastX[0]]);
    g.advance(fullAt + 4_999 - g.now());
    assert.deepEqual(g.missing('day_vote_resolved', 0, others), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1, others), []);
    const [resolved] = g.got(others[0], 'day_vote_resolved');
    assert.equal(resolved.outcome, 'TRIBUNAL');
    assert.equal(resolved.tribunalTargetUuid, X);
});

test('A03-B-289 7명 판: 끊긴 채 냈던 사람이 5초 중 돌아옴 → 마감 그대로', async (t) => {
    const g = H.setup(t, { id: 'b289', n: 7 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 6], [Y, 1]] });
    const [early] = votes[0];
    assert.equal((await g.vote(...votes[0])).ok, true);
    await g.disconnect(early);
    for (const ack of await g.voteAll(votes.slice(1))) assert.equal(ack.ok, true);
    const fullAt = g.now();
    g.advance(2_000);
    await g.reconnect(early);
    const others = connected(g, [early]);
    for (const uuid of others) {
        const got = g.got(uuid, 'phase_settle_started');
        assert.equal(got.length, 1);
        assert.equal(got[0].deadline, fullAt + 5_000);
    }
    g.advance(fullAt + 4_999 - g.now());
    assert.deepEqual(g.missing('day_vote_resolved', 0, others), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1, g.ids), [], '돌아온 사람 새 소켓 포함 전원');
});
