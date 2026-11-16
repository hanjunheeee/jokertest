'use strict';

// 업적 DB 시험: 옛 판 기록을 기준 바로 밑까지 넣고 진짜 판 하나를 끝내 업적 줄·보상 장부·테두리·알림이 시험 DB에 맞게 남는지 읽음
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-B-258~287·301~303 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
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
// 모델을 먼저 불러 시험 DB에 붙여 둠 (gameFixtures가 DATABASE_URL을 막는 값으로 바꾸기 전에)
const db = require('../../models');
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const gameSettings = require('../../services/ops/gameSettings');
const achievementService = require('../../services/achievement');
const money = require('../admin/helpers/money');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');

process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const { core } = gf;
const T = gs.__testables;
const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

test.before(async () => {
    if (!TEST_DB_URL) return;
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
});

test.after(async () => {
    gs.__resetStateForTests();
    await db.sequelize.close();
});

// ── 이 파일 안 작은 도우미 (공용 도우미는 안 고침) ──

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

// 판 출처를 정해 둠 (판 만들 때 정해짐): 'test' = 시험 환경, 'production' = 운영 못박음, 끝에 되돌림
// 한 시험에서 두 번 불러도 되돌리기는 처음 값으로 한 번만
const sourced = new WeakSet();
function setSource(t, source) {
    const saved = { NODE_ENV: process.env.NODE_ENV, GAME_SOURCE_OVERRIDE: process.env.GAME_SOURCE_OVERRIDE };
    if (source === 'production') process.env.GAME_SOURCE_OVERRIDE = 'production';
    else {
        delete process.env.GAME_SOURCE_OVERRIDE;
        process.env.NODE_ENV = 'test';
    }
    if (sourced.has(t)) return;
    sourced.add(t);
    t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
}

// 진짜 계정으로 판 열기 (직업 고정 randomFn 0, roleCounts 직접 구성) + 첫 낮 + 판 골드 값 1
// 받은 다시 읽기 신호·업적 받음 알림은 signals에 모음
async function startGame(t, { label, n = 5, roleCounts = { JOKER: 1 }, source = 'production', uuids = null }) {
    gf.resetCore();
    gs.__resetStateForTests();
    setSource(t, source);
    gameSettings.__setGoldRewardForTests(1);
    const people = uuids ?? await createUsers(n, label);
    const counts = { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts };
    const room = {
        id: crypto.randomUUID(),
        players: new Map(people.map((uuid, i) => [uuid, { uuid, nickname: `${label}${i}`, isReady: true }])),
        settings: { maxPlayers: 10, jokerCount: counts.JOKER, roleCompositionMode: 'custom', roleCounts: counts },
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
    t.after(() => {
        gs.__resetStateForTests();
        gf.resetCore();
        gameSettings.__setGoldRewardForTests();
        achievementService.__internal.__setDepsForTests(null);
    });
    return { session, world, signals, joker: gf.firstOf(session, 'JOKER'), citizens: gf.nonJokers(session) };
}

// 피고 세우고 투표할 사람 전원 같은 표 → 판정 확정 (판 규칙 함수로, 전적 저장은 따로)
function tribunal(session, defendant, vote = 'GUILTY') {
    gf.toTribunal(session, defendant);
    for (const uuid of core.getTribunalVoterUuids(session, defendant)) {
        assert.equal(core.submitTribunalVote(uuid, session.id, session.dayIndex, vote).ok, true);
    }
    const anyone = [...session.players.values()].find((p) => p.alive && p.isParticipating !== false).uuid;
    const prepared = core.prepareTribunalVoteResolution(anyone, session.id, session.dayIndex);
    assert.equal(prepared.ok, true, `재판 준비 실패: ${prepared.code}`);
    const committed = core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `재판 확정 실패: ${committed.code}`);
    return committed;
}

// 밤 하나를 판 규칙 함수로만 (방송·저장 없음), victim null이면 안 죽임
function nightCoreOnly(session, victim = null) {
    T.stopNightTurnSequence(session.id);
    T.stopDayPhaseTimer(session.id);
    gf.toNight(session);
    const joker = gf.byRole(session, 'JOKER').find((u) => session.players.get(u).alive);
    if (victim) assert.equal(core.submitNightAction(joker, session.id, victim).ok, true);
    gf.skipAllNight(session);
    const prepared = core.prepareNightResolution(joker, session.id);
    assert.equal(prepared.ok, true, `밤 준비 실패: ${prepared.code}`);
    assert.equal(core.commitNightResolution(prepared.session, prepared.resolution).ok, true);
}

