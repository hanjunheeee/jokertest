'use strict';

const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;

process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f29-recovery-fixture-secret';
process.env.PASSWORD_RESET_APP_URL = process.env.PASSWORD_RESET_APP_URL || 'https://frontend.example.test';

const AUTH_ROUTES_PATH = require.resolve('../../routes/auth.routes');
const RATE_LIMIT_PATH = require.resolve('../../middleware/rateLimit');

const RATE_LIMIT_ENV_KEYS = [
    'FIND_ID_WINDOW_MS', 'FIND_ID_IP_MAX', 'FIND_ID_TARGET_MAX',
    'PASSWORD_RESET_REQUEST_WINDOW_MS', 'PASSWORD_RESET_REQUEST_IP_MAX', 'PASSWORD_RESET_REQUEST_EMAIL_MAX',
    'PASSWORD_RESET_CHECK_WINDOW_MS', 'PASSWORD_RESET_CHECK_IP_MAX',
];

const RELAXED_LIMITS = {
    FIND_ID_IP_MAX: '1000',
    FIND_ID_TARGET_MAX: '1000',
    PASSWORD_RESET_REQUEST_IP_MAX: '1000',
    PASSWORD_RESET_REQUEST_EMAIL_MAX: '1000',
    PASSWORD_RESET_CHECK_IP_MAX: '1000',
};

const isDatabaseConfigured = () => typeof TEST_DB_URL === 'string' && TEST_DB_URL.length > 0;

let schemaSequelize = null;
let connectionError = null;

const getSchemaSequelize = () => {
    if (!schemaSequelize) {
        const { Sequelize } = require('sequelize');
        schemaSequelize = new Sequelize(TEST_DB_URL, { logging: false });
    }
    return schemaSequelize;
};

const checkAvailability = async () => {
    if (!isDatabaseConfigured()) {
        return { ok: false, reason: 'F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 이 AC를 검증할 수 없습니다 (미검증).' };
    }
    if (connectionError) return { ok: false, reason: `격리 DB에 연결할 수 없습니다 — 미검증: ${connectionError.message}` };
    try {
        await getSchemaSequelize().authenticate();
    } catch (error) {
        connectionError = error;
        return { ok: false, reason: `격리 DB에 연결할 수 없습니다 — 미검증: ${error.message}` };
    }
    return { ok: true };
};

const buildSchemaDefinition = () => {
    const migrationRunner = require('../../db/migrationRunner');
    const { buildManagedSchema } = require('./isolatedTestDb');
    const { managedTables, dropOrder } = buildManagedSchema({
        baseline: require('../../db/migrations/0001-legacy-baseline'),
        addRefreshTokenHistory: require('../../db/migrations/0004-add-refresh-token-history'),
        addSocialAuth: require('../../db/migrations/0005-add-social-auth'),
        addEconomy: require('../../db/migrations/0006-add-economy'),
        addEconomyPurchaseRequests: require('../../db/migrations/0007-add-economy-purchase-requests'),
        addVoteParticipations: require('../../db/migrations/0008-add-vote-participations'),
        addAchievementGrants: require('../../db/migrations/0009-add-achievement-grants'),
        addNotifications: require('../../db/migrations/0012-add-notifications'),
        addF19FriendsInvites: require('../../db/migrations/0013-f19-friends-invites'),
        migrationRunner,
    });
    return { managedTables, dropOrder, migrationRunner };
};

const rebuildFullSchema = async () => {
    const sequelize = getSchemaSequelize();
    const { assertDedicatedTestDatabase, resetManagedSchema } = require('./isolatedTestDb');
    const { managedTables, dropOrder, migrationRunner } = buildSchemaDefinition();
    const { MIGRATIONS } = require('../../scripts/migrate-db');

    await assertDedicatedTestDatabase(sequelize, TEST_DB_URL);
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables, dropOrder });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

