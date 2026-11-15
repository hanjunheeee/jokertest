'use strict';

// 재판 "다 누르면 5초 뒤 판정" 흐름 시험: 마감 당김 알림·남은 시간 짧으면 원래 마감·끊김·나감·한 번만 (가짜 소켓·가짜 시계)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-121~145, 209~214, 221, 222
const test = require('node:test');
const assert = require('node:assert/strict');

const W = require('./a04-world');

const { gf } = W;

// 첫 낮까지 차린 판 + 피고(첫 시민) + 재판 진입
async function openWorld(t, spec) {
    const w = W.toFirstDay(W.setupWorld(t, spec));
    const defendant = gf.nonJokers(w.session)[0];
    const enteredAt = await W.openTribunal(w, defendant);
    return { w, defendant, enteredAt };
}

// 투표할 사람 전원이 같은 표를 냄 (낸 순서 그대로)
async function castAll(w, uuids, vote = 'GUILTY') {
    for (const uuid of uuids) {
        const reply = await W.cast(w, uuid, vote);
        assert.equal(reply.ok, true, `재판 표 실패(${uuid}): ${reply.code}`);
    }
}

// 아직 판정 없음 / 판정 1번 (판정 알림 수로 봄)
const resolvedCount = (w, uuid) => W.countFor(w, uuid, 'tribunal_vote_resolved');

// 121~126: 마지막 표 순간 판 전원에 당김 알림(지금+5초), 4.9초엔 판정 없음, 5초에 판정
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    test(`A04-B-${121 + i} ${n}명 판 재판 120초, 마지막 표 → 판 전원 phase_settle_started(TRIBUNAL·지금+5초), 4.9초 판정 없음·5초 판정`, async (t) => {
        const { w } = await openWorld(t, { id: `a04s${n}`, n, settings: { tribunalTime: 120 } });
        const list = W.tribunalVoters(w);
        await castAll(w, list.slice(0, -1));
        const lastAt = Date.now();
        await castAll(w, list.slice(-1));
        for (const uuid of w.uuids) {
            const settles = W.tribunalSettles(w, uuid);
            assert.equal(settles.length, 1, `${uuid} 당김 알림 수`);
            assert.deepEqual(settles[0].payload, {
                gameId: w.session.id, phase: 'TRIBUNAL', dayIndex: 1, role: null, deadline: lastAt + 5_000,
            });
        }
        w.tick(4_900);
        assert.equal(resolvedCount(w, w.uuids[0]), 0);
        w.tick(100);
        assert.equal(resolvedCount(w, w.uuids[0]), 1);
    });
});

// 127~131: 다 찬 순간 남은 시간 6초·5.001초 → 지금+5초 / 5초·4초·1초 → 원래 마감 그대로
[
    { remaining: 6_000, pulled: true },
    { remaining: 5_001, pulled: true },
    { remaining: 5_000, pulled: null },
    { remaining: 4_000, pulled: false },
    { remaining: 1_000, pulled: false },
].forEach(({ remaining, pulled }, i) => {
    const label = pulled === true ? '마감 지금+5초' : pulled === false ? '마감 안 바뀜·원래 마감에 판정' : '판정 시각만 봄';
    test(`A04-B-${127 + i} 8명 판 다 찬 순간 남은 ${remaining / 1000}초 → ${label}`, async (t) => {
        const { w, enteredAt } = await openWorld(t, { id: `a04r${i}`, n: 8, settings: { tribunalTime: 120 } });
        const deadline = enteredAt + 120_000;
        const list = W.tribunalVoters(w);
        await castAll(w, list.slice(0, -1));
        w.tick(deadline - remaining - Date.now());
        const lastAt = Date.now();
        await castAll(w, list.slice(-1));
        const watcher = w.uuids[0];
        if (pulled === true) {
            assert.equal(W.tribunalSettles(w, watcher).at(-1)?.payload.deadline, lastAt + 5_000);
            w.tick(4_999);
            assert.equal(resolvedCount(w, watcher), 0);
            w.tick(1);
            assert.equal(resolvedCount(w, watcher), 1);
            return;
        }
        if (pulled === false) assert.equal(W.tribunalSettles(w, watcher).length, 0);
        // 원래 마감에 판정
        w.tick(deadline - Date.now() - 1);
        assert.equal(resolvedCount(w, watcher), 0);
        w.tick(1);
        assert.equal(resolvedCount(w, watcher), 1);
    });
});

