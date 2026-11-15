'use strict';

// 판 골드 서버 흐름 시험 — 방에서 진짜로 시작한 판이 시작 때 값을 들고 끝까지 감, 받는 사람 가르기, 저장·지급 다시 하기여도 한 번, 다시 읽기 신호
// 목록 A07-B-156~178, 돌리기: node --env-file=.env.test --test tests/flow/a07-gold-flow.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음 → 꼭 socket 쪽보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');
const mf = require('../helpers/matchmakingFixtures');
const gameSettings = require('../../services/ops/gameSettings');
const persistModule = require('../../services/game/record/persist');
const desertion = require('../../services/game/desertion');
const { getSessionById } = require('../../game-core/queries/byId');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');

const { core } = gf;
const T = gs.__testables;
const M = matchmaking.__testables;

// ── 이 파일 안 작은 도우미 (공용 도우미는 안 고침) ──

const clockFns = (clock) => ({ nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });

// 시험 하나 준비: 가짜 소켓 세상(빈 io) + 가짜 시계 + 가짜 저장·장부·업적·탈주 기록
// persist·grant를 주면 그 가짜로 (실패 흉내), 안 주면 늘 성공
function setup(t, { persist, grant } = {}) {
    gf.resetCore();
    gs.__resetStateForTests();
    matchmaking.__resetStateForTests();
    // 판 시작이 직업을 Math.random으로 나눔 → 0으로 고정해 늘 같은 직업
    t.mock.method(Math, 'random', () => 0);
    mf.installFakeMatchmakingDeps(matchmaking);
    const clock = gf.fakeClock();
    const fakes = { records: [], persistTries: 0, grants: [], grantTries: 0, signals: [], deserted: [], evaluated: [] };
    T.__setRecordVoteParticipationForTests(async () => {});
    T.__setEvaluateAchievementsForTests(async (userId) => { fakes.evaluated.push(userId); });
    T.__setGameResultPersistForTests(async (record) => {
        fakes.persistTries += 1;
        if (persist) await persist(record, fakes.persistTries);
        fakes.records.push(record);
    });
    persistModule.__setGameGoldGrantForTests(async (g) => {
        fakes.grantTries += 1;
        if (grant) await grant(g, fakes.grantTries);
        fakes.grants.push(g);
    });
    T.__setTerminalPersistTimersForTests({ setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn });
    desertion.__setRepositoryForTests({
        findDesertionsForWarmup: async () => [],
        countDesertionsSince: async () => 0,
        insertDesertion: async (row) => { fakes.deserted.push(row); return { created: true, row }; },
    });
    const io = mf.createFakeIo([]);
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    gs.setOnlineUsersRegistry(registry);
    gs.setEmitToUser((uuid, event, payload) => fakes.signals.push({ uuid, event, payload }));
    t.after(() => {
        gs.__resetStateForTests();
        matchmaking.__resetStateForTests();
        gameSettings.__setGoldRewardForTests();
        T.__setRecordVoteParticipationForTests(null);
        T.__setEvaluateAchievementsForTests(null);
        T.__setGameResultPersistForTests(null);
        persistModule.__setGameGoldGrantForTests(null);
        desertion.__setRepositoryForTests(null);
        desertion.__resetForTests();
        gf.resetCore();
    });
    return { io, registry, clock, fakes };
}

