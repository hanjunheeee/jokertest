'use strict';

// 끊겼다 다시 붙은 사람이 받는 스냅샷 흐름 시험 — 지금 단계·남은 시간·내 직업·동료·낸 것·끊긴 동안 생긴 일, 다시 붙은 뒤 표·밤 고르기
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-132~155, 돌리기: node --env-file=.env.test --test tests/flow/a09-reconnect-snapshot.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a09-grace-harness');

const { core } = H;

// 마감 시각을 싣는 판 방송 이름 (사람들이 받은 마지막 값과 스냅샷을 맞춰 봄)
const DAY_DEADLINE_EVENTS = new Set(['game_phase_changed', 'day_phase_changed', 'phase_settle_started', 'day_vote_resolved']);

// 그 사람이 받은 판 방송 중 마지막 마감 값 (스냅샷 단계에 맞는 것)
function lastBroadcast(w, uuid, phase) {
    const received = (w.world.history.get(uuid) ?? []).flatMap((s) => s.received);
    if (phase === 'NIGHT') {
        // 마지막 차례 시작 뒤에 온 당김 알림만 (앞 차례 당김은 안 셈)
        const startIndex = received.findLastIndex((e) => e.event === 'night_turn_started');
        const started = received[startIndex].payload;
        const settled = received.slice(startIndex)
            .filter((e) => e.event === 'phase_settle_started' && e.payload.phase === 'NIGHT').at(-1)?.payload;
        return { dayIndex: started.dayIndex, nightTurnRole: started.role, nightTurnDeadline: settled?.deadline ?? started.deadline };
    }
    const key = phase === 'TRIBUNAL' ? 'tribunalDeadline' : 'dayPhaseDeadline';
    const last = received.filter((e) => DAY_DEADLINE_EVENTS.has(e.event) && (e.payload?.[key] !== undefined
        || (e.event === 'phase_settle_started' && e.payload.phase === (phase === 'TRIBUNAL' ? 'TRIBUNAL' : 'DAY')))).at(-1).payload;
    return { dayIndex: last.dayIndex, [key]: last[key] ?? last.deadline, ...(last.dayPhase ? { dayPhase: last.dayPhase } : {}) };
}

// 끊긴 단계 6가지 (a09-grace-60s와 같은 차림)
const PHASES = [
    ['A09-B-132', '역할 확인', 5, { JOKER: 1 }, async (w) => w.nonJokers()[0]],
    ['A09-B-133', '토론', 6, { JOKER: 1 }, async (w) => { w.toDay(); return w.nonJokers()[0]; }],
    ['A09-B-134', '투표', 7, { JOKER: 1 }, async (w) => { w.toVote(); return w.nonJokers()[0]; }],
    ['A09-B-135', '재판', 8, { JOKER: 1 }, async (w) => { await w.toTribunal(w.nonJokers()[1]); return w.nonJokers()[0]; }],
    ['A09-B-136', '밤 내 차례', 10, { JOKER: 2, DOCTOR: 1, GUARD: 1 }, async (w) => {
        w.toDay();
        await w.toNight();
        await w.untilTurn('DOCTOR');
        return w.firstOf('DOCTOR');
    }],
    ['A09-B-137', '밤 남 차례', 6, { JOKER: 1, DOCTOR: 1 }, async (w) => {
        w.toDay();
        await w.toNight();
        return w.byRole('CITIZEN')[0];
    }],
];
for (const [no, label, n, roleCounts, reach] of PHASES) {
    test(`${no} ${n}명 판 ${label}에 끊김, 30초 뒤 스냅샷 → 단계·날짜·마감 시각 = 판 사람들이 받은 마지막 방송 값, 남은 시간 > 0`, async (t) => {
        const w = H.setup(t, { id: `a09rs${no.slice(-3)}`, n, roleCounts });
        const x = await reach(w);
        const at = w.now();
        await w.disconnect(x);
        w.advanceTo(at + 30_000);
        const snap = await w.reconnect(x);
        assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
        const watcher = w.others(x).find((u) => w.isAlive(u) && w.connected(u));
        const expected = lastBroadcast(w, watcher, snap.phase);
        const picked = Object.fromEntries(Object.keys(expected).map((k) => [k, snap[k]]));
        assert.deepEqual(picked, expected);
        const deadline = snap.dayPhaseDeadline ?? snap.tribunalDeadline ?? snap.nightTurnDeadline;
        assert.ok(deadline - w.now() > 0, '남은 시간이 0 이하');
    });
}

