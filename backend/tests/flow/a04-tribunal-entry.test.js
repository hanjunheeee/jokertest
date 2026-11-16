'use strict';

// 재판 들어가기·마감 흐름 시험: 낮 투표 → 재판 진입 알림, 재판 시간대로 마감, 마감에 낸 표만 셈 (가짜 소켓·가짜 시계)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-101~120, 219, 220, 223, 224
const test = require('node:test');
const assert = require('node:assert/strict');

const W = require('./a04-world');

const { gf } = W;

// 첫 낮까지 차린 판 + 피고(첫 시민)
function tribunalWorld(t, spec) {
    const w = W.toFirstDay(W.setupWorld(t, spec));
    return { w, defendant: gf.nonJokers(w.session)[0] };
}

// 101~106: 판 전원이 재판 진입 알림(같은 피고·마감 = 진입 + 재판 시간)
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    test(`A04-B-${101 + i} ${n}명 판 낮 투표 최다 1명 > 기권 → 판 전원 day_vote_resolved TRIBUNAL·같은 피고·마감 = 지금 + 재판 60초`, async (t) => {
        const { w, defendant } = tribunalWorld(t, { id: `a04e${n}`, n, settings: { tribunalTime: 60 } });
        const enteredAt = await W.openTribunal(w, defendant);
        for (const uuid of w.uuids) {
            const resolved = w.received(uuid, 'day_vote_resolved');
            assert.equal(resolved.length, 1, `${uuid} 재판 진입 알림 수`);
            assert.equal(resolved[0].payload.outcome, 'TRIBUNAL');
            assert.equal(resolved[0].payload.tribunalTargetUuid, defendant);
            assert.equal(resolved[0].payload.tribunalDeadline, enteredAt + 60_000);
        }
    });
});

// 107~110: 재판 시간 설정대로 마감 (그 시각 전엔 판정 없음)
[
    { label: '재판 15초', settings: { tribunalTime: 15 }, ms: 15_000 },
    { label: '재판 60초', settings: { tribunalTime: 60 }, ms: 60_000 },
    { label: '재판 120초', settings: { tribunalTime: 120 }, ms: 120_000 },
    { label: '재판 칸 없음 + 낮 투표 90초', settings: { dayVoteTime: 90 }, ms: 90_000 },
].forEach(({ label, settings, ms }, i) => {
    test(`A04-B-${107 + i} 7명 판 ${label} → 그 시각 전엔 판정 없음, 그 시각에 tribunal_vote_resolved`, async (t) => {
        const { w, defendant } = tribunalWorld(t, { id: `a04t${i}`, n: 7, settings });
        await W.openTribunal(w, defendant);
        const watcher = w.uuids[0];
        w.tick(ms - 1);
        assert.equal(W.countFor(w, watcher, 'tribunal_vote_resolved'), 0);
        w.tick(1);
        assert.equal(W.countFor(w, watcher, 'tribunal_vote_resolved'), 1);
    });
});

// 111~114: 마감까지 표 0 → 무죄 0:0, 처형 없음, 밤
[5, 7, 8, 10].forEach((n, i) => {
    test(`A04-B-${111 + i} ${n}명 판 마감까지 표 0 → NOT_GUILTY·처형 없음, 밤`, async (t) => {
        const { w, defendant } = tribunalWorld(t, { id: `a04z${n}`, n, settings: { tribunalTime: 30 } });
        await W.openTribunal(w, defendant);
        w.tick(30_000);
        const resolved = W.lastResolved(w, w.uuids[0]);
        assert.equal(resolved.outcome, 'NOT_GUILTY');
        assert.equal(resolved.executedUuid, null);
        assert.equal(resolved.phase, 'NIGHT');
    });
});

