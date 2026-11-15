'use strict';

// A05b 밤 동안 연출 알림 없음 흐름 시험 — 성공 연출·연출 대기 사건이 아무에게도 안 가고 차례가 기다림 없이 이어지는지 봄
// 목록 A05-B-543~569 (docs/게임_의도_2026-11-15/시험목록/A05b-밤-알림-낮연출.md B-3), 돌리기: node --env-file=.env.test --test tests/flow/a05b-night-no-presentation.test.js
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

const everyone = (ctx) => [...ctx.s.players.keys()];
const citizens = (ctx) => gf.byRole(ctx.s, 'CITIZEN');
const one = (ctx, role) => gf.firstOf(ctx.s, role);

// ---- 이 파일 시험들 ----

// 없어진 밤 연출 사건 두 개 (옛 화면이 받던 암살 성공 연출·연출 대기 알림)
const GONE = ['night_action_success', 'night_presentation_wait'];

// 그 사람이 이번 밤 시작부터 밤 판정 끝 알림 전까지 받은 사건
function nightEvents(ctx, uuid) {
    const rest = ctx.log.slice(ctx.nightStart);
    const end = rest.findIndex((e) => e.event === 'night_actions_resolved');
    return (end === -1 ? rest : rest.slice(0, end)).filter((e) => e.uuid === uuid);
}

// 판 전원이 받은 사건 중 없어진 연출 사건 수 (판 시작부터 지금까지)
const goneCount = (ctx) => ctx.log.filter((e) => GONE.includes(e.event)).length;

function pickAll(ctx, role, target) {
    for (const uuid of core.getAliveActorUuidsForRole(ctx.s, role)) {
        assert.deepEqual(act(ctx, uuid, target), { ok: true }, `${uuid} 제출 거절`);
    }
}

// 마지막 차례가 닫히면 바로 낮이 되어 날짜가 바뀌니 밤 날짜를 따로 받음
const turnEnded = (ctx, role, dayIndex = ctx.s.dayIndex) => seen(ctx, 'night_turn_ended', { dayIndex, role }).length > 0;

function assertClosesAt(ctx, role, at) {
    const night = ctx.s.dayIndex;
    ctx.clock.advance(at - 1 - ctx.clock.now());
    assert.equal(turnEnded(ctx, role, night), false, `${role} 차례가 ${at - 1}에 벌써 닫힘`);
    ctx.clock.advance(1);
    assert.equal(turnEnded(ctx, role, night), true, `${role} 차례가 ${at}에 안 닫힘`);
}

// 한 사람이 받은 사건 차례에서 앞 사건 바로 다음 사건 (같은 시각인지도 같이)
function nextAfter(ctx, uuid, event, match) {
    const mine = ctx.log.filter((e) => e.uuid === uuid);
    const i = mine.findIndex((e) => e.event === event && Object.entries(match).every(([k, v]) => e.payload?.[k] === v));
    assert.ok(i >= 0, `${uuid}가 ${event}를 못 받음`);
    return { prev: mine[i], next: mine[i + 1] };
}

// 값 안 모든 칸 이름 (깊이 끝까지)
function allKeys(value, out = new Set()) {
    if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
    else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) { out.add(k); allKeys(v, out); }
    }
    return out;
}

// ---------- A05-B-543~548 [버그 5] 광대 암살 성공 밤에 판 누구에게도 연출 사건 없음 ----------
for (const [no, n] of [[543, 5], [544, 6], [545, 7], [546, 8], [547, 9], [548, 10]]) {
    test(`A05-B-${no} [버그 5] ${n}명: 광대가 A를 죽인 밤, 밤 판정 전까지 판 전원 연출 사건 0개`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n });
        startNight(ctx);
        const [a] = citizens(ctx);
        pickAll(ctx, 'JOKER', a);
        runOutNight(ctx);
        // 암살이 진짜 됐는지 먼저 (A 죽음)
        assert.equal(got(ctx, one(ctx, 'JOKER'), 'night_result_applied')[0].victimUuid, a);
        for (const uuid of everyone(ctx)) {
            const names = nightEvents(ctx, uuid).map((e) => e.event);
            for (const gone of GONE) assert.equal(names.includes(gone), false, `${uuid}가 ${gone}를 받음`);
        }
    });
}

// ---------- A05-B-549~552 능력 4종이 성공한 밤에도 연출 사건 없음 ----------
test('A05-B-549 6명: 암살 성공한 밤 → 판 전원 연출 사건 0개', (t) => {
    const ctx = setupGame(t, { id: 'b549', n: 6 });
    startNight(ctx);
    const [a] = citizens(ctx);
    pickAll(ctx, 'JOKER', a);
    runOutNight(ctx);
    assert.equal(got(ctx, a, 'night_result_applied')[0].victimUuid, a);
    assert.equal(goneCount(ctx), 0);
});