// 광대 처형으로 시민 승 / 밤마다 시민 암살로 광대 승 (판 규칙 함수로만)
function finishCitizenWin(session) {
    tribunal(session, gf.firstOf(session, 'JOKER'));
    assert.equal(session.winResult?.winner, 'CITIZEN');
}
function finishJokerWin(session) {
    for (let i = 0; i < 12 && session.phase !== 'ENDED'; i += 1) {
        const victim = [...session.players.values()].find((p) => p.alive && p.role !== 'JOKER').uuid;
        nightCoreOnly(session, victim);
    }
    assert.equal(session.winResult?.winner, 'JOKER');
}

// 조건이 맞을 때까지 잠깐씩 다시 봄 (DB 쓰기는 기다리지 않는 길이라), 넉넉히 기다림 (표 처음 쓰기 7~13초)
async function waitFor(check, label, timeoutMs = 25_000) {
    const until = Date.now() + timeoutMs;
    for (;;) {
        if (await check()) return;
        if (Date.now() > until) assert.fail(`${label} 기다리다 시간 넘김`);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

// 전원이 그 범위 다시 읽기 신호를 count번 받을 때까지 (economy = 판 골드·업적 평가까지 끝남)
async function waitSignals(ctx, scope = 'economy', count = 1) {
    const uuids = [...ctx.session.players.keys()];
    await waitFor(() => uuids.every((u) => ctx.signals.filter((e) => e.uuid === u
        && e.event === 'account_cache_invalidated' && e.payload.scopes.includes(scope)).length >= count), `${scope} 다시 읽기 신호`);
}

// 서버 판 끝 저장 길을 열고 판 끝 처리(저장 → 판 골드 → 업적) 끝날 때까지
async function persistAndSettle(ctx) {
    T.persistTerminalSession(ctx.session, { completed: true });
    await waitSignals(ctx);
}

const TEAM_OF = (role) => (role === 'JOKER' ? 'JOKER' : 'CITIZEN');

// 옛 판 기록 count판 (운영 출처·끝까지 간 판) 넣기 → 업적 셈의 바탕 (판 줄 + 그 사람 참가 줄)
async function seedGames(uuid, count, { role = 'CITIZEN', won = false, alive = false } = {}) {
    if (count <= 0) return [];
    const results = [];
    const players = [];
    for (let i = 0; i < count; i += 1) {
        const id = crypto.randomUUID();
        const at = new Date(Date.UTC(2026, 8, 1, 0, i));
        results.push({
            id, started_at: at, ended_at: at, winner: won ? TEAM_OF(role) : 'NONE', win_reason: null, day_index: 2, player_count: 5,
            settings: { gameSource: { v: 1, value: 'production' } }, completed: true,
        });
        players.push({ game_id: id, user_id: uuid, nickname_snapshot: '옛판', role, team: TEAM_OF(role), won, is_alive: alive });
    }
    await db.GameResult.bulkCreate(results);
    await db.GameResultPlayer.bulkCreate(players);
    return results.map((r) => r.id);
}

// 옛 투표 참여 count번 (운영 출처 끝난 판 하나에 날짜만 달리)
async function seedVotes(uuid, count) {
    const [gameId] = await seedGames(uuid, 1);
    const rows = Array.from({ length: count }, (_, i) => ({ game_id: gameId, day_index: i + 1, user_id: uuid, accepted_at: new Date() }));
    await db.VoteParticipation.bulkCreate(rows);
}

const grantOf = (uuid, id) => db.AchievementGrant.findOne({ where: { user_id: uuid, achievement_id: id }, raw: true });
const grantCount = (uuid, id) => db.AchievementGrant.count({ where: { user_id: uuid, achievement_id: id } });
const rewardRows = (uuid, id) => db.EconomyLedgerEntry.findAll({
    where: { user_id: uuid, reason: 'ACHIEVEMENT_REWARD', reference_event_id: [`achievement:${id}:GOLD`, `achievement:${id}:DIAMOND`, `achievement:${id}:ITEM`] },
    raw: true,
});
const ownsItem = (uuid, itemId) => db.sequelize.models.EconomyEntitlement.count({ where: { user_id: uuid, item_id: itemId } });

// 업적 받음 확인: 업적 줄 하나 + 보상 장부(골드·다이아 금액)
async function assertGranted(uuid, id, { gold, diamond }) {
    assert.ok(await grantOf(uuid, id), `${id} 업적 줄 있어야 함`);
    const rows = await rewardRows(uuid, id);
    const sum = (currency) => rows.filter((r) => r.currency === currency).reduce((s, r) => s + Number(r.amount), 0);
    assert.equal(sum('GOLD'), gold, `${id} 골드 보상`);
    assert.equal(sum('DIAMOND'), diamond, `${id} 다이아 보상`);
}

// 낮 투표 단계로 열고 화면이 보내는 것처럼 낮 표 (진짜 처리기 → 참여 기록 DB)
async function castDayVotes(ctx, voters, target) {
    const { session, world } = ctx;
    const clock = gf.fakeClock();
    T.startDayPhaseTimer(world.io, session, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn,
        discussionDurationMs: 30_000, voteDurationMs: 30_000,
    });
    clock.advance(30_000);
    for (const uuid of voters) {
        const r = await gf.call(T.handleSubmitDayVote, world.io, world.sock(uuid), uuid, { gameId: session.id, targetId: target });
        assert.equal(r.ok, true, `낮 표 거절: ${r.code}`);
    }
    T.stopDayPhaseTimer(session.id);
}

// ── A07-B-258~264: 기록 업적 7개 기준 경계 (5명 판) ──
// A는 기준−1, B는 기준−2로 시작 → 판 하나 끝내면 A만 받음 (골드 50·다이아 50)

const RECORD_EDGES = [
    ['258', 'record-1-masquerade', '판 수 3', 3, 'games'],
    ['259', 'record-2-extra-mask', '투표 참여 10', 10, 'votes'],
    ['260', 'record-3-first-morning', '생존 5', 5, 'survivals'],
    ['261', 'record-4-testimonies', '판 수 15', 15, 'games'],
    ['262', 'record-5-clown-story', '승 10', 10, 'wins'],
    ['263', 'record-6-dead-mans-leaving', '생존 20', 20, 'survivals'],
    ['264', 'record-7-erased-night', '승 30', 30, 'wins'],
];
const seedMetric = async (uuid, metric, count) => {
    if (metric === 'games') return seedGames(uuid, count);
    if (metric === 'votes') return seedVotes(uuid, count);
    if (metric === 'survivals') return seedGames(uuid, count, { alive: true });
    return seedGames(uuid, count, { won: true });
};

for (const [no, id, label, threshold, metric] of RECORD_EDGES) {
    test(`A07-B-${no} ${label}: 기준−1인 사람이 5명 판 끝냄 → 받음(골드 50·다이아 50), 기준−2인 사람은 안 받음`, async (t) => {
        if (noDb(t)) return;
        const ctx = await startGame(t, { label: `h${no}` });
        const [a, b] = ctx.citizens;
        await seedMetric(a, metric, threshold - 1);
        await seedMetric(b, metric, threshold - 2);
        // 투표 업적은 이 판에서 낮 표 하나씩 (광대를 찍음)
        if (metric === 'votes') await castDayVotes(ctx, [a, b], ctx.joker);
        // 시민 승 → A·B 둘 다 살아서 이김
        finishCitizenWin(ctx.session);
        await persistAndSettle(ctx);
        await assertGranted(a, id, { gold: 50, diamond: 50 });
        assert.equal(await grantCount(b, id), 0, `기준−2는 ${id} 없음`);
        assert.equal((await rewardRows(b, id)).length, 0);
    });
}

// ── A07-B-265~279: 직업 10·20·30승 ──

const JOBS = [
    ['CITIZEN', 'noble', '귀족(시민)'],
    ['JOKER', 'clown', '광대'],
    ['DOCTOR', 'doctor', '의사'],
    ['GUARD', 'guard', '경비원'],
    ['WITCH_HUNTER', 'witch-hunter', '마녀사냥꾼'],
];
const BORDER_OF = { CITIZEN: '귀족', JOKER: '광대', DOCTOR: '주치의', GUARD: '경비원', WITCH_HUNTER: '마녀사냥꾼' };

// 그 직업을 맡은 사람 A로 5명 판을 열고, A에게 그 직업 승 wins판을 넣고, A 편이 이기게 끝냄 → A
async function roleWinGame(t, no, role, wins) {
    const roleCounts = role === 'CITIZEN' || role === 'JOKER' ? { JOKER: 1 } : { JOKER: 1, [role]: 1 };
    const ctx = await startGame(t, { label: `h${no}`, roleCounts });
    const a = gf.firstOf(ctx.session, role);
    assert.ok(a, `${role} 맡은 사람`);
    await seedGames(a, wins, { role, won: true });
    if (role === 'JOKER') finishJokerWin(ctx.session); else finishCitizenWin(ctx.session);
    await persistAndSettle(ctx);
    return { ctx, a };
}

for (const [i, [role, prefix, label]] of JOBS.entries()) {
    const no = String(265 + i);
    test(`A07-B-${no} ${label} 9승 → 이겨서 10승 → 골드 10·다이아 10`, async (t) => {
        if (noDb(t)) return;
        const { a } = await roleWinGame(t, no, role, 9);
        await assertGranted(a, `${prefix}-win-10`, { gold: 10, diamond: 10 });
    });
}

for (const [i, [role, prefix, label]] of JOBS.entries()) {
    const no = String(270 + i);
    test(`A07-B-${no} ${label} 19승 → 20승 → 골드 20·다이아 30`, async (t) => {
        if (noDb(t)) return;
        const { a } = await roleWinGame(t, no, role, 19);
        await assertGranted(a, `${prefix}-win-20`, { gold: 20, diamond: 30 });
    });
}

for (const [i, [role, prefix, label]] of JOBS.entries()) {
    const no = String(275 + i);
    test(`A07-B-${no} ${label} 29승 → 30승 → 그 직업 테두리 가짐`, async (t) => {
        if (noDb(t)) return;
        const { a } = await roleWinGame(t, no, role, 29);
        assert.ok(await grantOf(a, `${prefix}-win-30`), '30승 업적 줄');
        assert.equal(await ownsItem(a, `profile-border-${BORDER_OF[role]}`), 1);
    });
}

// ── A07-B-280~287 ──

test('A07-B-280 테두리 산 사람이 30승 → 업적 기록 있음, 오류 없음, 테두리 하나', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'h280' });
    const a = ctx.citizens[0];
    const border = `profile-border-${BORDER_OF.CITIZEN}`;
    // 상점에서 산 것처럼 테두리 보유 줄을 먼저
    await db.sequelize.models.EconomyEntitlement.create({ user_id: a, item_id: border, item_type: 'PROFILE_BORDER', source: 'PURCHASE' });
    await seedGames(a, 29, { role: 'CITIZEN', won: true });
    finishCitizenWin(ctx.session);
    await persistAndSettle(ctx);
    assert.ok(await grantOf(a, 'noble-win-30'), '30승 업적 줄');
    assert.equal(await ownsItem(a, border), 1);
});