// 115~120: 일부만 냄 → 마감에 낸 표만 셈
[
    { n: 6, guilty: 2, notGuilty: 1, outcome: 'GUILTY' },
    { n: 7, guilty: 1, notGuilty: 0, outcome: 'GUILTY' },
    { n: 8, guilty: 2, notGuilty: 2, outcome: 'NOT_GUILTY' },
    { n: 10, guilty: 0, notGuilty: 1, outcome: 'NOT_GUILTY' },
    { n: 5, guilty: 1, notGuilty: 1, outcome: 'NOT_GUILTY' },
    { n: 9, guilty: 3, notGuilty: 2, outcome: 'GUILTY' },
].forEach(({ n, guilty, notGuilty, outcome }, i) => {
    const idle = n - 1 - guilty - notGuilty;
    test(`A04-B-${115 + i} ${n}명 판 유죄 ${guilty}·무죄 ${notGuilty}·안 냄 ${idle} → 마감에 낸 표만 세어 ${outcome}`, async (t) => {
        const { w, defendant } = tribunalWorld(t, { id: `a04p${i}`, n, settings: { tribunalTime: 30 } });
        await W.openTribunal(w, defendant);
        const list = W.tribunalVoters(w);
        for (const uuid of list.slice(0, guilty)) assert.equal((await W.cast(w, uuid, 'GUILTY')).ok, true);
        for (const uuid of list.slice(guilty, guilty + notGuilty)) assert.equal((await W.cast(w, uuid, 'NOT_GUILTY')).ok, true);
        w.tick(30_000);
        const resolved = W.lastResolved(w, w.uuids[0]);
        // 표 수는 알림에 안 실림 → 결과로 봄 (안 낸 사람을 유죄나 무죄로 셌다면 결과가 뒤집히는 표 모양)
        assert.equal(resolved.outcome, outcome);
        assert.equal(resolved.executedUuid, outcome === 'GUILTY' ? defendant : null);
    });
});

test('A04-B-219 6명 판 재판 진입 뒤 원래 낮 마감 시각 → 낮 판정 알림 0번 더', async (t) => {
    const { w, defendant } = tribunalWorld(t, { id: 'a04d219', n: 6, settings: { tribunalTime: 60 } });
    // 낮 투표 30초 시작 시각 = 지금 + 토론 30초, 원래 낮 마감 = 그 + 30초
    const originalDayDeadline = Date.now() + 30_000 + 30_000;
    await W.openTribunal(w, defendant);
    w.tick(originalDayDeadline - Date.now() + 1);
    assert.equal(w.session.phase, 'TRIBUNAL');
    for (const uuid of w.uuids) assert.equal(W.countFor(w, uuid, 'day_vote_resolved'), 1);
});

test('A04-B-220 7명 판 1표 6기권으로 밤(재판 없음) → 재판 표 INVALID_PHASE', async (t) => {
    const { w } = tribunalWorld(t, { id: 'a04d220', n: 7 });
    const [target, voter] = gf.nonJokers(w.session);
    W.startDayVote(w);
    for (const uuid of w.uuids) {
        assert.equal((await W.dayVote(w, uuid, uuid === voter ? target : null)).ok, true);
    }
    w.tick(5_000);
    assert.equal(w.session.phase, 'NIGHT');
    const reply = await W.cast(w, voter, 'GUILTY');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'INVALID_PHASE');
});

test('A04-B-223 7명 판 2일 재판 진입 → tribunalDeadline = 2일 진입 시각 + 재판 시간', async (t) => {
    const { w, defendant } = tribunalWorld(t, { id: 'a04d223', n: 7, settings: { tribunalTime: 45 } });
    // 1일 재판은 아무도 안 내 무죄 → 밤 → 2일
    await W.openTribunal(w, defendant);
    w.tick(45_000);
    W.nightToDay(w);
    assert.equal(w.session.dayIndex, 2);
    const enteredAt = await W.openTribunal(w, gf.nonJokers(w.session)[1]);
    const [, second] = w.received(w.uuids[0], 'day_vote_resolved').filter((e) => e.payload.outcome === 'TRIBUNAL');
    assert.equal(second.payload.dayIndex, 2);
    assert.equal(second.payload.tribunalDeadline, enteredAt + 45_000);
});

test('A04-B-224 6명 판 재판 60초: 낮 투표 다 차 5초 뒤 재판 → 재판 마감 = 진입 + 60초', async (t) => {
    const { w, defendant } = tribunalWorld(t, { id: 'a04d224', n: 6, settings: { tribunalTime: 60 } });
    const enteredAt = await W.openTribunal(w, defendant);
    const snap = await W.snapshot(w, w.uuids[0]);
    assert.equal(snap.tribunalDeadline, enteredAt + 60_000);
    // 진입 + 60초 직전엔 판정 없음, 60초에 판정
    w.tick(59_999);
    assert.equal(W.countFor(w, w.uuids[0], 'tribunal_vote_resolved'), 0);
    w.tick(1);
    assert.equal(W.countFor(w, w.uuids[0], 'tribunal_vote_resolved'), 1);
});
