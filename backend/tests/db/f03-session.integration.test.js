'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'f03-session-integration-test-secret';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addPasswordResetTokens = require('../../db/migrations/0015-password-reset-tokens');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory, addSocialAuth, addPasswordResetTokens];
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

const db = require('../../models');
const authService = require('../../services/auth/account');
const userRepository = require('../../repositories/user.repositories');
const sessionLifecycle = require('../../auth/sessionLifecycle');
const { hashPassword } = require('../../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const PASSWORD = 'correct-horse-battery-1';
const REQ_INFO = { ip: '127.0.0.1', userAgent: 'f03-integration', deviceType: 'PC' };

const createUser = async (label) => {
    const uuid = crypto.randomUUID();
    const email = `${label}-${uuid}@example.com`;
    await db.User.create({
        uuid,
        password_hash: await hashPassword(PASSWORD),
        nickname: `${label}${uuid.slice(0, 6)}`,
        email,
    });
    await db.UserStats.create({ user_id: uuid });
    return { uuid, email };
};

test('R-IMPL #3: 갱신 자격 재사용 감지 시 revoked_at이 실제 DB에 커밋되고, 이후 refresh·세션 검증이 모두 거부한다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email } = await createUser('reuse');
    const { refreshToken: rawFirst } = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);

    const rotated = await authService.refresh(rawFirst);
    assert.ok(rotated.refreshToken);

    const user = await db.User.findOne({ where: { email } });
    const sessionBefore = await db.UserSession.findOne({ where: { user_id: user.uuid } });
    await sessionBefore.update({ refresh_previous_expires_at: new Date(Date.now() - 1_000) });

    await assert.rejects(authService.refresh(rawFirst), (error) => error.status === 401);

    const sessionAfter = await db.UserSession.findOne({ where: { id: sessionBefore.id } });
    assert.ok(sessionAfter.revoked_at instanceof Date,
        '재사용 감지의 세션 폐기(revoked_at)가 managed transaction rollback으로 취소되지 않고 실제로 커밋되어야 합니다(R-IMPL #3)');
    assert.equal(Number(sessionAfter.is_online), 0);

    await assert.rejects(authService.refresh(rotated.refreshToken), (error) => error.status === 401);

    const decoded = { uuid: sessionAfter.user_id, sessionId: sessionAfter.id };
    const result = await sessionLifecycle.resolveSession(decoded);
    assert.equal(result.ok, false);
});

test('R-IMPL #5: 같은 자격으로 들어온 4개의 동시 회전 요청이 정상 세션을 재사용으로 오판해 폐기하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email } = await createUser('concurrent');
    const { refreshToken: rawToken } = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);

    const results = await Promise.allSettled([
        authService.refresh(rawToken),
        authService.refresh(rawToken),
        authService.refresh(rawToken),
        authService.refresh(rawToken),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected');
    assert.deepEqual(rejected, [], `정상적인 동시 요청은 모두 성공해야 합니다: ${rejected.map((r) => r.reason?.message)}`);

    const fulfilled = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    assert.equal(fulfilled.length, 4);
    for (const value of fulfilled) {
        assert.ok(value.accessToken, '모든 동시 요청이 유효한 액세스 토큰을 받아야 합니다');
    }

    const user = await db.User.findOne({ where: { email } });
    const sessionAfter = await db.UserSession.findOne({ where: { user_id: user.uuid } });
    assert.equal(sessionAfter.revoked_at, null,
        '정상적인 3개 이상의 동시 갱신 요청만으로 전체 세션이 폐기되면 안 됩니다(R-IMPL #5)');
    assert.equal(Number(sessionAfter.is_online), 1);

    const rotatedTokens = new Set(fulfilled.map((v) => v.refreshToken));
    assert.equal(rotatedTokens.size, 1,
        '동시 요청 4개는 응답 순서와 무관하게 모두 같은(결정론적으로 재현된) 갱신 자격을 돌려받아야 합니다(F-03 R-IMPL #8)');
    const finalHash = crypto.createHash('sha256').update([...rotatedTokens][0]).digest('hex');
    assert.equal(sessionAfter.refresh_token_hash, finalHash,
        '4개 응답이 공통으로 돌려준 자격은 실제로 저장된 현재 해시와 일치해야 합니다');
});

