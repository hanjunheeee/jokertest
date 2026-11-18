'use strict';

// A05b 낮이 될 때 모두에게 흐름 시험 — 밤 결과 공개 값(희생자·사망 공개)이 판 전원에게 같게 한 번 가는지, doctorSaved 칸은 안 실리는지, 새로고침엔 다시 안 가는지 봄
// 목록 A05-B-588~619·696~698 (docs/게임_의도_2026-11-15/시험목록/A05b-밤-알림-낮연출.md B-5·B-7), 돌리기: node --env-file=.env.test --test tests/flow/a05b-dawn-broadcast.test.js
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

function pickAll(ctx, role, target) {
    for (const uuid of core.getAliveActorUuidsForRole(ctx.s, role)) {
        assert.deepEqual(act(ctx, uuid, target), { ok: true }, `${uuid} 제출 거절`);
    }
}

// 직업 차례로 가서 그 사람(들)이 대상을 고름 (picks = [[직업, 대상], ...] 차례대로), 밤 끝까지
function playTurns(ctx, picks) {
    for (const [role, target] of picks) {
        skipToTurn(ctx, role);
        pickAll(ctx, role, target);
    }
    runOutNight(ctx);
}

// 그 밤(밤 날짜 night) 끝에 그 사람이 받은 낮 시작 공개 값 (판정 뒤 날짜 = 밤 날짜 + 1)
const dawn = (ctx, uuid, night) => got(ctx, uuid, 'night_result_applied', { dayIndex: night + 1 });

// 연출 값 두 칸(희생자·사망 공개) + 의사 살림 칸이 실렸나 (2026-11-18부터 안 실음 → 늘 거짓)
const show = (p) => ({ victimUuid: p.victimUuid, deathReveals: p.deathReveals, hasDoctorSaved: Object.hasOwn(p, 'doctorSaved') });
const killed = (a) => ({ victimUuid: a, deathReveals: [{ victimUuid: a, source: 'JOKER' }], hasDoctorSaved: false });
// 아무도 안 죽은 밤: 의사가 살렸든 광대가 안 죽였든 같은 값 (사용자 결정 2026-11-18)
const QUIET = { victimUuid: null, deathReveals: [], hasDoctorSaved: false };

// 값 안 모든 칸 이름 (깊이 끝까지)
function allKeys(value, out = new Set()) {
    if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
    else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) { out.add(k); allKeys(v, out); }
    }
    return out;
}

// 새로고침 스냅샷에 지난 밤 연출 칸이 없음
function assertNoPresentation(snap) {
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    const keys = allKeys(snap);
    assert.equal(keys.has('nightSuccessRecovery'), false);
    assert.equal(keys.has('presentationWaiting'), false);
}

// ---------- A05-B-588~593 [버그 5] 광대가 A를 죽이면 판 전원이 같은 공개 값 ----------
for (const [no, n] of [[588, 5], [589, 6], [590, 7], [591, 8], [592, 9], [593, 10]]) {
    test(`A05-B-${no} [버그 5] ${n}명: 광대가 A를 죽이면 판 전원 소켓마다 낮 시작 공개 값 1번, 희생자 A·사망 공개 [A·광대]·doctorSaved 칸 없음`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n });
        startNight(ctx);
        const [a] = citizens(ctx);
        playTurns(ctx, [['JOKER', a]]);
        for (const uuid of everyone(ctx)) {
            const all = got(ctx, uuid, 'night_result_applied');
            assert.equal(all.length, 1, `${uuid} 받은 수`);
            assert.deepEqual(show(all[0]), killed(a), `${uuid} 값`);
        }
    });
}

// ---------- A05-B-594~598 [버그 5] 받는 사람 종류마다 같은 값 (7명, 둘째 밤) ----------
for (const [no, who, label] of [[594, 'citizen', '산 시민'], [595, 'joker', '광대 본인'], [596, 'victim', '당한 A'], [597, 'dead', '전날 죽은 관전자'], [598, 'doctor', '의사']]) {
    test(`A05-B-${no} [버그 5] 7명: ${label}도 산 시민과 같은 낮 시작 공개 값`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n: 7 });
        const dead = citizens(ctx).at(-1);
        toSecondNight(ctx, dead);
        const [a, c] = citizens(ctx);
        playTurns(ctx, [['JOKER', a]]);
        const uuid = { citizen: c, joker: one(ctx, 'JOKER'), victim: a, dead, doctor: one(ctx, 'DOCTOR') }[who];
        const [mine] = dawn(ctx, uuid, 2);
        const [ref] = dawn(ctx, c, 2);
        assert.ok(mine, `${label}가 공개 값을 못 받음`);
        assert.deepEqual(show(mine), killed(a));
        assert.deepEqual(mine, ref);
    });
}

