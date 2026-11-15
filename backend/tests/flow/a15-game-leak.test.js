'use strict';

// 판 안 정보가 안 새는지 판 하나를 처음부터 훑는 시험 — 사람 자리마다 받은 알림·답을 다 모아 남의 직업이 어디에도 없는지 봄
// 목록 A15-B-169~181 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 가짜 소켓·가짜 io·node:test 가짜 시계, 돌리기: node --env-file=.env.test --test tests/flow/a15-game-leak.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음 → 모델을 불러도 DB에 안 붙음 (꼭 socket/gameSession보다 먼저)
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const desertion = require('../../services/game/desertion');
const { assertNoForbiddenPrivateData, collectOtherPlayerRoleSecrets } = require('../helpers/gameSession.testUtils');

const T = gs.__testables;
const core = gf.core;
const ROLE_NAMES = new Set(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN']);
// 차례 알림의 맨 위 role 칸 = 지금 누구 차례인지 직업 이름 (사람과 안 묶임, 전원에게 같은 값), 낮은 null
const TURN_EVENTS = new Set(['night_turn_started', 'night_turn_ended', 'phase_settle_started']);

// 비동기 꼬리 흘려보내기 (setImmediate는 가짜 시계에 안 묶임)
async function flush(times = 4) {
    for (let i = 0; i < times; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

// 판 하나 차리기: 직업 고정(직접 구성 + 무작위 0) + 사람마다 가짜 소켓 + 판 밖 로비 사람 소켓 하나
// 타이머는 서버 기본 길 그대로 (setTimeout·Date를 가짜 시계로 바꿔 시간만 넘김)
function setupGame(t, { id, n, roleCounts, jokerCount }) {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_800_000_000_000 });
    t.mock.method(Math, 'random', () => 0);
    gs.__resetStateForTests();
    gf.resetCore();
    desertion.__resetForTests();
    // 표 기록·업적·전적·탈주는 DB에 씀 → 아무것도 안 하는 함수로 (끝에 원래대로)
    T.__setRecordVoteParticipationForTests(async () => {});
    T.__setEvaluateAchievementsForTests(async () => {});
    T.__setGameResultPersistForTests(async () => ({ ok: true }));
    desertion.__setRepositoryForTests({
        findDesertionsForWarmup: async () => [], countDesertionsSince: async () => 0, insertDesertion: async () => ({ created: true, row: null }),
    });
    const quietError = console.error;
    console.error = () => {};
    t.after(() => {
        console.error = quietError;
        gs.__resetStateForTests();
        gf.resetCore();
        desertion.__resetForTests();
        desertion.__setRepositoryForTests(null);
        T.__setRecordVoteParticipationForTests(null);
        T.__setEvaluateAchievementsForTests(null);
        T.__setGameResultPersistForTests(null);
    });
    const s = gf.startGame({ id, n, roleCounts, jokerCount });
    const world = gf.socketWorld(gs, s);
    const ctx = { t, s, world, log: [], outsider: `${id}-lobby`, picked: new Set(), nightPlan: null };
    // 판 밖 사람: 같은 서버에 붙어 로비에 있음 (판 채널 아님)
    const lobby = gf.createFakeSocket(ctx.outsider);
    world.io.sockets.sockets.set(lobby.id, lobby);
    world.registry.set(ctx.outsider, lobby.id);
    world.sockets.set(ctx.outsider, lobby);
    for (const [uuid, sock] of world.sockets) {
        const emit = sock.emit;
        sock.emit = (event, payload) => { emit(event, payload); ctx.log.push({ uuid, event, payload }); };
        gs.registerGameHandlers(world.io, sock, uuid);
    }
    // 시작 알림: 시작 길(startLaunch.js)이 사람마다 buildGameStartedPayload로 만들어 그 사람 소켓에 보내는 값 그대로
    for (const uuid of s.players.keys()) world.sock(uuid).emit('game_started', core.buildGameStartedPayload(s, uuid));
    T.ensureRoleRevealTimer(world.io, s);
    t.after(() => {
        T.stopDayPhaseTimer(s.id);
        T.stopTribunalTimer(s.id);
        T.stopNightTurnSequence(s.id);
    });
    return ctx;
}

// 화면이 보내는 것처럼 요청 하나 보내고 받은 답도 그 사람 기록에 넣음
async function send(ctx, uuid, event, payload) {
    let reply;
    ctx.world.sock(uuid).trigger(event, payload, (r) => { reply = r; });
    await flush();
    ctx.log.push({ uuid, event: `reply:${event}`, payload: reply });
    return reply;
}

// 밤 차례가 열린 사람이 계획대로 고름 (계획에 없으면 건너뛰기 null)
async function pickNight(ctx) {
    if (ctx.s.phase !== 'NIGHT' || !ctx.nightPlan) return;
    const d = ctx.s.dayIndex;
    for (const e of [...ctx.log]) {
        if (e.event !== 'night_turn_started' || e.payload?.dayIndex !== d) continue;
        const key = `${d}:${e.uuid}`;
        const me = ctx.s.players.get(e.uuid);
        if (ctx.picked.has(key) || !me?.alive || me.role !== e.payload.role) continue;
        ctx.picked.add(key);
        await send(ctx, e.uuid, 'submit_night_action', { gameId: ctx.s.id, targetId: ctx.nightPlan[e.payload.role] ?? null });
    }
}

// 시간을 0.25초씩 넘기며 조건이 될 때까지 (가짜 시계는 한 번에 넘긴 끝 시각으로 부르므로 잘게)
async function until(ctx, cond, limitMs, label) {
    for (let waited = 0; waited <= limitMs; waited += 250) {
        await pickNight(ctx);
        if (cond()) return;
        ctx.t.mock.timers.tick(250);
        await flush();
    }
    assert.fail(`${label}: ${limitMs}ms 안에 안 됨 (지금 ${ctx.s.phase})`);
}

const alive = (ctx) => [...ctx.s.players.values()].filter((p) => p.alive).map((p) => p.uuid);
const snapshotAll = async (ctx) => {
    for (const uuid of [...ctx.s.players.keys(), ctx.outsider]) await send(ctx, uuid, 'get_session_snapshot', { gameId: ctx.s.id });
};

// 역할 확인 10초 → 첫 낮
const toFirstDay = (ctx) => until(ctx, () => ctx.s.phase === 'DAY', 11_000, '역할 확인 → 낮');

// 낮 하나: 토론 → 투표 (execute 주면 그 사람 몰표 → 재판 유죄, 없으면 모두 기권) → 밤이나 판 끝
async function runDay(ctx, { execute = null } = {}) {
    const { s } = ctx;
    // 다음 밤 계획은 runNight가 줌 (밤이 열리자마자 옛 계획으로 고르지 않게)
    ctx.nightPlan = null;
    await until(ctx, () => gf.T.getDayPhase(s) === 'DAY_VOTE', 200_000, `${s.dayIndex}일 토론 → 투표`);
    await snapshotAll(ctx);
    for (const uuid of alive(ctx)) {
        await send(ctx, uuid, 'cast_day_vote', { gameId: s.id, targetId: execute && uuid !== execute ? execute : null });
    }
    if (execute) {
        await until(ctx, () => s.phase === 'TRIBUNAL', 10_000, '투표 → 재판');
        await snapshotAll(ctx);
        for (const uuid of alive(ctx).filter((u) => u !== execute)) {
            await send(ctx, uuid, 'cast_tribunal_vote', { gameId: s.id, dayIndex: s.dayIndex, vote: 'GUILTY' });
        }
    }
    await until(ctx, () => s.phase === 'NIGHT' || s.phase === 'ENDED', 60_000, `${s.dayIndex}일 낮 → 밤`);
    if (execute) assert.equal(s.players.get(execute).alive, false, '처형 안 됨');
}

// 밤 하나: 계획대로 고르고 다음 낮 시작까지
async function runNight(ctx, plan) {
    const { s } = ctx;
    const day = s.dayIndex;
    ctx.nightPlan = plan;
    ctx.nightStart = ctx.log.length;
    await snapshotAll(ctx);
    await until(ctx, () => (s.phase === 'DAY' && s.dayIndex === day + 1) || s.phase === 'ENDED', 300_000, `${day}일 밤 → 낮`);
    ctx.nightEnd = ctx.log.length;
}

// 판 하나 훑기 (169~178): 1일 X 처형 → 1일 밤 아무도 안 죽임 → 2일 모두 기권 → 2일 밤 광대가 V 암살 → 3일 낮 시작
async function playThrough(ctx, { executed, victim, chatter }) {
    const { s } = ctx;
    await snapshotAll(ctx);
    await toFirstDay(ctx);
    await send(ctx, chatter, 'submit_game_chat_message', { gameId: s.id, text: '안녕하세요' });
    await runDay(ctx, { execute: executed });
    const jokers = gf.byRole(s, 'JOKER').filter((u) => s.players.get(u).alive);
    if (jokers.length > 1) await send(ctx, jokers[0], 'submit_joker_chat_message', { gameId: s.id, text: '누구 할까' });
    await runNight(ctx, {});
    await send(ctx, executed, 'submit_game_chat_message', { gameId: s.id, text: '죽은 사람 말' });
    await runDay(ctx);
    await runNight(ctx, { JOKER: victim });
    assert.equal(s.players.get(victim).alive, false, '암살 안 됨');
    await send(ctx, chatter, 'submit_game_chat_message', { gameId: s.id, text: '아침이네요' });
    await snapshotAll(ctx);
}

// 받은 값 하나에서 "남에게 보여도 되는 칸"만 뺀 사본 (내 칸 self, 차례 직업 이름, 지금 차례 이름, 죽인 쪽 이름)
// self가 남의 것이면 문제로 적음
function publicCopy(event, payload, viewer, problems) {
    const walk = (value, path) => {
        if (Array.isArray(value)) return value.map((x, i) => walk(x, [...path, i]));
        if (value === null || typeof value !== 'object') return value;
        const out = {};
        for (const [key, val] of Object.entries(value)) {
            if (key === 'self') {
                if (val?.uuid !== undefined && val.uuid !== viewer) problems.push(`${event} ${[...path, key].join('.')}: 남의 self`);
                continue;
            }
            if (key === 'nightTurnRole') continue;
            if (key === 'source' && path.at(-2) === 'deathReveals') continue;
            if (key === 'role' && path.length === 0 && TURN_EVENTS.has(event)) continue;
            out[key] = walk(val, [...path, key]);
        }
        return out;
    };
    return walk(payload, []);
}

// 한 칸 묶음 안에 남의 uuid와 직업 이름이 같이 있으면 짝으로 샌 것
function pairLeaks(value, others, event, path = [], problems = []) {
    if (Array.isArray(value)) value.forEach((x, i) => pairLeaks(x, others, event, [...path, i], problems));
    else if (value !== null && typeof value === 'object') {
        const vals = Object.values(value);
        const who = vals.find((v) => typeof v === 'string' && others.has(v));
        const role = vals.find((v) => typeof v === 'string' && ROLE_NAMES.has(v));
        if (who && role) problems.push(`${event} ${path.join('.') || '(맨 위)'}: ${who}와 ${role}가 같이 실림`);
        for (const [k, v] of Object.entries(value)) pairLeaks(v, others, event, [...path, k], problems);
    }
    return problems;
}

// 그 사람이 받은 것 전부(알림·답)에서 남의 직업이 샌 곳 목록
function leaksFor(ctx, viewer, entries = ctx.log) {
    const secrets = collectOtherPlayerRoleSecrets(ctx.s, viewer);
    const others = new Set([...ctx.s.players.keys()].filter((u) => u !== viewer));
    const problems = [];
    for (const e of entries.filter((x) => x.uuid === viewer)) {
        const copy = publicCopy(e.event, e.payload, viewer, problems);
        try {
            assertNoForbiddenPrivateData(copy, secrets);
        } catch (error) {
            problems.push(`${e.event}: ${error.message.split('\n')[0]}`);
        }
        pairLeaks(copy, others, e.event, [], problems);
    }
    return [...new Set(problems)];
}

// 그 사람이 받은 값 안 동료 목록(allies)을 전부 모음 (uuid만)
function alliesSeen(ctx, viewer) {
    const found = [];
    const walk = (v) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') {
            for (const [k, val] of Object.entries(v)) {
                if (k === 'allies') found.push((Array.isArray(val) ? val : [val]).map((a) => (typeof a === 'string' ? a : a?.uuid)));
                walk(val);
            }
        }
    };
    for (const e of ctx.log.filter((x) => x.uuid === viewer)) walk(e.payload);
    return found;
}

