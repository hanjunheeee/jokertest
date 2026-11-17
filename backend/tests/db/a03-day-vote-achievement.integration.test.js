'use strict';

// 낮 표 업적 DB 시험 — 낮 표 한 번 DB 문장 수·낮 끝에 묶어 매기기·탈주한 판 표 빼기를 시험 DB로 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A03-낮투표.md A03-B-310~322, 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models·gameFixtures require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
// 모델을 먼저 불러 시험 DB에 묶어 둠 (gameFixtures가 주소를 막힌 곳으로 바꿔도 이미 묶인 연결은 그대로)
const db = require('../../models');
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const gameSettings = require('../../services/ops/gameSettings');
const achievementService = require('../../services/achievement');
const achievementHooks = require('../../services/game/achievementHooks');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');

process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const { core } = gf;
const T = gs.__testables;
const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 with-lock.sh testdb로 돌림');
    return true;
};

// 업적 평가가 끝날 때까지 기다리려고 평가 Promise만 모음 (평가 자체는 진짜 그대로)
const evaluations = [];
const realEvaluateForUsers = achievementHooks.evaluateForUsers;
achievementHooks.evaluateForUsers = (...args) => {
    const pending = realEvaluateForUsers(...args);
    evaluations.push(pending);
    return pending;
};

// 걸린 업적 평가가 다 끝날 때까지 (평가 중에 새로 걸린 것까지)
async function settleEvaluations() {
    await gf.flush();
    while (evaluations.length > 0) {
        await Promise.all(evaluations.splice(0));
        await gf.flush();
    }
}

test.before(async () => {
    if (!TEST_DB_URL) return;
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
});

test.after(async () => {
    gs.__resetStateForTests();
    await settleEvaluations();
    achievementHooks.evaluateForUsers = realEvaluateForUsers;
    await db.sequelize.close();
});

// ── 이 파일 안 작은 도우미 ──

// 시험마다 새 사람 n명 (계정 + 통계 한 줄), uuid가 달라 시험끼리 안 섞임
async function createUsers(n, label) {
    const uuids = [];
    for (let i = 0; i < n; i += 1) {
        const uuid = crypto.randomUUID();
        await db.User.create({
            uuid,
            password_hash: 'not-a-real-hash',
            nickname: `${label}${i}${uuid.slice(0, 4)}`.slice(0, 12),
            email: `${label}-${i}-${uuid}@example.test`,
        });
        await db.UserStats.create({ user_id: uuid });
        uuids.push(uuid);
    }
    return uuids;
}

// 운영 출처로 못박고 끝에 되돌림 (출처 test 판은 업적에 안 셈)
function productionSource(t) {
    const saved = process.env.GAME_SOURCE_OVERRIDE;
    process.env.GAME_SOURCE_OVERRIDE = 'production';
    t.after(() => {
        if (saved === undefined) delete process.env.GAME_SOURCE_OVERRIDE; else process.env.GAME_SOURCE_OVERRIDE = saved;
    });
}

// 진짜 계정 n명 판 (광대 1·나머지 시민 고정) + 첫 낮, 참여 기록·업적 평가 둘 다 진짜
// 업적 받음 알림·다시 읽기 신호는 signals에 모음
async function startGame(t, { label, n = 6 }) {
    gf.resetCore();
    gs.__resetStateForTests();
    productionSource(t);
    gameSettings.__setGoldRewardForTests(1);
    const people = await createUsers(n, label);
    const room = {
        id: crypto.randomUUID(),
        players: new Map(people.map((uuid, i) => [uuid, { uuid, nickname: `${label}${i}`, isReady: true }])),
        settings: {
            maxPlayers: 10, jokerCount: 1, roleCompositionMode: 'custom',
            roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 },
        },
    };
    const candidate = core.__testables.buildSessionCandidate(room, { randomFn: () => 0, gameIdFn: () => crypto.randomUUID() });
    assert.equal(candidate.ok, true, `판 만들기 거절: ${candidate.reason ?? candidate.code}`);
    core.commitGameSession(candidate.session);
    const session = candidate.session;
    session.goldReward = gameSettings.getGameGoldReward();
    gf.toDay(session);
    const world = gf.socketWorld(gs, session);
    const signals = [];
    const emit = (uuid, event, payload) => signals.push({ uuid, event, payload });
    gs.setEmitToUser(emit);
    achievementService.__internal.__setDepsForTests({ emitToUser: emit });
    T.__setRecordVoteParticipationForTests(null);
    T.__setEvaluateAchievementsForTests(null);
    t.after(async () => {
        gs.__resetStateForTests();
        await settleEvaluations();
        gf.resetCore();
        gameSettings.__setGoldRewardForTests();
        achievementService.__internal.__setDepsForTests(null);
    });
    return { session, world, signals, joker: gf.firstOf(session, 'JOKER'), citizens: gf.nonJokers(session) };
}

