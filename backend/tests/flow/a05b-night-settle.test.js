'use strict';

// A05b 다 고르면 5초 뒤 밤 차례 닫힘 흐름 시험 — 5초 알림 받는 사람·남은 시간 경계·바꾸기·끊김·나가기를 가짜 시계로 봄
// 목록 A05-B-631~695·699 (docs/게임_의도_2026-11-15/시험목록/A05b-밤-알림-낮연출.md B-7), 돌리기: node --env-file=.env.test --test tests/flow/a05b-night-settle.test.js
// ---- 판 차리기 도우미 (이 파일 안에서만 씀 — 공용 도우미는 못 고쳐서 같은 묶음 파일마다 같은 모양으로 둠) ----
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음 → 모델을 불러도 DB에 안 붙음 (꼭 socket/gameSession보다 먼저)
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const desertion = require('../../services/game/desertion');

const T = gs.__testables;
const core = gf.core;

// 탈주 기록은 DB에 씀 → 아무것도 안 하는 저장소로 바꿔 끼움 (나가기·60초 탈락 시험용)
const quietDesertionRepo = {
    findDesertionsForWarmup: async () => [],
    countDesertionsSince: async () => 0,
    insertDesertion: async () => ({ created: true, row: null }),
};

// 소켓이 받는 사건마다 받은 시각(가짜 시계)과 받은 사람을 판 기록 하나에 모음
function watch(ctx, sock, uuid) {
    const emit = sock.emit;
    sock.emit = (event, payload) => {
        emit(event, payload);
        ctx.log.push({ uuid, sockId: sock.id, event, payload, at: ctx.clock.now() });
    };
}

// 판 하나 차리기: n명, 직업은 randomFn 0으로 늘 같게(직접 구성이면 roleCounts) + 첫 낮 + 가짜 소켓·가짜 시계
// 밤 차례 길이는 방 설정(turnSec초), 낮 타이머도 가짜 시계에 묶어 둠 (밤 끝 뒤 낮 타이머가 진짜 시계로 안 걸리게)
function setupGame(t, { id, n, jokerCount, roleCounts, turnSec = 30, clock = gf.fakeClock() }) {
    gs.__resetStateForTests();
    gf.resetCore();
    desertion.__resetForTests();
    T.__setRecordVoteParticipationForTests(async () => {});
    T.__setEvaluateAchievementsForTests(async () => {});
    T.__setGameResultPersistForTests(async () => {});
    desertion.__setRepositoryForTests(quietDesertionRepo);
    t.after(() => {
        gs.__resetStateForTests();
        gf.resetCore();
        desertion.__resetForTests();
        desertion.__setRepositoryForTests(null);
        T.__setRecordVoteParticipationForTests(null);
        T.__setEvaluateAchievementsForTests(null);
        T.__setGameResultPersistForTests(null);
    });
    const s = gf.startGame({ id, n, jokerCount, roleCounts, settings: { nightActionTime: turnSec } });
    gf.toDay(s);
    const ctx = { s, clock, log: [], turnMs: turnSec * 1000, reconnects: 0 };
    ctx.fns = { nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn };
    ctx.world = gf.socketWorld(gs, s);
    for (const [uuid, sock] of ctx.world.sockets) {
        watch(ctx, sock, uuid);
        gs.registerGameHandlers(ctx.world.io, sock, uuid);
    }
    T.startDayPhaseTimer(ctx.world.io, s, { ...ctx.fns, discussionDurationMs: 600_000, voteDurationMs: 600_000 });
    return ctx;
}

// 밤 시작: 지금 날짜 그대로 밤으로 + 밤 차례 순서를 가짜 시계로 (빈 차례 무작위 = 차례 길이의 40%)
function startNight(ctx) {
    ctx.nightStart = ctx.log.length;
    gf.toNight(ctx.s);
    T.startNightTurnSequence(ctx.world.io, ctx.s, { ...ctx.fns, randomFn: () => 0.5 });
}

// 받은 사건 고르기: 이름 + 값 칸이 같은 것만 (uuid 주면 그 사람 것만)
function seen(ctx, event, match = {}, uuid = null) {
    return ctx.log.filter((e) => e.event === event
        && (uuid === null || e.uuid === uuid)
        && Object.entries(match).every(([k, v]) => e.payload?.[k] === v));
}
const got = (ctx, uuid, event, match = {}) => seen(ctx, event, match, uuid).map((e) => e.payload);

// 화면이 보내는 것처럼 요청 하나 보내고 답 받기 (답이 안 오면 undefined)
function send(ctx, uuid, event, payload) {
    let reply;
    ctx.world.sock(uuid).trigger(event, payload, (r) => { reply = r; });
    return reply;
}
const act = (ctx, uuid, targetId) => send(ctx, uuid, 'submit_night_action', { gameId: ctx.s.id, targetId });
const snapshot = (ctx, uuid) => send(ctx, uuid, 'get_session_snapshot', { gameId: ctx.s.id });
const leaveGame = (ctx, uuid) => send(ctx, uuid, 'leave_game_session', { gameId: ctx.s.id });

// 지금 열린 차례 (오늘 밤 시작은 됐고 끝은 안 된 것)
function openTurn(ctx) {
    const d = ctx.s.dayIndex;
    const started = seen(ctx, 'night_turn_started', { dayIndex: d });
    for (let i = started.length - 1; i >= 0; i -= 1) {
        const p = started[i].payload;
        if (seen(ctx, 'night_turn_ended', { dayIndex: d, role: p.role }).length === 0) return p;
    }
    return null;
}