// A09-B-138~142 다시 붙으면 내 직업과 같은 직업 동료를 돌려받음 (값 5)
const ROLE_CASES = [
    ['A09-B-138', '광대', 8, { JOKER: 2, DOCTOR: 2 }, 'JOKER', true],
    ['A09-B-139', '의사', 8, { JOKER: 2, DOCTOR: 2 }, 'DOCTOR', true],
    ['A09-B-140', '경비원', 10, { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, 'GUARD', false],
    ['A09-B-141', '마녀사냥꾼', 10, { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, 'WITCH_HUNTER', false],
    ['A09-B-142', '시민', 8, { JOKER: 2, DOCTOR: 2 }, 'CITIZEN', false],
];
for (const [no, label, n, roleCounts, role, paired] of ROLE_CASES) {
    test(`${no} ${n}명 판 ${label}이 끊겼다 붙음 → self 직업 = 시작 때 직업, ${paired ? '동료 목록에 같은 직업 다른 사람' : '동료 없음'}`, async (t) => {
        const w = H.setup(t, { id: `a09rs${no.slice(-3)}`, n, roleCounts });
        w.toDay();
        const [x, mate] = w.byRole(role);
        await w.disconnect(x);
        w.advance(20_000);
        const snap = await w.reconnect(x);
        assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
        assert.equal(snap.self.role, role);
        if (paired) assert.deepEqual(snap.self.allies, [mate]);
        else assert.deepEqual(snap.self.allies ?? [], []);
    });
}

test('A09-B-143 7명 판 낮 표 낸 뒤 끊김 → 붙음 → 내 표 칸 그대로', async (t) => {
    const w = H.setup(t, { id: 'a09rs143', n: 7, settings: { dayVoteTime: 60 } });
    w.toVote();
    const [x, target] = w.nonJokers();
    assert.equal((await w.vote(x, target)).ok, true);
    await w.disconnect(x);
    w.advance(20_000);
    const snap = await w.reconnect(x);
    assert.equal(snap.self.hasSubmittedDayVote, true);
    assert.equal(snap.self.dayVoteTargetUuid, target);
});

test('A09-B-144 8명 판 의사가 보호 고른 뒤 끊김 → 붙음 → 고른 것 칸 그대로 (했음 표시)', async (t) => {
    const w = H.setup(t, { id: 'a09rs144', n: 8, roleCounts: { JOKER: 1, DOCTOR: 1 } });
    w.toDay();
    await w.toNight();
    await w.untilTurn('DOCTOR');
    const doctor = w.firstOf('DOCTOR');
    // 의사가 혼자라 고르면 5초 뒤 차례가 닫힘 → 그 안에 끊었다 붙음
    assert.equal((await w.night(doctor, w.byRole('CITIZEN')[0])).ok, true);
    await w.disconnect(doctor);
    w.advance(2_000);
    const snap = await w.reconnect(doctor);
    assert.equal(snap.phase, 'NIGHT');
    assert.equal(snap.self.hasActedThisPhase, true);
});

test('A09-B-145 6명 판 토론에 끊김 → 투표·밤 → 붙음 → phase NIGHT, 지난 투표 결과 칸 있음', async (t) => {
    const w = H.setup(t, { id: 'a09rs145', n: 6 });
    w.toDay();
    const x = w.nonJokers()[0];
    // 준비 누른 뒤 끊김 (남은 사람이 다 준비하면 바로 투표 → 60초 안에 밤까지 감)
    assert.equal((await w.ready(x)).ok, true);
    const at = w.now();
    await w.disconnect(x);
    for (const u of w.alive().filter((u) => u !== x)) assert.equal((await w.ready(u)).ok, true);
    await w.voteAll(() => null);
    w.advanceUntil(() => w.session.phase === 'NIGHT');
    w.advanceTo(at + 40_000);
    const snap = await w.reconnect(x);
    assert.equal(snap.phase, 'NIGHT');
    assert.ok(snap.dayVoteResolution, '지난 투표 결과 칸 없음');
    assert.equal(snap.dayVoteResolution.outcome, 'ABSTAINED');
});

test('A09-B-146 7명 판 밤에 끊김 → 시민 1 살해·낮 → 붙음 → nightResult 죽은 사람 = 그 시민', async (t) => {
    const w = H.setup(t, { id: 'a09rs146', n: 7 });
    w.toDay();
    await w.toNight();
    const [x, victim] = w.nonJokers();
    await w.disconnect(x);
    await w.quickNight({ [w.firstOf('JOKER')]: victim });
    assert.equal(w.session.phase, 'DAY');
    const snap = await w.reconnect(x);
    assert.equal(snap.nightResult.victimUuid, victim);
});

test('A09-B-147 8명 판 경비원이 조사 고른 뒤 끊김 → 낮 → 붙음 → 내 지난밤 결과 칸에 조사 결과', async (t) => {
    const w = H.setup(t, { id: 'a09rs147', n: 8, roleCounts: { JOKER: 1, GUARD: 1 } });
    w.toDay();
    await w.toNight();
    await w.untilTurn('GUARD');
    const guard = w.firstOf('GUARD');
    assert.equal((await w.night(guard, w.firstOf('JOKER'))).ok, true);
    await w.disconnect(guard);
    await w.quickNight();
    assert.equal(w.session.phase, 'DAY');
    const snap = await w.reconnect(guard);
    assert.ok(snap.self.nightActionResult, '지난밤 결과 칸 없음');
    assert.equal(snap.self.nightActionResult.dayIndex, 1);
});

test('A09-B-148 6명 판 끊긴 시민을 광대가 암살 → 낮 → 60초 지나도 player_eliminated 없음·탈주 막힘 없음, 붙으면 죽음(관전)', async (t) => {
    const w = H.setup(t, { id: 'a09rs148', n: 6 });
    w.toDay();
    await w.toNight();
    const x = w.nonJokers()[0];
    const at = w.now();
    await w.disconnect(x);
    await w.quickNight({ [w.firstOf('JOKER')]: x });
    assert.equal(w.isAlive(x), false);
    w.advanceTo(at + 61_000);
    assert.equal(w.ids.filter((u) => w.got(u, 'player_eliminated').length > 0).length, 0);
    const snap = await w.reconnect(x);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.players.find((p) => p.uuid === x).isAlive, false);
    const room = await w.createRoom(x);
    assert.equal(room.ok, true, `방 만들기 거절: ${room.code}`);
});

test('A09-B-149 7명 판 재판 중 끊긴 피고 → 유죄 → 붙음 → 죽은 이유 처형, 방 만들기 바로 됨(탈주 아님)', async (t) => {
    const w = H.setup(t, { id: 'a09rs149', n: 7 });
    w.toVote();
    const x = w.nonJokers()[0];
    // 재판이 열린 뒤 끊김 (뽑히는 순간 끊겨 있으면 재판이 안 열림)
    await w.toTribunal(x);
    await w.disconnect(x);
    await w.castAll('GUILTY');
    w.advanceUntil(() => w.session.phase === 'NIGHT');
    const watcher = w.firstOf('JOKER');
    assert.equal(w.got(watcher, 'tribunal_vote_resolved').at(-1).executedUuid, x);
    const snap = await w.reconnect(x);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.players.find((p) => p.uuid === x).isAlive, false);
    const row = core.buildGameResultRecord(w.session, { completed: false }).players.find((p) => p.user_id === x);
    assert.equal(row.death_reason, 'EXECUTION');
    const room = await w.createRoom(x);
    assert.equal(room.ok, true, `방 만들기 거절: ${room.code}`);
});