// ---------- A05-B-599~603 의사가 살려도 판 전원이 아무 일 없는 밤과 같은 값 (doctorSaved 칸 없음) ----------
for (const [no, n] of [[599, 6], [600, 7], [601, 8], [602, 9], [603, 10]]) {
    test(`A05-B-${no} ${n}명: 의사가 살리면 판 전원 doctorSaved 칸 없음, 희생자 null, 사망 공개 []`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n });
        startNight(ctx);
        const [a] = citizens(ctx);
        playTurns(ctx, [['JOKER', a], ['DOCTOR', a]]);
        for (const uuid of everyone(ctx)) {
            const [p] = dawn(ctx, uuid, 1);
            assert.ok(p, `${uuid}가 공개 값을 못 받음`);
            assert.deepEqual(show(p), QUIET, `${uuid} 값`);
        }
    });
}

// ---------- A05-B-604~606 의사가 살렸을 때 받는 사람 종류 (8명, 둘째 밤) ----------
for (const [no, who, label] of [[604, 'joker', '광대'], [605, 'saved', '보호받은 사람'], [606, 'dead', '죽은 관전자']]) {
    test(`A05-B-${no} 8명: 의사가 살린 밤 ${label}도 같은 공개 값 (doctorSaved 칸 없음)`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n: 8 });
        const dead = citizens(ctx).at(-1);
        toSecondNight(ctx, dead);
        const [a, c] = citizens(ctx);
        playTurns(ctx, [['JOKER', a], ['DOCTOR', a]]);
        const uuid = { joker: one(ctx, 'JOKER'), saved: a, dead }[who];
        const [mine] = dawn(ctx, uuid, 2);
        assert.ok(mine, `${label}가 공개 값을 못 받음`);
        assert.deepEqual(show(mine), QUIET);
        assert.deepEqual(mine, dawn(ctx, c, 2)[0]);
    });
}

// ---------- A05-B-607~609 아무 일 없으면 연출 값이 다 비어 있음, 의사가 살린 밤과 같음 (8명) ----------
test('A05-B-607 8명: 광대가 건너뜀 → 희생자 null, 사망 공개 [], doctorSaved 칸 없음', (t) => {
    const ctx = setupGame(t, { id: 'b607', n: 8 });
    startNight(ctx);
    playTurns(ctx, [['JOKER', null]]);
    for (const uuid of everyone(ctx)) assert.deepEqual(show(dawn(ctx, uuid, 1)[0]), QUIET, `${uuid} 값`);
});

test('A05-B-608 8명 광대 2: 광대 둘이 다른 대상 → 희생자 null, 사망 공개 [], doctorSaved 칸 없음', (t) => {
    const ctx = setupGame(t, { id: 'b608', n: 8, jokerCount: 2 });
    startNight(ctx);
    const [j1, j2] = gf.byRole(ctx.s, 'JOKER');
    const [a, b] = citizens(ctx);
    assert.deepEqual(act(ctx, j1, a), { ok: true });
    assert.deepEqual(act(ctx, j2, b), { ok: true });
    runOutNight(ctx);
    for (const uuid of everyone(ctx)) assert.deepEqual(show(dawn(ctx, uuid, 1)[0]), QUIET, `${uuid} 값`);
});

test('A05-B-609 8명: 광대가 안 내고 시간 끝 → 희생자 null, 사망 공개 [], doctorSaved 칸 없음', (t) => {
    const ctx = setupGame(t, { id: 'b609', n: 8 });
    startNight(ctx);
    runOutNight(ctx);
    for (const uuid of everyone(ctx)) assert.deepEqual(show(dawn(ctx, uuid, 1)[0]), QUIET, `${uuid} 값`);
});