test('A05-B-550 7명: 의사가 살린 밤 → 판 전원 연출 사건 0개', (t) => {
    const ctx = setupGame(t, { id: 'b550', n: 7 });
    startNight(ctx);
    const [a] = citizens(ctx);
    pickAll(ctx, 'JOKER', a);
    skipToTurn(ctx, 'DOCTOR');
    pickAll(ctx, 'DOCTOR', a);
    runOutNight(ctx);
    assert.equal(got(ctx, a, 'night_result_applied')[0].doctorSaved, true);
    assert.equal(goneCount(ctx), 0);
});

test('A05-B-551 8명: 경비원이 조사한 밤 → 판 전원 연출 사건 0개', (t) => {
    const ctx = setupGame(t, { id: 'b551', n: 8 });
    startNight(ctx);
    const [a] = citizens(ctx);
    skipToTurn(ctx, 'GUARD');
    pickAll(ctx, 'GUARD', a);
    runOutNight(ctx);
    assert.equal(got(ctx, one(ctx, 'GUARD'), 'night_action_result')[0].actionType, 'INVESTIGATE');
    assert.equal(goneCount(ctx), 0);
});

test('A05-B-552 10명 둘째 밤: 마녀사냥꾼이 확인한 밤 → 판 전원 연출 사건 0개', (t) => {
    const ctx = setupGame(t, { id: 'b552', n: 10 });
    const dead = citizens(ctx).at(-1);
    toSecondNight(ctx, dead);
    skipToTurn(ctx, 'WITCH_HUNTER');
    pickAll(ctx, 'WITCH_HUNTER', dead);
    runOutNight(ctx);
    assert.equal(got(ctx, one(ctx, 'WITCH_HUNTER'), 'night_action_result')[0].actionType, 'CONFIRM');
    assert.equal(goneCount(ctx), 0);
});

// ---------- A05-B-553~557 [버그 5] 밤 동안 광대 대상이 아무에게도 안 알려짐 (7명, 둘째 밤) ----------
for (const [no, who, label] of [[553, 'joker', '광대 본인'], [554, 'victim', '당한 A'], [555, 'doctor', '의사'], [556, 'citizen', '시민'], [557, 'dead', '죽은 관전자']]) {
    test(`A05-B-${no} [버그 5] 7명: 밤 동안 ${label}가 받은 사건 어디에도 광대가 고른 A가 없음`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n: 7 });
        const dead = citizens(ctx).at(-1);
        toSecondNight(ctx, dead);
        const [a, c] = citizens(ctx);
        pickAll(ctx, 'JOKER', a);
        runOutNight(ctx);
        const uuid = { joker: one(ctx, 'JOKER'), victim: a, doctor: one(ctx, 'DOCTOR'), citizen: c, dead }[who];
        const during = nightEvents(ctx, uuid);
        assert.ok(during.length > 0, '밤 사건을 하나도 못 받음');
        for (const e of during) assert.equal(JSON.stringify(e.payload).includes(a), false, `${e.event}에 A가 실림`);
    });
}

test('A05-B-558 6명: 광대 차례가 닫히면 기다림 없이 바로 의사 차례 (같은 시각)', (t) => {
    const ctx = setupGame(t, { id: 'b558', n: 6 });
    startNight(ctx);
    const [a, c] = citizens(ctx);
    pickAll(ctx, 'JOKER', a);
    ctx.clock.advance(5_000);
    const { prev, next } = nextAfter(ctx, c, 'night_turn_ended', { role: 'JOKER' });
    assert.equal(next?.event, 'night_turn_started');
    assert.equal(next.payload.role, 'DOCTOR');
    assert.equal(next.at - prev.at, 0);
});

// ---------- A05-B-559~561 다른 차례 사이도 기다림 없음 ----------
test('A05-B-559 8명: 의사 차례 끝 → 경비원 차례 사이 0ms', (t) => {
    const ctx = setupGame(t, { id: 'b559', n: 8 });
    startNight(ctx);
    const [a, c] = citizens(ctx);
    skipToTurn(ctx, 'DOCTOR');
    pickAll(ctx, 'DOCTOR', a);
    ctx.clock.advance(5_000);
    const { prev, next } = nextAfter(ctx, c, 'night_turn_ended', { role: 'DOCTOR' });
    assert.equal(next?.event, 'night_turn_started');
    assert.equal(next.payload.role, 'GUARD');
    assert.equal(next.at - prev.at, 0);
});

test('A05-B-560 10명 둘째 밤: 경비원 차례 끝 → 마녀사냥꾼 차례 사이 0ms', (t) => {
    const ctx = setupGame(t, { id: 'b560', n: 10 });
    const dead = citizens(ctx).at(-1);
    toSecondNight(ctx, dead);
    const [a, c] = citizens(ctx);
    skipToTurn(ctx, 'GUARD');
    pickAll(ctx, 'GUARD', a);
    ctx.clock.advance(5_000);
    const { prev, next } = nextAfter(ctx, c, 'night_turn_ended', { role: 'GUARD', dayIndex: 2 });
    assert.equal(next?.event, 'night_turn_started');
    assert.equal(next.payload.role, 'WITCH_HUNTER');
    assert.equal(next.at - prev.at, 0);
});

