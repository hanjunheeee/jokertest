'use strict';

// 전적 저장 DB 시험: 진짜 계정으로 판을 끝내 판 줄·참가자 줄·사람별 통계·판 설정 복사·판 출처가 시험 DB에 맞게 남는지 읽음
// 목록 docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md A07-B-240~257 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
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
const recordService = require('../../services/game/record');
const { persistGameResult } = require('../helpers/persistGameResult');
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

// 판 출처를 정해 둠: 'test' = 시험 환경(NODE_ENV=test), 'production' = 운영 못박음, 끝에 되돌림
function setSource(t, source) {
    const saved = { NODE_ENV: process.env.NODE_ENV, GAME_SOURCE_OVERRIDE: process.env.GAME_SOURCE_OVERRIDE };
    if (source === 'production') process.env.GAME_SOURCE_OVERRIDE = 'production';
    else {
        delete process.env.GAME_SOURCE_OVERRIDE;
        process.env.NODE_ENV = 'test';
    }
    t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
}

// 진짜 계정으로 판 열기 (직업 고정 randomFn 0, roleCounts 직접 구성) + 첫 낮 + 판 골드 값 1
async function startGame(t, { n, label, roleCounts = { JOKER: 1 } }) {
    gf.resetCore();
    gs.__resetStateForTests();
    gameSettings.__setGoldRewardForTests(1);
    const people = await createUsers(n, label);
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
    gs.setEmitToUser((uuid, event, payload) => signals.push({ uuid, event, payload }));
    t.after(() => {
        gs.__resetStateForTests();
        gf.resetCore();
        gameSettings.__setGoldRewardForTests();
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
    gf.toNight(session);
    const joker = gf.byRole(session, 'JOKER').find((u) => session.players.get(u).alive);
    if (victim) assert.equal(core.submitNightAction(joker, session.id, victim).ok, true);
    gf.skipAllNight(session);
    const prepared = core.prepareNightResolution(joker, session.id);
    assert.equal(prepared.ok, true, `밤 준비 실패: ${prepared.code}`);
    assert.equal(core.commitNightResolution(prepared.session, prepared.resolution).ok, true);
}

// 밤마다 산 시민을 죽여 광대 승으로 끝냄 (판 규칙 함수로만)
function finishJokerWin(session) {
    for (let i = 0; i < 12 && session.phase !== 'ENDED'; i += 1) {
        const victim = [...session.players.values()].find((p) => p.alive && p.role !== 'JOKER').uuid;
        nightCoreOnly(session, victim);
    }
    assert.equal(session.winResult?.winner, 'JOKER');
}

// 광대를 전부 처형해 시민 승으로 끝냄 (사이 밤은 아무도 안 죽음)
function finishCitizenWin(session) {
    const jokers = gf.byRole(session, 'JOKER').filter((u) => session.players.get(u).alive);
    for (const [i, joker] of jokers.entries()) {
        tribunal(session, joker);
        if (i < jokers.length - 1) nightCoreOnly(session);
    }
    assert.equal(session.winResult?.winner, 'CITIZEN');
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

// 전원이 그 범위 다시 읽기 신호를 count번 받을 때까지 (저장 확인 = profile, 판 골드·업적까지 = economy)
async function waitSignals(ctx, scope = 'economy', count = 1) {
    const uuids = [...ctx.session.players.keys()];
    await waitFor(() => uuids.every((u) => ctx.signals.filter((e) => e.uuid === u
        && e.event === 'account_cache_invalidated' && e.payload.scopes.includes(scope)).length >= count), `${scope} 다시 읽기 신호`);
}

// 서버 판 끝 저장 길을 열고 판 끝 처리 끝날 때까지
async function persistAndSettle(ctx) {
    T.persistTerminalSession(ctx.session, { completed: true });
    await waitSignals(ctx);
}

const gameRow = (gameId) => db.GameResult.findOne({ where: { id: gameId }, raw: true });
const playerRows = (gameId) => db.GameResultPlayer.findAll({ where: { game_id: gameId }, raw: true });
const statsOf = (uuid) => db.UserStats.findOne({ where: { user_id: uuid }, raw: true });
// DB가 JSON을 글자로 줄 때도 읽게
const parseJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
// DB가 참/거짓을 1/0으로 줄 때도 맞춤
const bool = (value) => (value === null || value === undefined ? null : Boolean(value));

// 사람별 통계 지금 값 → Map(uuid → { total, survival, execution })
async function statsMap(uuids) {
    const map = new Map();
    for (const u of uuids) {
        const row = await statsOf(u);
        map.set(u, { total: row.total_games, survival: row.survival_count, execution: row.execution_count });
    }
    return map;
}

// 직업을 정해 둔 끝난 판 (사람 → 직업), 많이 한 직업 시험용 — 판 → 기록 저장은 진짜 저장소
function endedSessionWithRoles(rolesByUuid) {
    const players = new Map(Object.entries(rolesByUuid).map(([uuid, role], i) => [uuid, {
        uuid, nickname: `직${i}`, role, team: role === 'JOKER' ? 'JOKER' : 'CITIZEN', alive: true, deathReason: null,
    }]));
    const now = Date.now();
    return {
        id: crypto.randomUUID(), phase: 'ENDED', winResult: { winner: 'CITIZEN' }, players, dayIndex: 2,
        startedAt: now - 60_000, endedAt: now, jokerCount: 1, roleComposition: {}, timerSettings: {},
    };
}

// ── A07-B-240~245: 판 하나 저장 ──

for (const [i, n] of [5, 6, 7, 8, 9, 10].entries()) {
    const no = String(240 + i);
    const winner = i % 2 === 0 ? 'CITIZEN' : 'JOKER';
    test(`A07-B-${no} ${n}명 판 끝남(${winner === 'CITIZEN' ? '시민' : '광대'} 승) → game_results 1줄(winner·win_reason·player_count ${n}·completed true), game_result_players ${n}줄`, async (t) => {
        if (noDb(t)) return;
        const ctx = await startGame(t, { n, label: `r${no}` });
        if (winner === 'CITIZEN') finishCitizenWin(ctx.session); else finishJokerWin(ctx.session);
        await persistAndSettle(ctx);
        const rows = await db.GameResult.findAll({ where: { id: ctx.session.id }, raw: true });
        assert.equal(rows.length, 1);
        assert.equal(rows[0].winner, winner);
        assert.equal(rows[0].win_reason, winner === 'CITIZEN' ? 'ALL_JOKERS_ELIMINATED' : 'JOKER_PARITY_REACHED');
        assert.equal(rows[0].player_count, n);
        assert.equal(bool(rows[0].completed), true);
        const players = await playerRows(ctx.session.id);
        assert.equal(players.length, n);
        assert.deepEqual(players.map((p) => p.user_id).sort(), [...ctx.session.players.keys()].sort());
    });
}

// ── A07-B-246~248: 사람별 통계 더하기 (7명 판) ──
// 1일 C1 처형 → 밤 C2 암살 → 2일 광대 처형 → 시민 승 (산 사람 C3~C6, 처형 C1·광대)
async function statsGame(t, no) {
    const ctx = await startGame(t, { n: 7, label: `r${no}` });
    const { session, joker } = ctx;
    const [c1, c2] = ctx.citizens;
    const uuids = [...session.players.keys()];
    const before = await statsMap(uuids);
    tribunal(session, c1);
    nightCoreOnly(session, c2);
    tribunal(session, joker);
    assert.equal(session.winResult?.winner, 'CITIZEN');
    await persistAndSettle(ctx);
    const after = await statsMap(uuids);
    const alive = new Set(uuids.filter((u) => session.players.get(u).alive));
    return { uuids, before, after, alive, executed: new Set([c1, joker]) };
}

test('A07-B-246 7명 판 → user_stats 판 수 +1 전원', async (t) => {
    if (noDb(t)) return;
    const { uuids, before, after } = await statsGame(t, '246');
    for (const u of uuids) assert.equal(after.get(u).total, before.get(u).total + 1, u);
});

test('A07-B-247 7명 판 → user_stats 생존 +1 산 사람만', async (t) => {
    if (noDb(t)) return;
    const { uuids, before, after, alive } = await statsGame(t, '247');
    assert.equal(alive.size, 4);
    for (const u of uuids) assert.equal(after.get(u).survival, before.get(u).survival + (alive.has(u) ? 1 : 0), u);
});

test('A07-B-248 7명 판 → user_stats 처형 +1 처형된 사람만', async (t) => {
    if (noDb(t)) return;
    const { uuids, before, after, executed } = await statsGame(t, '248');
    for (const u of uuids) assert.equal(after.get(u).execution, before.get(u).execution + (executed.has(u) ? 1 : 0), u);
});

// ── A07-B-249~252 ──

test('A07-B-249 6명 판 1명 산 채로 나감, 그 편 이김 → 그 줄 won false·death_reason DISCONNECT, 판 수 +1', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { n: 6, label: 'r249' });
    const leaver = ctx.citizens[0];
    const before = (await statsOf(leaver)).total_games;
    assert.equal(T.applyParticipantDeparture(ctx.world.io, ctx.session, leaver, { reason: 'PLAYER_LEFT' }).ok, true);
    T.stopDayPhaseTimer(ctx.session.id);
    finishCitizenWin(ctx.session);
    await persistAndSettle(ctx);
    const row = (await playerRows(ctx.session.id)).find((p) => p.user_id === leaver);
    assert.equal(bool(row.won), false);
    assert.equal(row.death_reason, 'DISCONNECT');
    assert.equal((await statsOf(leaver)).total_games, before + 1);
});

test('A07-B-250 5명 판 점검 강제 종료 → completed false·winner NONE·win_reason MAINTENANCE, 전원 won null, user_stats 안 바뀜', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { n: 5, label: 'r250' });
    const uuids = [...ctx.session.players.keys()];
    const before = await statsMap(uuids);
    assert.equal(abortGamesForMaintenance(ctx.world.io), 1);
    await waitFor(async () => (await gameRow(ctx.session.id)) !== null, '판 기록 줄');
    await waitSignals(ctx, 'profile');
    const row = await gameRow(ctx.session.id);
    assert.equal(bool(row.completed), false);
    assert.equal(row.winner, 'NONE');
    assert.equal(row.win_reason, 'MAINTENANCE');
    const players = await playerRows(ctx.session.id);
    assert.equal(players.length, 5);
    for (const p of players) assert.equal(p.won, null, p.user_id);
    assert.deepEqual(await statsMap(uuids), before);
});