test('A05-B-610 7명: 광대 → A 뒤 A가 밤 중 나가면 남은 전원 희생자 null, doctorSaved 칸 없음', (t) => {
    const ctx = setupGame(t, { id: 'b610', n: 7 });
    startNight(ctx);
    const [a] = citizens(ctx);
    pickAll(ctx, 'JOKER', a);
    skipToTurn(ctx, 'DOCTOR');
    assert.deepEqual(leaveGame(ctx, a), { ok: true });
    runOutNight(ctx);
    for (const uuid of everyone(ctx).filter((u) => u !== a)) {
        const [p] = dawn(ctx, uuid, 1);
        assert.ok(p, `${uuid}가 공개 값을 못 받음`);
        assert.equal(p.victimUuid, null);
        assert.equal(Object.hasOwn(p, 'doctorSaved'), false);
    }
});

// ---------- A05-B-611~613 세 밤 연달아 — 밤마다 그 밤 값만 (10명) ----------
// 1밤 A 죽음 → 2밤 의사가 B 살림 → 3밤 아무 일 없음
function threeNights(t, id) {
    const ctx = setupGame(t, { id, n: 10 });
    const [a, b, c] = citizens(ctx);
    startNight(ctx);
    playTurns(ctx, [['JOKER', a]]);
    startNight(ctx);
    playTurns(ctx, [['JOKER', b], ['DOCTOR', b]]);
    startNight(ctx);
    runOutNight(ctx);
    return { ctx, a, c };
}

test('A05-B-611 10명 세 밤: 1밤 공개 값은 희생자 A', (t) => {
    const { ctx, a, c } = threeNights(t, 'b611');
    assert.deepEqual(show(dawn(ctx, c, 1)[0]), killed(a));
});

test('A05-B-612 10명 세 밤: 2밤 공개 값은 아무 일 없는 밤 값 (의사가 살렸어도, 앞 밤 희생자 안 남음)', (t) => {
    const { ctx, c } = threeNights(t, 'b612');
    assert.deepEqual(show(dawn(ctx, c, 2)[0]), QUIET);
});

test('A05-B-613 10명 세 밤: 3밤 공개 값은 다 비어 있음 (2밤과 같은 값)', (t) => {
    const { ctx, c } = threeNights(t, 'b613');
    assert.deepEqual(show(dawn(ctx, c, 3)[0]), QUIET);
});

// ---------- A05-B-614~615 반대 차례 두 밤 (7명) ----------
// 1밤 의사가 A 살림 → 2밤 B 죽음
function savedThenKilled(t, id) {
    const ctx = setupGame(t, { id, n: 7 });
    const [a, b, c] = citizens(ctx);
    startNight(ctx);
    playTurns(ctx, [['JOKER', a], ['DOCTOR', a]]);
    startNight(ctx);
    playTurns(ctx, [['JOKER', b]]);
    return { ctx, b, c };
}

test('A05-B-614 7명 두 밤: 1밤 값은 희생자 없음·doctorSaved 칸 없음', (t) => {
    const { ctx, c } = savedThenKilled(t, 'b614');
    assert.deepEqual(show(dawn(ctx, c, 1)[0]), QUIET);
});

test('A05-B-615 7명 두 밤: 2밤 값은 희생자 B·doctorSaved 칸 없음', (t) => {
    const { ctx, b, c } = savedThenKilled(t, 'b615');
    assert.deepEqual(show(dawn(ctx, c, 2)[0]), killed(b));
});

test('A05-B-616 6명: 끊김 기다림 중이던 B가 다시 붙으면 스냅샷엔 A 사망만, 연출 칸 없음, 공개 값 다시 안 옴', async (t) => {
    const ctx = setupGame(t, { id: 'b616', n: 6 });
    startNight(ctx);
    const [a, b] = citizens(ctx);
    await disconnect(ctx, b);
    playTurns(ctx, [['JOKER', a]]);
    const sock = reconnect(ctx, b);
    const snap = snapshot(ctx, b);
    assertNoPresentation(snap);
    assert.equal(snap.players.find((p) => p.uuid === a).isAlive, false);
    assert.equal(seen(ctx, 'night_result_applied').filter((e) => e.sockId === sock.id).length, 0);
});

