'use strict';

// 재판 표 내기 답 흐름 시험: 성공 답·낸 사람만 진행 알림·표 값 안 샘·모양 틀림·옛 창·남의 판·판 밖 사람 (가짜 소켓·가짜 시계)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-146~153, 218
const test = require('node:test');
const assert = require('node:assert/strict');

const W = require('./a04-world');

const { gf } = W;

// 첫 낮까지 차린 판 + 피고(첫 시민) + 재판 진입
async function openWorld(t, spec) {
    const w = W.toFirstDay(W.setupWorld(t, spec));
    const defendant = gf.nonJokers(w.session)[0];
    await W.openTribunal(w, defendant);
    return { w, defendant };
}

// 그 사람 스냅샷의 "재판 표 냈음" 표시 (표가 적혔는지 겉으로 보는 곳)
async function hasSubmitted(w, uuid) {
    const snap = await W.snapshot(w, uuid);
    assert.equal(snap.ok, true, `스냅샷 실패: ${snap.code}`);
    return snap.self.hasSubmittedTribunalVote;
}

test('A04-B-146 6명 판 cast_tribunal_vote 유죄 → 답 { ok: true, gameId, dayIndex, vote: GUILTY }', async (t) => {
    const { w } = await openWorld(t, { id: 'a04v146', n: 6, settings: { tribunalTime: 60 } });
    const [voter] = W.tribunalVoters(w);
    const reply = await W.cast(w, voter, 'GUILTY');
    assert.equal(reply.ok, true);
    assert.equal(reply.gameId, w.session.id);
    assert.equal(reply.dayIndex, 1);
    assert.equal(reply.vote, 'GUILTY');
});

test('A04-B-147 7명 판 표 냄 → 낸 사람만 session_self_progress hasSubmittedTribunalVote true, 다른 사람 0번', async (t) => {
    const { w } = await openWorld(t, { id: 'a04v147', n: 7, settings: { tribunalTime: 60 } });
    const [voter] = W.tribunalVoters(w);
    const before = new Map(w.uuids.map((u) => [u, W.countFor(w, u, 'session_self_progress')]));
    assert.equal((await W.cast(w, voter, 'NOT_GUILTY')).ok, true);
    for (const uuid of w.uuids) {
        const added = w.received(uuid, 'session_self_progress').slice(before.get(uuid));
        if (uuid === voter) {
            assert.equal(added.length, 1);
            assert.equal(added[0].payload.self.hasSubmittedTribunalVote, true);
        } else {
            assert.equal(added.length, 0, `${uuid}도 받음`);
        }
    }
});

test('A04-B-148 8명 판 다 차기 전 표 3개 → 판 채널로 표 값이 담긴 알림 0번', async (t) => {
    const { w } = await openWorld(t, { id: 'a04v148', n: 8, settings: { tribunalTime: 60 } });
    const [a, b, c] = W.tribunalVoters(w);
    const broadcastsBefore = w.io.broadcasts.length;
    const receivedBefore = new Map(w.uuids.map((u) => [u, w.sock(u).received.length]));
    assert.equal((await W.cast(w, a, 'GUILTY')).ok, true);
    assert.equal((await W.cast(w, b, 'NOT_GUILTY')).ok, true);
    assert.equal((await W.cast(w, c, 'GUILTY')).ok, true);
    // 판 채널 방송에 표 값 없음
    for (const sent of w.io.broadcasts.slice(broadcastsBefore)) {
        assert.equal(JSON.stringify(sent.payload).includes('GUILTY'), false, `${sent.event}에 표 값`);
    }
    // 낸 사람 셋 말고는 받은 알림에도 표 값 없음
    for (const uuid of w.uuids.filter((u) => ![a, b, c].includes(u))) {
        for (const got of w.sock(uuid).received.slice(receivedBefore.get(uuid))) {
            assert.equal(JSON.stringify(got.payload).includes('GUILTY'), false, `${uuid}가 받은 ${got.event}에 표 값`);
        }
    }
});