test('A07-B-251 5명 판 두 번째 저장 → 판 1줄, 통계 한 번만', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { n: 5, label: 'r251' });
    const uuids = [...ctx.session.players.keys()];
    const before = await statsMap(uuids);
    finishJokerWin(ctx.session);
    await persistAndSettle(ctx);
    // 메모리 표식(같은 판 한 번만)을 지워 DB까지 두 번째 저장이 가게 함 (서버를 다시 켠 것과 같음)
    recordService.__resetTerminalPersistForTests();
    T.persistTerminalSession(ctx.session, { completed: true });
    await waitSignals(ctx, 'economy', 2);
    assert.equal(await db.GameResult.count({ where: { id: ctx.session.id } }), 1);
    assert.equal((await playerRows(ctx.session.id)).length, 5);
    const after = await statsMap(uuids);
    for (const u of uuids) assert.equal(after.get(u).total, before.get(u).total + 1, u);
});

test('A07-B-252 6명 판 한꺼번에 두 번 저장 → 판 1줄, 통계 한 번만', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { n: 6, label: 'r252' });
    const uuids = [...ctx.session.players.keys()];
    const before = await statsMap(uuids);
    finishJokerWin(ctx.session);
    // 판 → 기록 저장 두 번을 동시에 (진짜 저장소)
    await Promise.allSettled([persistGameResult(ctx.session), persistGameResult(ctx.session)]);
    assert.equal(await db.GameResult.count({ where: { id: ctx.session.id } }), 1);
    assert.equal((await playerRows(ctx.session.id)).length, 6);
    const after = await statsMap(uuids);
    for (const u of uuids) assert.equal(after.get(u).total, before.get(u).total + 1, u);
});