// 가짜 시계로 낮 타이머 시작 → 토론 30초 흘려 투표 단계로 (투표 30초)
function openVote(ctx) {
    const clock = gf.fakeClock();
    T.startDayPhaseTimer(ctx.world.io, ctx.session, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn,
        discussionDurationMs: 30_000, voteDurationMs: 30_000,
    });
    clock.advance(30_000);
    return clock;
}

// 화면이 보내는 것처럼 낮 표 하나 (target null = 기권), 성공 답이어야 함
async function vote(ctx, uuid, targetId) {
    const reply = await gf.call(T.handleSubmitDayVote, ctx.world.io, ctx.world.sock(uuid), uuid, { gameId: ctx.session.id, targetId });
    assert.equal(reply.ok, true, `낮 표 거절: ${reply.code}`);
    return reply;
}

// 투표 마감까지 시계를 넘겨 낮 판정 (안 낸 사람은 기권으로 채움) → 밤이면 밤 차례 타이머는 끔 (밤은 시험이 직접 넘김)
async function endDay(ctx, clock) {
    const dayIndex = ctx.session.dayIndex;
    clock.advance(30_000);
    assert.notEqual(ctx.session.phase, 'DAY', `${dayIndex}일 낮이 안 끝남`);
    T.stopNightTurnSequence(ctx.session.id);
    await settleEvaluations();
}

// 밤에 아무도 안 죽이고 다음 날 낮으로 (판 규칙 함수로만, 끈 밤 차례 진행 칸은 비우고 다시 밤으로)
function passNight(ctx) {
    gf.toNight(ctx.session);
    const { committed } = gf.resolveNightDirect(ctx.session, { [ctx.joker]: null });
    assert.equal(committed?.ok, true, '밤 판정 실패');
    assert.equal(ctx.session.phase, 'DAY');
}

// 그동안 나간 DB 문장 모으기 (시퀄라이즈가 문장마다 남기는 "Executing" 기록을 셈), 업적 평가가 끝날 때까지 셈
async function collectStatements(work) {
    const seen = [];
    const options = db.sequelize.options;
    const hadOwn = Object.prototype.hasOwnProperty.call(options, 'logging');
    const savedLogging = options.logging;
    options.logging = (message) => {
        if (typeof message === 'string' && message.startsWith('Executing')) seen.push(message);
    };
    try {
        await work();
        await settleEvaluations();
    } finally {
        if (hadOwn) options.logging = savedLogging; else delete options.logging;
    }
    return seen;
}

// 업적 평가가 읽는 표 (진행 값 = 판 기록·참가 줄, 받은 목록 = 업적 줄)
const achievementReads = (statements) => statements.filter((sql) => /achievement_grants|game_result_players|game_results/.test(sql));

