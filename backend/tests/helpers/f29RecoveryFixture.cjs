'use strict';

// F-29 복구 흐름(아이디 찾기·비밀번호 재설정) 통합 시험용 공용 fixture.
//
// 기존 DB 시험(tests/db/f29a-find-id·f29b-password-reset)은 서버 기동·메일 어댑터 대체·격리
// 스키마 준비를 각자 파일 안에 두고 있어 다른 시험이 부를 수 없었다. 프런트 화면까지 함께
// 지나는 새 통합 시험(frontend/src/domains/auth/pages/__tests__/F29Recovery.integration.test.js)은
// 같은 준비가 필요하므로 그 절차만 여기로 모은다. **대체 경계는 메일 전달 하나뿐이다** —
// 라우터·검증·컨트롤러·서비스·모델·DB는 전부 실제 코드가 돈다.
//
// 안전 계약은 tests/helpers/isolatedTestDb.js와 같다: 승인된 전용 테스트 DB 이름인지,
// 실제 연결된 DATABASE()가 그 이름인지를 먼저 확인하고, 하나라도 어긋나면 드롭을 한 번도
// 실행하지 않고 던진다. F01_TEST_DATABASE_URL이 없으면 준비 자체를 하지 않는다(호출부가
// 명시적으로 "미검증"을 남긴다 — skip은 통과가 아니다).

const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;

// 모델을 로드하기 **전에** 지정해야 한다 — models/index.js가 require 시점에 DATABASE_URL을 읽는다.
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f29-recovery-fixture-secret';
// 재설정 링크의 기반 URL. 서버 설정만 링크에 반영된다(요청 Host는 절대 쓰지 않는다).
process.env.PASSWORD_RESET_APP_URL = process.env.PASSWORD_RESET_APP_URL || 'https://frontend.example.test';

const AUTH_ROUTES_PATH = require.resolve('../../routes/auth.routes');
const RATE_LIMIT_PATH = require.resolve('../../middleware/rateLimit');

// 한도 환경변수는 auth.routes.js가 **require 시점에** 읽어 카운터를 만든다. 그래서 fixture마다
// 값을 바꾸려면 값을 넣은 뒤 그 모듈을 캐시에서 지우고 다시 require해야 한다(그래야 케이스마다
// 카운터도 새로 시작한다 — 같은 프로세스의 앞선 케이스가 쓴 횟수가 넘어오지 않는다).
const RATE_LIMIT_ENV_KEYS = [
    'FIND_ID_WINDOW_MS', 'FIND_ID_IP_MAX', 'FIND_ID_TARGET_MAX',
    'PASSWORD_RESET_REQUEST_WINDOW_MS', 'PASSWORD_RESET_REQUEST_IP_MAX', 'PASSWORD_RESET_REQUEST_EMAIL_MAX',
    'PASSWORD_RESET_CHECK_WINDOW_MS', 'PASSWORD_RESET_CHECK_IP_MAX',
];

// 실제 DB 왕복 케이스가 우연히 429에 걸려 오염되지 않도록 기본값은 넉넉히 올린다. 한도 자체를
// 검증하는 케이스는 options.limits로 실제 기본값(10/5, 10/3, 20)을 명시해 새 라우터를 받는다.
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

/**
 * 연결 가능 여부를 한 번만 확인한다. 실패 사유는 호출부가 skip 사유로 그대로 쓴다.
 * @returns {Promise<{ok: true} | {ok: false, reason: string}>}
 */
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