test('A09-B-150 5명 판 채팅 몇 줄 뒤 끊겼다 붙음 → 스냅샷에 채팅 칸 없음', async (t) => {
    const w = H.setup(t, { id: 'a09rs150', n: 5 });
    w.toDay();
    const [x, y] = w.nonJokers();
    assert.equal((await w.chat(x, '첫줄채팅')).ok, true);
    assert.equal((await w.chat(y, '둘째줄채팅')).ok, true);
    await w.disconnect(x);
    w.advance(10_000);
    const snap = await w.reconnect(x);
    assert.equal(snap.ok, true);
    const text = JSON.stringify(snap);
    assert.equal(text.includes('첫줄채팅') || text.includes('둘째줄채팅'), false, '채팅 글이 실림');
    assert.equal(Object.keys(snap).some((k) => /chat|message/i.test(k)), false, '채팅 칸이 있음');
});

test('A09-B-151 10명 판 새 창이 gameId 없이 스냅샷 → 지금 판 ok', async (t) => {
    const w = H.setup(t, { id: 'a09rs151', n: 10 });
    w.toDay();
    const x = w.nonJokers()[0];
    await w.disconnect(x);
    w.advance(5_000);
    const fresh = w.attachSocket(x);
    await H.gs.resyncSessionRouting(fresh, x, w.io);
    const snap = await w.snapshot(x, {});
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.gameId, w.gameId);
});