// 옛 판 기록 count판 (운영 출처·끝까지 간 판) — 업적 셈의 바탕
async function seedGames(uuid, count) {
    const results = [];
    const players = [];
    for (let i = 0; i < count; i += 1) {
        const id = crypto.randomUUID();
        const at = new Date(Date.UTC(2026, 8, 1, 0, i));
        results.push({
            id, started_at: at, ended_at: at, winner: 'NONE', win_reason: null, day_index: 2, player_count: 5,
            settings: { gameSource: { v: 1, value: 'production' } }, completed: true,
        });
        players.push({ game_id: id, user_id: uuid, nickname_snapshot: '옛판', role: 'CITIZEN', team: 'CITIZEN', won: false, is_alive: false });
    }
    await db.GameResult.bulkCreate(results);
    await db.GameResultPlayer.bulkCreate(players);
    return results.map((r) => r.id);
}

// 옛 투표 참여 count번 (옛 판 하나에 날짜만 달리)
async function seedVotes(uuid, count) {
    const [gameId] = await seedGames(uuid, 1);
    const rows = Array.from({ length: count }, (_, i) => ({ game_id: gameId, day_index: i + 1, user_id: uuid, accepted_at: new Date() }));
    await db.VoteParticipation.bulkCreate(rows);
}

// 판 수 3 업적: 옛 판 3개를 넣고 업적 줄은 안 넣음 = 앞 판 평가가 실패해 아직 못 받은 사람
const GAMES_3 = 'record-1-masquerade';
const VOTES_10 = 'record-2-extra-mask';
const grantCount = (uuid, id) => db.AchievementGrant.count({ where: { user_id: uuid, achievement_id: id } });
const rewardRows = (uuid, id) => db.EconomyLedgerEntry.findAll({
    where: { user_id: uuid, reason: 'ACHIEVEMENT_REWARD', reference_event_id: [`achievement:${id}:GOLD`, `achievement:${id}:DIAMOND`] },
    raw: true,
});
const grantedSignals = (ctx, uuid) => ctx.signals
    .filter((e) => e.uuid === uuid && e.event === 'achievement_granted')
    .map((e) => e.payload.achievementId);

// 업적 받음 확인: 업적 줄 하나 + 보상 장부(골드 50·다이아 50) + 받음 알림 한 번
async function assertGrantedOnce(ctx, uuid, id) {
    assert.equal(await grantCount(uuid, id), 1, `${id} 업적 줄 하나`);
    const rows = await rewardRows(uuid, id);
    const sum = (currency) => rows.filter((r) => r.currency === currency).reduce((s, r) => s + Number(r.amount), 0);
    assert.equal(rows.length, 2, '보상 줄 골드·다이아 두 줄');
    assert.equal(sum('GOLD'), 50);
    assert.equal(sum('DIAMOND'), 50);
    assert.deepEqual(grantedSignals(ctx, uuid), [id], '받음 알림 한 번');
}

// 전원이 경제 다시 읽기 신호를 받을 때까지 (판 골드·업적 평가 끝남), 저장은 기다리지 않는 길이라 잠깐씩 다시 봄
async function waitEconomySignals(ctx) {
    const uuids = [...ctx.session.players.keys()];
    const until = Date.now() + 25_000;
    for (;;) {
        const done = uuids.every((u) => ctx.signals.some((e) => e.uuid === u
            && e.event === 'account_cache_invalidated' && e.payload.scopes.includes('economy')));
        if (done) break;
        if (Date.now() > until) assert.fail('경제 다시 읽기 신호 기다리다 시간 넘김');
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await settleEvaluations();
}

// ── A03-B-310~311 (가) 낮 표 한 번에 나가는 DB 문장 ──

test('A03-B-310 6명 판: 낮 표 한 번 → 나간 DB 문장은 참여 기록뿐 (업적 읽기 0, 전체 4 이하)', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'v310' });
    openVote(ctx);
    const [X, A] = ctx.citizens;
    const statements = await collectStatements(() => vote(ctx, A, X));
    const reads = achievementReads(statements);
    t.diagnostic(`낮 표 한 번 DB 문장 ${statements.length}개 (업적 읽기 ${reads.length}개)`);
    assert.equal(reads.length, 0, `표마다 업적 읽기: ${reads.join(' | ')}`);
    assert.ok(statements.length <= 4, `낮 표 한 번 DB 문장 ${statements.length}개`);
});