// 149~151: 보내는 값 모양이 틀림 → INVALID_PAYLOAD, 표 안 적힘
[
    { label: '보내는 값이 배열', payload: (w) => [w.session.id, 1, 'GUILTY'] },
    { label: 'gameId 숫자', payload: (w) => ({ gameId: 123, dayIndex: w.session.dayIndex, vote: 'GUILTY' }) },
    { label: 'dayIndex 글자', payload: (w) => ({ gameId: w.session.id, dayIndex: '1', vote: 'GUILTY' }) },
].forEach(({ label, payload }, i) => {
    test(`A04-B-${149 + i} 5명 판 ${label} → INVALID_PAYLOAD, 표 안 적힘`, async (t) => {
        const { w } = await openWorld(t, { id: `a04v${149 + i}`, n: 5, settings: { tribunalTime: 60 } });
        const [voter] = W.tribunalVoters(w);
        const reply = await W.castRaw(w, voter, payload(w));
        assert.equal(reply.ok, false);
        assert.equal(reply.code, 'INVALID_PAYLOAD');
        assert.equal(await hasSubmitted(w, voter), false);
    });
});

test('A04-B-152 6명 판 같은 계정 새 창이 붙은 뒤 옛 창에서 냄 → STALE_SOCKET, 표 안 적힘', async (t) => {
    const { w } = await openWorld(t, { id: 'a04v152', n: 6, settings: { tribunalTime: 60 } });
    const [voter] = W.tribunalVoters(w);
    const oldSocket = w.sock(voter);
    assert.equal((await W.reconnect(w, voter)).ok, true);
    const reply = await W.castRaw(w, voter, { gameId: w.session.id, dayIndex: 1, vote: 'GUILTY' }, oldSocket);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'STALE_SOCKET');
    assert.equal(await hasSubmitted(w, voter), false);
});

test('A04-B-153 10명 판 다른 판 gameId로 냄 → 거절, 두 판 다 표 없음', async (t) => {
    const [mine, other] = W.setupWorlds(t, [
        { id: 'a04v153a', n: 10, settings: { tribunalTime: 60 } },
        { id: 'a04v153b', n: 5, settings: { tribunalTime: 60 } },
    ]);
    W.toFirstDay(mine);
    W.toFirstDay(other);
    await W.openTribunal(mine, gf.nonJokers(mine.session)[0]);
    // 다른 판도 재판 중 (판 규칙 함수로 바로 세움)
    gf.toTribunal(other.session, gf.nonJokers(other.session)[0]);
    const [voter] = W.tribunalVoters(mine);
    const reply = await W.castRaw(mine, voter, { gameId: other.session.id, dayIndex: other.session.dayIndex, vote: 'GUILTY' });
    assert.equal(reply.ok, false);
    assert.equal((await W.snapshot(mine, voter)).progress.doneCount, 0);
    const otherViewer = gf.nonJokers(other.session)[1];
    assert.equal((await W.snapshot(other, otherViewer)).progress.doneCount, 0);
});

test('A04-B-218 5명 판 판 밖 계정이 그 판 gameId로 냄 → 거절, 표 없음', async (t) => {
    const { w } = await openWorld(t, { id: 'a04v218', n: 5, settings: { tribunalTime: 60 } });
    // 판 밖 계정: 접속은 했지만 판 참가자가 아님
    const outsider = 'a04v218-outsider';
    const socket = gf.createFakeSocket(outsider);
    w.io.sockets.sockets.set(socket.id, socket);
    w.registry.set(outsider, socket.id);
    const reply = await W.castRaw(w, outsider, { gameId: w.session.id, dayIndex: 1, vote: 'GUILTY' }, socket);
    assert.equal(reply.ok, false);
    assert.equal((await W.snapshot(w, w.uuids[0])).progress.doneCount, 0);
});