// ── A07-B-253~254: 많이 한 직업 ──

test('A07-B-253 의사 2판·시민 1판 → most_played_role DOCTOR', async (t) => {
    if (noDb(t)) return;
    const [a, ...others] = await createUsers(5, 'r253');
    const rolesFor = (role) => ({ [a]: role, [others[0]]: 'JOKER', [others[1]]: 'CITIZEN', [others[2]]: 'CITIZEN', [others[3]]: 'CITIZEN' });
    // 마지막 판이 시민이라 "마지막 판 직업"으로 고르면 틀림
    for (const role of ['DOCTOR', 'DOCTOR', 'CITIZEN']) await persistGameResult(endedSessionWithRoles(rolesFor(role)));
    assert.equal((await statsOf(a)).most_played_role, 'DOCTOR');
});

test('A07-B-254 의사 1판·경비원 1판 → 이름 순 앞 DOCTOR', async (t) => {
    if (noDb(t)) return;
    const [a, ...others] = await createUsers(5, 'r254');
    const rolesFor = (role) => ({ [a]: role, [others[0]]: 'JOKER', [others[1]]: 'CITIZEN', [others[2]]: 'CITIZEN', [others[3]]: 'CITIZEN' });
    // 마지막 판이 경비원이라 "마지막 판 직업"으로 고르면 틀림
    for (const role of ['DOCTOR', 'GUARD']) await persistGameResult(endedSessionWithRoles(rolesFor(role)));
    assert.equal((await statsOf(a)).most_played_role, 'DOCTOR');
});