test('A05-B-561 5명(광대만): 마지막 차례 끝 → 밤 결과 사이 0ms', (t) => {
    const ctx = setupGame(t, { id: 'b561', n: 5 });
    startNight(ctx);
    const [a, c] = citizens(ctx);
    pickAll(ctx, 'JOKER', a);
    ctx.clock.advance(5_000);
    const { prev, next } = nextAfter(ctx, c, 'night_turn_ended', { role: 'JOKER' });
    assert.equal(next?.event, 'night_actions_resolved');
    assert.equal(next.at - prev.at, 0);
});

test('A05-B-562 7명: 광대 → A 뒤 판 전원 차례 끝 방송 값은 { gameId, dayIndex, role }뿐', (t) => {
    const ctx = setupGame(t, { id: 'b562', n: 7 });
    startNight(ctx);
    const [a] = citizens(ctx);
    pickAll(ctx, 'JOKER', a);
    runOutNight(ctx);
    for (const uuid of everyone(ctx)) {
        const ended = got(ctx, uuid, 'night_turn_ended');
        assert.ok(ended.length > 0, `${uuid}가 차례 끝 방송을 못 받음`);
        for (const p of ended) assert.deepEqual(Object.keys(p).sort(), ['dayIndex', 'gameId', 'role']);
    }
});

test('A05-B-563 6명: 광대 차례 끝 뒤 옛 "다 봤다" 신호를 보내도 답 없음, 의사 차례·마감 그대로', (t) => {
    const ctx = setupGame(t, { id: 'b563', n: 6 });
    startNight(ctx);
    const joker = one(ctx, 'JOKER');
    pickAll(ctx, 'JOKER', citizens(ctx)[0]);
    ctx.clock.advance(5_000);
    const doctorTurn = openTurn(ctx);
    assert.equal(doctorTurn.role, 'DOCTOR');
    const before = ctx.log.length;
    assert.equal(send(ctx, joker, 'acknowledge_night_action_success', { gameId: ctx.s.id, dayIndex: 1 }), undefined);
    assert.equal(ctx.log.length, before, '신호 뒤 누가 무언가를 받음');
    assertClosesAt(ctx, 'DOCTOR', doctorTurn.deadline);
});

test('A05-B-564 6명: 의사 차례가 열리자마자 낸 대상을 받음 (연출 대기 거절 없음)', (t) => {
    const ctx = setupGame(t, { id: 'b564', n: 6 });
    startNight(ctx);
    const [a] = citizens(ctx);
    pickAll(ctx, 'JOKER', a);
    ctx.clock.advance(5_000);
    assert.equal(openTurn(ctx).role, 'DOCTOR');
    assert.deepEqual(act(ctx, one(ctx, 'DOCTOR'), a), { ok: true });
});

// ---------- A05-B-565~567 밤 중 스냅샷에 연출 칸 없음 (7명) ----------
for (const [no, who, label] of [[565, 'joker', '광대'], [566, 'victim', '당한 A'], [567, 'citizen', '시민']]) {
    test(`A05-B-${no} 7명: 광대 차례 끝 뒤 ${label}의 스냅샷에 연출 칸 없음, A는 아직 산 사람`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n: 7 });
        startNight(ctx);
        const [a, c] = citizens(ctx);
        pickAll(ctx, 'JOKER', a);
        ctx.clock.advance(5_000);
        const uuid = { joker: one(ctx, 'JOKER'), victim: a, citizen: c }[who];
        const snap = snapshot(ctx, uuid);
        assert.equal(snap.ok, true);
        const keys = allKeys(snap);
        assert.equal(keys.has('nightSuccessRecovery'), false);
        assert.equal(keys.has('presentationWaiting'), false);
        assert.equal(snap.players.find((p) => p.uuid === a).isAlive, true);
    });
}

// ---------- A05-B-568~569 둘째·셋째 밤에도 연출 사건 없음 (10명) ----------
// 첫 밤 아무 일 없음 → 2일 밤 광대 암살 → (569만) 3일 밤 경비원 조사
function laterNights(t, id, upToDay) {
    const ctx = setupGame(t, { id, n: 10 });
    startNight(ctx);
    runOutNight(ctx);
    startNight(ctx);
    const [a, b] = citizens(ctx);
    pickAll(ctx, 'JOKER', a);
    runOutNight(ctx);
    assert.equal(got(ctx, b, 'night_result_applied', { dayIndex: 3 })[0]?.victimUuid, a);
    if (upToDay === 3) {
        startNight(ctx);
        skipToTurn(ctx, 'GUARD');
        pickAll(ctx, 'GUARD', b);
        runOutNight(ctx);
        assert.equal(got(ctx, one(ctx, 'GUARD'), 'night_action_result', { dayIndex: 3 })[0]?.targetId, b);
    }
    return ctx;
}

test('A05-B-568 10명: 2일 밤 암살 → 판 전원 연출 사건 0개', (t) => {
    const ctx = laterNights(t, 'b568', 2);
    assert.equal(goneCount(ctx), 0);
});

test('A05-B-569 10명: 3일 밤 조사 → 판 전원 연출 사건 0개', (t) => {
    const ctx = laterNights(t, 'b569', 3);
    assert.equal(goneCount(ctx), 0);
});