test('R-IMPL #8: 회전 응답 유실 후에도 이전 자격 재시도로 안전하게 복구되고, grace 이후 정상 회전이 이어지며, grace 밖 재사용은 여전히 거부된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email } = await createUser('lostresponse');
    const { refreshToken: raw0 } = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);

    const lostResponse = await authService.refresh(raw0);
    assert.ok(lostResponse.refreshToken);

    const recovered = await authService.refresh(raw0);
    assert.equal(recovered.refreshToken, lostResponse.refreshToken,
        '응답 유실 후 재시도는 실제로 회전했던 자격과 정확히 같은 값을 복구해야 합니다(F-03 R-IMPL #8)');

    const recoveredAgain = await authService.refresh(raw0);
    assert.equal(recoveredAgain.refreshToken, lostResponse.refreshToken);

    const user = await db.User.findOne({ where: { email } });
    const session = await db.UserSession.findOne({ where: { user_id: user.uuid } });
    await session.update({ refresh_previous_expires_at: new Date(Date.now() - 1_000) });

    const nextRotation = await authService.refresh(recovered.refreshToken);
    assert.ok(nextRotation.accessToken);
    assert.ok(nextRotation.refreshToken);
    assert.notEqual(nextRotation.refreshToken, recovered.refreshToken);

    await assert.rejects(authService.refresh(raw0), (error) => error.status === 401);
    const sessionAfterReuse = await db.UserSession.findOne({ where: { id: session.id } });
    assert.ok(sessionAfterReuse.revoked_at instanceof Date,
        'grace 밖에서 이미 대체된 자격이 재사용되면 세션 전체가 폐기되어야 합니다');

    await assert.rejects(authService.refresh(nextRotation.refreshToken), (error) => error.status === 401,
        '두 세대 이상 전 자격의 재사용이 감지된 뒤에는 방금 발급된 최신 갱신 자격도 거부되어야 합니다');
    const decoded = { uuid: sessionAfterReuse.user_id, sessionId: sessionAfterReuse.id };
    assert.equal((await sessionLifecycle.resolveSession(decoded)).ok, false,
        '두 세대 이상 전 자격의 재사용이 감지된 뒤에는 이 세션의 HTTP 접근도 거부되어야 합니다');
});

test('R-IMPL #11: 발급된 적 없는 임의의 갱신 자격은 401만 돌려주고, 그 계정의 정상 세션은 폐기하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email } = await createUser('neverissued');
    await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);

    const neverIssuedRaw = crypto.randomBytes(32).toString('base64url');
    await assert.rejects(authService.refresh(neverIssuedRaw), (error) => error.status === 401);

    const user = await db.User.findOne({ where: { email } });
    const session = await db.UserSession.findOne({ where: { user_id: user.uuid } });
    assert.equal(session.revoked_at, null,
        '한 번도 발급된 적 없는 임의의 자격은 어떤 세션과도 연관되지 않으므로, 정상 세션을 폐기하면 안 됩니다(F-03 R-IMPL #11)');
    assert.equal(Number(session.is_online), 1);
});

test('AC-03/AC-05: 실제 로그아웃 후 HTTP 보호 요청·refresh·기존 및 신규 Socket.IO 인증이 모두 거부된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email } = await createUser('logoutwiring');
    const { token, refreshToken } = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const express = require('express');
    const cookieParser = require('cookie-parser');
    const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler');
    const { once } = require('node:events');
    const socketLayer = require('../../socket/socket');
    const fakeHandshakeSocket = (accessToken) => ({ handshake: { headers: { cookie: `accessToken=${accessToken}` } }, data: {} });
    const runAuthenticateSocket = (socket) =>
        new Promise((resolve) => socketLayer.__testables.authenticateSocket(socket, resolve));

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', require('../../routes/auth.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;

    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${token}` } })).status, 200);
    assert.equal(await runAuthenticateSocket(fakeHandshakeSocket(token)), undefined);
    const guarded = { data: { user: decoded }, emitted: [], disconnectCalls: 0, _handlers: {},
        on(event, cb) { this._handlers[event] = cb; },
        emit(event, payload) { this.emitted.push({ event, payload }); },
        disconnect() { this.disconnectCalls += 1; } };
    socketLayer.__testables.wrapSocketWithSessionGuard(guarded);
    let ran = false;
    guarded.on('game_action', () => { ran = true; });
    await guarded._handlers.game_action();
    assert.equal(ran, true);

    const logoutRes = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie: `accessToken=${token}` } });
    assert.equal(logoutRes.status, 200);

    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${token}` } })).status, 401);
    await assert.rejects(authService.refresh(refreshToken), (error) => error.status === 401);
    assert.ok(await runAuthenticateSocket(fakeHandshakeSocket(token)) instanceof Error,
        '로그아웃된 계정의 신규 소켓 연결은 거부되어야 합니다(F-03 AC-03/AC-05)');
    let ranAfterLogout = false;
    guarded.on('game_action', () => { ranAfterLogout = true; });
    await guarded._handlers.game_action();
    assert.equal(ranAfterLogout, false, '로그아웃 이후 이미 연결된 소켓의 보호 이벤트는 실행되면 안 됩니다');
    assert.ok(guarded.emitted.some((e) => e.event === 'force_disconnect'));
    assert.ok(guarded.disconnectCalls >= 1);
});

