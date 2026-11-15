'use strict';

// 판 중 끊김 60초 기다림 흐름 시험 — 59·60·61초 경계 × 끊긴 단계, 단계가 바뀌어도 60초, 내 밤 차례 마감이 아니라 60초, 다시 끊기면 새 60초
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-101~131, 돌리기: node --env-file=.env.test --test tests/flow/a09-grace-60s.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a09-grace-harness');

// 끊긴 단계 6가지: 판 차리기 → 그 단계로 가서 끊을 사람 돌려줌
const PHASES = [
    {
        label: '역할 확인', n: 5, roleCounts: { JOKER: 1 },
        async reach(w) { return w.nonJokers()[0]; },
    },
    {
        label: '토론', n: 6, roleCounts: { JOKER: 1 },
        async reach(w) { w.toDay(); return w.nonJokers()[0]; },
    },
    {
        label: '투표', n: 7, roleCounts: { JOKER: 1 },
        async reach(w) { w.toVote(); return w.nonJokers()[0]; },
    },
    {
        // 끊긴 사람은 피고 아닌 투표자
        label: '재판', n: 8, roleCounts: { JOKER: 1 },
        async reach(w) { await w.toTribunal(w.nonJokers()[1]); return w.nonJokers()[0]; },
    },
    {
        label: '내 밤 차례', n: 10, roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 1 },
        async reach(w) { w.toDay(); await w.toNight(); await w.untilTurn('DOCTOR'); return w.firstOf('DOCTOR'); },
    },
    {
        label: '남의 밤 차례', n: 6, roleCounts: { JOKER: 1, DOCTOR: 1 },
        async reach(w) {
            w.toDay();
            await w.toNight();
            assert.equal(H.core.getCurrentNightTurnRole(w.session), 'JOKER');
            return w.byRole('CITIZEN')[0];
        },
    },
];

// 끊긴 단계까지 가서 끊음, 끊긴 시각 돌려줌
async function disconnectAt(t, no, phase) {
    const w = H.setup(t, { id: `a09g${no}`, n: phase.n, roleCounts: phase.roleCounts });
    const x = await phase.reach(w);
    assert.equal(w.isAlive(x), true);
    const at = w.now();
    await w.disconnect(x);
    return { w, x, at };
}

// 판 전원 중 player_eliminated를 받은 사람 수 (옛 소켓 포함)
const eliminatedCount = (w) => w.ids.filter((u) => w.got(u, 'player_eliminated').length > 0).length;

// A09-B-101~118 60초 경계 × 끊긴 단계 (값 18)
let no = 101;
for (const phase of PHASES) {
    const n59 = `A09-B-${no}`;
    const n60 = `A09-B-${no + 1}`;
    const n61 = `A09-B-${no + 2}`;
    no += 3;

    test(`${n59} ${phase.n}명 판 ${phase.label}에 끊김 → 59초에 붙어 스냅샷 → 산 채, 아무에게도 player_eliminated 안 감`, async (t) => {
        const { w, x, at } = await disconnectAt(t, n59, phase);
        w.advanceTo(at + 59_000);
        assert.equal(eliminatedCount(w), 0);
        const snap = await w.reconnect(x);
        assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
        assert.equal(snap.players.find((p) => p.uuid === x).isAlive, true);
        w.advance(5_000);
        assert.equal(eliminatedCount(w), 0);
    });

    test(`${n60} ${phase.n}명 판 ${phase.label}에 끊김 → 59.999초엔 없음, 60초에 판 전원 player_eliminated`, async (t) => {
        const { w, x, at } = await disconnectAt(t, n60, phase);
        w.advanceTo(at + 59_999);
        assert.equal(eliminatedCount(w), 0);
        w.advance(1);
        const others = w.others(x);
        assert.deepEqual(w.missing('player_eliminated', 1, others), []);
        for (const u of others) assert.equal(w.got(u, 'player_eliminated')[0].victimUuid, x);
    });

    test(`${n61} ${phase.n}명 판 ${phase.label}에 끊김 → 61초에 붙어 스냅샷 → FORFEITED_FROM_SESSION`, async (t) => {
        const { w, x, at } = await disconnectAt(t, n61, phase);
        w.advanceTo(at + 61_000);
        const snap = await w.reconnect(x);
        assert.equal(snap.ok, false);
        assert.equal(snap.code, 'FORFEITED_FROM_SESSION');
    });
}