// ── A07-B-255: 판 설정 복사 ──

test('A07-B-255 8명 판 → settings에 광대 수·역할 구성·시간이 판 시작 값 그대로', async (t) => {
    if (noDb(t)) return;
    const ctx = await startGame(t, { n: 8, label: 'r255', roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 1 } });
    const { session } = ctx;
    // 판 시작 때 값 (판 중에 바뀌어도 기록은 이 값이어야 함)
    const atStart = JSON.parse(JSON.stringify({
        jokerCount: session.jokerCount, roleComposition: session.roleComposition, timerSettings: session.timerSettings,
    }));
    assert.equal(atStart.jokerCount, 2);
    finishCitizenWin(session);
    await persistAndSettle(ctx);
    const settings = parseJson((await gameRow(session.id)).settings);
    assert.equal(settings.jokerCount, 2);
    assert.deepEqual(settings.roleComposition, atStart.roleComposition);
    for (const [key, value] of Object.entries(atStart.timerSettings ?? {})) {
        assert.deepEqual(settings.timerSettings[key], value, `시간 ${key}`);
    }
});

// ── A07-B-256~257: 판 출처 ──

for (const [no, source, label] of [['256', 'test', 'NODE_ENV=test'], ['257', 'production', '운영 못박음']]) {
    test(`A07-B-${no} ${label} → 출처 ${source}`, async (t) => {
        if (noDb(t)) return;
        setSource(t, source);
        const ctx = await startGame(t, { n: 5, label: `r${no}` });
        finishJokerWin(ctx.session);
        await persistAndSettle(ctx);
        const settings = parseJson((await gameRow(ctx.session.id)).settings);
        assert.equal(settings.gameSource.value, source);
    });
}
