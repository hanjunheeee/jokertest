'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'f02-signup-integration-test-secret';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addLoadoutRevision = require('../../db/migrations/0010-add-economy-loadout-revision');
const addEconomyLoadoutJobSkins = require('../../db/migrations/0011-add-economy-loadout-job-skins');
const addPasswordResetTokens = require('../../db/migrations/0015-password-reset-tokens');
const addSignupEmailVerification = require('../../db/migrations/0016-signup-email-verification');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const { prepareSignupProof } = require('../helpers/signupProof');

const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory, addSocialAuth, addEconomy, addLoadoutRevision, addEconomyLoadoutJobSkins, addPasswordResetTokens, addSignupEmailVerification];
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner,
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
    if (connectionError) {
        t.skip(`격리 DB(${TEST_DB_URL.replace(/:[^:@]*@/, ':***@')})에 연결할 수 없습니다 — 미검증: ${connectionError.message}`);
        return true;
    }
    return false;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

const VALID_SIGNUP_BASE = {
    password: 'pw12345678',
    passwordConfirm: 'pw12345678',
    birthDate: '2000-01-01',
};

const db = require('../../models');
const authService = require('../../services/auth/account');
const signupEmailVerificationService = require('../../services/auth/signupEmailVerification');
const userRepository = require('../../repositories/user');
const gameResultRepository = require('../../repositories/game/result');
const { hashPassword } = require('../../utils/auth/credentials');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

test('AC-04(F-31a, 서비스 동시성): 같은 signupProof로 동시에 signup을 호출하면 하나만 성공하고 나머지는 SIGNUP_PROOF_INVALID다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const email = 'concurrent-signup@example.com';
    const { signupProof } = await prepareSignupProof(email);

    const originalConsumeSignupProof = signupEmailVerificationService.consumeSignupProof;
    let arrivals = 0;
    let releaseBarrier;
    const barrier = new Promise((resolve) => { releaseBarrier = resolve; });
    signupEmailVerificationService.consumeSignupProof = async (...args) => {
        arrivals += 1;
        if (arrivals >= 2) releaseBarrier();
        await barrier;
        return originalConsumeSignupProof(...args);
    };
    t.after(() => { signupEmailVerificationService.consumeSignupProof = originalConsumeSignupProof; });

    const attempts = await Promise.allSettled([
        authService.signup({ ...VALID_SIGNUP_BASE, email, nickname: '동시가입1', signupProof }),
        authService.signup({ ...VALID_SIGNUP_BASE, email, nickname: '동시가입2', signupProof }),
    ]);

    assert.equal(arrivals, 2, '두 요청 모두 증명 소비(잠금 시도) 지점에 도달해야 실제 경합을 검증한 것이다');

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected');

    assert.equal(fulfilled.length, 1, '정확히 하나만 성공해야 한다');
    assert.equal(rejected.length, 1, '나머지 하나는 실패해야 한다');
    assert.equal(rejected[0].reason.status, 401);
    assert.equal(rejected[0].reason.code, 'SIGNUP_PROOF_INVALID');

    const [rows] = await sequelize.query('SELECT COUNT(*) AS cnt FROM users WHERE email = :email', {
        replacements: { email },
    });
    assert.equal(Number(rows[0].cnt), 1, 'users 테이블에는 정확히 한 행만 남아야 한다');
});