test('R-IMPL #7: 정지 감지 시 세션이 실제로 영구 폐기되고, 밴 해제 후에도 과거 세션이 복원되지 않으며, 실제 HTTP·refresh·기존 및 신규 소켓이 모두 거부된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email, uuid } = await createUser('ban');
    const { token, refreshToken } = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const express = require('express');
    const cookieParser = require('cookie-parser');
    const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler');
    const { once } = require('node:events');
    const socketLayer = require('../../socket/socket');
    const fakeHandshakeSocket = (accessToken) => ({ handshake: { headers: { cookie: `accessToken=${accessToken}` } }, data: {} });
    const runAuthenticateSocket = (socket) =>
        new Promise((resolve) => socketLayer.__testables.authenticateSocket(socket, resolve));
    const makeGuardedSocket = (user) => {
        const handlers = {};
        return {
            data: { user },
            emitted: [],
            disconnectCalls: 0,
            on(event, cb) { handlers[event] = cb; },
            emit(event, payload) { this.emitted.push({ event, payload }); },
            disconnect() { this.disconnectCalls += 1; },
            _handlers: handlers,
        };
    };

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', require('../../routes/auth.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;

    assert.equal((await sessionLifecycle.resolveSession(decoded)).ok, true);
    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${token}` } })).status, 200);
    assert.equal(await runAuthenticateSocket(fakeHandshakeSocket(token)), undefined);
    const guarded = makeGuardedSocket(decoded);
    socketLayer.__testables.wrapSocketWithSessionGuard(guarded);
    let protectedEventRan = false;
    guarded.on('game_action', () => { protectedEventRan = true; });
    await guarded._handlers.game_action();
    assert.equal(protectedEventRan, true, '정지 이전에는 이미 연결된 소켓의 보호 이벤트가 정상 실행되어야 합니다');

    const ban = await db.UserBan.create({ user_id: uuid, reason: 'R-IMPL 테스트 정지', is_permanent: true });

    const duringBan = await sessionLifecycle.resolveSession(decoded);
    assert.equal(duringBan.ok, false);
    assert.equal(duringBan.status, 403);

    const sessionAfterBan = await db.UserSession.findOne({ where: { id: decoded.sessionId } });
    assert.ok(sessionAfterBan.revoked_at instanceof Date,
        '정지 감지 시점에 세션이 실제로 영구 폐기(revoked_at)되어야 합니다 — 단순 거부만으로는 밴 해제 후 복원을 막지 못합니다(R-IMPL #7)');

    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${token}` } })).status, 401);
    await assert.rejects(authService.refresh(refreshToken), (error) => error.status === 401 || error.status === 403);
    assert.ok(await runAuthenticateSocket(fakeHandshakeSocket(token)) instanceof Error,
        '정지된 계정의 신규 소켓 연결은 거부되어야 합니다(F-03 AC-03/AC-05)');
    let protectedEventRanAfterBan = false;
    guarded.on('game_action', () => { protectedEventRanAfterBan = true; });
    await guarded._handlers.game_action();
    assert.equal(protectedEventRanAfterBan, false, '정지 이후 이미 연결된 소켓의 보호 이벤트는 실행되면 안 됩니다');
    assert.ok(guarded.emitted.some((e) => e.event === 'force_disconnect'));
    assert.ok(guarded.disconnectCalls >= 1);

    await ban.destroy();

    const afterUnban = await sessionLifecycle.resolveSession(decoded);
    assert.equal(afterUnban.ok, false,
        '밴 해제 후에도 밴 이전에 폐기된 세션이 다시 유효해지면 안 됩니다(R-IMPL #7)');
    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${token}` } })).status, 401,
        '밴 해제 후에도 실제 HTTP 보호 요청은 계속 거부되어야 합니다');
});

test('R-IMPL #7/AC-04: 비밀번호 변경은 변경 요청 세션뿐 아니라, 변경 직전까지 실제로 유효했던 다른 세션의 갱신 자격도 함께 폐기한다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email, uuid } = await createUser('pwchange');

    const loginB = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);

    const rawTokenA = crypto.randomBytes(32).toString('base64url');
    const hashA = crypto.createHash('sha256').update(rawTokenA).digest('hex');
    const sessionA = await db.UserSession.create({
        id: crypto.randomUUID(),
        user_id: uuid,
        ip_address: '127.0.0.1',
        is_online: true,
        refresh_token_hash: hashA,
        refresh_token_expires_at: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
    });

    const beforeChange = await authService.refresh(rawTokenA);
    assert.ok(beforeChange.accessToken, '변경 이전에는 세션 A의 갱신 자격이 실제로 통과해야 합니다');

    const express = require('express');
    const cookieParser = require('cookie-parser');
    const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler');
    const { once } = require('node:events');

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/user', require('../../routes/user.routes'));
    app.use('/auth', require('../../routes/auth.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;

    const res = await fetch(`${base}/user/me/password`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: `accessToken=${loginB.token}` },
        body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'new-correct-horse-2' }),
    });
    assert.equal(res.status, 200);

    const sessionsAfterChange = await db.UserSession.findAll({ where: { user_id: uuid } });
    assert.equal(sessionsAfterChange.length, 2);
    for (const session of sessionsAfterChange) {
        assert.ok(session.revoked_at instanceof Date,
            `세션 ${session.id}은 비밀번호 변경 후 폐기되어야 합니다(변경 직전까지 유효했던 다른 세션 포함)`);
        assert.equal(Number(session.is_online), 0);
    }

    await assert.rejects(authService.refresh(rawTokenA), (error) => error.status === 401);

    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${loginB.token}` } })).status, 401);
    await assert.rejects(authService.refresh(loginB.refreshToken), (error) => error.status === 401);

    const socketLayer = require('../../socket/socket');
    const postChangeSocket = { handshake: { headers: { cookie: `accessToken=${loginB.token}` } }, data: {} };
    const authErr = await new Promise((resolve) => socketLayer.__testables.authenticateSocket(postChangeSocket, resolve));
    assert.ok(authErr instanceof Error, '비밀번호 변경 이전 토큰으로의 신규 소켓 연결은 거부되어야 합니다(AC-03/AC-05)');

    await assert.rejects(
        authService.login({ email, password: PASSWORD, rememberMe: false }, REQ_INFO),
        (error) => error.status === 401,
    );
    const reLogin = await authService.login({ email, password: 'new-correct-horse-2', rememberMe: false }, REQ_INFO);
    assert.ok(reLogin.token);
});


