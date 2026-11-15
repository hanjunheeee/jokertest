'use strict';

// 지운 사건 resolve_day_vote("낮 집계" 단추)를 화면이 보내도 서버가 안 받는지 서버 흐름 시험
// 목록 A03-낮투표.md 번호 A03-B-196~198
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 진짜 연결처럼 판 사건 받는 곳을 소켓마다 붙임 → 지운 사건을 보냄 (답이 오는지도 셈)
function sendRemoved(g, uuid) {
    const answers = [];
    g.world.sockets.get(uuid).trigger('resolve_day_vote', { gameId: g.gameId, dayIndex: g.session.dayIndex }, (body) => answers.push(body));
    return answers;
}

function registerAll(g) {
    for (const [uuid, s] of g.world.sockets) H.gs.registerGameHandlers(g.io, s, uuid);
}

test('A03-B-196 6명 판: 다 냈을 때 resolve_day_vote 보냄 → 판정 안 당겨짐(5초 그대로), 답 없음', async (t) => {
    const g = H.setup(t, { id: 'b196', n: 6 });
    registerAll(g);
    g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const { votes } = H.allocate(g.alive(), { targets: [[X, 5], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    const fullAt = g.now();
    g.advance(1_000);
    // 붙인 받는 곳이 진짜 도는지: 같은 표를 사건으로 다시 내면 답이 옴
    const [voter, target] = votes[0];
    const revote = await new Promise((resolve) => {
        g.world.sockets.get(voter).trigger('cast_day_vote', { gameId: g.gameId, targetId: target }, resolve);
    });
    assert.equal(revote.ok, true);
    const answers = sendRemoved(g, g.ids[0]);
    assert.deepEqual(g.missing('day_vote_resolved', 0), [], '보내자마자 판정');
    g.advance(fullAt + 4_999 - g.now());
    assert.deepEqual(g.missing('day_vote_resolved', 0), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1), []);
    assert.deepEqual(answers, []);
});

test('A03-B-197 6명 판: 1명 안 냈을 때 resolve_day_vote 보냄 → 원래 투표 마감까지 판정 없음', async (t) => {
    const g = H.setup(t, { id: 'b197', n: 6 });
    registerAll(g);
    const voteEnd = g.toVote();
    const [X, Y] = g.aliveNonJokers();
    const skipper = g.aliveNonJokers().at(-1);
    const { votes } = H.allocate(g.alive().filter((u) => u !== skipper), { targets: [[X, 4], [Y, 1]] });
    for (const ack of await g.voteAll(votes)) assert.equal(ack.ok, true);
    g.advance(10_000);
    sendRemoved(g, g.ids[0]);
    g.advance(voteEnd - g.now() - 1);
    assert.deepEqual(g.missing('day_vote_resolved', 0), []);
    g.advance(1);
    assert.deepEqual(g.missing('day_vote_resolved', 1), []);
});

test('A03-B-198 6명 판: 토론 중 resolve_day_vote 보냄 → 아무 단계도 안 바뀜', async (t) => {
    const g = H.setup(t, { id: 'b198', n: 6 });
    registerAll(g);
    g.advance(5_000);
    sendRemoved(g, g.ids[0]);
    assert.deepEqual(g.missing('day_phase_changed', 0), [], '단계 바뀜 알림');
    assert.deepEqual(g.missing('day_vote_resolved', 0), []);
    // 토론 30초 마감 1ms 전까지도 그대로
    g.advance(30_000 - 5_000 - 1);
    assert.deepEqual(g.missing('day_phase_changed', 0), []);
});