test('A04-B-132 6명 판 다 찬 뒤 투표자 1명 나감(다시 다 참) → 마감 안 늘어남, phase_settle_started 1번', async (t) => {
    const { w } = await openWorld(t, { id: 'a04s132', n: 6, settings: { tribunalTime: 120 } });
    const list = W.tribunalVoters(w);
    const settledAt = Date.now();
    await castAll(w, list);
    w.tick(1_000);
    const leaver = list.find((u) => u !== gf.firstOf(w.session, 'JOKER'));
    assert.equal((await W.leave(w, leaver)).ok, true);
    const watcher = gf.firstOf(w.session, 'JOKER');
    assert.equal(W.tribunalSettles(w, watcher).length, 1);
    // 처음 당긴 마감(settledAt+5초)에 판정
    w.tick(settledAt + 5_000 - Date.now() - 1);
    assert.equal(resolvedCount(w, watcher), 0);
    w.tick(1);
    assert.equal(resolvedCount(w, watcher), 1);
});

// 133~135: 끊겨 기다리는 1명만 안 냄 → 알림 없음, 원래 마감에 판정 (그 사람 기권)
[6, 8, 10].forEach((n, i) => {
    test(`A04-B-${133 + i} ${n}명 판 끊긴 1명만 안 냄 → 당김 알림 없음, 원래 마감에 판정, 그 사람 기권`, async (t) => {
        const { w, enteredAt } = await openWorld(t, { id: `a04c${n}`, n, settings: { tribunalTime: 30 } });
        const list = W.tribunalVoters(w);
        const away = list.find((u) => u !== gf.firstOf(w.session, 'JOKER'));
        await W.disconnect(w, away);
        await castAll(w, list.filter((u) => u !== away));
        const watcher = gf.firstOf(w.session, 'JOKER');
        assert.equal(W.tribunalSettles(w, watcher).length, 0);
        w.tick(enteredAt + 30_000 - Date.now() - 1);
        assert.equal(resolvedCount(w, watcher), 0);
        w.tick(1);
        const resolved = W.lastResolved(w, watcher);
        assert.deepEqual(resolved.counts, { guilty: list.length - 1, notGuilty: 0 });
    });
});

// 136~138: 안 낸 1명이 나가서 다 참 → 그 순간 지금+5초·알림, 5초 뒤 판정
[5, 7, 9].forEach((n, i) => {
    test(`A04-B-${136 + i} ${n}명 판 안 낸 1명 나감 → 그 순간 마감 지금+5초·알림, 5초 뒤 판정`, async (t) => {
        const { w } = await openWorld(t, { id: `a04l${n}`, n, settings: { tribunalTime: 120 } });
        const list = W.tribunalVoters(w);
        const leaver = list.find((u) => u !== gf.firstOf(w.session, 'JOKER'));
        await castAll(w, list.filter((u) => u !== leaver));
        const watcher = gf.firstOf(w.session, 'JOKER');
        assert.equal(W.tribunalSettles(w, watcher).length, 0);
        const leftAt = Date.now();
        assert.equal((await W.leave(w, leaver)).ok, true);
        assert.equal(W.tribunalSettles(w, watcher).at(-1)?.payload.deadline, leftAt + 5_000);
        w.tick(4_999);
        assert.equal(resolvedCount(w, watcher), 0);
        w.tick(1);
        assert.equal(resolvedCount(w, watcher), 1);
    });
});