// 방 만들기 → n명 입장·준비 → 방장 시작 (화면이 보내는 요청 그대로) → 판 + 그 판 사람 소켓
let seq = 0;
async function startRoomGame(base, { n, jokerCount = n >= 8 ? 2 : 1 }) {
    seq += 1;
    const uuids = Array.from({ length: n }, (_, i) => `a07f${seq}-${i}`);
    const sockets = new Map(uuids.map((u) => [u, mf.createFakeSocket(u)]));
    for (const [u, sk] of sockets) {
        base.io.sockets.sockets.set(sk.id, sk);
        base.registry.set(u, sk.id);
    }
    const [host, ...guests] = uuids;
    const created = await mf.callAsPromise(M.handleCreateRoom, base.io, sockets.get(host), host,
        mf.validSettingsPayload({ maxPlayers: n, jokerCount, accessType: 'code' }));
    assert.equal(created.ok, true, `방 만들기 실패: ${created.code}`);
    for (const g of guests) await M.handleJoinRoomByCode(base.io, sockets.get(g), g, created.room.roomCode);
    for (const u of uuids) {
        const r = await mf.callAsPromise(M.handleSetReady, base.io, sockets.get(u), u, mf.readyPayload(created.room));
        assert.equal(r.ok, true, `준비 실패: ${r.code}`);
    }
    const started = await mf.callAsPromise(M.handleStartGame, base.io, sockets.get(host), host, mf.startPayload(created.room));
    assert.equal(started.ok, true, `시작 실패: ${started.code}`);
    const s = getSessionById(started.gameId);
    // 역할 확인 10초는 이 시험이 보는 것이 아님 → 바로 첫 낮
    T.stopRoleRevealTimer(s.id);
    gf.toDay(s);
    const world = {
        io: base.io,
        sockets,
        sock: (u) => sockets.get(u),
        received: (u, event) => sockets.get(u).received.filter((e) => e.event === event),
    };
    return { ...base, s, world };
}

// 재판: 연결된 산 사람이 표 → 재판 마감(15초)까지 가짜 시계로 (안 낸 사람은 마감에 기권)
async function tribunal({ s, world, clock }, defendant, vote = 'GUILTY') {
    gf.toTribunal(s, defendant);
    T.startTribunalTimer(world.io, s, { ...clockFns(clock), durationMs: 15_000 });
    for (const p of [...s.players.values()]) {
        if (!p.alive || p.uuid === defendant || world.sock(p.uuid).connected === false) continue;
        const r = await gf.call(T.handleCastTribunalVote, world.io, world.sock(p.uuid), p.uuid, { gameId: s.id, dayIndex: s.dayIndex, vote });
        assert.equal(r.ok, true, `재판 표 거절: ${r.code}`);
    }
    clock.advance(15_000);
}

// 밤: 준 행동만 내고 나머지 건너뛰기 → 밤 마무리
function night({ s, world }, actions = {}) {
    T.stopNightTurnSequence(s.id);
    gf.toNight(s);
    for (const [actor, target] of Object.entries(actions)) {
        assert.equal(core.submitNightAction(actor, s.id, target).ok, true);
    }
    gf.skipAllNight(s);
    assert.equal(T.finalizeNightForSession(world.io, s).ok, true);
}

// 광대를 처형해 시민 승으로 끝냄
async function endCitizenWin(ctx) {
    const jokers = gf.byRole(ctx.s, 'JOKER').filter((u) => ctx.s.players.get(u).alive);
    for (const [i, j] of jokers.entries()) {
        await tribunal(ctx, j);
        if (i < jokers.length - 1) night(ctx);
    }
    assert.equal(ctx.s.winResult?.winner, 'CITIZEN');
}

const leave = ({ s, world }, uuid) => gf.call(T.handleLeaveGameSession, world.io, world.sock(uuid), uuid, { gameId: s.id });

// 저장·지급·신호는 판 끝 뒤 비동기 → 몇 바퀴 흘려보냄
async function settle() {
    for (let i = 0; i < 10; i += 1) await gf.flush();
}

// 판 끝 칸 공개 줄 (나가지 않은 사람이 받은 것) → Map(uuid → goldReward)
function revealGold(ctx) {
    const watcher = [...ctx.s.players.keys()].find((u) => ctx.world.received(u, 'tribunal_vote_resolved').some((e) => e.payload.winResult)
        || ctx.world.received(u, 'player_eliminated').some((e) => e.payload.winResult)
        || ctx.world.received(u, 'night_result_applied').some((e) => e.payload.winResult));
    const event = [...ctx.world.sock(watcher).received].find((e) => e.payload?.winResult);
    return new Map(event.payload.winResult.reveals.map((r) => [r.uuid, r.goldReward]));
}

