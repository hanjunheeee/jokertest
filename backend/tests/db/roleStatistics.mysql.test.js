'use strict';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f10-role-statistics-mysql-test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests, migrationRunner,
});

let sequelize;
let connectionError = null;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    try {
        await sequelize.authenticate();
    } catch (error) {
        connectionError = error;
    }
});

test.after(async () => {
    if (sequelize) await sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    if (connectionError) throw connectionError;
    return false;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

const db = require('../../models');
const gameResultRepository = require('../../repositories/gameResult.repositories');
const gameSessionSocket = require('../../socket/gameSession');
const { hashPassword } = require('../../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const setUp = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, 8 - label.length)}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await hashPassword('correct-horse-battery-1'),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    await db.UserStats.create({ user_id: uuid });
    return uuid;
};

const makePlayer = (uuid, role, alive = true) => [uuid, {
    uuid, nickname: `nick-${uuid.slice(0, 6)}`, role, team: role === 'JOKER' ? 'JOKER' : 'CITIZEN',
    alive, deathReason: null,
}];

const makeEndedSession = (id, playersMap, overrides = {}) => ({
    id,
    roomId: crypto.randomUUID(),
    phase: 'ENDED',
    dayIndex: 2,
    jokerCount: 1,
    roleComposition: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: Math.max(playersMap.size - 1, 0) },
    timerSettings: { dayDiscussionTime: 90, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
    startedAt: Date.now() - 60_000,
    endedAt: Date.now(),
    winResult: { winner: 'CITIZEN' },
    gameSource: 'production',
    players: playersMap,
    ...overrides,
});

test('AC-01: 같은 game_id로 두 번 저장해도 행이 늘지 않고 통계도 두 번 반영되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const u1 = await createLocalUser('dup1');
    const u2 = await createLocalUser('dup2');
    const gameId = crypto.randomUUID();
    const session = makeEndedSession(gameId, new Map([
        makePlayer(u1, 'CITIZEN', true),
        makePlayer(u2, 'JOKER', false),
    ]));

    const first = await gameResultRepository.persistGameResult(session, { completed: true });
    assert.equal(first.persisted, true);
    const second = await gameResultRepository.persistGameResult(session, { completed: true });
    assert.equal(second.persisted, false, '이미 저장된 game_id는 다시 저장되지 않아야 한다(실패가 아니다)');

    assert.equal(await db.GameResult.count({ where: { id: gameId } }), 1, '경기 헤더가 중복 생성되면 안 된다');
    assert.equal(await db.GameResultPlayer.count({ where: { game_id: gameId } }), 2, '참가자 행이 중복 삽입되면 안 된다');

    const stats1 = await db.UserStats.findOne({ where: { user_id: u1 } });
    assert.equal(stats1.total_games, 1, '통계가 두 번 반영되면 안 된다');
});

test('AC-01: 동시 요청(경합)에서도 같은 game_id는 실제 DB 제약으로 정확히 한 번만 저장된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const u1 = await createLocalUser('race1');
    const gameId = crypto.randomUUID();
    const session = makeEndedSession(gameId, new Map([makePlayer(u1, 'DOCTOR', true)]));

    const [r1, r2] = await Promise.all([
        gameResultRepository.persistGameResult(session, { completed: true }),
        gameResultRepository.persistGameResult(session, { completed: true }),
    ]);
    const persistedCount = [r1, r2].filter((r) => r.persisted).length;
    assert.equal(persistedCount, 1, '동시 저장 요청 중 정확히 하나만 실제로 저장되어야 한다(나머지는 persisted:false)');

    assert.equal(await db.GameResult.count({ where: { id: gameId } }), 1);
    assert.equal(await db.GameResultPlayer.count({ where: { game_id: gameId } }), 1, '경합에서도 참가자 행이 중복되면 안 된다');
    const stats = await db.UserStats.findOne({ where: { user_id: u1 } });
    assert.equal(stats.total_games, 1, '경합에서도 통계는 정확히 한 번만 증가해야 한다');
});

test('AC-01: 실제 DB raw TINYINT를 정규화한 JOIN 통계와 settings.gameSource가 보존된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const u1 = await createLocalUser('join1');
    const gameId = crypto.randomUUID();
    const session = makeEndedSession(gameId, new Map([makePlayer(u1, 'GUARD', true)]), { gameSource: 'production' });

    await gameResultRepository.persistGameResult(session, { completed: true });

    const stats = await gameResultRepository.getMyRoleStatistics(u1);
    const guard = stats.find((s) => s.role === 'GUARD');
    assert.equal(guard.games, 1);
    assert.equal(guard.wins, 1);
    assert.equal(guard.survivalCount, 1);

    const rawPlayers = await db.GameResultPlayer.findAll({ where: { game_id: gameId }, raw: true });
    assert.equal(rawPlayers[0].won, 1, 'MySQL raw BOOLEAN is TINYINT; the repository must normalize it');
    assert.equal(rawPlayers[0].is_alive, 1);
    assert.equal(guard.winRate, 1, 'normalized booleans must reach the policy');

    const storedGame = await db.GameResult.findOne({ where: { id: gameId }, raw: true });
    assert.deepEqual(storedGame.settings.gameSource, { v: 1, value: 'production' }, 'JSON 컬럼이 저장→조회 왕복에서 구조를 보존해야 한다');
});