test('A03-B-311 6명 판 5명 진짜 표: 낮 동안 업적 읽기 0 → 낮 끝에 사람 수와 상관없이 3번', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'v311' });
    const clock = openVote(ctx);
    const [X, ...rest] = ctx.citizens;
    const voters = [...rest, ctx.joker];
    const during = await collectStatements(async () => {
        for (const uuid of voters) await vote(ctx, uuid, X);
        await vote(ctx, X, null);
    });
    const atEnd = await collectStatements(() => endDay(ctx, clock));
    t.diagnostic(`낮 표 6번 DB 문장 ${during.length}개 (업적 읽기 ${achievementReads(during).length}개), 낮 끝 업적 읽기 ${achievementReads(atEnd).length}개`);
    assert.equal(achievementReads(during).length, 0, '낮 동안 업적 읽기 없음');
    assert.equal(achievementReads(atEnd).length, 3, '낮 끝 업적 읽기 = 진행 값 2 + 받은 목록 1');
});

// ── A03-B-312~317 (나) 낮 끝에 업적이 지금과 같게 매겨짐 ──

test('A03-B-312 판 수 3 못 받은 A·B: A만 진짜 표, B 기권 → 표 낸 때는 업적 없음, 낮 끝에 A만 받음(골드 50·다이아 50·알림 1)', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'v312' });
    const [X, A, B] = ctx.citizens;
    await seedGames(A, 3);
    await seedGames(B, 3);
    const clock = openVote(ctx);
    await vote(ctx, A, X);
    await vote(ctx, B, null);
    await settleEvaluations();
    assert.equal(await grantCount(A, GAMES_3), 0, '표 낸 때는 아직 업적 없음');
    assert.deepEqual(grantedSignals(ctx, A), [], '표 낸 때는 알림 없음');
    await endDay(ctx, clock);
    await assertGrantedOnce(ctx, A, GAMES_3);
    assert.equal(await grantCount(B, GAMES_3), 0, '기권한 B는 낮 끝 평가에 없음');
    assert.deepEqual(grantedSignals(ctx, B), []);
});

test('A03-B-313 여러 낮: 1일 A 표·2일 B 표 → 1일 끝에 A만, 2일 끝에 B, A는 한 번만', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'v313' });
    const [X, A, B] = ctx.citizens;
    await seedGames(A, 3);
    await seedGames(B, 3);
    const first = openVote(ctx);
    await vote(ctx, A, X);
    await endDay(ctx, first);
    assert.equal(await grantCount(A, GAMES_3), 1, '1일 끝 A 받음');
    assert.equal(await grantCount(B, GAMES_3), 0, '1일 끝 B는 아직');
    passNight(ctx);
    assert.equal(ctx.session.dayIndex, 2);
    const second = openVote(ctx);
    await vote(ctx, B, X);
    await settleEvaluations();
    assert.equal(await grantCount(B, GAMES_3), 0, '2일 표 낸 때는 아직');
    await endDay(ctx, second);
    await assertGrantedOnce(ctx, A, GAMES_3);
    await assertGrantedOnce(ctx, B, GAMES_3);
});

test('A03-B-314 표 낸 뒤 낮 끝 전에 산 채로 나간 A → 낮 끝에 그대로 받음(골드 50·다이아 50·알림 1)', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'v314' });
    const [X, A] = ctx.citizens;
    await seedGames(A, 3);
    const clock = openVote(ctx);
    await vote(ctx, A, X);
    assert.equal(T.applyParticipantDeparture(ctx.world.io, ctx.session, A, { reason: 'PLAYER_LEFT' }).ok, true);
    await endDay(ctx, clock);
    await assertGrantedOnce(ctx, A, GAMES_3);
});

test('A03-B-315 같은 낮에 표를 X→Y→Z로 바꾼 A → 낮 끝에 업적 줄 하나·보상 한 번·알림 한 번', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'v315' });
    const [X, Y, Z, A] = ctx.citizens;
    await seedGames(A, 3);
    const clock = openVote(ctx);
    for (const target of [X, Y, Z]) await vote(ctx, A, target);
    await endDay(ctx, clock);
    await assertGrantedOnce(ctx, A, GAMES_3);
});