// 가짜 장부 줄 (그 판 참조 id만) → [{ userId, amount }]
const ledgerRows = (fakes, gameId) => fakes.grants
    .filter((g) => g.referenceEventId === `game-reward:${gameId}`)
    .flatMap((g) => g.userIds.map((userId) => ({ userId, amount: g.amount })));

// 사람마다 장부 줄 수
function rowsPerUser(rows) {
    const count = new Map();
    for (const r of rows) count.set(r.userId, (count.get(r.userId) ?? 0) + 1);
    return count;
}

// 그 사람이 받은 다시 읽기 신호 범위 목록
const signalScopes = (fakes, uuid) => fakes.signals
    .filter((e) => e.uuid === uuid && e.event === 'account_cache_invalidated')
    .map((e) => e.payload.scopes.join(','));

// ── A07-B-156~161: 판 시작 때 값이 그 판 값 ──

test('A07-B-156 5명 판 값 1로 시작 → 판 중 5로 바꿈 → 끝 goldReward 1, 장부 금액 1', async (t) => {
    const base = setup(t);
    gameSettings.__setGoldRewardForTests(1);
    const ctx = await startRoomGame(base, { n: 5 });
    gameSettings.__setGoldRewardForTests(5);
    await endCitizenWin(ctx);
    await settle();
    for (const [uuid, gold] of revealGold(ctx)) assert.equal(gold, 1, uuid);
    const rows = ledgerRows(ctx.fakes, ctx.s.id);
    assert.equal(rows.length, 5);
    for (const r of rows) assert.equal(r.amount, 1);
});

test('A07-B-157 6명 판 값 5로 바꾼 뒤 시작 → 끝 goldReward 5', async (t) => {
    const base = setup(t);
    gameSettings.__setGoldRewardForTests(5);
    const ctx = await startRoomGame(base, { n: 6 });
    await endCitizenWin(ctx);
    await settle();
    for (const [uuid, gold] of revealGold(ctx)) assert.equal(gold, 5, uuid);
    for (const r of ledgerRows(ctx.fakes, ctx.s.id)) assert.equal(r.amount, 5);
});

test('A07-B-158 7명 판 값 0으로 시작 → goldReward 전원 0, 장부 줄 0', async (t) => {
    const base = setup(t);
    gameSettings.__setGoldRewardForTests(0);
    const ctx = await startRoomGame(base, { n: 7 });
    await endCitizenWin(ctx);
    await settle();
    const gold = revealGold(ctx);
    assert.equal(gold.size, 7);
    for (const [uuid, value] of gold) assert.equal(value, 0, uuid);
    assert.equal(ledgerRows(ctx.fakes, ctx.s.id).length, 0);
});

test('A07-B-159 8명 판 값 100 → goldReward 전원 100, 장부 금액 100', async (t) => {
    const base = setup(t);
    gameSettings.__setGoldRewardForTests(100);
    const ctx = await startRoomGame(base, { n: 8 });
    await endCitizenWin(ctx);
    await settle();
    for (const [uuid, gold] of revealGold(ctx)) assert.equal(gold, 100, uuid);
    const rows = ledgerRows(ctx.fakes, ctx.s.id);
    assert.equal(rows.length, 8);
    for (const r of rows) assert.equal(r.amount, 100);
});

test('A07-B-160 10명 판 값 1로 시작 → 판 중 0 → 끝 전원 1', async (t) => {
    const base = setup(t);
    gameSettings.__setGoldRewardForTests(1);
    const ctx = await startRoomGame(base, { n: 10 });
    gameSettings.__setGoldRewardForTests(0);
    await endCitizenWin(ctx);
    await settle();
    const gold = revealGold(ctx);
    assert.equal(gold.size, 10);
    for (const [uuid, value] of gold) assert.equal(value, 1, uuid);
    assert.equal(ledgerRows(ctx.fakes, ctx.s.id).length, 10);
});