const applyLimitEnv = (limits) => {
    const saved = {};
    for (const key of RATE_LIMIT_ENV_KEYS) saved[key] = process.env[key];
    for (const [key, value] of Object.entries({ ...RELAXED_LIMITS, ...limits })) {
        if (!RATE_LIMIT_ENV_KEYS.includes(key)) throw new Error(`알 수 없는 한도 설정 키입니다: ${key}`);
        process.env[key] = String(value);
    }
    return () => {
        for (const key of RATE_LIMIT_ENV_KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    };
};

const loadFreshAuthRouter = () => {
    delete require.cache[AUTH_ROUTES_PATH];
    delete require.cache[RATE_LIMIT_PATH];
    const router = require(AUTH_ROUTES_PATH);
    delete require.cache[AUTH_ROUTES_PATH];
    delete require.cache[RATE_LIMIT_PATH];
    return router;
};

const createF29RecoveryFixture = async (t, options = {}) => {
    const { limits = {}, rebuildSchema = true, socket = false } = options;

    const availability = await checkAvailability();
    if (!availability.ok) throw new Error(availability.reason);

    if (rebuildSchema) await rebuildFullSchema();

    const restoreLimitEnv = applyLimitEnv(limits);

    const mailAdapterModule = require('../../mail/mailAdapter');
    const memoryMail = mailAdapterModule.createMemoryMailAdapter();
    const originalCreateHttpMailAdapter = mailAdapterModule.createHttpMailAdapter;
    mailAdapterModule.createHttpMailAdapter = () => memoryMail;

    const express = require('express');
    const cookieParser = require('cookie-parser');
    const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', loadFreshAuthRouter());
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = http.createServer(app);

    let io = null;
    if (socket) {
        io = require('../../socket/socket').initSocket(server);
    }

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseURL = `http://127.0.0.1:${server.address().port}`;

    const db = require('../../models');
    const authService = require('../../services/auth/account');

    const cleanup = async () => {
        if (io) {
            await new Promise((resolve) => io.close(resolve));
            require('../../service/concurrency.service').stopConcurrentSnapshotScheduler();
        }
        await new Promise((resolve) => server.close(resolve));
        mailAdapterModule.createHttpMailAdapter = originalCreateHttpMailAdapter;
        restoreLimitEnv();
    };
    if (t && typeof t.after === 'function') t.after(cleanup);

    const createLocalUser = async ({ nickname, email, password = 'correct-horse-1', birthDate = '1995-05-05' }) => {
        const user = await authService.signup({ email, password, passwordConfirm: password, nickname, birthDate });
        return { uuid: user.uuid, email, password, nickname, birthDate };
    };

    const createSocialOnlyUser = async ({ nickname, email, provider = 'google', birthDate = '1992-02-02' }) => {
        const socialAuthService = require('../../services/auth/social');
        const crypto = require('node:crypto');
        const fingerprint = `fp-${crypto.randomUUID()}`;
        const state = await socialAuthService.issueOAuthState({ purpose: 'login', browserFingerprint: fingerprint });
        const callback = await socialAuthService.handleOAuthCallback({
            provider, subject: `sub-${crypto.randomUUID()}`, email,
            rawState: state.state, browserFingerprint: fingerprint,
            reqInfo: { ip: '127.0.0.1', userAgent: 'f29-recovery-fixture' },
        });
        const completed = await socialAuthService.completeSocialSignup({
            intentToken: callback.intentToken, nickname, birthDate,
            reqInfo: { ip: '127.0.0.1', userAgent: 'f29-recovery-fixture' },
        });
        return { uuid: completed.user.uuid, email, nickname };
    };

    const plantUnusedResetToken = async ({ userId, ttlMs = 30 * 60 * 1000 }) => {
        const crypto = require('node:crypto');
        const rawToken = crypto.randomBytes(32).toString('base64url');
        const row = await db.PasswordResetToken.create({
            user_id: userId,
            token: null,
            token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
            expired_at: new Date(Date.now() + ttlMs),
            used: false,
        });
        return { rawToken, id: row.id };
    };

    return {
        baseURL,
        db,
        sequelize: getSchemaSequelize(),
        plantUnusedResetToken,
        io,
        mail: memoryMail,
        outbox: memoryMail.outbox,
        createLocalUser,
        createSocialOnlyUser,
        cleanup,
    };
};

const tokenOf = (mail) => new URL(mail.params.resetUrl).searchParams.get('token');

const closeF29RecoveryFixtures = async () => {
    if (schemaSequelize) {
        await schemaSequelize.close();
        schemaSequelize = null;
    }
    const modelsPath = require.resolve('../../models');
    if (require.cache[modelsPath]) {
        await require('../../models').sequelize.close();
    }
};

module.exports = {
    TEST_DB_URL,
    MIGRATION_DIR: path.join(__dirname, '..', '..', 'db', 'migrations'),
    isDatabaseConfigured,
    checkAvailability,
    rebuildFullSchema,
    createF29RecoveryFixture,
    closeF29RecoveryFixtures,
    tokenOf,
};