test('A09-B-152 6명 판 투표 중 끊김 → 40초에 붙음 → 표 냄 → ok, 판정에 셈', async (t) => {
    const w = H.setup(t, { id: 'a09rs152', n: 6, settings: { dayVoteTime: 60 } });
    w.toVote();
    const [x, target] = w.nonJokers();
    const at = w.now();
    await w.disconnect(x);
    await w.voteAll(() => null, { skip: [x] });
    w.advanceTo(at + 40_000);
    assert.equal((await w.reconnect(x)).ok, true);
    const reply = await w.vote(x, target);
    assert.equal(reply.ok, true, `표 거절: ${reply.code}`);
    w.advanceUntil(() => w.got(target, 'day_vote_resolved').length > 0);
    const resolved = w.got(target, 'day_vote_resolved').at(-1);
    assert.equal(resolved.publicVoteCount, 6);
    assert.equal(resolved.publicAbstainCount, 5);
});

test('A09-B-153 8명 판 의사 차례 중 끊김 → 10초에 붙음 → 보호 고름 → ok', async (t) => {
    const w = H.setup(t, { id: 'a09rs153', n: 8, roleCounts: { JOKER: 1, DOCTOR: 1 } });
    w.toDay();
    await w.toNight();
    const victim = w.byRole('CITIZEN')[0];
    assert.equal((await w.night(w.firstOf('JOKER'), victim)).ok, true);
    await w.untilTurn('DOCTOR');
    const doctor = w.firstOf('DOCTOR');
    await w.disconnect(doctor);
    w.advance(10_000);
    assert.equal((await w.reconnect(doctor)).ok, true);
    const reply = await w.night(doctor, victim);
    assert.equal(reply.ok, true, `보호 거절: ${reply.code}`);
    await w.quickNight();
    assert.equal(w.isAlive(victim), true);
});

test('A09-B-154 7명 판 끊긴 지 20초에 승부 → 붙음 → 스냅샷 phase ENDED·승패 칸', async (t) => {
    const w = H.setup(t, { id: 'a09rs154', n: 7 });
    w.toDay();
    const x = w.nonJokers()[0];
    await w.disconnect(x);
    w.advance(20_000);
    assert.equal((await w.leave(w.firstOf('JOKER'))).ok, true);
    const snap = await w.reconnect(x);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.phase, 'ENDED');
    assert.equal(snap.winResult?.winner, 'CITIZEN');
});

test('A09-B-155 6명 판 끊긴 사람이 로비 화면 소켓으로 붙음 → 60초 뒤에도 산 채', async (t) => {
    const w = H.setup(t, { id: 'a09rs155', n: 6 });
    w.toDay();
    const x = w.nonJokers()[0];
    const at = w.now();
    await w.disconnect(x);
    w.advance(20_000);
    // 로비 화면도 접속하면 서버가 판 채널 다시 넣기를 함 (스냅샷은 안 물음)
    const lobby = w.attachSocket(x);
    await H.gs.resyncSessionRouting(lobby, x, w.io);
    w.advanceTo(at + 61_000);
    assert.equal(w.isAlive(x), true);
    assert.equal(w.ids.filter((u) => w.got(u, 'player_eliminated').length > 0).length, 0);
});
