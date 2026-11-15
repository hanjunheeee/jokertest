'use strict';

// A05b 밤 능력 결과는 쓴 사람에게만 흐름 시험 — 경비원·마녀사냥꾼·광대 실패 결과가 누구에게 가고 당한 사람에겐 흔적이 없는지 봄
// 목록 A05-B-570~587·700 (docs/게임_의도_2026-11-15/시험목록/A05b-밤-알림-낮연출.md B-4·B-7), 돌리기: node --env-file=.env.test --test tests/flow/a05b-private-result-delivery.test.js
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

// 낮 투표·재판을 판 규칙으로 바로 돌려 한 사람 처형 (시험 앞 준비만, 끝나면 밤)
function executeByDay(ctx, uuid) {
    gf.toTribunal(ctx.s, uuid);
    for (const p of ctx.s.players.values()) {
        if (p.alive && p.uuid !== uuid) core.submitTribunalVote(p.uuid, ctx.s.id, ctx.s.dayIndex, 'GUILTY');
    }
    const anyone = [...ctx.s.players.values()].find((p) => p.alive).uuid;
    const prepared = core.prepareTribunalVoteResolution(anyone, ctx.s.id, ctx.s.dayIndex);
    assert.equal(prepared.ok, true, `재판 준비 실패: ${prepared.code}`);
    const committed = core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `재판 확정 실패: ${committed.code}`);
}

// ---- 이 파일 시험들 ----

function pickAll(ctx, role, target) {
    for (const uuid of core.getAliveActorUuidsForRole(ctx.s, role)) {
        assert.deepEqual(act(ctx, uuid, target), { ok: true }, `${uuid} 제출 거절`);
    }
}

// 직업 차례로 가서 그 사람(들)이 대상을 고름 (picks = [[직업, 대상], ...] 차례대로)
function playTurns(ctx, picks) {
    for (const [role, target] of picks) {
        skipToTurn(ctx, role);
        pickAll(ctx, role, target);
    }
    runOutNight(ctx);
}

const results = (ctx, uuid) => got(ctx, uuid, 'night_action_result');

// 사건 이름 차례 + 값 칸 이름 (값 모양 비교용, 받는 사람마다 다른 칸 값은 안 봄)
const shapeOf = (ctx, uuid, fromIndex = 0) => ctx.log.slice(fromIndex)
    .filter((e) => e.uuid === uuid)
    .map((e) => `${e.event}:${Object.keys(e.payload ?? {}).sort().join(',')}`);

test('A05-B-570 8명: 경비원 조사 결과는 경비원 소켓만 받음, 나머지 7명 개인 결과 0개', (t) => {
    const ctx = setupGame(t, { id: 'b570', n: 8 });
    startNight(ctx);
    const guard = one(ctx, 'GUARD');
    const [a] = citizens(ctx);
    playTurns(ctx, [['GUARD', a]]);
    const [r] = results(ctx, guard);
    assert.equal(results(ctx, guard).length, 1);
    assert.equal(r.actionType, 'INVESTIGATE');
    assert.equal(r.targetId, a);
    assert.equal(r.role, 'CITIZEN');
    for (const uuid of everyone(ctx).filter((u) => u !== guard)) assert.equal(results(ctx, uuid).length, 0, `${uuid}가 개인 결과를 받음`);
});

// ---------- A05-B-571~574 조사당한 사람은 아무 일 없던 시민과 같은 것만 받음 (10명) ----------
for (const [no, role, label] of [[571, 'JOKER', '광대'], [572, 'DOCTOR', '의사'], [573, 'CITIZEN', '시민'], [574, 'WITCH_HUNTER', '마녀사냥꾼']]) {
    test(`A05-B-${no} 10명: 조사당한 ${label}가 받은 사건 차례·값 모양 = 아무 일 없던 산 시민의 것`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n: 10 });
        startNight(ctx);
        const [c1, c2] = citizens(ctx);
        // 시민을 조사하면 c1이 대상, 비교할 아무 일 없던 시민은 c2
        const target = role === 'CITIZEN' ? c1 : one(ctx, role);
        const plain = c2;
        playTurns(ctx, [['GUARD', target]]);
        assert.equal(results(ctx, one(ctx, 'GUARD'))[0].targetId, target);
        assert.deepEqual(shapeOf(ctx, target, ctx.nightStart), shapeOf(ctx, plain, ctx.nightStart));
        assert.equal(results(ctx, target).length, 0);
    });
}