test('A03-B-316 표 낸 뒤 낮 끝 전에 점검 강제 종료 → 판이 지워질 때 A 받음 (판이 깨져도 안 잃음)', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'v316' });
    const [X, A] = ctx.citizens;
    await seedGames(A, 3);
    openVote(ctx);
    await vote(ctx, A, X);
    assert.equal(abortGamesForMaintenance(ctx.world.io), 1);
    await settleEvaluations();
    await assertGrantedOnce(ctx, A, GAMES_3);
});

test('A03-B-317 여러 사람·두 낮 끝까지: 옛 참여 8인 A(1일·2일 표)·B(1일만) → 판 끝 A만 투표 참여 10 받음, 진행 숫자 A 10·B 9', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'v317' });
    const [X, A, B] = ctx.citizens;
    await seedVotes(A, 8);
    await seedVotes(B, 8);
    const first = openVote(ctx);
    await vote(ctx, A, X);
    await vote(ctx, B, X);
    await endDay(ctx, first);
    passNight(ctx);
    openVote(ctx);
    await vote(ctx, A, X);
    // 2일 낮 끝 (낮 타이머 멈춤) → 광대 처형으로 시민 승 → 판 끝 저장·골드·업적
    T.stopDayPhaseTimer(ctx.session.id);
    await settleEvaluations();
    assert.equal(await grantCount(A, VOTES_10), 0, '판 끝 전엔 이번 판 표를 안 셈');
    gf.toTribunal(ctx.session, ctx.joker);
    for (const uuid of core.getTribunalVoterUuids(ctx.session, ctx.joker)) {
        assert.equal(core.submitTribunalVote(uuid, ctx.session.id, ctx.session.dayIndex, 'GUILTY').ok, true);
    }
    const prepared = core.prepareTribunalVoteResolution(A, ctx.session.id, ctx.session.dayIndex);
    assert.equal(prepared.ok, true, `재판 준비 실패: ${prepared.code}`);
    assert.equal(core.commitTribunalVoteResolution(prepared.session, prepared.resolution).ok, true);
    assert.equal(ctx.session.winResult?.winner, 'CITIZEN');
    T.persistTerminalSession(ctx.session, { completed: true });
    await waitEconomySignals(ctx);
    await assertGrantedOnce(ctx, A, VOTES_10);
    assert.equal(await grantCount(B, VOTES_10), 0);
    const currentOf = async (uuid) => (await achievementService.getStatusForUser(uuid)).find((s) => s.id === VOTES_10).current;
    assert.equal(await currentOf(A), 10);
    assert.equal(await currentOf(B), 9);
});

// ── A03-B-318~322 (다) 탈주한 판의 낮 표는 투표 참여 수에서 뺌 (사용자 결정 2026-11-17, 판 수와 같은 기준) ──

const voteParticipationRepository = require('../../repositories/game/voteParticipation');

// 옛 판 하나 + 그 판 낮 표 count번, deathReason 'DISCONNECT' = 산 채로 나간 판(탈주) → 판 id
async function seedGameWithVotes(uuid, count, { deathReason = null, isAlive = false, won = false } = {}) {
    const id = crypto.randomUUID();
    const at = new Date(Date.UTC(2026, 8, 2, 0, 0));
    await db.GameResult.create({
        id, started_at: at, ended_at: at, winner: 'NONE', win_reason: null, day_index: count + 1, player_count: 5,
        settings: { gameSource: { v: 1, value: 'production' } }, completed: true,
    });
    await db.GameResultPlayer.create({
        game_id: id, user_id: uuid, nickname_snapshot: '옛판', role: 'CITIZEN', team: 'CITIZEN',
        won, is_alive: isAlive, death_reason: deathReason,
    });
    const rows = Array.from({ length: count }, (_, i) => ({ game_id: id, day_index: i + 1, user_id: uuid, accepted_at: new Date() }));
    if (rows.length > 0) await db.VoteParticipation.bulkCreate(rows);
    return id;
}