test('A04-B-139 7명 판(죽은 2명) 산 투표자 4명만 냄 → 다 찬 것으로 5초 당김', async (t) => {
    const w = W.setupWorld(t, { id: 'a04s139', n: 7, settings: { tribunalTime: 120 } });
    const [deadA, deadB, defendant] = gf.nonJokers(w.session);
    W.killAtNights(w, [deadA, deadB]);
    await W.openTribunal(w, defendant);
    const list = W.tribunalVoters(w);
    assert.equal(list.length, 4);
    const lastAt = Date.now();
    await castAll(w, list);
    const watcher = gf.firstOf(w.session, 'JOKER');
    assert.equal(W.tribunalSettles(w, watcher).at(-1)?.payload.deadline, lastAt + 5_000);
    w.tick(5_000);
    assert.equal(resolvedCount(w, watcher), 1);
});

test('A04-B-140 6명 판 다 찬 뒤 같은 사람이 무죄로 다시 → TRIBUNAL_VOTE_ALREADY_SUBMITTED, 마감·결과 그대로', async (t) => {
    const { w } = await openWorld(t, { id: 'a04s140', n: 6, settings: { tribunalTime: 120 } });
    const list = W.tribunalVoters(w);
    const settledAt = Date.now();
    await castAll(w, list);
    const again = await W.cast(w, list[0], 'NOT_GUILTY');
    assert.equal(again.code, 'TRIBUNAL_VOTE_ALREADY_SUBMITTED');
    const watcher = gf.firstOf(w.session, 'JOKER');
    const settles = W.tribunalSettles(w, watcher);
    assert.equal(settles.length, 1);
    assert.equal(settles[0].payload.deadline, settledAt + 5_000);
    w.tick(5_000);
    const resolved = W.lastResolved(w, watcher);
    assert.equal(resolved.outcome, 'GUILTY');
    assert.deepEqual(resolved.counts, { guilty: 5, notGuilty: 0 });
});

test('A04-B-141 8명 판 당김 뒤 2초에 피고 나감 → 바로 CANCELLED, 5초 시각에 두 번째 판정 없음', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04s141', n: 8, settings: { tribunalTime: 120 } });
    await castAll(w, W.tribunalVoters(w));
    w.tick(2_000);
    assert.equal((await W.leave(w, defendant)).ok, true);
    const watcher = gf.firstOf(w.session, 'JOKER');
    assert.equal(resolvedCount(w, watcher), 1);
    assert.equal(W.lastResolved(w, watcher).outcome, 'CANCELLED');
    w.tick(3_000);
    assert.equal(resolvedCount(w, watcher), 1);
});

test('A04-B-142 5명 판 다 찬 뒤 resolve_tribunal_vote 보냄 → 판정 안 당겨짐, 5초 시각에 판정 1번', async (t) => {
    const { w } = await openWorld(t, { id: 'a04s142', n: 5, settings: { tribunalTime: 120 } });
    const list = W.tribunalVoters(w);
    await castAll(w, list);
    // 화면이 옛 요청을 보낸 것처럼: 등록된 핸들러로 사건을 흘림
    const sender = list[0];
    W.gs.registerGameHandlers(w.io, w.sock(sender), sender);
    w.sock(sender).trigger('resolve_tribunal_vote', { gameId: w.session.id, dayIndex: w.session.dayIndex }, () => {});
    const watcher = gf.firstOf(w.session, 'JOKER');
    assert.equal(resolvedCount(w, watcher), 0);
    w.tick(5_000);
    assert.equal(resolvedCount(w, watcher), 1);
});