test('operator regression: failed logins commit counters/history and fifth attempt locks the account', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    const { email, uuid } = await createUser('failed');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        await assert.rejects(
            authService.login({ email, password: 'incorrect-password' }, REQ_INFO),
            (error) => error.status === (attempt === 5 ? 423 : 401),
        );
        const stored = await db.User.findByPk(uuid);
        assert.equal(stored.failed_login_count, attempt);
    }
    const stored = await db.User.findByPk(uuid);
    assert.ok(stored.locked_until > new Date());
    assert.equal(await db.LoginHistory.count({ where: { user_id: uuid, success: false } }), 5);
    assert.equal(await db.UserSession.count({ where: { user_id: uuid } }), 0);
    await assert.rejects(authService.login({ email, password: PASSWORD }, REQ_INFO), (error) => error.status === 423);
});

test('operator regression: banned login commits session revocation before returning 403', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    const { email, uuid } = await createUser('banlogin');
    const login = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);
    const ban = await db.UserBan.create({ user_id: uuid, reason: 'operator regression', is_permanent: true });
    await assert.rejects(authService.login({ email, password: PASSWORD }, REQ_INFO), (error) => error.status === 403);
    const sessions = await db.UserSession.findAll({ where: { user_id: uuid } });
    assert.equal(sessions.length, 1);
    assert.ok(sessions[0].revoked_at instanceof Date);
    await ban.destroy();
    await assert.rejects(authService.refresh(login.refreshToken), (error) => error.status === 401);
});