test('A09-B-119 6명 판 토론30·투표30·재판15초, 토론 시작에 끊김 → 투표 → 재판 → 밤 → 59초에 붙음 → 산 채, 단계 NIGHT', async (t) => {
    const w = H.setup(t, { id: 'a09g119', n: 6, settings: { tribunalTime: 15 } });
    w.toDay();
    const [x, defendant] = w.nonJokers();
    // 준비 누른 뒤 끊김 (남은 사람이 다 준비하면 바로 투표로 넘어가게)
    assert.equal((await w.ready(x)).ok, true);
    const at = w.now();
    await w.disconnect(x);
    for (const u of w.alive().filter((u) => u !== x)) assert.equal((await w.ready(u)).ok, true);
    assert.equal(w.phase(), 'DAY_VOTE');
    await w.voteAll((u) => (u === defendant ? null : defendant));
    w.advanceUntil(() => w.session.phase === 'TRIBUNAL');
    await w.castAll('NOT_GUILTY');
    w.advanceUntil(() => w.session.phase === 'NIGHT');
    assert.ok(w.now() < at + 59_000, '59초 전에 밤이 안 됨');
    w.advanceTo(at + 59_000);
    const snap = await w.reconnect(x);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.phase, 'NIGHT');
    assert.equal(snap.players.find((p) => p.uuid === x).isAlive, true);
});

test('A09-B-120 5명 판 역할 확인 0초에 끊김 → 10초 뒤 첫 낮 → 59초에 붙음 → 산 채', async (t) => {
    const w = H.setup(t, { id: 'a09g120', n: 5 });
    const x = w.nonJokers()[0];
    const at = w.now();
    await w.disconnect(x);
    w.advanceTo(at + 10_000);
    assert.equal(w.phase(), 'DAY_DISCUSSION');
    w.advanceTo(at + 59_000);
    const snap = await w.reconnect(x);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.players.find((p) => p.uuid === x).isAlive, true);
    assert.equal(eliminatedCount(w), 0);
});

test('A09-B-121 7명 판 투표 남은 1초에 끊김 → 판정·재판·밤 → 50초에 붙음 → 산 채', async (t) => {
    const w = H.setup(t, { id: 'a09g121', n: 7 });
    w.toVote();
    const [x, defendant] = w.nonJokers();
    await w.voteAll((u) => (u === defendant ? null : defendant), { skip: [x] });
    w.advanceTo(w.session.dayPhaseDeadline - 1_000);
    const at = w.now();
    await w.disconnect(x);
    w.advanceUntil(() => w.session.phase === 'TRIBUNAL');
    await w.castAll('NOT_GUILTY');
    w.advanceUntil(() => w.session.phase === 'NIGHT');
    w.advanceTo(at + 50_000);
    const snap = await w.reconnect(x);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.players.find((p) => p.uuid === x).isAlive, true);
});

test('A09-B-122 8명 판 광대 차례 중 경비원 끊김 → 의사·경비원 차례·낮 시작 → 55초에 붙음 → 산 채', async (t) => {
    const w = H.setup(t, { id: 'a09g122', n: 8, roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1 } });
    w.toDay();
    await w.toNight();
    assert.equal(H.core.getCurrentNightTurnRole(w.session), 'JOKER');
    const guard = w.firstOf('GUARD');
    const at = w.now();
    await w.disconnect(guard);
    await w.quickNight();
    assert.equal(w.session.phase, 'DAY');
    assert.ok(w.now() < at + 55_000, '55초 전에 낮이 안 옴');
    w.advanceTo(at + 55_000);
    const snap = await w.reconnect(guard);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.players.find((p) => p.uuid === guard).isAlive, true);
});