test('A04-B-143 7명 판(죽은 2명) 마감 당김 알림 → 산 투표자·피고·죽은 사람 2명 모두 받음', async (t) => {
    const w = W.setupWorld(t, { id: 'a04s143', n: 7, settings: { tribunalTime: 120 } });
    const [deadA, deadB, defendant] = gf.nonJokers(w.session);
    W.killAtNights(w, [deadA, deadB]);
    await W.openTribunal(w, defendant);
    await castAll(w, W.tribunalVoters(w));
    for (const uuid of w.uuids) assert.equal(W.tribunalSettles(w, uuid).length, 1, `${uuid} 못 받음`);
});

test('A04-B-144 5명 판·6명 판 둘: 한 판 재판이 다 참 → 다른 판 사람은 phase_settle_started 0번', async (t) => {
    const [a, b] = W.setupWorlds(t, [
        { id: 'a04s144a', n: 5, settings: { tribunalTime: 120 } },
        { id: 'a04s144b', n: 6, settings: { tribunalTime: 120 } },
    ]);
    W.toFirstDay(a);
    W.toFirstDay(b);
    await W.openTribunal(a, gf.nonJokers(a.session)[0]);
    await castAll(a, W.tribunalVoters(a));
    assert.equal(W.tribunalSettles(a, a.uuids[0]).length, 1);
    for (const uuid of b.uuids) assert.equal(W.countFor(b, uuid, 'phase_settle_started'), 0);
});

test('A04-B-145 6명 판 당김 뒤 get_session_snapshot → tribunalDeadline = 당긴 시각', async (t) => {
    const { w } = await openWorld(t, { id: 'a04s145', n: 6, settings: { tribunalTime: 120 } });
    const settledAt = Date.now();
    await castAll(w, W.tribunalVoters(w));
    const snap = await W.snapshot(w, w.uuids[0]);
    assert.equal(snap.ok, true);
    assert.equal(snap.tribunalDeadline, settledAt + 5_000);
});

test('A04-B-209 5명 판 재판 15초, 남은 10초에 다 참 → 마감 지금+5초', async (t) => {
    const { w } = await openWorld(t, { id: 'a04s209', n: 5, settings: { tribunalTime: 15 } });
    w.tick(5_000);
    const lastAt = Date.now();
    await castAll(w, W.tribunalVoters(w));
    assert.equal(W.tribunalSettles(w, w.uuids[0]).at(-1)?.payload.deadline, lastAt + 5_000);
});

test('A04-B-210 7명 판 다 찬 뒤 판정 → 유죄+무죄 = 투표할 사람 수 (기권 없음)', async (t) => {
    const { w } = await openWorld(t, { id: 'a04s210', n: 7, settings: { tribunalTime: 120 } });
    const list = W.tribunalVoters(w);
    await castAll(w, list.slice(0, 4), 'GUILTY');
    await castAll(w, list.slice(4), 'NOT_GUILTY');
    w.tick(5_000);
    const { counts } = W.lastResolved(w, w.uuids[0]);
    assert.equal(counts.guilty + counts.notGuilty, list.length);
});

test('A04-B-211 8명 판 남은 2명이 같은 차례에 냄 → phase_settle_started 1번, 판정 1번', async (t) => {
    const { w } = await openWorld(t, { id: 'a04s211', n: 8, settings: { tribunalTime: 120 } });
    const list = W.tribunalVoters(w);
    await castAll(w, list.slice(0, -2));
    // 시계를 안 넘기고 두 표를 한꺼번에 보냄
    const [x, y] = list.slice(-2);
    const replies = await Promise.all([W.cast(w, x, 'GUILTY'), W.cast(w, y, 'GUILTY')]);
    assert.deepEqual(replies.map((r) => r.ok), [true, true]);
    for (const uuid of w.uuids) assert.equal(W.tribunalSettles(w, uuid).length, 1);
    w.tick(5_000);
    for (const uuid of w.uuids) assert.equal(resolvedCount(w, uuid), 1);
});