test('A07-B-161 동시에 도는 두 판: ㄱ(5명) 값 1로 시작, 2로 바꾼 뒤 ㄴ(6명) 시작 → 끝 ㄱ 1·ㄴ 2', async (t) => {
    const base = setup(t);
    gameSettings.__setGoldRewardForTests(1);
    const a = await startRoomGame(base, { n: 5 });
    gameSettings.__setGoldRewardForTests(2);
    const b = await startRoomGame(base, { n: 6 });
    await endCitizenWin(a);
    await endCitizenWin(b);
    await settle();
    for (const [uuid, gold] of revealGold(a)) assert.equal(gold, 1, uuid);
    for (const [uuid, gold] of revealGold(b)) assert.equal(gold, 2, uuid);
    for (const r of ledgerRows(a.fakes, a.s.id)) assert.equal(r.amount, 1);
    for (const r of ledgerRows(b.fakes, b.s.id)) assert.equal(r.amount, 2);
    assert.equal(ledgerRows(a.fakes, a.s.id).length, 5);
    assert.equal(ledgerRows(b.fakes, b.s.id).length, 6);
});

// ── A07-B-162~167: 지급 대상 = 판 끝까지 있던 사람 (가짜 장부 줄 수) ──

test('A07-B-162 5명 판 끝까지 → 장부 5줄', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 5 });
    await endCitizenWin(ctx);
    await settle();
    assert.equal(ledgerRows(ctx.fakes, ctx.s.id).length, 5);
});

test('A07-B-163 10명 판 2명 산 채로 나감 → 장부 8줄 (나간 사람 없음)', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 10 });
    const leavers = gf.nonJokers(ctx.s).slice(0, 2);
    for (const u of leavers) assert.equal((await leave(ctx, u)).ok, true);
    await endCitizenWin(ctx);
    await settle();
    const rows = ledgerRows(ctx.fakes, ctx.s.id);
    assert.equal(rows.length, 8);
    for (const u of leavers) assert.equal(rows.some((r) => r.userId === u), false, u);
});

test('A07-B-164 7명 판 처형 2·암살 1 → 장부 7줄', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 7 });
    const joker = gf.firstOf(ctx.s, 'JOKER');
    const [c1, c2] = gf.nonJokers(ctx.s);
    await tribunal(ctx, c1);
    night(ctx, { [joker]: c2 });
    await tribunal(ctx, joker);
    assert.equal(ctx.s.winResult?.winner, 'CITIZEN');
    await settle();
    assert.equal(ledgerRows(ctx.fakes, ctx.s.id).length, 7);
});

test('A07-B-165 6명 판 죽은 뒤 나간 1명 포함 → 장부 6줄', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 6 });
    const [c1] = gf.nonJokers(ctx.s);
    await tribunal(ctx, c1);
    night(ctx);
    assert.equal((await leave(ctx, c1)).ok, true);
    await endCitizenWin(ctx);
    await settle();
    const rows = ledgerRows(ctx.fakes, ctx.s.id);
    assert.equal(rows.length, 6);
    assert.equal(rows.some((r) => r.userId === c1), true);
});

test('A07-B-166 8명 판 60초 탈락 1명 → 장부 7줄', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 8 });
    const [gone] = gf.nonJokers(ctx.s);
    ctx.world.sock(gone).connected = false;
    T.beginDisconnectGrace(ctx.io, ctx.s, gone, clockFns(ctx.clock));
    ctx.clock.advance(60_000);
    assert.equal(ctx.s.players.get(gone).alive, false);
    await endCitizenWin(ctx);
    await settle();
    const rows = ledgerRows(ctx.fakes, ctx.s.id);
    assert.equal(rows.length, 7);
    assert.equal(rows.some((r) => r.userId === gone), false);
});

test('A07-B-167 5명 판 점검 강제 종료 → 장부 0줄', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 5 });
    assert.equal(abortGamesForMaintenance(ctx.io), 1);
    await settle();
    assert.equal(ctx.fakes.records.length, 1);
    assert.equal(ledgerRows(ctx.fakes, ctx.s.id).length, 0);
});

// ── A07-B-168~171: 저장·지급 다시 하기여도 한 번 ──