test('A07-B-281 판 수 3 받은 뒤 4판째 → 업적 줄·보상 장부 그대로', async (t) => {
    if (noDb(t)) return;
    const uuids = await createUsers(5, 'h281');
    const first = await startGame(t, { label: 'h281', uuids });
    const a = first.citizens[0];
    await seedGames(a, 2);
    finishCitizenWin(first.session);
    await persistAndSettle(first);
    await assertGranted(a, 'record-1-masquerade', { gold: 50, diamond: 50 });
    const second = await startGame(t, { label: 'h281', uuids });
    finishCitizenWin(second.session);
    await persistAndSettle(second);
    assert.equal(await grantCount(a, 'record-1-masquerade'), 1);
    assert.equal((await rewardRows(a, 'record-1-masquerade')).length, 2, '골드·다이아 줄 그대로 2줄');
    await assertGranted(a, 'record-1-masquerade', { gold: 50, diamond: 50 });
});

test('A07-B-282 업적 받는 판 → 그 사람만 achievement_granted', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'h282' });
    const a = ctx.citizens[0];
    await seedGames(a, 2);
    finishCitizenWin(ctx.session);
    await persistAndSettle(ctx);
    for (const u of ctx.session.players.keys()) {
        const got = ctx.signals.filter((e) => e.uuid === u && e.event === 'achievement_granted');
        if (u === a) assert.deepEqual(got.map((e) => e.payload.achievementId), ['record-1-masquerade']);
        else assert.equal(got.length, 0, `${u}는 업적 알림 없음`);
    }
});

