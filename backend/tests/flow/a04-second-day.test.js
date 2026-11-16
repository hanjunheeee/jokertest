'use strict';

// 둘째 날·셋째 날·같은 방 둘째 판 재판 흐름 시험 (받은 버그 8: 1일에 낸 사람이 2일 재판 표를 못 냄)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-166~174, 206~208
const test = require('node:test');
const assert = require('node:assert/strict');

const W = require('./a04-world');

const { gf } = W;

// 첫 낮까지 차린 판
const dayWorld = (t, spec) => W.toFirstDay(W.setupWorld(t, { settings: { tribunalTime: 60 }, ...spec }));

// 한 사람(voter)이 재판에서 표를 내고, 나머지 투표할 사람도 같은 표 → 5초 뒤 판정 → 밤 → 다음 낮
async function dayWithTribunal(w, defendant, voter, vote) {
    await W.openTribunal(w, defendant);
    assert.equal((await W.cast(w, voter, vote)).ok, true, '그날 재판 표 실패');
    for (const uuid of W.tribunalVoters(w).filter((u) => u !== voter)) {
        assert.equal((await W.cast(w, uuid, vote)).ok, true);
    }
    w.tick(5_000);
    assert.equal(w.session.phase, 'NIGHT');
    W.nightToDay(w);
}

test('A04-B-166 [버그 8] 7명 판 1일 재판 유죄 낸 A가 2일 재판 표 → 받음', async (t) => {
    const w = dayWorld(t, { id: 'a04b166', n: 7 });
    const [d1, d2, a] = gf.nonJokers(w.session);
    await dayWithTribunal(w, d1, a, 'GUILTY');
    await W.openTribunal(w, d2);
    const reply = await W.cast(w, a, 'GUILTY');
    assert.equal(reply.ok, true, `거절: ${reply.code}`);
    assert.equal(reply.dayIndex, 2);
});

test('A04-B-167 [버그 8] 8명 판 1·2일 낸 A의 3일 재판 표 → 받음', async (t) => {
    const w = dayWorld(t, { id: 'a04b167', n: 8 });
    const [d1, d2, d3, a] = gf.nonJokers(w.session);
    await dayWithTribunal(w, d1, a, 'NOT_GUILTY');
    await dayWithTribunal(w, d2, a, 'NOT_GUILTY');
    await W.openTribunal(w, d3);
    const reply = await W.cast(w, a, 'GUILTY');
    assert.equal(reply.ok, true, `거절: ${reply.code}`);
    assert.equal(reply.dayIndex, 3);
});

test('A04-B-168 [버그 8] 6명 판 1일 낸 A의 2일 재판 스냅샷 → hasSubmittedTribunalVote false', async (t) => {
    const w = dayWorld(t, { id: 'a04b168', n: 6 });
    const [d1, d2, a] = gf.nonJokers(w.session);
    await dayWithTribunal(w, d1, a, 'NOT_GUILTY');
    await W.openTribunal(w, d2);
    const snap = await W.snapshot(w, a);
    assert.equal(snap.phase, 'TRIBUNAL');
    assert.equal(snap.dayIndex, 2);
    assert.equal(snap.self.hasSubmittedTribunalVote, false);
});

test('A04-B-169 6명 판 2일 재판에 낸 뒤 A의 내 진행 알림 → hasSubmittedTribunalVote true', async (t) => {
    const w = dayWorld(t, { id: 'a04b169', n: 6 });
    const [d1, d2, a] = gf.nonJokers(w.session);
    await dayWithTribunal(w, d1, a, 'NOT_GUILTY');
    await W.openTribunal(w, d2);
    assert.equal((await W.cast(w, a, 'GUILTY')).ok, true);
    const last = w.received(a, 'session_self_progress').at(-1).payload;
    assert.equal(last.dayIndex, 2);
    assert.equal(last.self.hasSubmittedTribunalVote, true);
});

test('A04-B-170 7명 판 2일 재판 표 수에 A 표가 들어감 (기권으로 안 셈)', async (t) => {
    const w = dayWorld(t, { id: 'a04b170', n: 7 });
    const [d1, d2, a] = gf.nonJokers(w.session);
    await dayWithTribunal(w, d1, a, 'NOT_GUILTY');
    await W.openTribunal(w, d2);
    // 2일엔 A만 냄, 나머지는 마감까지 안 냄 → 유죄 1이어야 A 표가 들어간 것
    assert.equal((await W.cast(w, a, 'GUILTY')).ok, true);
    w.tick(60_000);
    const resolved = W.lastResolved(w, a);
    assert.equal(resolved.dayIndex, 2);
    // 표 수는 알림에 안 실림 → 결과로 봄 (A 표가 안 들어갔다면 0:0 무죄)
    assert.equal(resolved.outcome, 'GUILTY');
});

test('A04-B-171 5명 판 A가 2일 재판에 dayIndex 1로 냄 → STALE_DAY_INDEX', async (t) => {
    const w = dayWorld(t, { id: 'a04b171', n: 5 });
    const [d1, d2, a] = gf.nonJokers(w.session);
    await dayWithTribunal(w, d1, a, 'NOT_GUILTY');
    await W.openTribunal(w, d2);
    const reply = await W.castRaw(w, a, { gameId: w.session.id, dayIndex: 1, vote: 'GUILTY' });
    assert.equal(reply.code, 'STALE_DAY_INDEX');
});