// 열린 차례를 마감까지 보냄: 5초 알림이 왔으면 당긴 마감, 산 사람 없는 차례는 길이의 40%, 나머지는 원래 마감
function closeOpenTurn(ctx) {
    const p = openTurn(ctx);
    assert.ok(p, '열린 밤 차례 없음');
    const settled = seen(ctx, 'phase_settle_started', { phase: 'NIGHT', dayIndex: p.dayIndex, role: p.role }).at(-1);
    const empty = core.getAliveActorUuidsForRole(ctx.s, p.role).length === 0;
    let at = p.deadline;
    if (settled) at = settled.payload.deadline;
    else if (empty) at = p.deadline - ctx.turnMs + Math.floor(ctx.turnMs * 0.4);
    ctx.clock.advance(Math.max(0, at - ctx.clock.now()));
}

// 그 직업 차례가 열릴 때까지 앞 차례를 마감으로 넘김, 열린 차례 값 돌려줌
function skipToTurn(ctx, role) {
    for (let i = 0; i < 6; i += 1) {
        const p = openTurn(ctx);
        if (p && p.role === role) return p;
        closeOpenTurn(ctx);
    }
    return assert.fail(`${role} 차례가 안 열림`);
}

// 이 밤이 끝날 때까지 남은 차례를 마감으로 넘김 (이미 끝났으면 그대로)
function runOutNight(ctx) {
    if (ctx.s.phase !== 'NIGHT') return;
    const d = ctx.s.dayIndex;
    for (let i = 0; i < 8; i += 1) {
        if (seen(ctx, 'night_actions_resolved', { dayIndex: d }).length > 0) return;
        closeOpenTurn(ctx);
    }
    assert.fail('밤이 안 끝남');
}

// 첫 밤에 광대가 victim을 죽이고 둘째 날 밤으로 감 (죽은 관전자·마녀사냥꾼 확인 대상 만들기)
function toSecondNight(ctx, victim) {
    startNight(ctx);
    for (const j of gf.byRole(ctx.s, 'JOKER')) assert.equal(act(ctx, j, victim).ok, true);
    runOutNight(ctx);
    assert.equal(ctx.s.dayIndex, 2);
    startNight(ctx);
}

// 끊김: 소켓이 끊기고 60초 기다림이 가짜 시계로 시작됨
async function disconnect(ctx, uuid) {
    const sock = ctx.world.sock(uuid);
    sock.connected = false;
    T.beginDisconnectGrace(ctx.world.io, ctx.s, uuid, { ...ctx.fns, graceMs: 60_000 });
    await gs.onDisconnect(ctx.world.io, sock, uuid);
}

// 다시 붙기(새로고침): 새 소켓이 판 채널에 붙고 접속 목록이 새 소켓을 가리킴
function reconnect(ctx, uuid) {
    ctx.reconnects += 1;
    const sock = gf.createFakeSocket(uuid, { id: `sock-${uuid}-r${ctx.reconnects}` });
    sock.rooms.add(ctx.s.channelId);
    sock.data.activeGameId = ctx.s.id;
    ctx.world.io.sockets.sockets.set(sock.id, sock);
    ctx.world.registry.set(uuid, sock.id);
    ctx.world.sockets.set(uuid, sock);
    watch(ctx, sock, uuid);
    gs.registerGameHandlers(ctx.world.io, sock, uuid);
    return sock;
}

const everyone = (ctx) => [...ctx.s.players.keys()];
const citizens = (ctx) => gf.byRole(ctx.s, 'CITIZEN');
const one = (ctx, role) => gf.firstOf(ctx.s, role);

// ---- 이 파일 시험들 ----

// 그 직업 산 사람 전원이 고를 대상: 광대·의사·경비원은 산 시민, 마녀사냥꾼은 첫 밤에 죽은 사람
function targetFor(ctx, role, deadUuid) {
    return role === 'WITCH_HUNTER' ? deadUuid : citizens(ctx).find((u) => ctx.s.players.get(u).alive);
}

// 직업·인원 표: 둘째 밤이면 첫 밤에 광대가 시민 하나를 죽여 둠 (마녀사냥꾼 확인 대상)
function roleTurn(t, { id, role, n, jokerCount, roleCounts, second = false, turnSec = 30 }) {
    const ctx = setupGame(t, { id, n, jokerCount, roleCounts, turnSec });
    let dead = null;
    if (second) {
        dead = citizens(ctx).at(-1);
        toSecondNight(ctx, dead);
    } else {
        startNight(ctx);
    }
    const turn = skipToTurn(ctx, role);
    return { ctx, turn, target: targetFor(ctx, role, dead), dead };
}

// 그 직업 산 사람 전원이 대상 하나를 고름 (모두 성공 답)
function pickAll(ctx, role, target) {
    for (const uuid of core.getAliveActorUuidsForRole(ctx.s, role)) {
        assert.deepEqual(act(ctx, uuid, target), { ok: true }, `${uuid} 제출 거절`);
    }
}

// 그 차례가 닫혔나 (오늘 밤 그 직업 차례 끝 방송을 누가 받았나)
// 마지막 차례가 닫히면 바로 낮이 되어 날짜가 바뀌니 밤 날짜를 따로 받음
const turnEnded = (ctx, role, dayIndex = ctx.s.dayIndex) => seen(ctx, 'night_turn_ended', { dayIndex, role }).length > 0;