test('AC-01: 참가자 삽입이 실패하면 이미 만든 game_results 행도 같은 트랜잭션으로 롤백된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const u1 = await createLocalUser('rb1');
    const gameId = crypto.randomUUID();
    const session = makeEndedSession(gameId, new Map([makePlayer(u1, 'WITCH_HUNTER', true)]));

    const original = db.GameResultPlayer.bulkCreate;
    db.GameResultPlayer.bulkCreate = () => Promise.reject(new Error('시뮬레이션된 참가자 삽입 실패'));
    t.after(() => { db.GameResultPlayer.bulkCreate = original; });

    await assert.rejects(
        () => gameResultRepository.persistGameResult(session, { completed: true }),
        /시뮬레이션된 참가자 삽입 실패/,
    );

    assert.equal(await db.GameResult.count({ where: { id: gameId } }), 0, 'game_results 삽입도 같은 트랜잭션이므로 함께 롤백되어야 한다(경기는 있는데 참가자가 없는 상태 금지)');
    const stats = await db.UserStats.findOne({ where: { user_id: u1 } });
    assert.equal(stats.total_games, 0, '롤백된 트랜잭션은 통계도 증가시키면 안 된다');
});

test('AC-05: 중단 경기는 이탈자 패배만 확정되고, 잔류자(won=null)는 실제 DB 조회에서도 판수·생존수에 들어가지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const leaver = await createLocalUser('leave1');
    const stayer = await createLocalUser('stay1');
    const gameId = crypto.randomUUID();
    const session = makeEndedSession(gameId, new Map([
        makePlayer(leaver, 'CITIZEN', true),
        makePlayer(stayer, 'CITIZEN', true),
    ]), { winResult: null });

    const result = await gameResultRepository.persistGameResult(session, { completed: false, disconnectedUuid: leaver });
    assert.equal(result.persisted, true);

    const rows = await db.GameResultPlayer.findAll({ where: { game_id: gameId } });
    const leaverRow = rows.find((r) => r.user_id === leaver);
    const stayerRow = rows.find((r) => r.user_id === stayer);
    assert.equal(leaverRow.won, false, '이탈자는 패배로 확정되어야 한다');
    assert.equal(leaverRow.is_alive, false);
    assert.equal(leaverRow.death_reason, 'DISCONNECT');
    assert.equal(stayerRow.won, null, '잔류자의 승패는 미확정(null)으로 남아야 한다');

    const leaverStats = await gameResultRepository.getMyRoleStatistics(leaver);
    assert.equal(leaverStats.find((s) => s.role === 'CITIZEN').games, 1);
    const stayerStats = await gameResultRepository.getMyRoleStatistics(stayer);
    assert.equal(stayerStats.find((s) => s.role === 'CITIZEN').games, 0, '잔류자의 미확정 전적은 실제 DB 조회에서도 판수에 들어가면 안 된다');

    const stayerUserStats = await db.UserStats.findOne({ where: { user_id: stayer } });
    assert.equal(stayerUserStats.total_games, 0, 'won=null 잔류자는 user_stats도 증가하면 안 된다');
    const leaverUserStats = await db.UserStats.findOne({ where: { user_id: leaver } });
    assert.equal(leaverUserStats.total_games, 1);
});

test('AC-05: 소켓 종료 저장 경로(persistTerminalSession)도 실제 DB에 settings.gameSource를 그대로 보존한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const u1 = await createLocalUser('sock1');
    const gameId = crypto.randomUUID();
    const session = makeEndedSession(gameId, new Map([makePlayer(u1, 'CITIZEN', true)]), { gameSource: 'development' });

    gameSessionSocket.__testables.persistTerminalSession(session, { completed: true });

    const deadline = Date.now() + 2000;
    let row = null;
    while (Date.now() < deadline) {
        row = await db.GameResult.findOne({ where: { id: gameId }, raw: true });
        if (row) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(row, '소켓 종료 경로가 실제로 game_results에 저장해야 한다(타임아웃 2초 안에 반영되지 않음)');
    assert.deepEqual(row.settings.gameSource, { v: 1, value: 'development' }, '소켓 경로를 거쳐도 출처 값이 그대로 보존되어야 한다');

    const stats = await gameResultRepository.getMyRoleStatistics(u1);
    assert.equal(stats.find((s) => s.role === 'CITIZEN').games, 0, '소켓 경로로 저장된 개발 경기도 조회에서 제외되어야 한다');
});