test('A05-B-575 10명 둘째 밤: 마녀사냥꾼 확인 대상(죽은 C)은 아무것도 안 받음, 받은 사건 = 다른 죽은 관전자와 같음', (t) => {
    const ctx = setupGame(t, { id: 'b575', n: 10 });
    const all = citizens(ctx);
    const c = all.at(-1);
    const d = all.at(-2);
    // 첫 밤 C가 죽고, 둘째 낮 재판으로 D가 처형됨 → 둘째 밤 죽은 관전자 둘
    startNight(ctx);
    pickAll(ctx, 'JOKER', c);
    runOutNight(ctx);
    executeByDay(ctx, d);
    startNight(ctx);
    const witch = one(ctx, 'WITCH_HUNTER');
    playTurns(ctx, [['WITCH_HUNTER', c]]);
    const [r] = results(ctx, witch);
    assert.equal(r.actionType, 'CONFIRM');
    assert.equal(r.targetId, c);
    assert.equal(results(ctx, c).length, 0);
    assert.deepEqual(shapeOf(ctx, c, ctx.nightStart), shapeOf(ctx, d, ctx.nightStart));
});

test('A05-B-576 7명: 암살이 막히면 광대만 실패 결과, 의사·A는 개인 결과 0', (t) => {
    const ctx = setupGame(t, { id: 'b576', n: 7 });
    startNight(ctx);
    const [a] = citizens(ctx);
    playTurns(ctx, [['JOKER', a], ['DOCTOR', a]]);
    const [r] = results(ctx, one(ctx, 'JOKER'));
    assert.equal(r.actionType, 'ASSASSINATE');
    assert.equal(r.success, false);
    assert.equal(results(ctx, one(ctx, 'DOCTOR')).length, 0);
    assert.equal(results(ctx, a).length, 0);
});

test('A05-B-577 8명 광대 2: 둘 다 A, 의사 → A면 광대 두 소켓 다 실패 결과', (t) => {
    const ctx = setupGame(t, { id: 'b577', n: 8, jokerCount: 2 });
    startNight(ctx);
    const [a] = citizens(ctx);
    playTurns(ctx, [['JOKER', a], ['DOCTOR', a]]);
    for (const j of gf.byRole(ctx.s, 'JOKER')) {
        const [r] = results(ctx, j);
        assert.equal(r?.actionType, 'ASSASSINATE', `${j} 결과`);
        assert.equal(r.success, false);
    }
});

test('A05-B-578 10명 경비원 2: 둘 다 A 조사 → 경비원 둘 다 결과, A 개인 결과 0', (t) => {
    const ctx = setupGame(t, { id: 'b578', n: 10, roleCounts: { JOKER: 1, GUARD: 2 } });
    startNight(ctx);
    const [a] = citizens(ctx);
    playTurns(ctx, [['GUARD', a]]);
    for (const g of gf.byRole(ctx.s, 'GUARD')) {
        const [r] = results(ctx, g);
        assert.equal(r?.actionType, 'INVESTIGATE', `${g} 결과`);
        assert.equal(r.targetId, a);
    }
    assert.equal(results(ctx, a).length, 0);
});

test('A05-B-579 10명 경비원 2: A·B 따로 조사 → 경비원 둘 다 결과 0, A·B도 0', (t) => {
    const ctx = setupGame(t, { id: 'b579', n: 10, roleCounts: { JOKER: 1, GUARD: 2 } });
    startNight(ctx);
    const [g1, g2] = gf.byRole(ctx.s, 'GUARD');
    const [a, b] = citizens(ctx);
    skipToTurn(ctx, 'GUARD');
    assert.deepEqual(act(ctx, g1, a), { ok: true });
    assert.deepEqual(act(ctx, g2, b), { ok: true });
    runOutNight(ctx);
    for (const uuid of [g1, g2, a, b]) assert.equal(results(ctx, uuid).length, 0, `${uuid}가 결과를 받음`);
});

test('A05-B-580 8명: 경비원 소켓이 받는 밤 끝 차례 = 판정 끝 → 개인 결과 → 공개 결과', (t) => {
    const ctx = setupGame(t, { id: 'b580', n: 8 });
    startNight(ctx);
    const guard = one(ctx, 'GUARD');
    playTurns(ctx, [['GUARD', citizens(ctx)[0]]]);
    const names = ctx.log.filter((e) => e.uuid === guard).map((e) => e.event);
    const i = names.indexOf('night_actions_resolved');
    assert.deepEqual(names.slice(i, i + 3), ['night_actions_resolved', 'night_action_result', 'night_result_applied']);
});