// ---------- A15-B-169~178 판 전체 훑기 ----------

// 6명 J1D1C4: 처형 = 시민1, 암살 = 시민2, 산 시민 = 시민3 / 10명 J2D2G2W2C2: 처형 = 경비원1, 암살 = 마녀사냥꾼1, 산 시민 = 시민1
const GAMES = [
    { n: 6, roleCounts: { JOKER: 1, DOCTOR: 1 }, label: '6명 J1D1C4',
        cast: (s) => { const c = gf.byRole(s, 'CITIZEN'); return { executed: c[0], victim: c[1], citizen: c[2], chatter: c[3] }; } },
    { n: 10, roleCounts: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, label: '10명 J2D2G2W2C2',
        cast: (s) => { const c = gf.byRole(s, 'CITIZEN'); return { executed: gf.byRole(s, 'GUARD')[0], victim: gf.byRole(s, 'WITCH_HUNTER')[0], citizen: c[0], chatter: c[1] }; } },
];
const VIEWERS = [
    ['산 시민', (cast) => cast.citizen],
    ['산 광대', (cast, s) => gf.byRole(s, 'JOKER')[0]],
    ['1일 처형된 사람', (cast) => cast.executed],
    ['2일 밤 암살된 사람', (cast) => cast.victim],
    ['판 밖 사람', (cast, s, ctx) => ctx.outsider],
];