test('A07-B-283 기준−1 + 점검 강제 종료 판 → 업적 없음', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'h283' });
    const a = ctx.citizens[0];
    await seedGames(a, 2);
    assert.equal(abortGamesForMaintenance(ctx.world.io), 1);
    await waitFor(async () => (await db.GameResult.count({ where: { id: ctx.session.id } })) === 1, '판 기록 줄');
    await waitSignals(ctx, 'profile');
    assert.equal(await grantCount(a, 'record-1-masquerade'), 0);
    assert.equal(await db.AchievementGrant.count({ where: { user_id: a } }), 0);
});

test('A07-B-284 기준−1 + 출처 test 판 → 업적 없음', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'h284', source: 'test' });
    const a = ctx.citizens[0];
    await seedGames(a, 2);
    finishCitizenWin(ctx.session);
    await persistAndSettle(ctx);
    assert.equal(await grantCount(a, 'record-1-masquerade'), 0);
    assert.equal(await db.AchievementGrant.count({ where: { user_id: a } }), 0);
});

test('A07-B-285 업적 받는 판 → ACHIEVEMENT_REWARD 줄과 GAME_REWARD 줄이 따로', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'h285' });
    const a = ctx.citizens[0];
    await seedGames(a, 2);
    finishCitizenWin(ctx.session);
    await persistAndSettle(ctx);
    const rows = await money.ledgerOf(a);
    const game = rows.filter((r) => r.reason === 'GAME_REWARD');
    const achievement = rows.filter((r) => r.reason === 'ACHIEVEMENT_REWARD');
    assert.equal(game.length, 1);
    assert.equal(game[0].reference_event_id, `game-reward:${ctx.session.id}`);
    assert.equal(achievement.length, 2);
    for (const r of achievement) assert.match(r.reference_event_id, /^achievement:record-1-masquerade:/);
});