// at 시각 1ms 전엔 안 닫히고 at에 닫힘
function assertClosesAt(ctx, role, at) {
    const night = ctx.s.dayIndex;
    ctx.clock.advance(at - 1 - ctx.clock.now());
    assert.equal(turnEnded(ctx, role, night), false, `${role} 차례가 ${at - 1}에 벌써 닫힘`);
    ctx.clock.advance(1);
    assert.equal(turnEnded(ctx, role, night), true, `${role} 차례가 ${at}에 안 닫힘`);
}

// 밤 결과 공개 값 (판에 남은 아무나 받은 것)
const dawnOf = (ctx, uuid) => got(ctx, uuid, 'night_result_applied').at(-1);

// ---------- A05-B-631~638 직업마다 1명·2명이 다 고르면 5초 뒤 닫힘 ----------
for (const spec of [
    { no: 631, role: 'JOKER', n: 5, label: '광대 1(5명)' },
    { no: 632, role: 'JOKER', n: 6, jokerCount: 2, label: '광대 2(6명)' },
    { no: 633, role: 'DOCTOR', n: 6, label: '의사 1(6명)' },
    { no: 634, role: 'DOCTOR', n: 7, roleCounts: { JOKER: 1, DOCTOR: 2 }, label: '의사 2(7명 직접 구성)' },
    { no: 635, role: 'GUARD', n: 8, label: '경비원 1(8명)' },
    { no: 636, role: 'GUARD', n: 9, roleCounts: { JOKER: 1, GUARD: 2 }, label: '경비원 2(9명 직접 구성)' },
    { no: 637, role: 'WITCH_HUNTER', n: 10, second: true, label: '마녀사냥꾼 1(10명 둘째 밤)' },
    { no: 638, role: 'WITCH_HUNTER', n: 10, roleCounts: { JOKER: 1, WITCH_HUNTER: 2 }, second: true, label: '마녀사냥꾼 2(10명 둘째 밤 직접 구성)' },
]) {
    test(`A05-B-${spec.no} ${spec.label}: 다 고르면 판 전원 5초 알림, 4999ms엔 차례 안 닫히고 5000ms에 닫힘`, (t) => {
        const { ctx, turn, target } = roleTurn(t, { id: `b${spec.no}`, ...spec });
        // 남은 시간 20초에 다 고름
        ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
        const pickedAt = ctx.clock.now();
        pickAll(ctx, spec.role, target);
        const expected = { gameId: ctx.s.id, phase: 'NIGHT', dayIndex: ctx.s.dayIndex, role: spec.role, deadline: pickedAt + 5_000 };
        for (const uuid of everyone(ctx)) {
            assert.deepEqual(got(ctx, uuid, 'phase_settle_started', { role: spec.role }), [expected], `${uuid} 5초 알림`);
        }
        assertClosesAt(ctx, spec.role, pickedAt + 5_000);
    });
}

// ---------- A05-B-639~654 남은 시간 경계 × 직업 ----------
{
    let no = 639;
    for (const spec of [
        { role: 'JOKER', n: 5, label: '광대(5명)' },
        { role: 'DOCTOR', n: 6, label: '의사(6명)' },
        { role: 'GUARD', n: 8, label: '경비원(8명)' },
        { role: 'WITCH_HUNTER', n: 10, second: true, label: '마녀사냥꾼(10명 둘째 밤)' },
    ]) {
        for (const [remainSec, closeSec] of [[6, 5], [5, 5], [4, 4], [1, 1]]) {
            const caseNo = no;
            no += 1;
            test(`A05-B-${caseNo} ${spec.label}: 다 고른 때 남은 ${remainSec}초 → ${closeSec}초 뒤 닫힘`, (t) => {
                const { ctx, turn, target } = roleTurn(t, { id: `b${caseNo}`, ...spec });
                ctx.clock.advance(turn.deadline - remainSec * 1000 - ctx.clock.now());
                const pickedAt = ctx.clock.now();
                pickAll(ctx, spec.role, target);
                assertClosesAt(ctx, spec.role, pickedAt + closeSec * 1000);
            });
        }
    }
}

// ---------- A05-B-655~658 차례 길이 설정과 상관없이 5초 ----------
for (const [no, sec] of [[655, 30], [656, 60], [657, 90], [658, 120]]) {
    test(`A05-B-${no} 6명 밤 시간 ${sec}초 방: 광대가 차례 열리자마자 고르면 5초 뒤 닫힘`, (t) => {
        const { ctx, target } = roleTurn(t, { id: `b${no}`, role: 'JOKER', n: 6, turnSec: sec });
        const pickedAt = ctx.clock.now();
        pickAll(ctx, 'JOKER', target);
        assertClosesAt(ctx, 'JOKER', pickedAt + 5_000);
    });
}

test('A05-B-659 6명: 광대 → A, 2초째 → B → 처음 고른 때부터 5초에 닫힘, 희생자 B', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b659', role: 'JOKER', n: 6 });
    const joker = one(ctx, 'JOKER');
    const [a, b] = citizens(ctx);
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    assert.deepEqual(act(ctx, joker, a), { ok: true });
    ctx.clock.advance(2_000);
    assert.deepEqual(act(ctx, joker, b), { ok: true });
    assertClosesAt(ctx, 'JOKER', pickedAt + 5_000);
    runOutNight(ctx);
    assert.equal(dawnOf(ctx, a).victimUuid, b);
});