let no = 169;
for (const game of GAMES) {
    for (const [viewerLabel, pickViewer] of VIEWERS) {
        const id = `A15-B-${no}`;
        const gameId = `a15-leak-${no}`;
        no += 1;
        test(`${id} ${game.label} 판 전체 훑기: ${viewerLabel} 자리에서 받은 시작·스냅샷·투표·재판·밤 결과·낮 시작·채팅 전부에 남의 직업 없음`, async (t) => {
            const ctx = setupGame(t, { id: gameId, n: game.n, roleCounts: game.roleCounts });
            const cast = game.cast(ctx.s);
            await playThrough(ctx, cast);
            const viewer = pickViewer(cast, ctx.s, ctx);

            if (viewer === ctx.outsider) {
                // 판 밖 사람: 판 사건 0개, 자기가 물은 답에도 판 값(명단·단계·사람 uuid) 없음
                const mine = ctx.log.filter((e) => e.uuid === viewer);
                assert.deepEqual(mine.filter((e) => !e.event.startsWith('reply:')).map((e) => e.event), [], '판 사건을 받음');
                for (const e of mine) {
                    assert.equal(e.payload?.ok, false, '판 밖 사람 스냅샷이 열림');
                    const text = JSON.stringify(e.payload);
                    for (const uuid of ctx.s.players.keys()) assert.ok(!text.includes(uuid), `답에 판 사람 ${uuid}`);
                    assert.equal(e.payload.players, undefined);
                    assert.equal(e.payload.phase, undefined);
                }
                return;
            }

            const me = ctx.s.players.get(viewer);
            // 동료 목록: 광대·의사·경비원·마녀사냥꾼은 같은 직업 남만, 시민은 비었거나 없음
            const sameRoleOthers = gf.byRole(ctx.s, me.role).filter((u) => u !== viewer).sort();
            const alliesLists = alliesSeen(ctx, viewer);
            // 같은 직업 동료가 있으면 동료 목록을 한 번은 받아야 함 (목록을 아예 안 보면 아래 검사가 빈 채 통과)
            if (me.role !== 'CITIZEN' && sameRoleOthers.length > 0) assert.ok(alliesLists.length > 0, '동료 목록을 못 받음');
            for (const allies of alliesLists) {
                if (me.role === 'CITIZEN') assert.deepEqual(allies, [], '시민에게 동료 목록이 있음');
                else assert.deepEqual([...allies].sort(), sameRoleOthers, '동료 목록에 다른 직업이 섞임');
            }
            // 받은 것이 실제로 모였는지 (빈 기록으로 통과 막기)
            assert.ok(ctx.log.filter((e) => e.uuid === viewer && e.event === 'tribunal_vote_resolved').length === 1, '재판 결과를 못 받음');
            assert.ok(ctx.log.filter((e) => e.uuid === viewer && e.event === 'night_result_applied').length === 2, '밤 결과를 못 받음');
            assert.deepEqual(leaksFor(ctx, viewer), [], '남의 직업이 샘');
        });
    }
}

