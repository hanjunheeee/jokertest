'use strict';

// 낮 투표 진행 수(낸 사람 수/산 사람 수)를 표가 들어올 때마다 판 전원 각자에게 보내는지 서버 흐름 시험
// 표 대상·낸 사람이 안 새는지, 바꾸기·기권 바꾸기에 두 번 안 세는지, 죽은 사람·스냅샷·나간 사람 분모까지 봄 (사용자 결정 2026-11-18)
// 목록 A03-낮투표.md 번호 A03-B-323~330
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./a03-day-harness');

// 그 사람이 받은 내 진행 알림 수 (지금까지)
const progressCount = (g, uuid) => g.got(uuid, 'session_self_progress').length;
// 그 사람이 받은 마지막 진행 숫자
const lastProgress = (g, uuid) => g.got(uuid, 'session_self_progress').at(-1)?.progress ?? null;
// 전원 받은 알림 수 적어 두기 (뒤에 새로 받은 것만 보려고)
const countsOf = (g) => new Map(g.ids.map((u) => [u, progressCount(g, u)]));
// 적어 둔 뒤 새로 받은 진행 알림
const addedSince = (g, before, uuid) => g.got(uuid, 'session_self_progress').slice(before.get(uuid));

test('A03-B-323 7명 판(1명 죽음) 한 명이 표 냄 → 산 사람·죽은 사람 모두 진행 알림 1번, 숫자 1/6', async (t) => {
    const g = H.setup(t, { id: 'b323', n: 7, deaths: 1 });
    g.toVote();
    assert.equal(g.dead().length, 1);
    const [A, X] = g.aliveNonJokers();
    const before = countsOf(g);
    assert.equal((await g.vote(A, X)).ok, true);
    for (const uuid of g.ids) {
        const added = addedSince(g, before, uuid);
        assert.equal(added.length, 1, `${uuid} 받은 수`);
        assert.deepEqual(added[0].progress, { kind: 'DAY_VOTE', doneCount: 1, requiredCount: 6 }, `${uuid} 숫자`);
    }
});

test('A03-B-324 7명 판 A가 Z 찍음 → A 말고 다른 사람이 받은 진행 알림에 A·Z uuid 없음, 숫자 칸은 셋뿐', async (t) => {
    const g = H.setup(t, { id: 'b324', n: 7 });
    g.toVote();
    const [A, Z] = g.aliveNonJokers();
    const before = countsOf(g);
    assert.equal((await g.vote(A, Z)).ok, true);
    // A 자신은 자기 표 대상을 봄
    assert.equal(addedSince(g, before, A).at(-1).self.dayVoteTargetUuid, Z);
    for (const uuid of g.ids.filter((u) => u !== A)) {
        for (const payload of addedSince(g, before, uuid)) {
            assert.deepEqual(H.pathsOf(payload, A), [], `${uuid} 알림에 낸 사람 A`);
            assert.deepEqual(H.pathsOf(payload, Z), [], `${uuid} 알림에 표 대상 Z`);
            assert.deepEqual(Object.keys(payload.progress).sort(), ['doneCount', 'kind', 'requiredCount']);
            // 받는 사람 자기 표 칸은 아직 안 냈음
            assert.equal(payload.self.hasSubmittedDayVote, false);
            assert.equal(payload.self.dayVoteTargetUuid, null);
        }
    }
});

test('A03-B-325 6명 판 세 명이 차례로 냄 → 다른 사람 숫자 1·2·3으로 늘어남', async (t) => {
    const g = H.setup(t, { id: 'b325', n: 6 });
    g.toVote();
    const alive = g.alive();
    const [a, b, c, watcher] = alive;
    const seen = [];
    for (const [voter, target] of [[a, b], [b, null], [c, a]]) {
        assert.equal((await g.vote(voter, target)).ok, true);
        seen.push(lastProgress(g, watcher).doneCount);
    }
    assert.deepEqual(seen, [1, 2, 3]);
    assert.equal(lastProgress(g, watcher).requiredCount, 6);
});

test('A03-B-326 6명 판 같은 사람이 표 바꿈·기권으로 바꿈 → 숫자 1 그대로 (두 번 안 셈)', async (t) => {
    const g = H.setup(t, { id: 'b326', n: 6 });
    g.toVote();
    const [A, X, Y, watcher] = g.aliveNonJokers().concat(g.jokers());
    const seen = [];
    for (const target of [X, Y, null, X]) {
        assert.equal((await g.vote(A, target)).ok, true);
        seen.push(lastProgress(g, watcher).doneCount);
    }
    assert.deepEqual(seen, [1, 1, 1, 1]);
});

test('A03-B-327 7명 판(1명 죽음) 두 명 낸 뒤 스냅샷 → 산 사람·죽은 사람 모두 숫자 2/6', async (t) => {
    const g = H.setup(t, { id: 'b327', n: 7, deaths: 1 });
    g.toVote();
    const [A, B, X] = g.aliveNonJokers();
    await g.vote(A, X);
    await g.vote(B, null);
    for (const uuid of [g.dead()[0], X]) {
        const snap = await g.snapshot(uuid);
        assert.equal(snap.ok, true);
        assert.deepEqual(snap.progress, { kind: 'DAY_VOTE', doneCount: 2, requiredCount: 6 }, `${uuid} 스냅샷`);
    }
});

test('A03-B-328 7명 판 안 낸 사람이 나감 → 남은 사람 숫자 분모 6, 낸 수 그대로', async (t) => {
    const g = H.setup(t, { id: 'b328', n: 7, settings: { dayVoteTime: 90 } });
    g.toVote();
    const [A, X, leaver] = g.aliveNonJokers();
    await g.vote(A, X);
    assert.equal((await g.leave(leaver)).ok, true);
    for (const uuid of g.ids.filter((u) => u !== leaver)) {
        assert.deepEqual(lastProgress(g, uuid), { kind: 'DAY_VOTE', doneCount: 1, requiredCount: 6 }, `${uuid} 숫자`);
    }
});

test('A03-B-329 7명 판 낸 사람이 나감 → 남은 사람 숫자 0/6 (나간 사람 표 빠짐)', async (t) => {
    const g = H.setup(t, { id: 'b329', n: 7, settings: { dayVoteTime: 90 } });
    g.toVote();
    const [A, X] = g.aliveNonJokers();
    await g.vote(A, X);
    assert.equal((await g.leave(A)).ok, true);
    for (const uuid of g.ids.filter((u) => u !== A)) {
        assert.deepEqual(lastProgress(g, uuid), { kind: 'DAY_VOTE', doneCount: 0, requiredCount: 6 }, `${uuid} 숫자`);
    }
});

test('A03-B-330 6명 판(1명 죽음) 투표로 넘어갈 때 판 전원 day_phase_changed에 숫자 0/5 (사람 uuid 없음)', async (t) => {
    const g = H.setup(t, { id: 'b330', n: 6, deaths: 1 });
    g.toVote();
    for (const uuid of g.ids) {
        const changed = g.got(uuid, 'day_phase_changed').at(-1);
        assert.deepEqual(changed.progress, { kind: 'DAY_VOTE', doneCount: 0, requiredCount: 5 }, `${uuid} 숫자`);
        for (const other of g.ids) assert.deepEqual(H.pathsOf(changed, other), []);
    }
});