// 172~173: 1일 무죄 피고가 2일에 다시 피고 / 다른 사람이 피고 → 2일 재판은 빈 표에서 시작
[
    { label: '1일 피고가 다시 피고', second: (d1) => d1 },
    { label: '다른 사람이 피고', second: (d1, other) => other },
].forEach(({ label, second }, i) => {
    test(`A04-B-${172 + i} 6명 판 1일 무죄 뒤 2일 ${label} → 2일 재판 열림, 1일 표 하나도 안 남음`, async (t) => {
        const w = dayWorld(t, { id: `a04b${172 + i}`, n: 6 });
        const [d1, other, a] = gf.nonJokers(w.session);
        await dayWithTribunal(w, d1, a, 'NOT_GUILTY');
        const d2 = second(d1, other);
        await W.openTribunal(w, d2);
        const snap = await W.snapshot(w, a);
        assert.equal(snap.tribunal.defendantUuid, d2);
        assert.deepEqual({ kind: snap.progress.kind, doneCount: snap.progress.doneCount }, { kind: 'TRIBUNAL', doneCount: 0 });
        for (const uuid of W.tribunalVoters(w)) {
            assert.equal((await W.snapshot(w, uuid)).self.hasSubmittedTribunalVote, false, `${uuid} 1일 표가 남음`);
        }
    });
});

test('A04-B-174 6명 판 1일 처형된 B가 2일 재판 표 → PLAYER_NOT_ALIVE', async (t) => {
    const w = dayWorld(t, { id: 'a04b174', n: 6 });
    const [b, d2, a] = gf.nonJokers(w.session);
    await dayWithTribunal(w, b, a, 'GUILTY');
    await W.openTribunal(w, d2);
    const reply = await W.cast(w, b, 'NOT_GUILTY');
    assert.equal(reply.code, 'PLAYER_NOT_ALIVE');
});

// 같은 방 둘째 판: 첫 판을 광대 처형으로 끝내고 같은 사람·같은 방으로 새 판을 열어 소켓을 새 판 채널로 옮김
async function secondGame(t, id) {
    const w = dayWorld(t, { id, n: 6 });
    const joker = gf.firstOf(w.session, 'JOKER');
    const a = gf.nonJokers(w.session)[0];
    const first = w.session;
    await W.openTribunal(w, joker);
    assert.equal((await W.cast(w, a, 'GUILTY')).ok, true, '첫 판 A 표 실패');
    for (const uuid of W.tribunalVoters(w).filter((u) => u !== a)) await W.cast(w, uuid, 'GUILTY');
    w.tick(5_000);
    assert.equal(first.phase, 'ENDED');
    // 결과 화면에서 다 나가고(대기방으로) 같은 방으로 새 판
    for (const uuid of w.uuids) assert.equal((await W.leave(w, uuid)).ok, true);
    const next = gf.startGame({ id, n: 6, roleCounts: { JOKER: 1 }, settings: { dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30, tribunalTime: 60 }, gameId: `g-${id}-second` });
    for (const uuid of w.uuids) {
        const socket = w.sock(uuid);
        socket.rooms.add(next.channelId);
        socket.data.activeGameId = next.id;
    }
    return { w: { ...w, session: next, uuids: [...next.players.keys()] }, first, a };
}

test('A04-B-206 6명 판 첫 판 1일 재판에 낸 A가 같은 방 둘째 판 1일 재판 표 → 받음', async (t) => {
    const { w, a } = await secondGame(t, 'a04b206');
    W.toFirstDay(w);
    await W.openTribunal(w, gf.nonJokers(w.session).find((u) => u !== a));
    const reply = await W.cast(w, a, 'GUILTY');
    assert.equal(reply.ok, true, `거절: ${reply.code}`);
    assert.equal(reply.gameId, w.session.id);
    assert.equal(reply.dayIndex, 1);
});

test('A04-B-207 6명 판 같은 방 둘째 판 시작 → 재판 상태·표 없음, 첫 낮 단계', async (t) => {
    const { w, a } = await secondGame(t, 'a04b207');
    W.toFirstDay(w);
    const snap = await W.snapshot(w, a);
    assert.equal(snap.ok, true);
    assert.equal(snap.phase, 'DAY');
    assert.equal(snap.dayIndex, 1);
    assert.equal(snap.tribunal, undefined);
    assert.equal(snap.tribunalDeadline, undefined);
    assert.equal(snap.self.hasSubmittedTribunalVote, undefined);
});

test('A04-B-208 6명 판 둘째 판 재판 중 첫 판 gameId로 냄 → STALE_SESSION_MISMATCH 거절, 둘째 판 표 없음', async (t) => {
    const { w, first, a } = await secondGame(t, 'a04b208');
    W.toFirstDay(w);
    await W.openTribunal(w, gf.nonJokers(w.session).find((u) => u !== a));
    const reply = await W.castRaw(w, a, { gameId: first.id, dayIndex: 1, vote: 'GUILTY' });
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'STALE_SESSION_MISMATCH');
    assert.equal((await W.snapshot(w, a)).progress.doneCount, 0);
});