test('A05-B-660 7명: A → B(1초) → A(3초) → 5초에 닫힘, 희생자 A', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b660', role: 'JOKER', n: 7 });
    const joker = one(ctx, 'JOKER');
    const [a, b] = citizens(ctx);
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    assert.deepEqual(act(ctx, joker, a), { ok: true });
    ctx.clock.advance(1_000);
    assert.deepEqual(act(ctx, joker, b), { ok: true });
    ctx.clock.advance(2_000);
    assert.deepEqual(act(ctx, joker, a), { ok: true });
    assertClosesAt(ctx, 'JOKER', pickedAt + 5_000);
    runOutNight(ctx);
    assert.equal(dawnOf(ctx, b).victimUuid, a);
});

test('A05-B-661 8명 광대 2: 둘 다 A → 한 명이 B로 바꿈 → 5초에 닫힘, 동률이라 희생자 없음', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b661', role: 'JOKER', n: 8, jokerCount: 2 });
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    const [a, b] = citizens(ctx);
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    assert.deepEqual(act(ctx, j1, a), { ok: true });
    assert.deepEqual(act(ctx, j2, a), { ok: true });
    ctx.clock.advance(2_000);
    assert.deepEqual(act(ctx, j2, b), { ok: true });
    assertClosesAt(ctx, 'JOKER', pickedAt + 5_000);
    runOutNight(ctx);
    assert.equal(dawnOf(ctx, a).victimUuid, null);
});

test('A05-B-662 8명 광대 2: A·B로 다 고름(5초 시작) → B를 고른 광대가 A로 → 희생자 A', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b662', role: 'JOKER', n: 8, jokerCount: 2 });
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    const [a, b] = citizens(ctx);
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    assert.deepEqual(act(ctx, j1, a), { ok: true });
    assert.deepEqual(act(ctx, j2, b), { ok: true });
    ctx.clock.advance(2_000);
    assert.deepEqual(act(ctx, j2, a), { ok: true });
    assertClosesAt(ctx, 'JOKER', pickedAt + 5_000);
    runOutNight(ctx);
    assert.equal(dawnOf(ctx, b).victimUuid, a);
});

test('A05-B-663 7명: 광대 → A, 의사 → B 뒤 3초째 A로 → doctorSaved 참, 희생자 없음', (t) => {
    const { ctx } = roleTurn(t, { id: 'b663', role: 'JOKER', n: 7 });
    const doctor = one(ctx, 'DOCTOR');
    const [a, b] = citizens(ctx);
    assert.deepEqual(act(ctx, one(ctx, 'JOKER'), a), { ok: true });
    skipToTurn(ctx, 'DOCTOR');
    const pickedAt = ctx.clock.now();
    assert.deepEqual(act(ctx, doctor, b), { ok: true });
    ctx.clock.advance(3_000);
    assert.deepEqual(act(ctx, doctor, a), { ok: true });
    assertClosesAt(ctx, 'DOCTOR', pickedAt + 5_000);
    runOutNight(ctx);
    const dawn = dawnOf(ctx, b);
    assert.equal(dawn.doctorSaved, true);
    assert.equal(dawn.victimUuid, null);
});

test('A05-B-664 8명: 경비원 → A 뒤 5초 안에 B로 → 개인 결과 대상 B', (t) => {
    const { ctx } = roleTurn(t, { id: 'b664', role: 'GUARD', n: 8 });
    const guard = one(ctx, 'GUARD');
    const [a, b] = citizens(ctx);
    assert.deepEqual(act(ctx, guard, a), { ok: true });
    ctx.clock.advance(2_000);
    assert.deepEqual(act(ctx, guard, b), { ok: true });
    runOutNight(ctx);
    const [result] = got(ctx, guard, 'night_action_result');
    assert.equal(result.actionType, 'INVESTIGATE');
    assert.equal(result.targetId, b);
});

test('A05-B-665 6명 광대 2: 광대1만 고르면 5초 알림 없음, 원래 마감(30초)에 닫힘', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b665', role: 'JOKER', n: 6, jokerCount: 2 });
    const [j1] = gf.byRole(ctx.s, 'JOKER');
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    assert.deepEqual(act(ctx, j1, citizens(ctx)[0]), { ok: true });
    assertClosesAt(ctx, 'JOKER', turn.deadline);
    assert.equal(seen(ctx, 'phase_settle_started').length, 0);
});

test('A05-B-666 7명 광대 2: 광대2 끊김(60초 기다림 중) + 광대1 고름 → 5초 없음, 원래 마감에 광대2는 건너뛰기로 채워짐', async (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b666', role: 'JOKER', n: 7, jokerCount: 2 });
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    const [a, b] = citizens(ctx);
    await disconnect(ctx, j2);
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    assert.deepEqual(act(ctx, j1, a), { ok: true });
    assertClosesAt(ctx, 'JOKER', turn.deadline);
    assert.equal(seen(ctx, 'phase_settle_started').length, 0);
    // 광대2 칸이 건너뛰기로 채워져 광대1이 고른 A가 죽음
    runOutNight(ctx);
    assert.equal(dawnOf(ctx, b).victimUuid, a);
});