test('A09-B-123 6명 판 의사 차례 중 의사 끊김 → 차례 마감(30초) 지나도 아무 일 없음, 60초에 탈락', async (t) => {
    const w = H.setup(t, { id: 'a09g123', n: 6, roleCounts: { JOKER: 1, DOCTOR: 1 } });
    w.toDay();
    await w.toNight();
    await w.untilTurn('DOCTOR');
    const doctor = w.firstOf('DOCTOR');
    const at = w.now();
    const turnDeadline = w.got(doctor, 'night_turn_started').at(-1).deadline;
    await w.disconnect(doctor);
    w.advanceTo(turnDeadline);
    assert.equal(eliminatedCount(w), 0);
    assert.equal(w.isAlive(doctor), true);
    w.advanceTo(at + 59_999);
    assert.equal(eliminatedCount(w), 0);
    w.advance(1);
    assert.equal(w.got(w.firstOf('JOKER'), 'player_eliminated').at(-1)?.victimUuid, doctor);
});

// A09-B-124~127 내 밤 차례 끊김 × 직업: 차례는 마감에 건너뜀, 차례 마감 때 탈락 없음, 60초에 탈락 (값 4)
const OWN_TURN_CASES = [
    {
        no: 'A09-B-124', label: '광대(6명 판)', n: 6, roleCounts: { JOKER: 1, DOCTOR: 1 }, role: 'JOKER',
        async reach(w) { w.toDay(); await w.toNight(); },
        // 광대가 아무도 안 고름 → 그 밤 죽은 사람 없음
        afterNight(w) { assert.equal(w.got(w.firstOf('DOCTOR'), 'night_result_applied').at(-1).victimUuid, null); },
    },
    {
        no: 'A09-B-125', label: '의사(6명 판)', n: 6, roleCounts: { JOKER: 1, DOCTOR: 1 }, role: 'DOCTOR',
        // 광대는 시민 하나 고름 → 의사가 보호를 안 했으니 그 시민 죽음
        async reach(w) {
            w.toDay();
            await w.toNight();
            w.victim = w.byRole('CITIZEN')[0];
            assert.equal((await w.night(w.firstOf('JOKER'), w.victim)).ok, true);
        },
        afterNight(w) { assert.equal(w.got(w.firstOf('JOKER'), 'night_result_applied').at(-1).victimUuid, w.victim); },
    },
    {
        no: 'A09-B-126', label: '경비원(8명 판)', n: 8, roleCounts: { JOKER: 1, GUARD: 1 }, role: 'GUARD',
        async reach(w) { w.toDay(); await w.toNight(); },
        afterNight() {},
    },
    {
        no: 'A09-B-127', label: '마녀사냥꾼(10명 판 둘째 밤)', n: 10, roleCounts: { JOKER: 2, WITCH_HUNTER: 1 }, role: 'WITCH_HUNTER',
        // 첫 밤에 광대가 시민 하나 죽임 (마녀사냥꾼이 고를 죽은 사람이 생기게) → 둘째 날 기권 → 둘째 밤
        async reach(w) {
            w.toDay();
            await w.toNight();
            const victim = w.byRole('CITIZEN')[0];
            const picks = Object.fromEntries(w.byRole('JOKER').map((j) => [j, victim]));
            await w.quickNight(picks);
            assert.equal(w.isAlive(victim), false);
            await w.toNight();
        },
        afterNight() {},
    },
];
for (const c of OWN_TURN_CASES) {
    test(`${c.no} ${c.label} ${c.role} 차례 중 그 사람 끊김 → 차례는 마감에 건너뜀(고른 것 없음), 차례 마감 때 탈락 없음, 60초에 탈락`, async (t) => {
        const w = H.setup(t, { id: `a09g${c.no.slice(-3)}`, n: c.n, roleCounts: c.roleCounts });
        await c.reach(w);
        await w.untilTurn(c.role);
        const actor = w.firstOf(c.role);
        const watcher = w.others(actor).find((u) => w.isAlive(u));
        const deadline = w.got(watcher, 'night_turn_started').at(-1).deadline;
        const at = w.now();
        await w.disconnect(actor);
        const endedCount = () => w.got(watcher, 'night_turn_ended').filter((e) => e.role === c.role).length;
        const before = endedCount();
        w.advanceTo(deadline - 1);
        assert.equal(endedCount(), before, '차례 마감 전에 차례가 닫힘');
        w.advance(1);
        assert.equal(endedCount(), before + 1, '차례 마감에 차례가 안 닫힘');
        assert.equal(eliminatedCount(w), 0);
        assert.equal(w.isAlive(actor), true);
        // 남은 차례는 붙어 있는 사람이 바로 건너뛰어 밤을 끝냄
        if (w.session.phase === 'NIGHT') await w.quickNight();
        c.afterNight(w);
        assert.ok(w.now() < at + 60_000, '60초 전에 밤이 안 끝남');
        w.advanceTo(at + 59_999);
        assert.equal(eliminatedCount(w), 0);
        w.advance(1);
        assert.equal(w.got(watcher, 'player_eliminated').at(-1)?.victimUuid, actor);
    });
}