test('A04-B-212 6명 판 판정 바로 뒤 남은 표 → INVALID_PHASE', async (t) => {
    const { w } = await openWorld(t, { id: 'a04s212', n: 6, settings: { tribunalTime: 30 } });
    const list = W.tribunalVoters(w);
    await castAll(w, list.slice(0, -1));
    w.tick(30_000);
    assert.equal(resolvedCount(w, w.uuids[0]), 1);
    const late = await W.cast(w, list.at(-1), 'GUILTY');
    assert.equal(late.code, 'INVALID_PHASE');
});

test('A04-B-213 7명 판 끊겼던 C가 돌아와 마지막 표 → 그 순간 5초 당김', async (t) => {
    const { w } = await openWorld(t, { id: 'a04s213', n: 7, settings: { tribunalTime: 120 } });
    const list = W.tribunalVoters(w);
    const away = list.find((u) => u !== gf.firstOf(w.session, 'JOKER'));
    await W.disconnect(w, away);
    await castAll(w, list.filter((u) => u !== away));
    const watcher = gf.firstOf(w.session, 'JOKER');
    assert.equal(W.tribunalSettles(w, watcher).length, 0);
    w.tick(10_000);
    assert.equal((await W.reconnect(w, away)).ok, true);
    const lastAt = Date.now();
    assert.equal((await W.cast(w, away, 'NOT_GUILTY')).ok, true);
    assert.equal(W.tribunalSettles(w, watcher).at(-1)?.payload.deadline, lastAt + 5_000);
});

test('A04-B-214 8명 판 재판 중 죽은 사람 끊김 → 산 투표자만 다 내면 5초', async (t) => {
    const w = W.setupWorld(t, { id: 'a04s214', n: 8, settings: { tribunalTime: 120 } });
    const [dead, defendant] = gf.nonJokers(w.session);
    W.killAtNights(w, [dead]);
    await W.openTribunal(w, defendant);
    await W.disconnect(w, dead);
    const lastAt = Date.now();
    await castAll(w, W.tribunalVoters(w));
    const watcher = gf.firstOf(w.session, 'JOKER');
    assert.equal(W.tribunalSettles(w, watcher).at(-1)?.payload.deadline, lastAt + 5_000);
    w.tick(5_000);
    assert.equal(resolvedCount(w, watcher), 1);
});

test('A04-B-221 6명 판 1일에 이미 당긴 판, 2일 재판 다 참 → 다시 5초 당김·알림', async (t) => {
    const { w } = await openWorld(t, { id: 'a04s221', n: 6, settings: { tribunalTime: 60 } });
    await castAll(w, W.tribunalVoters(w), 'NOT_GUILTY');
    w.tick(5_000);
    W.nightToDay(w);
    await W.openTribunal(w, gf.nonJokers(w.session)[1]);
    const lastAt = Date.now();
    await castAll(w, W.tribunalVoters(w), 'NOT_GUILTY');
    const settles = W.tribunalSettles(w, w.uuids[0]);
    assert.equal(settles.length, 2);
    assert.equal(settles[1].payload.dayIndex, 2);
    assert.equal(settles[1].payload.deadline, lastAt + 5_000);
});

test('A04-B-222 8명 판 1·2일 당긴 판, 3일 다 참 → 5초 당김', async (t) => {
    const { w } = await openWorld(t, { id: 'a04s222', n: 8, settings: { tribunalTime: 60 } });
    await castAll(w, W.tribunalVoters(w), 'NOT_GUILTY');
    w.tick(5_000);
    for (const day of [2, 3]) {
        W.nightToDay(w);
        await W.openTribunal(w, gf.nonJokers(w.session)[day - 1]);
        const lastAt = Date.now();
        await castAll(w, W.tribunalVoters(w), 'NOT_GUILTY');
        const settle = W.tribunalSettles(w, w.uuids[0]).at(-1);
        assert.equal(settle.payload.dayIndex, day);
        assert.equal(settle.payload.deadline, lastAt + 5_000);
        w.tick(5_000);
    }
    assert.equal(W.tribunalSettles(w, w.uuids[0]).length, 3);
});
