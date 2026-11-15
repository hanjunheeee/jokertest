'use strict';

// A05b 밤 암살로 판이 끝남 흐름 시험 — 밤 암살로 광대가 이기면 판 끝 값에도 희생자가 실리고, 끝난 판엔 낮·밤이 더 안 가는지 봄
// 목록 A05-B-620~630 (docs/게임_의도_2026-11-15/시험목록/A05b-밤-알림-낮연출.md B-6), 돌리기: node --env-file=.env.test --test tests/flow/a05b-night-end-game.test.js
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

// 밤을 아무 일 없이 판 규칙으로 바로 넘김 (처형 준비 사이 밤, 소켓 안 거침)
function quietNight(ctx) {
    gf.skipAllNight(ctx.s);
    const { committed } = gf.resolveNightDirect(ctx.s);
    assert.equal(committed?.ok, true, '조용한 밤 확정 실패');
}

// ---- 이 파일 시험들 ----

function pickAll(ctx, role, target) {
    for (const uuid of core.getAliveActorUuidsForRole(ctx.s, role)) {
        assert.deepEqual(act(ctx, uuid, target), { ok: true }, `${uuid} 제출 거절`);
    }
}

// 낮 처형으로 광대 아닌 산 사람을 keep만 남김 (처형 사이 밤은 아무 일 없음), 끝나면 낮
function executeAllBut(ctx, keep) {
    const victims = [...ctx.s.players.values()].filter((p) => p.role !== 'JOKER' && !keep.includes(p.uuid)).map((p) => p.uuid);
    for (const uuid of victims) {
        executeByDay(ctx, uuid);
        quietNight(ctx);
    }
}

// 판 끝 값에서 보는 칸: 단계·이긴 쪽·희생자·사망 공개
const endShow = (p) => ({ phase: p.phase, winner: p.winResult?.winner, victimUuid: p.victimUuid, deathReveals: p.deathReveals });
const jokerWinBy = (a) => ({ phase: 'ENDED', winner: 'JOKER', victimUuid: a, deathReveals: [{ victimUuid: a, source: 'JOKER' }] });

// ---------- A05-B-620~624 [임시 9] 밤 암살로 산 광대 ≥ 나머지가 되면 판 끝 값에도 희생자 ----------
for (const [no, n] of [[620, 5], [621, 6], [622, 7], [623, 8], [624, 10]]) {
    test(`A05-B-${no} [임시 9] ${n}명: 처형으로 나머지 2명 → 밤 암살로 판 끝, 판 전원 판 끝 값에 광대 승·희생자 A`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n });
        const [a, b] = citizens(ctx);
        executeAllBut(ctx, [a, b]);
        startNight(ctx);
        pickAll(ctx, 'JOKER', a);
        runOutNight(ctx);
        for (const uuid of everyone(ctx)) {
            const all = got(ctx, uuid, 'night_result_applied');
            assert.equal(all.length, 1, `${uuid} 받은 수`);
            assert.deepEqual(endShow(all[0]), jokerWinBy(a), `${uuid} 값`);
        }
    });
}

// ---------- A05-B-625~627 판 끝 값을 받는 사람 종류 (5명, 광대 2) ----------
for (const [no, who, label] of [[625, 'joker', '광대'], [626, 'citizen', '산 시민'], [627, 'victim', '당한 A']]) {
    test(`A05-B-${no} [임시 9] 5명 광대 2: 밤 암살로 판 끝 → ${label}도 같은 판 끝 값`, (t) => {
        const ctx = setupGame(t, { id: `b${no}`, n: 5, jokerCount: 2 });
        const [a, c] = citizens(ctx);
        startNight(ctx);
        pickAll(ctx, 'JOKER', a);
        runOutNight(ctx);
        const uuid = { joker: one(ctx, 'JOKER'), citizen: c, victim: a }[who];
        const [mine] = got(ctx, uuid, 'night_result_applied');
        assert.ok(mine, `${label}가 판 끝 값을 못 받음`);
        assert.deepEqual(endShow(mine), jokerWinBy(a));
        assert.deepEqual(mine, got(ctx, c, 'night_result_applied')[0]);
    });
}

test('A05-B-628 5명: 밤 암살로 판이 끝나면 토론 시간이 지나도 낮 단계 사건 없음', (t) => {
    const ctx = setupGame(t, { id: 'b628', n: 5 });
    const [a, b] = citizens(ctx);
    executeAllBut(ctx, [a, b]);
    startNight(ctx);
    pickAll(ctx, 'JOKER', a);
    runOutNight(ctx);
    assert.equal(got(ctx, b, 'night_result_applied')[0].phase, 'ENDED');
    // 낮 타이머는 가짜 시계에 묶여 있음: 토론·투표 시간(각 600초)을 넘게 밀어 봄
    ctx.clock.advance(30 * 60_000);
    assert.equal(seen(ctx, 'day_phase_changed').length, 0);
    assert.equal(seen(ctx, 'day_vote_resolved').length, 0);
    assert.equal(seen(ctx, 'phase_settle_started', { phase: 'DAY' }).length, 0);
});

test('A05-B-629 6명 광대 2: 광대 2·나머지 3에서 광대 → A, 의사 → A면 판이 안 끝남 (낮, doctorSaved 참)', (t) => {
    const ctx = setupGame(t, { id: 'b629', n: 6, jokerCount: 2 });
    const [a, b] = citizens(ctx);
    executeAllBut(ctx, [a, b, one(ctx, 'DOCTOR')]);
    startNight(ctx);
    pickAll(ctx, 'JOKER', a);
    skipToTurn(ctx, 'DOCTOR');
    pickAll(ctx, 'DOCTOR', a);
    runOutNight(ctx);
    const [p] = got(ctx, b, 'night_result_applied');
    assert.equal(p.phase, 'DAY');
    assert.equal(p.doctorSaved, true);
});

test('A05-B-630 6명 광대 2: 광대 둘 다 고른 5초 안에 시민이 나가 판이 끝나면 차례 끝·밤 결과 안 옴', (t) => {
    const ctx = setupGame(t, { id: 'b630', n: 6, jokerCount: 2 });
    const [a, b] = citizens(ctx);
    executeAllBut(ctx, [a, b, one(ctx, 'DOCTOR')]);
    startNight(ctx);
    pickAll(ctx, 'JOKER', a);
    assert.equal(seen(ctx, 'phase_settle_started', { role: 'JOKER' }).length > 0, true);
    ctx.clock.advance(2_000);
    assert.deepEqual(leaveGame(ctx, b), { ok: true });
    // 광대 2 ≥ 나머지 2 → 판 끝 (나가기 방송에 판 끝 단계)
    assert.equal(got(ctx, a, 'session_participation_changed').at(-1)?.phase, 'ENDED');
    const before = ctx.log.length;
    ctx.clock.advance(10_000);
    const after = ctx.log.slice(before).map((e) => e.event);
    assert.equal(after.includes('night_turn_ended'), false);
    assert.equal(after.includes('night_result_applied'), false);
    assert.equal(seen(ctx, 'night_result_applied').length, 0);
});
