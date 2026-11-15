'use strict';

// 낮 토론 "투표하자" 준비가 산 사람 전원이면 바로 투표로 가는지 서버 흐름 시험 (나감·끊김 섞임 포함)
// 목록 A03-낮투표.md 번호 A03-B-207~210, 273~276
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 그 사람들이 투표 단계 알림을 한 번 받았고 투표 마감이 지금+30초인지
function assertVoteOpenedNow(g, uuids) {
    for (const uuid of uuids) {
        const got = g.got(uuid, 'day_phase_changed');
        assert.equal(got.length, 1, `${uuid}: 단계 바뀜 알림 수`);
        assert.equal(got[0].dayPhase, 'DAY_VOTE');
        assert.equal(got[0].dayPhaseDeadline, g.now() + 30_000);
    }
}

async function readyAll(g, uuids) {
    for (const uuid of uuids) assert.equal((await g.ready(uuid)).ok, true);
}

// A03-B-207~209 산 사람 전원 준비 → 바로 투표 (5·8·10명 판)
[5, 8, 10].forEach((n, i) => {
    test(`A03-B-${207 + i} ${n}명 판: 산 사람 전원 준비 → 투표 단계 알림, 투표 마감 = 지금+투표 시간`, async (t) => {
        const g = H.setup(t, { id: `b${207 + i}`, n });
        g.advance(3_000);
        await readyAll(g, g.alive());
        assertVoteOpenedNow(g, g.ids);
    });
});

test('A03-B-210 6명 판 토론 150초: 10초에 다 준비 → 남은 140초 버리고 바로 투표', async (t) => {
    const g = H.setup(t, { id: 'b210', n: 6, settings: { dayDiscussionTime: 150 } });
    g.advance(10_000);
    await readyAll(g, g.alive());
    assertVoteOpenedNow(g, g.ids);
});

// 끝 사람 하나 (광대 아닌 사람) 와 나머지
function splitLast(g) {
    const one = g.aliveNonJokers().at(-1);
    return { one, rest: g.alive().filter((u) => u !== one) };
}

test('A03-B-273 6명 판: 준비 안 한 사람이 나감 → 나머지가 다 준비했으면 바로 투표', async (t) => {
    const g = H.setup(t, { id: 'b273', n: 6 });
    const { one, rest } = splitLast(g);
    await readyAll(g, rest);
    assert.deepEqual(g.missing('day_phase_changed', 0), []);
    g.advance(5_000);
    assert.equal((await g.leave(one)).ok, true);
    assertVoteOpenedNow(g, rest);
});

test('A03-B-274 6명 판 토론 150초: 준비 안 한 사람이 끊긴 뒤 60초 탈락 → 바로 투표', async (t) => {
    const g = H.setup(t, { id: 'b274', n: 6, settings: { dayDiscussionTime: 150 } });
    const { one, rest } = splitLast(g);
    await g.disconnect(one);
    await readyAll(g, rest);
    g.advance(59_999);
    assert.deepEqual(g.missing('day_phase_changed', 0, rest), [], '60초 전 투표');
    g.advance(1);
    assertVoteOpenedNow(g, rest);
});

test('A03-B-275 6명 판: 준비한 사람이 끊김(60초 안) → 준비 그대로 셈, 나머지 다 준비하면 바로 투표', async (t) => {
    const g = H.setup(t, { id: 'b275', n: 6 });
    const { one, rest } = splitLast(g);
    assert.equal((await g.ready(one)).ok, true);
    await g.disconnect(one);
    g.advance(2_000);
    await readyAll(g, rest);
    assertVoteOpenedNow(g, rest);
});

test('A03-B-276 6명 판: 끊긴 사람이 준비 안 함 → 토론 마감까지 토론', async (t) => {
    const g = H.setup(t, { id: 'b276', n: 6 });
    const { one, rest } = splitLast(g);
    await g.disconnect(one);
    await readyAll(g, rest);
    g.advance(30_000 - 1);
    assert.deepEqual(g.missing('day_phase_changed', 0, rest), [], '마감 전 투표');
    g.advance(1);
    assertVoteOpenedNow(g, rest);
});