test('A09-B-128 7명 판 광대 차례 중 의사 끊김 → 의사 차례 끝에도 의사 산 채, 60초에 탈락', async (t) => {
    const w = H.setup(t, { id: 'a09g128', n: 7, roleCounts: { JOKER: 1, DOCTOR: 1 } });
    w.toDay();
    await w.toNight();
    assert.equal(H.core.getCurrentNightTurnRole(w.session), 'JOKER');
    const doctor = w.firstOf('DOCTOR');
    const joker = w.firstOf('JOKER');
    const at = w.now();
    await w.disconnect(doctor);
    assert.equal((await w.night(joker, null)).ok, true);
    w.advanceUntil(() => w.got(joker, 'night_turn_ended').some((e) => e.role === 'DOCTOR'), { step: 500 });
    assert.equal(w.isAlive(doctor), true);
    assert.equal(eliminatedCount(w), 0);
    w.advanceTo(at + 59_999);
    assert.equal(eliminatedCount(w), 0);
    w.advance(1);
    assert.equal(w.got(joker, 'player_eliminated').at(-1)?.victimUuid, doctor);
});

test('A09-B-129 8명 판 30초 끊김 → 붙음 → 다시 끊김 → 첫 끊김부터 70초엔 산 채, 둘째 끊김부터 60초에 탈락', async (t) => {
    const w = H.setup(t, { id: 'a09g129', n: 8 });
    w.toDay();
    const x = w.nonJokers()[0];
    const first = w.now();
    await w.disconnect(x);
    w.advanceTo(first + 30_000);
    assert.equal((await w.reconnect(x)).ok, true);
    w.advanceTo(first + 40_000);
    const second = w.now();
    await w.disconnect(x);
    w.advanceTo(first + 70_000);
    assert.equal(eliminatedCount(w), 0);
    assert.equal(w.isAlive(x), true);
    w.advanceTo(second + 59_999);
    assert.equal(eliminatedCount(w), 0);
    w.advance(1);
    assert.equal(w.got(w.firstOf('JOKER'), 'player_eliminated').at(-1)?.victimUuid, x);
});

test('A09-B-130 6명 판 새 탭이 이미 붙은 뒤 옛 탭 끊김 → 기다림 없음, 끊김 알림 없음, 60초 뒤에도 산 채', async (t) => {
    const w = H.setup(t, { id: 'a09g130', n: 6 });
    w.toDay();
    const x = w.nonJokers()[0];
    const oldSocket = w.sock(x);
    const fresh = w.attachSocket(x);
    await H.gs.resyncSessionRouting(fresh, x, w.io);
    oldSocket.connected = false;
    await H.gs.onDisconnect(w.io, oldSocket, x);
    w.advance(61_000);
    assert.equal(eliminatedCount(w), 0);
    assert.equal(w.isAlive(x), true);
    for (const u of w.others(x)) assert.equal(w.got(u, 'session_player_connection_changed').length, 0, `${u} 끊김 알림 받음`);
});

test('A09-B-131 5명 판 역할 확인 중 1명 끊김 → 그래도 10초에 첫 낮 (판이 안 멈춤)', async (t) => {
    const w = H.setup(t, { id: 'a09g131', n: 5 });
    const x = w.nonJokers()[0];
    const at = w.now();
    await w.disconnect(x);
    const watcher = w.firstOf('JOKER');
    w.advanceTo(at + 9_999);
    assert.equal(w.session.phase, 'ROLE_REVEAL');
    assert.equal(w.got(watcher, 'game_phase_changed').length, 0);
    w.advance(1);
    assert.equal(w.got(watcher, 'game_phase_changed').at(-1)?.phase, 'DAY');
});