test('A05-B-667 7명 광대 2: 광대1 고름, 광대2 끊김 → 10초 뒤 다시 붙어 고르면 그때부터 5초 뒤 닫힘', async (t) => {
    const { ctx } = roleTurn(t, { id: 'b667', role: 'JOKER', n: 7, jokerCount: 2 });
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    const [a] = citizens(ctx);
    assert.deepEqual(act(ctx, j1, a), { ok: true });
    await disconnect(ctx, j2);
    ctx.clock.advance(10_000);
    reconnect(ctx, j2);
    assert.equal(snapshot(ctx, j2).ok, true);
    const pickedAt = ctx.clock.now();
    assert.deepEqual(act(ctx, j2, a), { ok: true });
    assert.equal(got(ctx, a, 'phase_settle_started', { role: 'JOKER' })[0]?.deadline, pickedAt + 5_000);
    assertClosesAt(ctx, 'JOKER', pickedAt + 5_000);
});

test('A05-B-668 [지금 동작] 5명: 광대 1명이 건너뛰기(null)를 보내도 다 고름 → 5초 뒤 닫힘', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b668', role: 'JOKER', n: 5 });
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    assert.deepEqual(act(ctx, one(ctx, 'JOKER'), null), { ok: true });
    assertClosesAt(ctx, 'JOKER', pickedAt + 5_000);
});

test('A05-B-669 [임시 7] 8명 광대 2: 광대1 → A, 안 고른 광대2가 나감 → 나간 때부터 5초 뒤 닫힘, 남은 판 전원 5초 알림', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b669', role: 'JOKER', n: 8, jokerCount: 2 });
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    assert.deepEqual(act(ctx, j1, citizens(ctx)[0]), { ok: true });
    ctx.clock.advance(3_000);
    const leftAt = ctx.clock.now();
    assert.deepEqual(leaveGame(ctx, j2), { ok: true });
    for (const uuid of everyone(ctx).filter((u) => u !== j2)) {
        assert.equal(got(ctx, uuid, 'phase_settle_started', { role: 'JOKER' })[0]?.deadline, leftAt + 5_000, `${uuid} 5초 알림`);
    }
    assertClosesAt(ctx, 'JOKER', leftAt + 5_000);
});

test('A05-B-670 8명 광대 2 (차례 120초 방): 안 고른 광대2가 끊겨 60초 지나 탈락 → 그때부터 5초 뒤 닫힘', async (t) => {
    const { ctx } = roleTurn(t, { id: 'b670', role: 'JOKER', n: 8, jokerCount: 2, turnSec: 120 });
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    const cutAt = ctx.clock.now();
    await disconnect(ctx, j2);
    ctx.clock.advance(1_000);
    assert.deepEqual(act(ctx, j1, citizens(ctx)[0]), { ok: true });
    assert.equal(seen(ctx, 'phase_settle_started').length, 0);
    assertClosesAt(ctx, 'JOKER', cutAt + 60_000 + 5_000);
});

test('A05-B-671 [임시 7] 10명 의사 2: 의사1 고름, 안 고른 의사2가 나감 → 5초 뒤 닫힘', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b671', role: 'DOCTOR', n: 10, roleCounts: { JOKER: 1, DOCTOR: 2 } });
    const [d1, d2] = gf.byRole(ctx.s, 'DOCTOR');
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    assert.deepEqual(act(ctx, d1, citizens(ctx)[0]), { ok: true });
    ctx.clock.advance(2_000);
    const leftAt = ctx.clock.now();
    assert.deepEqual(leaveGame(ctx, d2), { ok: true });
    assertClosesAt(ctx, 'DOCTOR', leftAt + 5_000);
});

test('A05-B-672 6명: 광대가 고름 → 바꿈 → 바꿈 → 5초 알림은 한 번만', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b672', role: 'JOKER', n: 6 });
    const joker = one(ctx, 'JOKER');
    const [a, b] = citizens(ctx);
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    assert.deepEqual(act(ctx, joker, a), { ok: true });
    ctx.clock.advance(1_000);
    assert.deepEqual(act(ctx, joker, b), { ok: true });
    ctx.clock.advance(1_000);
    assert.deepEqual(act(ctx, joker, a), { ok: true });
    for (const uuid of everyone(ctx)) assert.equal(got(ctx, uuid, 'phase_settle_started').length, 1, `${uuid} 알림 수`);
});

test('A05-B-673 5명: 광대 → A, 2초째 → A 다시 → 마감 그대로, 알림 1번', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b673', role: 'JOKER', n: 5 });
    const joker = one(ctx, 'JOKER');
    const [a] = citizens(ctx);
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    assert.deepEqual(act(ctx, joker, a), { ok: true });
    ctx.clock.advance(2_000);
    assert.deepEqual(act(ctx, joker, a), { ok: true });
    for (const uuid of everyone(ctx)) assert.equal(got(ctx, uuid, 'phase_settle_started').length, 1, `${uuid} 알림 수`);
    assertClosesAt(ctx, 'JOKER', pickedAt + 5_000);
});

test('A05-B-674 6명: 광대 다 고름(5초) → 의사 차례 다 고름 → 알림 2번, 직업 JOKER·DOCTOR', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b674', role: 'JOKER', n: 6 });
    const [a] = citizens(ctx);
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    pickAll(ctx, 'JOKER', a);
    ctx.clock.advance(5_000);
    skipToTurn(ctx, 'DOCTOR');
    pickAll(ctx, 'DOCTOR', a);
    for (const uuid of everyone(ctx)) {
        assert.deepEqual(got(ctx, uuid, 'phase_settle_started').map((p) => p.role), ['JOKER', 'DOCTOR'], `${uuid} 알림`);
    }
});

