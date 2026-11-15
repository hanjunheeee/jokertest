'use strict';

// [받은 버그 9] 낮 투표에서 기권이 최다 득표 이상이면 재판 없이 밤으로 가는지 서버 흐름 시험 (마감·다 차서 5초 둘 다)
// 목록 A03-낮투표.md 번호 A03-B-231~236, 261~272
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 판 전원: 판정 알림이 기권 다수·밤·피고 없음·재판 마감 없음, 재판 결과 알림 없음, 밤 차례 시작 받음
function assertNightWithoutTribunal(g, dayIndex) {
    for (const uuid of g.ids) {
        const got = g.got(uuid, 'day_vote_resolved', dayIndex);
        assert.equal(got.length, 1, `${uuid}: 판정 알림 수`);
        assert.equal(got[0].outcome, 'ABSTAIN_MAJORITY');
        assert.equal(got[0].phase, 'NIGHT');
        assert.equal(got[0].tribunalTargetUuid, null);
        assert.equal('tribunalDeadline' in got[0], false);
        assert.equal(g.got(uuid, 'tribunal_vote_resolved').length, 0);
        assert.ok(g.got(uuid, 'night_turn_started').length >= 1, `${uuid}: 밤 차례 시작 못 받음`);
    }
}

// 판 전원: 판정 알림이 X 재판·재판 단계·재판 마감 실음
function assertTribunal(g, X) {
    for (const uuid of g.ids) {
        const [payload] = g.got(uuid, 'day_vote_resolved');
        assert.equal(payload.outcome, 'TRIBUNAL');
        assert.equal(payload.tribunalTargetUuid, X);
        assert.equal(payload.phase, 'TRIBUNAL');
        assert.equal(typeof payload.tribunalDeadline, 'number');
    }
}

test('A03-B-231 [버그 9] 7명 판: 1표·6명 안 냄 → 투표 마감에 기권 다수, 재판 없이 밤', async (t) => {
    const g = H.setup(t, { id: 'b231', n: 7 });
    const voteEnd = g.toVote();
    const [X, voter] = g.aliveNonJokers();
    assert.equal((await g.vote(voter, X)).ok, true);
    g.advance(voteEnd - g.now());
    assertNightWithoutTribunal(g, 1);
});

test('A03-B-232 [버그 9] 7명 판: 1표·6기권으로 다 차서 5초 → 기권 다수, 재판 없이 밤', async (t) => {
    const g = H.setup(t, { id: 'b232', n: 7 });
    g.toVote();
    const [X] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 1]], abstain: 6 });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(5_000);
    assertNightWithoutTribunal(g, 1);
});

test('A03-B-233 [버그 9] 6명 판: 한 사람 3표·3기권 → 밤', async (t) => {
    const g = H.setup(t, { id: 'b233', n: 6 });
    g.toVote();
    const [X] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 3]], abstain: 3 });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(5_000);
    assertNightWithoutTribunal(g, 1);
});

test('A03-B-234 [버그 9] 7명 판: 한 사람 4표·3기권 → 재판', async (t) => {
    const g = H.setup(t, { id: 'b234', n: 7 });
    g.toVote();
    const [X] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 4]], abstain: 3 });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(5_000);
    assertTribunal(g, X);
});

test('A03-B-235 [버그 9] 7명 판 2일째(산 6): 1표·5기권 → 밤', async (t) => {
    const g = H.setup(t, { id: 'b235', n: 7, deaths: 1 });
    g.toVote();
    assert.equal(g.alive().length, 6);
    const [X] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 1]], abstain: 5 });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(5_000);
    assertNightWithoutTribunal(g, 2);
});

test('A03-B-236 [버그 9] 6명 판: 1표·4기권·1명 안 냄(마감에 기권) → 밤', async (t) => {
    const g = H.setup(t, { id: 'b236', n: 6 });
    const voteEnd = g.toVote();
    const [X] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 1]], abstain: 4, skip: 1 });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(voteEnd - g.now());
    assertNightWithoutTribunal(g, 1);
    assert.equal(g.got(g.ids[0], 'day_vote_resolved')[0].publicAbstainCount, 5);
});

// A03-B-261~272 기권 경계를 흐름으로: 인원 5~10 × (최다 = 기권 / 최다 = 기권+1), 표 모양은 B-001~036 ④·⑤
// 인원 → [X 표, Y 표, 기권]
const EQUAL = { 5: [2, 1, 2], 6: [3, 0, 3], 7: [3, 1, 3], 8: [4, 0, 4], 9: [4, 1, 4], 10: [5, 0, 5] };
const PLUS_ONE = { 5: [3, 0, 2], 6: [3, 1, 2], 7: [4, 0, 3], 8: [4, 1, 3], 9: [5, 0, 4], 10: [5, 1, 4] };
const spec = ([x, y, a], X, Y) => ({ targets: y > 0 ? [[X, x], [Y, y]] : [[X, x]], abstain: a });

[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    const [ex, ey, ea] = EQUAL[n];
    test(`A03-B-${261 + i * 2} [버그 9] ${n}명 판: 최다 ${ex} = 기권 ${ea}${ey ? `(Y ${ey})` : ''} → 판 전원 기권 다수·밤 차례`, async (t) => {
        const g = H.setup(t, { id: `b${261 + i * 2}`, n });
        g.toVote();
        const [X, Y] = g.aliveNonJokers();
        const { votes } = H.allocate(g.alive(), spec(EQUAL[n], X, Y));
        for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
        g.advance(5_000);
        assertNightWithoutTribunal(g, 1);
    });

    const [px, py, pa] = PLUS_ONE[n];
    test(`A03-B-${262 + i * 2} [버그 9] ${n}명 판: 최다 ${px} = 기권 ${pa}+1${py ? `(Y ${py})` : ''} → 판 전원 X 재판·재판 마감`, async (t) => {
        const g = H.setup(t, { id: `b${262 + i * 2}`, n });
        g.toVote();
        const [X, Y] = g.aliveNonJokers();
        const { votes } = H.allocate(g.alive(), spec(PLUS_ONE[n], X, Y));
        for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
        g.advance(5_000);
        assertTribunal(g, X);
    });
});