test('AC-05(저장소 동시성): 저장소 계층에서 같은 이메일로 동시 생성해도 DB 유일 제약이 하나만 남긴다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const email = 'concurrent-repo-signup@example.com';
    const password_hash = await hashPassword('pw12345678');

    const attempts = await Promise.allSettled([
        userRepository.createUser({ email, password_hash, nickname: '저장소동시1', birth_date: new Date('2000-01-01') }),
        userRepository.createUser({ email, password_hash, nickname: '저장소동시2', birth_date: new Date('2000-01-01') }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected');

    assert.equal(fulfilled.length, 1, '정확히 하나만 성공해야 한다');
    assert.equal(rejected.length, 1, '나머지 하나는 실패해야 한다');
    assert.equal(rejected[0].reason.status, 409, '실패 원인은 409 유일 제약 충돌이어야 한다');

    const [rows] = await sequelize.query('SELECT COUNT(*) AS cnt FROM users WHERE email = :email', {
        replacements: { email },
    });
    assert.equal(Number(rows[0].cnt), 1, 'users 테이블에는 정확히 한 행만 남아야 한다');
});

test('AC-06: role/status/email_verified를 실어 보내도 저장되지 않고, 가입 후 재로그인이 성공한다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const email = 'ac06-signup@example.com';
    const { signupProof } = await prepareSignupProof(email);
    const created = await authService.signup({
        ...VALID_SIGNUP_BASE,
        email,
        nickname: 'AC06유저',
        role: 'ADMIN',
        status: 'BANNED',
        email_verified: false,
        signupProof,
    });

    const [rows] = await sequelize.query(
        'SELECT role, status, email_verified FROM users WHERE uuid = :uuid',
        { replacements: { uuid: created.uuid } },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, 'USER', '관리 필드로 보낸 role이 아니라 기본값이어야 한다');
    assert.equal(rows[0].status, 'ACTIVE', '관리 필드로 보낸 status가 아니라 기본값이어야 한다');
    assert.equal(Number(rows[0].email_verified), 1, '요청의 email_verified 값과 무관하게 서버 인증 결과(true)가 저장되어야 한다');

    const { user, token } = await authService.login(
        { email, password: VALID_SIGNUP_BASE.password },
        { ip: '127.0.0.1', userAgent: 'test-agent', deviceType: 'desktop' },
    );
    assert.equal(user.uuid, created.uuid);
    assert.ok(token, '재로그인은 토큰을 발급해야 한다');
});

test('AC-06: 30자를 넘는 nickname_snapshot도 경기 기록 저장 경로에서 잘리지 않는다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const email = 'ac06-longsnapshot@example.com';
    const { signupProof } = await prepareSignupProof(email);
    const created = await authService.signup({ ...VALID_SIGNUP_BASE, email, nickname: 'AC06스냅샷', signupProof });

    const longNicknameSnapshot = '가'.repeat(45);
    const gameId = '55555555-5555-5555-5555-555555555555';

    const session = {
        id: gameId,
        roomId: null,
        startedAt: 1_000,
        endedAt: 2_000,
        dayIndex: 1,
        players: new Map([[created.uuid, {
            uuid: created.uuid, nickname: longNicknameSnapshot, role: 'CITIZEN', team: 'CITIZEN', alive: true, deathReason: null,
        }]]),
        winResult: { winner: 'CITIZEN' },
    };

    const outcome = await gameResultRepository.persistGameResult(session, { completed: true });
    assert.deepEqual(outcome, { persisted: true, gameId });

    const [rows] = await sequelize.query(
        'SELECT nickname_snapshot FROM game_result_players WHERE game_id = :gameId AND user_id = :userId',
        { replacements: { gameId, userId: created.uuid } },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].nickname_snapshot, longNicknameSnapshot, '45자 nickname_snapshot이 잘리지 않고 그대로 저장·복원되어야 한다');
});

test('AC-03: birth_date는 서버 시간대와 무관하게 저장·복원된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const originalTz = process.env.TZ;
    t.after(() => {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
    });

    const email = 'ac03-birthdate@example.com';
    const { signupProof } = await prepareSignupProof(email);
    const created = await authService.signup({ ...VALID_SIGNUP_BASE, email, nickname: 'AC03생일', birthDate: '2000-06-15', signupProof });

    const timezones = ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles'];
    for (const tz of timezones) {
        process.env.TZ = tz;
        const restored = await userRepository.findByUuid(created.uuid);
        assert.ok(restored.birth_date instanceof Date, `TZ=${tz}에서도 birth_date는 Date 인스턴스여야 한다`);
        assert.equal(
            restored.birth_date.toISOString().slice(0, 10),
            '2000-06-15',
            `TZ=${tz}에서 저장한 생년월일이 하루 밀려 복원되면 안 된다`,
        );
    }
});