test('A07-B-286 승 9인 사람이 산 채로 나가고 그 편 이김 → 승 업적 없음', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'h286' });
    const a = ctx.citizens[0];
    await seedGames(a, 9, { won: true });
    assert.equal(T.applyParticipantDeparture(ctx.world.io, ctx.session, a, { reason: 'PLAYER_LEFT' }).ok, true);
    T.stopDayPhaseTimer(ctx.session.id);
    finishCitizenWin(ctx.session);
    await persistAndSettle(ctx);
    assert.equal(await grantCount(a, 'record-5-clown-story'), 0);
});

test('A07-B-287 승 9인 사람이 처형된 뒤 나가고 그 편 이김 → 승 10 업적', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'h287' });
    const a = ctx.citizens[0];
    await seedGames(a, 9, { won: true });
    assert.equal(tribunal(ctx.session, a).terminal ?? null, null);
    nightCoreOnly(ctx.session);
    assert.equal(T.applyParticipantDeparture(ctx.world.io, ctx.session, a, { reason: 'PLAYER_LEFT' }).ok, true);
    T.stopDayPhaseTimer(ctx.session.id);
    finishCitizenWin(ctx.session);
    await persistAndSettle(ctx);
    await assertGranted(a, 'record-5-clown-story', { gold: 50, diamond: 50 });
});

// ── 탈주한 판은 "끝까지 한 판 수"에 안 셈 (결정 2026-11-16 아침 10번) ──

test('A07-B-301 판 수 2인 사람이 산 채로 나가고 판이 끝까지 감 → 판 수 3 업적 없음', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'h301' });
    const a = ctx.citizens[0];
    await seedGames(a, 2);
    assert.equal(T.applyParticipantDeparture(ctx.world.io, ctx.session, a, { reason: 'PLAYER_LEFT' }).ok, true);
    T.stopDayPhaseTimer(ctx.session.id);
    finishCitizenWin(ctx.session);
    await persistAndSettle(ctx);
    assert.equal(await grantCount(a, 'record-1-masquerade'), 0);
});

test('A07-B-302 판 수 2인 사람이 처형된 뒤 나가고 판이 끝까지 감 → 판 수 3 업적 받음 (죽은 뒤 나감은 탈주 아님)', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'h302' });
    const a = ctx.citizens[0];
    await seedGames(a, 2);
    assert.equal(tribunal(ctx.session, a).terminal ?? null, null);
    nightCoreOnly(ctx.session);
    assert.equal(T.applyParticipantDeparture(ctx.world.io, ctx.session, a, { reason: 'PLAYER_LEFT' }).ok, true);
    T.stopDayPhaseTimer(ctx.session.id);
    finishCitizenWin(ctx.session);
    await persistAndSettle(ctx);
    await assertGranted(a, 'record-1-masquerade', { gold: 50, diamond: 50 });
});

test('A07-B-303 옛 판 1 + 옛 탈주 판 1(산 채로 나간 줄) + 판 하나 끝까지 함 → 판 수 2로 세어 판 수 3 업적 없음', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { label: 'h303' });
    const a = ctx.citizens[0];
    await seedGames(a, 1);
    // 옛 탈주 판: 끝까지 간 운영 판인데 이 사람 줄만 "산 채로 나감"(죽은 이유 DISCONNECT·패)
    const [deserted] = await seedGames(a, 1);
    await db.GameResultPlayer.update({ death_reason: 'DISCONNECT' }, { where: { game_id: deserted, user_id: a } });
    finishCitizenWin(ctx.session);
    await persistAndSettle(ctx);
    assert.equal(await grantCount(a, 'record-1-masquerade'), 0);
});