test('A07-B-168 5명 판 전적 저장 첫 시도 실패 → 1초 뒤 성공 → 장부 묶음 1번, 사람마다 1줄', async (t) => {
    const base = setup(t, { persist: async (_r, n) => { if (n === 1) throw new Error('잠깐 끊김'); } });
    const ctx = await startRoomGame(base, { n: 5 });
    await endCitizenWin(ctx);
    await settle();
    assert.equal(ledgerRows(ctx.fakes, ctx.s.id).length, 0, '저장 전엔 지급 없음');
    ctx.clock.advance(1_000);
    await settle();
    assert.equal(ctx.fakes.grants.length, 1);
    const per = rowsPerUser(ledgerRows(ctx.fakes, ctx.s.id));
    assert.equal(per.size, 5);
    for (const [u, c] of per) assert.equal(c, 1, u);
});

test('A07-B-169 6명 판 판 끝 저장 시작 2번 → 장부 사람마다 1줄', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 6 });
    await endCitizenWin(ctx);
    T.persistTerminalSession(ctx.s, { completed: true });
    await settle();
    T.persistTerminalSession(ctx.s, { completed: true });
    await settle();
    const per = rowsPerUser(ledgerRows(ctx.fakes, ctx.s.id));
    assert.equal(per.size, 6);
    for (const [u, c] of per) assert.equal(c, 1, u);
});

test('A07-B-170 7명 판 골드 지급 1번째 오류(5xx) → 1초 뒤 성공 → 7명 받음, 경제 다시 읽기 신호', async (t) => {
    const base = setup(t, {
        grant: async (_g, n) => {
            if (n === 1) throw Object.assign(new Error('장부 잠깐 안 됨'), { status: 503 });
        },
    });
    const ctx = await startRoomGame(base, { n: 7 });
    await endCitizenWin(ctx);
    await settle();
    assert.equal(ledgerRows(ctx.fakes, ctx.s.id).length, 0);
    const before = ctx.fakes.signals.length;
    ctx.clock.advance(1_000);
    await settle();
    const per = rowsPerUser(ledgerRows(ctx.fakes, ctx.s.id));
    assert.equal(per.size, 7);
    for (const [u, c] of per) assert.equal(c, 1, u);
    const after = ctx.fakes.signals.slice(before).filter((e) => e.event === 'account_cache_invalidated');
    for (const uuid of ctx.s.players.keys()) {
        assert.ok(after.some((e) => e.uuid === uuid && e.payload.scopes.includes('economy')), `${uuid} 경제 신호 없음`);
    }
});

test('A07-B-171 5명 판 골드 지급이 400 오류 → 골드 없음, 업적 평가·캐시 신호는 감', async (t) => {
    const base = setup(t, {
        grant: async () => { throw Object.assign(new Error('잘못된 요청'), { status: 400 }); },
    });
    const ctx = await startRoomGame(base, { n: 5 });
    await endCitizenWin(ctx);
    await settle();
    ctx.clock.advance(60_000);
    await settle();
    assert.equal(ledgerRows(ctx.fakes, ctx.s.id).length, 0);
    assert.deepEqual([...ctx.fakes.evaluated].sort(), [...ctx.s.players.keys()].sort());
    for (const uuid of ctx.s.players.keys()) {
        assert.ok(signalScopes(ctx.fakes, uuid).includes('economy,achievements'), `${uuid} 경제·업적 신호 없음`);
    }
});

// ── A07-B-172~174: 저장 뒤 다시 읽기 신호 ──

test('A07-B-172 6명 판 저장 뒤 판 사람 6명이 프로필 다시 읽기 신호 한 번씩', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 6 });
    await endCitizenWin(ctx);
    await settle();
    for (const uuid of ctx.s.players.keys()) {
        assert.equal(signalScopes(ctx.fakes, uuid).filter((s) => s === 'profile').length, 1, uuid);
    }
});