// ---------- A05-B-617~619 낮 토론 중 새로고침(새 소켓) (8명, 둘째 밤 뒤) ----------
for (const [no, who, label] of [[617, 'citizen', '산 시민'], [618, 'dead', '죽은 관전자'], [619, 'victim', '당한 A']]) {
    test(`A05-B-${no} 8명: 낮 토론 중 ${label}가 새로고침하면 A 사망만 보이고 연출 칸 없음, 공개 값 다시 안 옴`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n: 8 });
        const dead = citizens(ctx).at(-1);
        toSecondNight(ctx, dead);
        const [a, c] = citizens(ctx);
        playTurns(ctx, [['JOKER', a]]);
        const uuid = { citizen: c, dead, victim: a }[who];
        const sock = reconnect(ctx, uuid);
        const snap = snapshot(ctx, uuid);
        assertNoPresentation(snap);
        assert.equal(snap.phase, 'DAY');
        assert.equal(snap.players.find((p) => p.uuid === a).isAlive, false);
        assert.equal(seen(ctx, 'night_result_applied').filter((e) => e.sockId === sock.id).length, 0);
    });
}

test('A05-B-696 5명 같은 방 둘째 판: 첫 밤 광대 → A면 밤 동안 연출 사건 0, 낮 공개 값 희생자 A', async (t) => {
    const ctx = setupGame(t, { id: 'b696', n: 5 });
    // 첫 판: 광대가 나가 시민 승으로 끝남 → 결과 화면에서 모두 나감
    const firstJoker = one(ctx, 'JOKER');
    assert.deepEqual(leaveGame(ctx, firstJoker), { ok: true });
    for (const uuid of everyone(ctx).filter((u) => u !== firstJoker)) assert.deepEqual(leaveGame(ctx, uuid), { ok: true });
    // 판 채널 떼기가 끝날 때까지 기다림 (같은 소켓이 둘째 판 채널에 다시 붙음)
    await gf.flush();
    // 둘째 판: 같은 방·같은 5명
    const s2 = gf.startGame({ id: 'b696', n: 5, settings: { nightActionTime: 30 } });
    gf.toDay(s2);
    ctx.s = s2;
    ctx.log.length = 0;
    ctx.world = gf.socketWorld(gs, s2);
    for (const [uuid, sock] of ctx.world.sockets) {
        watch(ctx, sock, uuid);
        gs.registerGameHandlers(ctx.world.io, sock, uuid);
    }
    T.startDayPhaseTimer(ctx.world.io, s2, { ...ctx.fns, discussionDurationMs: 600_000, voteDurationMs: 600_000 });
    startNight(ctx);
    const [a] = citizens(ctx);
    playTurns(ctx, [['JOKER', a]]);
    assert.equal(ctx.log.filter((e) => ['night_action_success', 'night_presentation_wait'].includes(e.event)).length, 0);
    for (const uuid of everyone(ctx)) assert.deepEqual(show(dawn(ctx, uuid, 1)[0]), killed(a), `${uuid} 값`);
});

test('A05-B-697 6명: 광대가 끊긴 채 시간 끝 → 아무 일 없는 낮 (공개 값 비어 있음)', async (t) => {
    const ctx = setupGame(t, { id: 'b697', n: 6 });
    startNight(ctx);
    const joker = one(ctx, 'JOKER');
    await disconnect(ctx, joker);
    // 광대 차례는 원래 마감(30초)에 건너뛰기로 닫히고, 의사가 바로 골라 60초 탈락 전에 밤이 끝남
    skipToTurn(ctx, 'DOCTOR');
    pickAll(ctx, 'DOCTOR', citizens(ctx)[0]);
    runOutNight(ctx);
    for (const uuid of everyone(ctx).filter((u) => u !== joker)) {
        assert.deepEqual(show(dawn(ctx, uuid, 1)[0]), QUIET, `${uuid} 값`);
    }
});

test('A05-B-698 7명: 의사가 같은 A를 두 밤 연달아 지켜도 두 밤 다 아무 일 없는 밤 값 (doctorSaved 칸 없음)', (t) => {
    const ctx = setupGame(t, { id: 'b698', n: 7 });
    const [a, , c] = citizens(ctx);
    startNight(ctx);
    playTurns(ctx, [['JOKER', a], ['DOCTOR', a]]);
    startNight(ctx);
    playTurns(ctx, [['JOKER', a], ['DOCTOR', a]]);
    assert.deepEqual(show(dawn(ctx, c, 1)[0]), QUIET);
    assert.deepEqual(show(dawn(ctx, c, 2)[0]), QUIET);
});