test('A05-B-675 7명 둘째 밤: 광대 다 고름 → dayIndex 2 알림, 5초 뒤 닫힘', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b675', role: 'JOKER', n: 7, second: true });
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    pickAll(ctx, 'JOKER', citizens(ctx)[0]);
    const notice = got(ctx, one(ctx, 'DOCTOR'), 'phase_settle_started').at(-1);
    assert.equal(notice.dayIndex, 2);
    assert.equal(notice.deadline, pickedAt + 5_000);
    assertClosesAt(ctx, 'JOKER', pickedAt + 5_000);
});

// ---------- A05-B-676~678 직업이 다 죽었으면 5초가 아니라 무작위 닫힘 ----------
for (const [no, role, n, label] of [[676, 'DOCTOR', 6, '의사'], [677, 'GUARD', 8, '경비원'], [678, 'WITCH_HUNTER', 10, '마녀사냥꾼']]) {
    test(`A05-B-${no} ${n}명: ${label}가 다 죽은 밤 → 그 차례는 길이의 20~60% 사이에 닫힘, 5초 알림 없음`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n });
        // 첫 밤 광대가 그 직업을 죽임 → 둘째 밤 그 차례는 산 사람 없음
        toSecondNight(ctx, one(ctx, role));
        const turn = skipToTurn(ctx, role);
        const openedAt = turn.deadline - ctx.turnMs;
        ctx.clock.advance(openedAt + ctx.turnMs * 0.2 - 1 - ctx.clock.now());
        assert.equal(turnEnded(ctx, role, 2), false, '20% 전에 닫힘');
        ctx.clock.advance(openedAt + ctx.turnMs * 0.6 - ctx.clock.now());
        assert.equal(turnEnded(ctx, role, 2), true, '60%까지 안 닫힘');
        assert.equal(seen(ctx, 'phase_settle_started', { role, dayIndex: 2 }).length, 0);
    });
}

test('A05-B-679 5명(의사 없음) 밤: 의사 차례 시작·의사 5초 알림 둘 다 없음', (t) => {
    const { ctx } = roleTurn(t, { id: 'b679', role: 'JOKER', n: 5 });
    pickAll(ctx, 'JOKER', citizens(ctx)[0]);
    runOutNight(ctx);
    assert.equal(seen(ctx, 'night_turn_started', { role: 'DOCTOR' }).length, 0);
    assert.equal(seen(ctx, 'phase_settle_started', { role: 'DOCTOR' }).length, 0);
});

test('A05-B-680 5명: 다 고른 뒤 3초째 다른 대상 → 성공 답', (t) => {
    const { ctx } = roleTurn(t, { id: 'b680', role: 'JOKER', n: 5 });
    const joker = one(ctx, 'JOKER');
    const [a, b] = citizens(ctx);
    assert.deepEqual(act(ctx, joker, a), { ok: true });
    ctx.clock.advance(3_000);
    assert.deepEqual(act(ctx, joker, b), { ok: true });
});

test('A05-B-681 5명: 5초 지나 닫힌 뒤 광대가 내면 INVALID_PHASE 거절 (5명 판은 광대 차례가 닫히면 바로 낮)', (t) => {
    const { ctx } = roleTurn(t, { id: 'b681', role: 'JOKER', n: 5 });
    const joker = one(ctx, 'JOKER');
    const [a, b] = citizens(ctx);
    assert.deepEqual(act(ctx, joker, a), { ok: true });
    ctx.clock.advance(5_000);
    assert.equal(turnEnded(ctx, 'JOKER', 1), true);
    // 5명 판은 밤 차례가 광대뿐이라 닫히면 바로 낮 → 단계 검사에 먼저 걸림 (7명 이상 판이면 NOT_YOUR_TURN)
    assert.equal(ctx.s.phase, 'DAY');
    const reply = act(ctx, joker, b);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'INVALID_PHASE');
});

// ---------- A05-B-682~685 5초 알림을 판 전원이 받음 (8명, 둘째 밤) ----------
for (const [no, who, label] of [[682, 'joker', '그 직업 사람(광대)'], [683, 'doctor', '다른 직업(의사)'], [684, 'citizen', '산 시민'], [685, 'dead', '죽은 관전자']]) {
    test(`A05-B-${no} 8명: 광대가 다 고르면 ${label}도 같은 5초 알림을 받음`, (t) => {
        const { ctx, turn, dead } = roleTurn(t, { id: `b${no}`, role: 'JOKER', n: 8, second: true });
        ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
        const pickedAt = ctx.clock.now();
        const alive = citizens(ctx).filter((u) => ctx.s.players.get(u).alive);
        pickAll(ctx, 'JOKER', alive[0]);
        const uuid = { joker: one(ctx, 'JOKER'), doctor: one(ctx, 'DOCTOR'), citizen: alive[1], dead }[who];
        assert.deepEqual(got(ctx, uuid, 'phase_settle_started', { dayIndex: 2 }), [
            { gameId: ctx.s.id, phase: 'NIGHT', dayIndex: 2, role: 'JOKER', deadline: pickedAt + 5_000 },
        ]);
    });
}

