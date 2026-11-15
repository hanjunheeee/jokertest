'use strict';

// 둘째 날·셋째 날·같은 방 두 번째 판에서도 낮 투표 "다 내면 5초"·준비 규칙이 새로 도는지 서버 흐름 시험
// 목록 A03-낮투표.md 번호 A03-B-237~242
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 산 사람 표를 모양대로 다 냄 → 다 찬 시각
async function fill(g, spec) {
    const { votes } = H.allocate(g.alive(), spec);
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    return g.now();
}

// 그날 판 전원이 당김 알림 하나(마감 = 다 찬 시각+5초)를 받고 5초 뒤 판정 알림 받는지
function assertSettledDay(g, dayIndex, fullAt, uuids = g.ids) {
    for (const uuid of uuids) {
        const got = g.got(uuid, 'phase_settle_started', dayIndex);
        assert.equal(got.length, 1, `${uuid}: ${dayIndex}일 당김 알림 수`);
        assert.equal(got[0].deadline, fullAt + 5_000);
    }
    g.advance(4_999);
    assert.deepEqual(g.missing('day_vote_resolved', 0, uuids, dayIndex), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1, uuids, dayIndex), []);
}

test('A03-B-237 7명 판: 1일 표가 2일에 안 남음 → 2일 아무도 안 내면 전원 기권', async (t) => {
    const g = H.setup(t, { id: 'b237', n: 7 });
    g.toVote();
    const [X] = g.aliveNonJokers();
    await fill(g, { targets: [[X, 1]], abstain: 6 });
    g.advance(5_000);
    g.passNight();
    const voteEnd2 = g.toVote();
    g.advance(voteEnd2 - g.now());
    for (const uuid of g.ids) {
        const [payload] = g.got(uuid, 'day_vote_resolved', 2);
        assert.equal(payload.outcome, 'ABSTAINED');
        assert.equal(payload.publicAbstainCount, 7);
    }
});

test('A03-B-238 7명 판: 1일에 당김을 썼어도 2일 다 차면 다시 5초', async (t) => {
    const g = H.setup(t, { id: 'b238', n: 7 });
    g.toVote();
    const [X] = g.aliveNonJokers();
    const fullAt1 = await fill(g, { targets: [[X, 1]], abstain: 6 });
    assertSettledDay(g, 1, fullAt1);
    g.passNight();
    g.toVote();
    g.advance(3_000);
    const fullAt2 = await fill(g, { targets: [[X, 1]], abstain: 6 });
    assertSettledDay(g, 2, fullAt2);
});

test('A03-B-239 7명 판: 1일 재판 → 밤 → 2일 투표도 다 차면 5초', async (t) => {
    const g = H.setup(t, { id: 'b239', n: 7 });
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    await fill(g, { targets: [[X, 6], [Y, 1]] });
    g.advance(5_000);
    assert.equal(g.got(g.ids[0], 'day_vote_resolved')[0].outcome, 'TRIBUNAL');
    // 재판은 아무도 안 내 마감(30초)까지 → 밤
    g.advanceUntil(() => g.got(g.ids[0], 'night_turn_started').length > 0);
    g.passNight();
    g.toVote();
    const Z = g.aliveNonJokers()[0];
    const fullAt2 = await fill(g, { targets: [[Z, 1]], abstain: g.alive().length - 1 });
    assertSettledDay(g, 2, fullAt2);
});

test('A03-B-240 8명 판 3일째(산 5): 다 차면 5초', async (t) => {
    // 1일 재판 처형 + 1일 밤 암살, 2일 밤 암살 → 3일 낮 산 5명
    const g = H.setup(t, {
        id: 'b240',
        n: 8,
        steps: (session) => {
            const [a, b, c] = H.gf.nonJokers(session).slice(-3);
            return [{ execute: a, kill: b }, { kill: c }];
        },
    });
    assert.equal(g.session.dayIndex, 3);
    assert.equal(g.alive().length, 5);
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const fullAt = await fill(g, { targets: [[X, 4], [Y, 1]] });
    assertSettledDay(g, 3, fullAt);
});

test('A03-B-241 7명 판: 2일 준비는 새로 다 눌러야 투표 (1일에 다 눌렀어도)', async (t) => {
    const g = H.setup(t, { id: 'b241', n: 7 });
    for (const uuid of g.alive()) assert.equal((await g.ready(uuid)).ok, true);
    assert.equal(g.got(g.ids[0], 'day_phase_changed', 1).length, 1);
    await fill(g, { abstain: 7 });
    g.advance(5_000);
    g.passNight();
    g.advance(1_000);
    const [last, ...rest] = [...g.alive()].reverse();
    for (const uuid of rest) assert.equal((await g.ready(uuid)).ok, true);
    assert.deepEqual(g.missing('day_phase_changed', 0, g.ids, 2), [], '한 명 모자란데 2일 투표');
    assert.equal((await g.ready(last)).ok, true);
    for (const uuid of g.ids) {
        const got = g.got(uuid, 'day_phase_changed', 2);
        assert.equal(got.length, 1);
        assert.equal(got[0].dayPhase, 'DAY_VOTE');
    }
});

test('A03-B-242 7명 판: 같은 방 두 번째 판 첫 낮도 다 차면 5초', async (t) => {
    const first = H.setup(t, { id: 'b242', n: 7 });
    first.toVote();
    const [X] = first.aliveNonJokers();
    const fullAt1 = await fill(first, { targets: [[X, 1]], abstain: 6 });
    assertSettledDay(first, 1, fullAt1);
    // 첫 판 끝: 밤에 광대가 나가 시민 승 → 결과 화면에서 전원 나감
    const joker = first.joker;
    assert.equal((await first.leave(joker)).ok, true);
    for (const uuid of first.ids.filter((u) => u !== joker)) {
        assert.equal(first.got(uuid, 'player_eliminated').at(-1)?.winResult?.winner, 'CITIZEN');
        assert.equal((await first.leave(uuid)).ok, true);
    }

    // 같은 방 id·같은 사람으로 두 번째 판 (장부·시계는 그대로)
    const second = H.openNextGame({ id: 'b242', n: 7 });
    assert.notEqual(second.gameId, first.gameId);
    assert.deepEqual([...second.ids].sort(), [...first.ids].sort());
    second.toVote();
    const [X2] = second.aliveNonJokers();
    const fullAt2 = await fill(second, { targets: [[X2, 1]], abstain: 6 });
    assertSettledDay(second, 1, fullAt2);
});