// shape: 받은 사건 이름 + 값 칸 이름 차례 (받는 사람마다 다른 칸 값은 안 봄)
const shapeOf = (ctx, uuid, from, to) => ctx.log.slice(from, to)
    .filter((e) => e.uuid === uuid)
    .map((e) => `${e.event}:${Object.keys(e.payload ?? {}).sort().join(',')}`);
const privateResults = (ctx, uuid) => ctx.log.filter((e) => e.uuid === uuid && e.event === 'night_action_result').map((e) => e.payload);

test('A15-B-179 8명 판: 경비원이 1일 밤 C 조사 → C가 받은 사건 이름·칸 = 조사 안 당한 시민과 같음, 조사 결과는 경비원만', async (t) => {
    const ctx = setupGame(t, { id: 'a15-leak-179', n: 8, roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1 } });
    const { s } = ctx;
    const [c, other] = gf.byRole(s, 'CITIZEN');
    const guard = gf.byRole(s, 'GUARD')[0];
    await toFirstDay(ctx);
    await runDay(ctx);
    await runNight(ctx, { GUARD: c });
    assert.equal(s.dayIndex, 2, '2일 낮이 안 됨');
    assert.deepEqual(shapeOf(ctx, c, ctx.nightStart, ctx.nightEnd), shapeOf(ctx, other, ctx.nightStart, ctx.nightEnd));
    const results = privateResults(ctx, guard);
    assert.equal(results.length, 1);
    assert.equal(results[0].targetId, c);
    for (const uuid of [...s.players.keys(), ctx.outsider].filter((u) => u !== guard)) {
        assert.equal(privateResults(ctx, uuid).length, 0, `${uuid}가 조사 결과를 받음`);
    }
});