test('A05-B-686 5명 판 두 개: 판1 광대가 다 고르면 판2 전원은 5초 알림 0개', (t) => {
    const ctx = setupGame(t, { id: 'b686a', n: 5 });
    // 판2: 같은 서버(같은 io·접속 목록)에 5명 판 하나 더
    const s2 = gf.startGame({ id: 'b686b', n: 5, settings: { nightActionTime: 30 } });
    gf.toDay(s2);
    for (const uuid of s2.players.keys()) {
        const sock = gf.createFakeSocket(uuid);
        sock.rooms.add(s2.channelId);
        sock.data.activeGameId = s2.id;
        ctx.world.io.sockets.sockets.set(sock.id, sock);
        ctx.world.registry.set(uuid, sock.id);
        watch(ctx, sock, uuid);
        gs.registerGameHandlers(ctx.world.io, sock, uuid);
    }
    startNight(ctx);
    gf.toNight(s2);
    T.startNightTurnSequence(ctx.world.io, s2, { ...ctx.fns, randomFn: () => 0.5 });
    ctx.clock.advance(10_000);
    pickAll(ctx, 'JOKER', citizens(ctx)[0]);
    assert.equal(seen(ctx, 'phase_settle_started', { gameId: ctx.s.id }).length, 5);
    for (const uuid of s2.players.keys()) assert.equal(got(ctx, uuid, 'phase_settle_started').length, 0, `${uuid} 판2가 받음`);
});

test('A05-B-687 6명: 다 고르고 2초 뒤 스냅샷 → nightTurnDeadline = 당긴 마감(남은 3초)', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b687', role: 'JOKER', n: 6 });
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    pickAll(ctx, 'JOKER', citizens(ctx)[0]);
    ctx.clock.advance(2_000);
    const snap = snapshot(ctx, citizens(ctx)[1]);
    assert.equal(snap.ok, true);
    assert.equal(snap.nightTurnDeadline, pickedAt + 5_000);
    assert.equal(snap.nightTurnDeadline - ctx.clock.now(), 3_000);
});

test('A05-B-688 5명(광대만): 마지막 차례가 5초 뒤 닫히면 바로 밤 결과, 4999ms엔 없음', (t) => {
    const { ctx } = roleTurn(t, { id: 'b688', role: 'JOKER', n: 5 });
    const pickedAt = ctx.clock.now();
    pickAll(ctx, 'JOKER', citizens(ctx)[0]);
    ctx.clock.advance(4_999);
    assert.equal(seen(ctx, 'night_result_applied').length, 0);
    ctx.clock.advance(1);
    for (const uuid of everyone(ctx)) {
        const [dawn] = seen(ctx, 'night_result_applied', {}, uuid);
        assert.ok(dawn, `${uuid}가 밤 결과를 못 받음`);
        assert.equal(dawn.at, pickedAt + 5_000);
    }
});

// ---------- A05-B-689~691 옛 "밤 종료" 요청을 서버가 안 받음 (6명) ----------
for (const [no, who, label] of [[689, 'joker', '차례인 광대'], [690, 'citizen', '시민'], [691, 'dead', '죽은 관전자']]) {
    test(`A05-B-${no} 6명: ${label}가 resolve_night를 보내도 답 없음, 차례·마감 그대로`, (t) => {
        const { ctx, turn, dead } = roleTurn(t, { id: `b${no}`, role: 'JOKER', n: 6, second: true });
        ctx.clock.advance(5_000);
        const alive = citizens(ctx).filter((u) => ctx.s.players.get(u).alive);
        const sender = { joker: one(ctx, 'JOKER'), citizen: alive[0], dead }[who];
        const before = ctx.log.length;
        assert.equal(send(ctx, sender, 'resolve_night', { gameId: ctx.s.id, dayIndex: ctx.s.dayIndex }), undefined);
        assert.equal(ctx.log.length, before, '보낸 뒤 누가 무언가를 받음');
        assert.equal(snapshot(ctx, alive[1]).nightTurnDeadline, turn.deadline);
        assertClosesAt(ctx, 'JOKER', turn.deadline);
    });
}

test('A05-B-692 7명: 광대 → A(5초 시작) 뒤 A가 나감 → 5초에 닫힘, 희생자 없음', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b692', role: 'JOKER', n: 7 });
    const [a, b] = citizens(ctx);
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    pickAll(ctx, 'JOKER', a);
    ctx.clock.advance(2_000);
    assert.deepEqual(leaveGame(ctx, a), { ok: true });
    assertClosesAt(ctx, 'JOKER', pickedAt + 5_000);
    runOutNight(ctx);
    assert.equal(dawnOf(ctx, b).victimUuid, null);
});

// 암살을 고른 광대가 빠져도 암살은 남음 (사용자 결정 2026-11-16 낮, 전엔 [지금 동작]이던 줄)
test('A05-B-693 8명 광대 2: 둘 다 A 고른 뒤 광대2가 나감 → 5초에 닫힘, A 죽음', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b693', role: 'JOKER', n: 8, jokerCount: 2 });
    const [, j2] = gf.byRole(ctx.s, 'JOKER');
    const [a, b] = citizens(ctx);
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    pickAll(ctx, 'JOKER', a);
    ctx.clock.advance(2_000);
    assert.deepEqual(leaveGame(ctx, j2), { ok: true });
    assertClosesAt(ctx, 'JOKER', pickedAt + 5_000);
    runOutNight(ctx);
    assert.equal(dawnOf(ctx, b).victimUuid, a);
});

test('A05-B-694 6명: 시민 1명 끊김 중이어도 의사가 고르면 5초 뒤 닫힘', async (t) => {
    const { ctx } = roleTurn(t, { id: 'b694', role: 'JOKER', n: 6 });
    const [a, b] = citizens(ctx);
    await disconnect(ctx, b);
    const turn = skipToTurn(ctx, 'DOCTOR');
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    pickAll(ctx, 'DOCTOR', a);
    assertClosesAt(ctx, 'DOCTOR', pickedAt + 5_000);
});