/** 관리 스키마를 통째로 드롭하고 전체 MIGRATIONS(0014·0015 포함)를 다시 적용한다. */
const rebuildFullSchema = async () => {
    const sequelize = getSchemaSequelize();
    const { assertDedicatedTestDatabase, resetManagedSchema } = require('./isolatedTestDb');
    const { managedTables, dropOrder, migrationRunner } = buildSchemaDefinition();
    const { MIGRATIONS } = require('../../scripts/migrate-db');

    // 드롭 전에 대상 DB를 한 번 더 직접 확인한다(resetManagedSchema도 같은 확인을 하지만,
    // 이 fixture가 왜 안전한지를 호출 순서에서 보이게 둔다).
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

// auth.routes.js와 rateLimit.js를 캐시에서 지워, 이 fixture 전용 카운터를 가진 라우터를 만든다.
const loadFreshAuthRouter = () => {
    delete require.cache[AUTH_ROUTES_PATH];
    delete require.cache[RATE_LIMIT_PATH];
    const router = require(AUTH_ROUTES_PATH);
    // 다음 require가 또 새 인스턴스를 받도록 캐시를 비워 둔다(이 라우터 참조는 이미 손에 있다).
    delete require.cache[AUTH_ROUTES_PATH];
    delete require.cache[RATE_LIMIT_PATH];
    return router;
};

/**
 * 실제 /auth 라우터 + Socket.IO가 붙은 서버와 격리 DB를 준비한다.
 *
 * @param {import('node:test').TestContext} t 정리(t.after)를 등록할 시험 컨텍스트
 * @param {object} [options]
 * @param {object} [options.limits] 이 fixture 전용 요청 빈도 한도 환경값(키는 RATE_LIMIT_ENV_KEYS)
 * @param {boolean} [options.rebuildSchema=true] 스키마를 드롭·재적용할지
 * @param {boolean} [options.socket=false] Socket.IO(initSocket)를 붙일지
 * @returns {Promise<{baseURL, db, sequelize, outbox, mail, io, createLocalUser, createSocialOnlyUser}>}
 */
const createF29RecoveryFixture = async (t, options = {}) => {
    const { limits = {}, rebuildSchema = true, socket = false } = options;

    const availability = await checkAvailability();
    if (!availability.ok) throw new Error(availability.reason);

    if (rebuildSchema) await rebuildFullSchema();

    const restoreLimitEnv = applyLimitEnv(limits);

    // ── 메일 전달만 메모리 어댑터로 대체한다(유일한 대체 경계) ─────────────────────
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
    const authService = require('../../service/auth.service');

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

    /** 실제 가입 경로로 로컬(비밀번호 있는) 계정을 만든다. */
    const createLocalUser = async ({ nickname, email, password = 'correct-horse-1', birthDate = '1995-05-05' }) => {
        const user = await authService.signup({ email, password, passwordConfirm: password, nickname, birthDate });
        return { uuid: user.uuid, email, password, nickname, birthDate };
    };

    /** 실제 소셜 가입 경로로 소셜 전용(has_local_password=false) 계정을 만든다. */
    const createSocialOnlyUser = async ({ nickname, email, provider = 'google', birthDate = '1992-02-02' }) => {
        const socialAuthService = require('../../service/socialAuth.service');
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

    /**
     * 같은 사용자의 **추가** 미사용 재설정 토큰 행을 직접 심는다.
     *
     * 왜 직접 심는가: 정상 경로(requestPasswordReset)는 새 토큰을 만들기 전에 그 계정의 기존
     * 미사용 토큰을 모두 폐기하므로, 실제 요청만으로는 미사용 토큰이 둘이 될 수 없다. 그래서
     * "confirm이 **남은** 토큰까지 폐기한다"(AC-04)는 계약은 사용한 그 토큰 하나만으로는
     * 증명되지 않는다 — 소비되지 않은 다른 토큰이 함께 죽는지 보려면 그 행이 존재해야 한다.
     * 저장 형태(해시만 저장, 원문 컬럼은 NULL)는 생산 경로와 같게 맞춘다.
     *
     * @returns {Promise<{rawToken: string, id: number}>} 링크에 쓸 원문과 심은 행의 id
     */
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

/** 메일 본문의 링크에서 토큰 원문만 꺼낸다. */
const tokenOf = (mail) => new URL(mail.params.resetUrl).searchParams.get('token');

/** 시험 파일 마지막에 호출해 열린 커넥션을 닫는다(없으면 node --test가 종료를 기다린다). */
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