// 같은 판에 다른 사람 줄 + 그 사람 표 count번 (한 판에 탈주한 사람·안 한 사람 섞기)
async function joinGameWithVotes(gameId, uuid, count, { deathReason = null } = {}) {
    await db.GameResultPlayer.create({
        game_id: gameId, user_id: uuid, nickname_snapshot: '옛판', role: 'CITIZEN', team: 'CITIZEN',
        won: false, is_alive: false, death_reason: deathReason,
    });
    const rows = Array.from({ length: count }, (_, i) => ({ game_id: gameId, day_index: i + 1, user_id: uuid, accepted_at: new Date() }));
    await db.VoteParticipation.bulkCreate(rows);
}

// 업적 받음 알림은 버림 (판 없이 저장소·평가만 볼 때)
function quietAchievements(t) {
    achievementService.__internal.__setDepsForTests({ emitToUser: () => {} });
    t.after(() => achievementService.__internal.__setDepsForTests(null));
}

const voteCurrentOf = async (uuid) => (await achievementService.getStatusForUser(uuid)).find((s) => s.id === VOTES_10).current;

test('A03-B-318 탈주 안 한 판 3표 + 탈주한 판 2표 → 투표 참여 3 (한 명·여러 명 세기 둘 다)', async (t) => {
    if (noDb(t)) return;
    const [A] = await createUsers(1, 'v318');
    await seedGameWithVotes(A, 3);
    await seedGameWithVotes(A, 2, { deathReason: 'DISCONNECT' });
    assert.equal(await voteParticipationRepository.countEligibleDayVoteParticipations(A), 3);
    const counts = await voteParticipationRepository.countEligibleDayVoteParticipationsForUsers([A]);
    assert.equal(counts.get(A), 3);
});

test('A03-B-319 같은 판: A는 탈주·B는 끝까지 → A 표만 빠지고 B 표는 셈, A의 다른 판 표·죽은 뒤 나간 판 표는 셈', async (t) => {
    if (noDb(t)) return;
    const [A, B] = await createUsers(2, 'v319');
    const shared = await seedGameWithVotes(A, 2, { deathReason: 'DISCONNECT' });
    await joinGameWithVotes(shared, B, 2);
    await seedGameWithVotes(A, 1);
    // 처형으로 죽은 뒤 나간 판은 탈주가 아님 (판 수와 같은 기준)
    await seedGameWithVotes(A, 1, { deathReason: 'EXECUTION' });
    const counts = await voteParticipationRepository.countEligibleDayVoteParticipationsForUsers([A, B]);
    assert.equal(counts.get(A), 2, 'A: 탈주 판 2표 뺌, 다른 판 1 + 죽은 뒤 나간 판 1');
    assert.equal(counts.get(B), 2, 'B: 같은 판이라도 탈주 안 했으니 셈');
    assert.equal(await voteParticipationRepository.countEligibleDayVoteParticipations(A), 2);
    assert.equal(await voteParticipationRepository.countEligibleDayVoteParticipations(B), 2);
});

test('A03-B-320 탈주 판 표 빼면 9·넣으면 10인 A → 업적 안 받음(진행 9), 같은 모양인데 탈주 안 한 B → 받음(진행 10)', async (t) => {
    if (noDb(t)) return;
    quietAchievements(t);
    const [A, B] = await createUsers(2, 'v320');
    await seedGameWithVotes(A, 9);
    await seedGameWithVotes(A, 1, { deathReason: 'DISCONNECT' });
    await seedGameWithVotes(B, 9);
    await seedGameWithVotes(B, 1);
    await achievementHooks.evaluateForUsers([A, B], 'no-game');
    await settleEvaluations();
    assert.equal(await grantCount(A, VOTES_10), 0, 'A는 탈주 판 표를 빼서 9');
    assert.equal(await voteCurrentOf(A), 9);
    assert.equal(await grantCount(B, VOTES_10), 1, 'B는 10');
    assert.equal(await voteCurrentOf(B), 10);
    // 한 명 평가 길(미리 읽기 없이)도 같은 수
    await achievementService.evaluateAndGrantForUser(A);
    assert.equal(await grantCount(A, VOTES_10), 0);
});

