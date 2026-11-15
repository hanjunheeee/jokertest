'use strict';

// 낮 투표에서 누가 누굴 찍었는지가 판 전원 알림·남의 진행 알림·답에 안 새는지 서버 흐름 시험
// 목록 A03-낮투표.md 번호 A03-B-211~214
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 7명 판: A만 Z를 찍음(다른 사람은 Z 안 찍음), X는 Y, 나머지는 X → X 5표 재판
async function playSeven(t, id) {
    const g = H.setup(t, { id, n: 7 });
    g.toVote();
    const [X, Y, Z, A] = g.aliveNonJokers();
    const votes = g.alive().map((u) => [u, u === A ? Z : u === X ? Y : X]);
    const acks = new Map();
    for (const [voter, target] of votes) {
        const ack = await g.vote(voter, target);
        assert.equal(ack.ok, true);
        acks.set(voter, ack);
    }
    g.advance(5_000);
    return { g, X, Y, Z, A, acks };
}

// 값 안에 판 사람 uuid가 나온 곳 (허락한 경로는 뺌)
function uuidPaths(g, value, allowed = []) {
    return g.ids.flatMap((uuid) => H.pathsOf(value, uuid).map((p) => `${p}=${uuid}`))
        .filter((entry) => !allowed.includes(entry));
}

test('A03-B-211 7명 판: 판 전원이 받은 낮 판정 알림에 투표자→대상 짝 없음 (피고 칸만 uuid)', async (t) => {
    const { g, X } = await playSeven(t, 'b211');
    for (const uuid of g.ids) {
        const [payload] = g.got(uuid, 'day_vote_resolved');
        assert.ok(payload, `${uuid}: 판정 알림 없음`);
        assert.deepEqual(uuidPaths(g, payload, [`tribunalTargetUuid=${X}`]), []);
    }
});

test('A03-B-212 7명 판: 판 전원이 받은 마감 당김 알림에 사람 uuid 없음', async (t) => {
    const { g } = await playSeven(t, 'b212');
    for (const uuid of g.ids) {
        const got = g.got(uuid, 'phase_settle_started');
        assert.equal(got.length, 1);
        assert.deepEqual(uuidPaths(g, got[0]), []);
    }
});

test('A03-B-213 7명 판: 판 전원이 받은 낮 단계 바뀜 알림에 사람 uuid 없음', async (t) => {
    const { g } = await playSeven(t, 'b213');
    for (const uuid of g.ids) {
        const got = g.got(uuid, 'day_phase_changed');
        assert.ok(got.length >= 1);
        for (const payload of got) assert.deepEqual(uuidPaths(g, payload), []);
    }
});

test('A03-B-214 7명 판: 다른 사람이 받은 내 진행 알림·답에 내 표 대상(Z) 없음', async (t) => {
    const { g, Z, A, acks } = await playSeven(t, 'b214');
    // A 자신은 자기 대상을 봄 (보이는 칸이 있다는 것 확인)
    const own = g.got(A, 'session_self_progress');
    assert.ok(own.some((p) => p.self?.dayVoteTargetUuid === Z), 'A 자신 진행 알림에 대상 없음');
    // Z 자신이 받은 것엔 자기 uuid가 원래 있음(효과음 계정 칸) → A·Z 뺀 다른 사람만 봄
    for (const uuid of g.ids.filter((u) => u !== A && u !== Z)) {
        for (const payload of g.got(uuid, 'session_self_progress')) {
            assert.deepEqual(H.pathsOf(payload, Z), [], `${uuid} 진행 알림에 Z`);
        }
        assert.deepEqual(H.pathsOf(acks.get(uuid), Z), [], `${uuid} 답에 Z`);
    }
    // Z 자신: 진행 알림엔 Z 없음, 답엔 자기 계정 칸만
    for (const payload of g.got(Z, 'session_self_progress')) assert.deepEqual(H.pathsOf(payload, Z), []);
    assert.deepEqual(H.pathsOf(acks.get(Z), Z), ['sfxEvent.accountId']);
});