test('A07-B-173 6명 판 골드·업적 뒤 6명이 경제·업적 신호 한 번씩, 프로필 신호 뒤', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 6 });
    await endCitizenWin(ctx);
    await settle();
    for (const uuid of ctx.s.players.keys()) {
        const scopes = signalScopes(ctx.fakes, uuid);
        assert.equal(scopes.filter((s) => s === 'economy,achievements').length, 1, uuid);
        assert.ok(scopes.indexOf('profile') < scopes.indexOf('economy,achievements'), `${uuid} 차례 ${scopes}`);
    }
});

test('A07-B-174 5명 판 점검 강제 종료 → 프로필 신호만, 경제·업적 신호 없음', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 5 });
    assert.equal(abortGamesForMaintenance(ctx.io), 1);
    await settle();
    ctx.clock.advance(60_000);
    await settle();
    for (const uuid of ctx.s.players.keys()) {
        assert.deepEqual(signalScopes(ctx.fakes, uuid), ['profile'], uuid);
    }
});

// ── A07-B-175~178: 끊김·결과 화면 나감 ──

test('A07-B-175 7명 판 산 시민 끊김 20초째에 시민 승 → 그 사람 goldReward 1, 장부 1줄, won true', async (t) => {
    gameSettings.__setGoldRewardForTests(1);
    const ctx = await startRoomGame(setup(t), { n: 7 });
    const [cut] = gf.nonJokers(ctx.s);
    ctx.world.sock(cut).connected = false;
    T.beginDisconnectGrace(ctx.io, ctx.s, cut, clockFns(ctx.clock));
    ctx.clock.advance(5_000);
    // 재판 마감 15초를 더하면 끊긴 지 20초째에 판정
    await tribunal(ctx, gf.firstOf(ctx.s, 'JOKER'));
    assert.equal(ctx.s.winResult?.winner, 'CITIZEN');
    assert.equal(ctx.s.players.get(cut).alive, true);
    await settle();
    assert.equal(revealGold(ctx).get(cut), 1);
    assert.equal(ledgerRows(ctx.fakes, ctx.s.id).filter((r) => r.userId === cut).length, 1);
    const row = ctx.fakes.records[0].players.find((p) => p.user_id === cut);
    assert.equal(row.won, true);
});

test('A07-B-176 5명 판 판 끝 직후 1명 "로비로" → 장부 5줄, 탈주 기록 0줄', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 5 });
    await endCitizenWin(ctx);
    assert.equal((await leave(ctx, gf.nonJokers(ctx.s)[0])).ok, true);
    await settle();
    assert.equal(ledgerRows(ctx.fakes, ctx.s.id).length, 5);
    assert.equal(ctx.fakes.deserted.length, 0);
});

test('A07-B-177 6명 판 판 끝 직후 1명 끊김(새로고침) → 그 사람 장부 1줄', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 6 });
    await endCitizenWin(ctx);
    const refresher = gf.nonJokers(ctx.s)[0];
    ctx.world.sock(refresher).connected = false;
    await gs.onDisconnect(ctx.io, ctx.world.sock(refresher), refresher);
    // 새로고침 = 그 판에서 나가짐 (결정 그대로), 판 골드는 그대로
    assert.notEqual(core.getEndedGameId(refresher), ctx.s.id);
    await settle();
    assert.equal(ledgerRows(ctx.fakes, ctx.s.id).filter((r) => r.userId === refresher).length, 1);
    assert.equal(ctx.fakes.deserted.length, 0);
});

test('A07-B-178 5명 판 판 끝 직후 5명 모두 "로비로" → 장부 사람마다 1줄, 저장 1번', async (t) => {
    const ctx = await startRoomGame(setup(t), { n: 5 });
    await endCitizenWin(ctx);
    for (const uuid of [...ctx.s.players.keys()]) assert.equal((await leave(ctx, uuid)).ok, true);
    assert.equal(getSessionById(ctx.s.id) ?? null, null, '판이 지워져야 함');
    await settle();
    const per = rowsPerUser(ledgerRows(ctx.fakes, ctx.s.id));
    assert.equal(per.size, 5);
    for (const [u, c] of per) assert.equal(c, 1, u);
    assert.equal(ctx.fakes.records.length, 1);
});