test('A03-B-321 다른 업적 숫자(판 수·생존·승리)는 그대로: 탈주 판은 판 수에서만 빠지던 대로', async (t) => {
    if (noDb(t)) return;
    const [A] = await createUsers(1, 'v321');
    await seedGameWithVotes(A, 1, { isAlive: true, won: true });
    await seedGameWithVotes(A, 1);
    // 탈주 판: 판 수에선 빠지고(전부터) 생존·승리 숫자는 전과 같게 둠
    await seedGameWithVotes(A, 1, { deathReason: 'DISCONNECT', isAlive: false, won: false });
    const progress = await achievementService.loadProgress(A);
    assert.equal(progress.completedGames, 2);
    assert.equal(progress.survivals, 1);
    assert.equal(progress.wins, 1);
    assert.equal(progress.roleWinsByRole.get('CITIZEN'), 1);
    assert.equal(progress.voteParticipations, 2);
});

test('A03-B-322 표 낸 뒤 그 판에서 나중에 탈주: 1일 낮 끝엔 이번 판 표를 아직 안 셈(8), 판 끝 뒤엔 탈주 판이라 빠짐(8) · 같은 판 B는 10 받음', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'v322' });
    const [X, A, B] = ctx.citizens;
    await seedVotes(A, 8);
    await seedVotes(B, 8);
    const first = openVote(ctx);
    await vote(ctx, A, X);
    await vote(ctx, B, X);
    await endDay(ctx, first);
    // 낮 끝 평가 때 A는 아직 탈주 전, 이번 판은 판 결과가 없어 안 셈
    assert.equal(await voteCurrentOf(A), 8, '1일 낮 끝: 이번 판 표는 아직 안 셈');
    passNight(ctx);
    const second = openVote(ctx);
    await vote(ctx, A, X);
    await vote(ctx, B, X);
    // 표 낸 뒤 산 채로 나감 = 이 판 탈주
    assert.equal(T.applyParticipantDeparture(ctx.world.io, ctx.session, A, { reason: 'PLAYER_LEFT' }).ok, true);
    await endDay(ctx, second);
    assert.equal(await voteCurrentOf(A), 8, '2일 낮 끝: 아직 판 결과 없음');
    assert.equal(await grantCount(A, VOTES_10), 0);
    // 광대 처형으로 시민 승 → 판 끝 저장·업적
    passNight(ctx);
    gf.toTribunal(ctx.session, ctx.joker);
    for (const uuid of core.getTribunalVoterUuids(ctx.session, ctx.joker)) {
        assert.equal(core.submitTribunalVote(uuid, ctx.session.id, ctx.session.dayIndex, 'GUILTY').ok, true);
    }
    const prepared = core.prepareTribunalVoteResolution(B, ctx.session.id, ctx.session.dayIndex);
    assert.equal(prepared.ok, true, `재판 준비 실패: ${prepared.code}`);
    assert.equal(core.commitTribunalVoteResolution(prepared.session, prepared.resolution).ok, true);
    assert.equal(ctx.session.winResult?.winner, 'CITIZEN');
    T.persistTerminalSession(ctx.session, { completed: true });
    await waitEconomySignals(ctx);
    const rowA = await db.GameResultPlayer.findOne({ where: { game_id: ctx.session.id, user_id: A }, raw: true });
    assert.equal(rowA?.death_reason, 'DISCONNECT', '판 결과에 A는 탈주로 남음');
    assert.equal(await voteCurrentOf(A), 8, '판 끝 뒤: 탈주 판 표 2개 뺌');
    assert.equal(await grantCount(A, VOTES_10), 0);
    assert.equal(await voteCurrentOf(B), 10);
    assert.equal(await grantCount(B, VOTES_10), 1);
});
