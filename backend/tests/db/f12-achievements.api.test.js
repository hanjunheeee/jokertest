'use strict';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f12-achievements-api-test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const express = require('express');
const cookieParser = require('cookie-parser');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const addVoteParticipations = require('../../db/migrations/0008-add-vote-participations');
const addAchievementGrants = require('../../db/migrations/0009-add-achievement-grants');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests,
    addVoteParticipations, addAchievementGrants, migrationRunner,
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
const gameResultRepository = require('../../repositories/game/result');
const achievementService = require('../../services/achievement');
const { hashPassword, generateToken } = require('../../utils/auth/credentials');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');

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
    await db.UserSession.create({ id: `session-${uuid}`, user_id: uuid, is_online: true });
    return uuid;
};

const makePlayer = (uuid, role, alive) => [uuid, {
    uuid, nickname: `nick-${uuid.slice(0, 6)}`, role, team: role === 'JOKER' ? 'JOKER' : 'CITIZEN',
    alive, deathReason: null,
}];

const makeEndedSession = (id, playersMap, { winner = 'CITIZEN', gameSource = 'production' } = {}) => ({
    id,
    roomId: crypto.randomUUID(),
    phase: 'ENDED',
    dayIndex: 2,
    jokerCount: 1,
    roleComposition: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: Math.max(playersMap.size - 1, 0) },
    timerSettings: { dayDiscussionTime: 90, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
    startedAt: Date.now() - 60_000,
    endedAt: Date.now(),
    winResult: { winner },
    gameSource,
    players: playersMap,
});

const persistWins = async (userId, role, count) => {
    for (let i = 0; i < count; i += 1) {
        const gameId = crypto.randomUUID();
        const session = makeEndedSession(gameId, new Map([makePlayer(userId, role, true)]), { winner: role === 'JOKER' ? 'JOKER' : 'CITIZEN' });
        const result = await gameResultRepository.persistGameResult(session, { completed: true });
        assert.equal(result.persisted, true);
    }
};

const startRouteServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/user', require('../../routes/user.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const tokenFor = (uuid) => generateToken({ uuid, role: 'USER', sessionId: `session-${uuid}` });

test('AC-01/AC-06: 실제 DB 기준 진행률 3승을 쌓으면 기록 1(게임 3회 완료)이 achieved:true로 조회되지만, 아직 지급 이벤트가 없었으므로 granted:false다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('api1');
    await persistWins(userId, 'CITIZEN', 3);

    const base = await startRouteServer(t);
    const res = await fetch(`${base}/user/me/achievements`, { headers: { cookie: `accessToken=${tokenFor(userId)}` } });
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.data.length, 22);
    const record1 = body.data.find((a) => a.id === 'record-1-masquerade');
    assert.deepEqual(record1, { id: 'record-1-masquerade', achieved: true, current: 3, threshold: 3, granted: false, grantedAt: null });
});

test('AC-06: 실제로 지급된 업적은 조회에서 granted:true와 grantedAt(영속 지급 이력)을 함께 반환한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('api1b');
    await persistWins(userId, 'CITIZEN', 3);
    await achievementService.evaluateAndGrantForUser(userId);

    const base = await startRouteServer(t);
    const res = await fetch(`${base}/user/me/achievements`, { headers: { cookie: `accessToken=${tokenFor(userId)}` } });
    const body = await res.json();

    const record1 = body.data.find((a) => a.id === 'record-1-masquerade');
    assert.equal(record1.achieved, true);
    assert.equal(record1.granted, true, '재로그인·새로고침 후에도 실제 지급 이력이 granted:true로 복원되어야 한다');
    assert.ok(record1.grantedAt, 'grantedAt이 함께 조회되어야 한다');
});

test('A-09: 조회 API를 반복 호출해도 achievement_grants 행이 생기지 않는다(조회는 지급하지 않는다)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('api2');
    await persistWins(userId, 'CITIZEN', 10);

    const base = await startRouteServer(t);
    for (let i = 0; i < 3; i += 1) {
        const res = await fetch(`${base}/user/me/achievements`, { headers: { cookie: `accessToken=${tokenFor(userId)}` } });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.data.length, 22);
    }

    const grantCount = await db.AchievementGrant.count({ where: { user_id: userId } });
    assert.equal(grantCount, 0, 'GET만으로는 achievement_grants가 생기면 안 된다');

    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId }, raw: true });
    assert.equal(wallet?.balance_gold ?? 0, 0, 'GET만으로는 재화가 지급되면 안 된다');
});

test('A-09: 다른 계정의 진행률이 섞이지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const victim = await createLocalUser('victim');
    const attacker = await createLocalUser('attack');
    await persistWins(victim, 'CITIZEN', 15);

    const base = await startRouteServer(t);
    const res = await fetch(`${base}/user/me/achievements`, { headers: { cookie: `accessToken=${tokenFor(attacker)}` } });
    const body = await res.json();

    const record1 = body.data.find((a) => a.id === 'record-1-masquerade');
    assert.equal(record1.achieved, false, "attacker 계정에는 victim의 진행률이 보이면 안 된다");
});