test('A15-B-180 10명 판: 마녀사냥꾼이 2일 밤 죽은 D 확인 → D가 받은 값 = 다른 죽은 사람이 받은 값과 같음, 결과는 마녀사냥꾼만', async (t) => {
    const ctx = setupGame(t, { id: 'a15-leak-180', n: 10, roleCounts: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
    const { s } = ctx;
    const [d, e] = gf.byRole(s, 'CITIZEN');
    const witch = gf.byRole(s, 'WITCH_HUNTER')[0];
    await toFirstDay(ctx);
    await runDay(ctx, { execute: d });
    await runNight(ctx, { JOKER: e });
    assert.equal(s.players.get(e).alive, false, '1일 밤 암살 안 됨');
    await runDay(ctx);
    await runNight(ctx, { WITCH_HUNTER: d });
    assert.equal(s.dayIndex, 3, '3일 낮이 안 됨');
    // 받은 값 통째로 비교, 두 죽은 사람의 uuid·닉네임만 같은 글자로 바꿈 (자기 이름 칸은 원래 서로 다름)
    const names = [d, e].flatMap((u) => [u, ctx.s.players.get(u).nickname]);
    const seen = (uuid) => ctx.log.slice(ctx.nightStart, ctx.nightEnd).filter((x) => x.uuid === uuid)
        .map((x) => names.reduce((line, word) => line.replaceAll(`"${word}"`, '"<죽은 사람>"'), `${x.event}:${JSON.stringify(x.payload)}`));
    assert.deepEqual(seen(d), seen(e));
    const mine = privateResults(ctx, witch).filter((r) => r.targetId === d);
    assert.equal(mine.length, 1, '마녀사냥꾼 확인 결과 없음');
    for (const uuid of [...s.players.keys(), ctx.outsider]) {
        if (gf.byRole(s, 'WITCH_HUNTER').includes(uuid)) continue;
        assert.equal(privateResults(ctx, uuid).filter((r) => r.targetId === d).length, 0, `${uuid}가 확인 결과를 받음`);
    }
});

test('A15-B-181 7명 판: 광대 처형으로 판 끝 → 판 끝 알림 winResult.reveals에 7명 전원 직업·모두 같은 값, 그 앞 알림엔 직업 없음', async (t) => {
    const ctx = setupGame(t, { id: 'a15-leak-181', n: 7, jokerCount: 1 });
    const { s } = ctx;
    const joker = gf.byRole(s, 'JOKER')[0];
    await snapshotAll(ctx);
    await toFirstDay(ctx);
    await runDay(ctx, { execute: joker });
    assert.equal(s.phase, 'ENDED', '판이 안 끝남');
    // 판 끝 알림 = winResult가 처음 실린 알림
    const endIndex = ctx.log.findIndex((e) => e.payload?.winResult?.reveals);
    assert.ok(endIndex >= 0, 'winResult.reveals 실린 알림 없음');
    const endEvent = ctx.log[endIndex].event;
    const ends = [...s.players.keys()].map((uuid) => ctx.log.find((e) => e.uuid === uuid && e.event === endEvent && e.payload?.winResult));
    const expected = Object.fromEntries([...s.players.values()].map((p) => [p.uuid, p.role]));
    for (const end of ends) {
        assert.ok(end, '판 끝 알림을 못 받은 사람 있음');
        const reveals = end.payload.winResult.reveals;
        const got = Object.fromEntries((Array.isArray(reveals) ? reveals : Object.entries(reveals).map(([uuid, v]) => ({ uuid, ...(typeof v === 'string' ? { role: v } : v) })))
            .map((r) => [r.uuid, r.role]));
        assert.deepEqual(got, expected);
        assert.deepEqual(end.payload.winResult, ends[0].payload.winResult, '사람마다 판 끝 값이 다름');
    }
    // 판 끝 알림 앞까지 받은 것엔 남의 직업 없음
    const before = ctx.log.slice(0, endIndex);
    for (const uuid of s.players.keys()) assert.deepEqual(leaksFor(ctx, uuid, before), [], `${uuid} 판 끝 전에 남의 직업`);
});