// ---------- A05-B-581~586 네 직업이 다 쓴 밤, 받는 사람별 개인 결과 (10명, 광대 2, 둘째 밤) ----------
// 광대 둘 → A, 의사 → A, 경비원 → B, 마녀사냥꾼 → 죽은 C
function fullNight(t, id) {
    const ctx = setupGame(t, { id, n: 10, jokerCount: 2 });
    const all = citizens(ctx);
    const c = all.at(-1);
    toSecondNight(ctx, c);
    const [a, b] = all;
    playTurns(ctx, [['JOKER', a], ['DOCTOR', a], ['GUARD', b], ['WITCH_HUNTER', c]]);
    const mine = (uuid) => results(ctx, uuid).filter((r) => r.dayIndex === 2);
    return { ctx, a, b, c, plain: all[2], mine };
}

test('A05-B-581 10명 광대 2 둘째 밤: 광대 둘은 암살 실패 결과', (t) => {
    const { ctx, mine } = fullNight(t, 'b581');
    for (const j of gf.byRole(ctx.s, 'JOKER')) {
        assert.deepEqual(mine(j).map((r) => [r.actionType, r.success]), [['ASSASSINATE', false]], `${j}`);
    }
});

test('A05-B-582 10명 광대 2 둘째 밤: 의사는 개인 결과 없음', (t) => {
    const { ctx, mine } = fullNight(t, 'b582');
    assert.equal(mine(one(ctx, 'DOCTOR')).length, 0);
});

test('A05-B-583 10명 광대 2 둘째 밤: 경비원은 B 조사 결과', (t) => {
    const { ctx, b, mine } = fullNight(t, 'b583');
    assert.deepEqual(mine(one(ctx, 'GUARD')).map((r) => [r.actionType, r.targetId]), [['INVESTIGATE', b]]);
});

test('A05-B-584 10명 광대 2 둘째 밤: 마녀사냥꾼은 죽은 C 확인 결과', (t) => {
    const { ctx, c, mine } = fullNight(t, 'b584');
    assert.deepEqual(mine(one(ctx, 'WITCH_HUNTER')).map((r) => [r.actionType, r.targetId]), [['CONFIRM', c]]);
});

test('A05-B-585 10명 광대 2 둘째 밤: 산 시민은 개인 결과 없음', (t) => {
    const { plain, mine } = fullNight(t, 'b585');
    assert.equal(mine(plain).length, 0);
});

test('A05-B-586 10명 광대 2 둘째 밤: 죽은 관전자는 개인 결과 없음', (t) => {
    const { c, mine } = fullNight(t, 'b586');
    assert.equal(mine(c).length, 0);
});

test('A05-B-587 8명: 조사당한 A가 끊김 기다림 뒤 다시 붙어도 스냅샷에 조사 흔적 없음', async (t) => {
    const ctx = setupGame(t, { id: 'b587', n: 8 });
    startNight(ctx);
    const [a] = citizens(ctx);
    skipToTurn(ctx, 'GUARD');
    pickAll(ctx, 'GUARD', a);
    await disconnect(ctx, a);
    runOutNight(ctx);
    assert.equal(results(ctx, one(ctx, 'GUARD'))[0].targetId, a);
    reconnect(ctx, a);
    const snap = snapshot(ctx, a);
    assert.equal(snap.ok, true);
    assert.equal('nightActionResult' in snap.self, false);
    assert.equal(JSON.stringify(snap).includes('INVESTIGATE'), false);
});

test('A05-B-700 8명: 경비원이 조사한 A가 그 밤 죽어도 경비원은 결과를 받음, 공개 값 희생자 A', (t) => {
    const ctx = setupGame(t, { id: 'b700', n: 8 });
    startNight(ctx);
    const [a, b] = citizens(ctx);
    playTurns(ctx, [['JOKER', a], ['GUARD', a]]);
    const [r] = results(ctx, one(ctx, 'GUARD'));
    assert.equal(r?.actionType, 'INVESTIGATE');
    assert.equal(r.targetId, a);
    assert.equal(got(ctx, b, 'night_result_applied')[0].victimUuid, a);
});