test('A05-B-695 6명: 광대 차례에 시민이 내면 거절, 5초 알림 없음, 원래 마감', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b695', role: 'JOKER', n: 6 });
    const [a, b] = citizens(ctx);
    ctx.clock.advance(5_000);
    assert.equal(act(ctx, a, b).ok, false);
    assert.equal(seen(ctx, 'phase_settle_started').length, 0);
    assertClosesAt(ctx, 'JOKER', turn.deadline);
});

test('A05-B-699 10명 첫 밤: 마녀사냥꾼 차례 시작·5초 알림 둘 다 0개', (t) => {
    const ctx = setupGame(t, { id: 'b699', n: 10 });
    startNight(ctx);
    const [a] = citizens(ctx);
    // 차례마다 다 골라 5초 알림이 생기게 함
    for (const role of ['JOKER', 'DOCTOR', 'GUARD']) {
        skipToTurn(ctx, role);
        pickAll(ctx, role, a);
    }
    runOutNight(ctx);
    assert.equal(seen(ctx, 'night_turn_started', { role: 'WITCH_HUNTER' }).length, 0);
    assert.equal(seen(ctx, 'phase_settle_started', { role: 'WITCH_HUNTER' }).length, 0);
    assert.ok(seen(ctx, 'phase_settle_started', { role: 'GUARD' }).length > 0);
});

// ---------- A05-B-701~703 5초 당김 중 새로고침: 스냅샷에 "지금 당김 중" 표시 (결정 2026-11-16 아침 8번이 새로고침 뒤에도 지켜지게) ----------
test('A05-B-701 6명: 광대가 다 고르고 2초 뒤 시민의 스냅샷 → phaseSettle = 밤·그날·광대 차례·당긴 마감(nightTurnDeadline과 같음)', (t) => {
    const { ctx, turn } = roleTurn(t, { id: 'b701', role: 'JOKER', n: 6 });
    ctx.clock.advance(turn.deadline - 20_000 - ctx.clock.now());
    const pickedAt = ctx.clock.now();
    pickAll(ctx, 'JOKER', citizens(ctx)[0]);
    ctx.clock.advance(2_000);
    const snap = snapshot(ctx, citizens(ctx)[1]);
    assert.equal(snap.ok, true);
    assert.deepEqual(snap.phaseSettle, { phase: 'NIGHT', dayIndex: ctx.s.dayIndex, role: 'JOKER', deadline: pickedAt + 5_000 });
    assert.equal(snap.nightTurnRole, 'JOKER');
    assert.equal(snap.nightTurnDeadline, pickedAt + 5_000);
});

test('A05-B-702 6명: 광대가 아직 안 고른 차례 중 스냅샷 → phaseSettle 칸 없음', (t) => {
    const { ctx } = roleTurn(t, { id: 'b702', role: 'JOKER', n: 6 });
    ctx.clock.advance(5_000);
    const snap = snapshot(ctx, citizens(ctx)[1]);
    assert.equal(snap.ok, true);
    assert.equal(snap.nightTurnRole, 'JOKER');
    assert.equal(Object.hasOwn(snap, 'phaseSettle'), false);
});

test('A05-B-703 6명: 광대 차례가 5초 뒤 닫히고 의사 차례가 열린 스냅샷 → 광대 당김 표시가 의사 차례에 안 실림', (t) => {
    const { ctx } = roleTurn(t, { id: 'b703', role: 'JOKER', n: 6 });
    pickAll(ctx, 'JOKER', citizens(ctx)[0]);
    ctx.clock.advance(5_000);
    assert.equal(openTurn(ctx)?.role, 'DOCTOR', '의사 차례가 안 열림');
    const snap = snapshot(ctx, citizens(ctx)[1]);
    assert.equal(snap.nightTurnRole, 'DOCTOR');
    assert.equal(Object.hasOwn(snap, 'phaseSettle'), false);
});

// ---------- A05-B-704 암살을 고른 광대가 밤이 끝나기 전에 탈락해도 그 암살은 남음 (사용자 결정 2026-11-16 낮, "보호를 고른 의사가 탈락해도 보호 남음"과 같은 규칙) ----------
test('A05-B-704 8명 광대 2 (차례 120초 방): 둘 다 A 고름 → 광대 차례 닫힘 → 의사 차례 안에 광대1이 끊겨 60초 탈락 → 판 계속, 낮에 A 죽음', async (t) => {
    const { ctx } = roleTurn(t, { id: 'b704', role: 'JOKER', n: 8, jokerCount: 2, turnSec: 120 });
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    const [a, b] = citizens(ctx);
    pickAll(ctx, 'JOKER', a);
    ctx.clock.advance(5_000);
    assert.equal(openTurn(ctx)?.role, 'DOCTOR', '광대 차례가 안 닫힘 (준비 잘못)');
    await disconnect(ctx, j1);
    ctx.clock.advance(60_000);
    assert.equal(ctx.s.players.get(j1).alive, false, '광대1이 탈락 안 함 (준비 잘못)');
    assert.equal(ctx.s.phase, 'NIGHT', '밤이 벌써 끝남 (준비 잘못)');
    runOutNight(ctx);
    assert.equal(dawnOf(ctx, b).victimUuid, a);
    assert.equal(dawnOf(ctx, j2).victimUuid, a);
    assert.equal(ctx.s.players.get(a).alive, false);
});
