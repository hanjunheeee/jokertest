'use strict';

// F-03 격리 DB 검증 — R-IMPL 반송 지적 #3/#5/#7을 mock이 아니라 실제 MySQL 격리 DB로
// 검증한다. mock 함수 호출만으로 "영구 폐기 PASS"·"동시성 안전 PASS"를 주장하지 않기
// 위해, f01-migrations.integration.test.js와 같은 원칙(F01_TEST_DATABASE_URL이 없거나
// 연결에 실패하면 실패가 아니라 t.skip으로 "미검증"을 남긴다)을 그대로 따른다.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'f03-session-integration-test-secret';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// f02-signup.integration.test.js와 같은 이유로, DB URL이 없어도 models/index.js가 죽지
// 않도록 문법만 유효한 더미 값을 채운다(실제 연결은 시도하지 않는다 — unavailable(t)로 skip).
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
// F-03 R-IMPL #11: 2세대 이상 전 갱신 자격 재사용 감지용 이력 테이블(user_sessions의
// 자식 테이블). 같은 격리 DB를 공유하는 f01/f02 DB 스위트와 관리 테이블/삭제 순서를
// 일관되게 맞추지 않으면 서로의 resetSchema()가 "모르는 테이블"로 오판해 거부한다.
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');

const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory];
const MANAGED_TABLES = [...baseline.TABLE_ORDER, addRefreshTokenHistory.TABLE_NAME, migrationRunner.META_TABLE];
const DROP_ORDER = [addRefreshTokenHistory.TABLE_NAME, ...[...baseline.TABLE_ORDER].reverse(), migrationRunner.META_TABLE];

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
    const queryInterface = sequelize.getQueryInterface();
    const existing = new Set(await queryInterface.showAllTables());
    const unknown = [...existing].filter((t) => !MANAGED_TABLES.includes(t));
    if (unknown.length > 0) {
        throw new Error(
            `격리 DB에 F-01이 모르는 테이블이 있습니다: [${unknown.join(', ')}]. ` +
            `전용 테스트 DB가 맞는지 확인하세요 — 안전을 위해 진행을 거부합니다.`,
        );
    }
    for (const table of DROP_ORDER) {
        if (existing.has(table)) await queryInterface.dropTable(table);
    }
};

// backend/models와 service/repository는 require 캐시 싱글턴이라, 파일 맨 위에서 이미
// 맞춰둔 process.env.DATABASE_URL(F01_TEST_DATABASE_URL)로 처음 require되는 이 시점에
// 격리 DB에 연결된다 — 실제 프로덕션 경로(auth.service → user.repositories → Sequelize,
// sessionLifecycle, profile.controller)를 그대로 태운다.
const db = require('../../models');
const authService = require('../../service/auth.service');
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

// ── R-IMPL #3: 재사용 감지 시 폐기가 실제로 커밋된다(managed transaction 안에서 throw해
// rollback되던 결함) ──────────────────────────────────────────────────────────

test('R-IMPL #3: 갱신 자격 재사용 감지 시 revoked_at이 실제 DB에 커밋되고, 이후 refresh·세션 검증이 모두 거부한다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email } = await createUser('reuse');
    const { refreshToken: rawFirst } = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);

    // 정상 회전 한 번 — rawFirst는 이제 "이전(previous)" 자격이 되고, 30초 grace 안에서만
    // 재시도가 허용된다.
    const rotated = await authService.refresh(rawFirst);
    assert.ok(rotated.refreshToken);

    // grace window(30초)가 실제로 지난 뒤의 재사용을 재현하기 위해, 격리 DB에서 유예 만료
    // 시각만 과거로 되돌린다(실제 시계를 30초 기다리는 대신 — 이 조작은 grace 판정 조건 중
    // 하나만 인위적으로 앞당길 뿐, 재사용 감지·폐기 로직 자체는 손대지 않는다).
    const user = await db.User.findOne({ where: { email } });
    const sessionBefore = await db.UserSession.findOne({ where: { user_id: user.uuid } });
    await sessionBefore.update({ refresh_previous_expires_at: new Date(Date.now() - 1_000) });

    await assert.rejects(authService.refresh(rawFirst), (error) => error.status === 401);

    const sessionAfter = await db.UserSession.findOne({ where: { id: sessionBefore.id } });
    assert.ok(sessionAfter.revoked_at instanceof Date,
        '재사용 감지의 세션 폐기(revoked_at)가 managed transaction rollback으로 취소되지 않고 실제로 커밋되어야 합니다(R-IMPL #3)');
    assert.equal(Number(sessionAfter.is_online), 0);

    // 방금 정상적으로 발급받은 최신 자격(rotated.refreshToken)으로도 더 이상 갱신할 수 없다 —
    // 재사용 감지는 "제시된 그 자격"이 아니라 세션 전체를 폐기해야 한다.
    await assert.rejects(authService.refresh(rotated.refreshToken), (error) => error.status === 401);

    // HTTP·Socket.IO 공통 검증 경로(sessionLifecycle.resolveSession)도 같은 세션을 거부해야
    // 한다(AC-05) — 폐기가 실제 DB에 반영되지 않았다면 이 경로는 여전히 통과했을 것이다.
    const decoded = { uuid: sessionAfter.user_id, sessionId: sessionAfter.id };
    const result = await sessionLifecycle.resolveSession(decoded);
    assert.equal(result.ok, false);
});

// ── R-IMPL #5: 3개 이상 동시 회전 요청이 정상 세션을 재사용으로 오판해 폐기하지 않는다 ──

test('R-IMPL #5: 같은 자격으로 들어온 4개의 동시 회전 요청이 정상 세션을 재사용으로 오판해 폐기하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email } = await createUser('concurrent');
    const { refreshToken: rawToken } = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);

    // 실제 DB 행 잠금(FOR UPDATE)이 요청들을 직렬화하므로, 동시에 도착한 4개 요청 중 첫
    // 요청만 "현재 해시"와 매치해 실제로 회전하고, 나머지 3개는 grace(이전 해시) 매치로
    // 재회전 없이 새 액세스 토큰만 받아야 한다(R-IMPL #5 — 매 grace 요청마다 다시 회전하면
    // previous_hash 포인터가 계속 밀려 3번째 이상의 정상 요청이 재사용으로 오판된다).
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

    // F-03 R-IMPL #8: grace 응답이 결정론적으로 유도되므로, 실제로 회전(DB 기록)한 건 한
    // 번뿐이어도 4개의 응답 모두 정확히 같은(유효한) 갱신 자격을 돌려받아야 한다 — 이래야
    // 브라우저가 4개의 응답 중 어느 것을 마지막으로 쿠키에 반영하든 항상 유효하다.
    const rotatedTokens = new Set(fulfilled.map((v) => v.refreshToken));
    assert.equal(rotatedTokens.size, 1,
        '동시 요청 4개는 응답 순서와 무관하게 모두 같은(결정론적으로 재현된) 갱신 자격을 돌려받아야 합니다(F-03 R-IMPL #8)');
    const finalHash = crypto.createHash('sha256').update([...rotatedTokens][0]).digest('hex');
    assert.equal(sessionAfter.refresh_token_hash, finalHash,
        '4개 응답이 공통으로 돌려준 자격은 실제로 저장된 현재 해시와 일치해야 합니다');
});

// ── F-03 R-IMPL #8: 회전 응답 유실 → 이전 자격 재시도로 복구 → grace 이후 정상 회전 ──────

test('R-IMPL #8: 회전 응답 유실 후에도 이전 자격 재시도로 안전하게 복구되고, grace 이후 정상 회전이 이어지며, grace 밖 재사용은 여전히 거부된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email } = await createUser('lostresponse');
    const { refreshToken: raw0 } = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);

    // 실제 회전을 한 번 일으킨다 — 이 응답 자체가 네트워크에서 유실됐다고 가정하고 버린다.
    // 클라이언트는 여전히 raw0만 갖고 있다.
    const lostResponse = await authService.refresh(raw0);
    assert.ok(lostResponse.refreshToken);

    // 같은 이전 자격(raw0)으로 재시도한다 — 서버는 원문을 저장하지 않고도 잃어버린 응답과
    // 정확히 같은 자격을 복구해야 한다.
    const recovered = await authService.refresh(raw0);
    assert.equal(recovered.refreshToken, lostResponse.refreshToken,
        '응답 유실 후 재시도는 실제로 회전했던 자격과 정확히 같은 값을 복구해야 합니다(F-03 R-IMPL #8)');

    // 역순 응답: 네트워크 재전송 등으로 raw0이 다시 제시돼도(몇 번이든) 항상 같은 값이어야 한다.
    const recoveredAgain = await authService.refresh(raw0);
    assert.equal(recoveredAgain.refreshToken, lostResponse.refreshToken);

    // grace(30초)가 실제로 지난 뒤: 복구된 자격으로의 다음 정상 회전은 성공해야 한다.
    const user = await db.User.findOne({ where: { email } });
    const session = await db.UserSession.findOne({ where: { user_id: user.uuid } });
    await session.update({ refresh_previous_expires_at: new Date(Date.now() - 1_000) });

    const nextRotation = await authService.refresh(recovered.refreshToken);
    assert.ok(nextRotation.accessToken);
    assert.ok(nextRotation.refreshToken);
    assert.notEqual(nextRotation.refreshToken, recovered.refreshToken);

    // grace 밖에서 이미 두 세대 전인 raw0을 다시 제시하면 재사용으로 간주해 전체 세션을
    // 폐기해야 한다(F-03 R-IMPL #11 — findSessionForRefresh가 refresh_token_history까지
    // 뒤져 이 세션을 찾아내야 한다. 두 세대 전 자격은 현재·직전 해시 어디에도 없다).
    await assert.rejects(authService.refresh(raw0), (error) => error.status === 401);
    const sessionAfterReuse = await db.UserSession.findOne({ where: { id: session.id } });
    assert.ok(sessionAfterReuse.revoked_at instanceof Date,
        'grace 밖에서 이미 대체된 자격이 재사용되면 세션 전체가 폐기되어야 합니다');

    // 재사용 감지는 "제시된 그 자격"만이 아니라 세션 전체를 폐기해야 한다 — 방금 정상적으로
    // 발급받았던 최신 자격(nextRotation.refreshToken)으로도 더 이상 갱신할 수 없고, 이
    // 세션의 HTTP 보호 요청(공통 sessionLifecycle.resolveSession, AC-05)도 거부되어야
    // 한다(F-03 R-IMPL #11).
    await assert.rejects(authService.refresh(nextRotation.refreshToken), (error) => error.status === 401,
        '두 세대 이상 전 자격의 재사용이 감지된 뒤에는 방금 발급된 최신 갱신 자격도 거부되어야 합니다');
    const decoded = { uuid: sessionAfterReuse.user_id, sessionId: sessionAfterReuse.id };
    assert.equal((await sessionLifecycle.resolveSession(decoded)).ok, false,
        '두 세대 이상 전 자격의 재사용이 감지된 뒤에는 이 세션의 HTTP 접근도 거부되어야 합니다');
});

// ── F-03 R-IMPL #11: 한 번도 발급된 적 없는 임의의 자격은 정상 세션을 폐기하지 않는다 ──

test('R-IMPL #11: 발급된 적 없는 임의의 갱신 자격은 401만 돌려주고, 그 계정의 정상 세션은 폐기하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email } = await createUser('neverissued');
    await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);

    // 이 세션의 회전 이력에 전혀 없는, 완전히 무관한 무작위 값이다 — findSessionForRefresh가
    // 현재·직전 해시는 물론 refresh_token_history에서도 이 해시를 찾지 못해야 한다.
    const neverIssuedRaw = crypto.randomBytes(32).toString('base64url');
    await assert.rejects(authService.refresh(neverIssuedRaw), (error) => error.status === 401);

    const user = await db.User.findOne({ where: { email } });
    const session = await db.UserSession.findOne({ where: { user_id: user.uuid } });
    assert.equal(session.revoked_at, null,
        '한 번도 발급된 적 없는 임의의 자격은 어떤 세션과도 연관되지 않으므로, 정상 세션을 폐기하면 안 됩니다(F-03 R-IMPL #11)');
    assert.equal(Number(session.is_online), 1);
});

// ── AC-03/AC-05: 로그아웃 후 실제 HTTP 보호 요청·refresh·기존 및 신규 Socket.IO 인증이
// 모두 거부된다 — 공통 resolveSession 단위 호출만으로 모든 배선을 검증한 것으로 보지
// 않는다 ─────────────────────────────────────────────────────────────────────

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
    const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');
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

    // 사전 조건: 로그아웃 이전에는 모든 경로가 통과한다.
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

    // 실제 로그아웃.
    const logoutRes = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie: `accessToken=${token}` } });
    assert.equal(logoutRes.status, 200);

    // 로그아웃 이후: 실제 HTTP 보호 요청 거부.
    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${token}` } })).status, 401);
    // 로그아웃 이후: 실제 refresh 거부.
    await assert.rejects(authService.refresh(refreshToken), (error) => error.status === 401);
    // 로그아웃 이후: 신규 소켓 연결(handshake) 거부.
    assert.ok(await runAuthenticateSocket(fakeHandshakeSocket(token)) instanceof Error,
        '로그아웃된 계정의 신규 소켓 연결은 거부되어야 합니다(F-03 AC-03/AC-05)');
    // 로그아웃 이후: 이미 연결된 소켓의 후속 보호 이벤트도 거부되고 강제 종료된다.
    let ranAfterLogout = false;
    guarded.on('game_action', () => { ranAfterLogout = true; });
    await guarded._handlers.game_action();
    assert.equal(ranAfterLogout, false, '로그아웃 이후 이미 연결된 소켓의 보호 이벤트는 실행되면 안 됩니다');
    assert.ok(guarded.emitted.some((e) => e.event === 'force_disconnect'));
    assert.ok(guarded.disconnectCalls >= 1);
});

// ── R-IMPL #7: 정지 감지 시 전체 세션 영구 폐기, 밴 해제 후에도 복원되지 않는다 ────────

test('R-IMPL #7: 정지 감지 시 세션이 실제로 영구 폐기되고, 밴 해제 후에도 과거 세션이 복원되지 않으며, 실제 HTTP·refresh·기존 및 신규 소켓이 모두 거부된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email, uuid } = await createUser('ban');
    const { token, refreshToken } = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 실제 HTTP 앱(라우트 스택 전체)과 소켓 인증 배선을 태운다 — resolveSession 단위 호출
    // 만으로 모든 배선을 검증한 것으로 보지 않는다(F-03 AC-03/AC-05).
    const express = require('express');
    const cookieParser = require('cookie-parser');
    const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');
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

    // 정상 세션임을 먼저 확인한다 — resolveSession뿐 아니라 실제 HTTP·소켓 경로 모두.
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

    // 정지 이후: 실제 HTTP 보호 요청 거부.
    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${token}` } })).status, 401);
    // 정지 이후: 실제 refresh 거부.
    await assert.rejects(authService.refresh(refreshToken), (error) => error.status === 401 || error.status === 403);
    // 정지 이후: 신규 소켓 연결(handshake) 거부.
    assert.ok(await runAuthenticateSocket(fakeHandshakeSocket(token)) instanceof Error,
        '정지된 계정의 신규 소켓 연결은 거부되어야 합니다(F-03 AC-03/AC-05)');
    // 정지 이후: 이미 연결된 소켓의 후속 보호 이벤트도 거부되고 강제 종료된다.
    let protectedEventRanAfterBan = false;
    guarded.on('game_action', () => { protectedEventRanAfterBan = true; });
    await guarded._handlers.game_action();
    assert.equal(protectedEventRanAfterBan, false, '정지 이후 이미 연결된 소켓의 보호 이벤트는 실행되면 안 됩니다');
    assert.ok(guarded.emitted.some((e) => e.event === 'force_disconnect'));
    assert.ok(guarded.disconnectCalls >= 1);

    // 밴을 해제한다.
    await ban.destroy();

    // 밴이 풀렸어도 이 세션은 이미 폐기됐으므로 여전히 거부되어야 한다(복원 방지).
    const afterUnban = await sessionLifecycle.resolveSession(decoded);
    assert.equal(afterUnban.ok, false,
        '밴 해제 후에도 밴 이전에 폐기된 세션이 다시 유효해지면 안 됩니다(R-IMPL #7)');
    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${token}` } })).status, 401,
        '밴 해제 후에도 실제 HTTP 보호 요청은 계속 거부되어야 합니다');
});

// ── R-IMPL #7 / AC-04: 비밀번호 변경은 이미 오프라인인 다른 세션의 갱신 자격도 폐기한다 ──

test('R-IMPL #7/AC-04: 비밀번호 변경은 변경 요청 세션뿐 아니라, 변경 직전까지 실제로 유효했던 다른 세션의 갱신 자격도 함께 폐기한다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email, uuid } = await createUser('pwchange');

    // 비밀번호를 바꾸는 세션(B)만 실제 로그인 경로로 만든다 — login()은 로그인할 때마다
    // 이 계정의 기존 세션을 전부 오프라인·폐기 처리하므로(단일 활성 세션 정책, F-03에서
    // 바꾸지 않는다), 로그인을 두 번 해서 "다른 기기의 세션"을 만들면 그 세션은 두 번째
    // 로그인 시점에 이미 죽어버려 비밀번호 변경이 무엇을 더 폐기했는지 증명하지 못한다.
    // 그래서 "다른 기기의 세션"(A)은 login()을 거치지 않고 실제 회전 자격 저장 방식과
    // 동일하게(해시만 저장) 직접 시딩한다 — 로그인 정책 자체는 손대지 않으면서, 비밀번호
    // 변경 시점까지 실제로 살아있던 다른 세션을 재현한다(R-IMPL #10).
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

    // 사전 조건: 비밀번호 변경 이전에는 세션 A의 갱신 자격이 실제로 유효해야 이 테스트가
    // 의미 있다 — mock 없이 실제 authService.refresh()로 확인한다.
    const beforeChange = await authService.refresh(rawTokenA);
    assert.ok(beforeChange.accessToken, '변경 이전에는 세션 A의 갱신 자격이 실제로 통과해야 합니다');

    // 실제 profile.controller.js의 updatePassword 경로를 그대로 태운다(라우트 → 컨트롤러 →
    // repository, 격리 DB 대상).
    const express = require('express');
    const cookieParser = require('cookie-parser');
    const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');
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

    // 변경 직전까지 유효했던 세션 A의 갱신 자격은 이제 refresh()로 되살릴 수 없어야 한다 —
    // 변경 이전(beforeChange)에는 통과했던 바로 그 자격이다.
    await assert.rejects(authService.refresh(rawTokenA), (error) => error.status === 401);

    // 변경 요청을 실행한 세션(B) 자신도 재로그인이 요구된다(AC-04) — 같은 액세스 토큰으로의
    // 실제 HTTP 보호 요청과 소켓 인증이 모두 거부되어야 한다(AC-03/AC-05).
    assert.equal((await fetch(`${base}/auth/me`, { headers: { cookie: `accessToken=${loginB.token}` } })).status, 401);
    await assert.rejects(authService.refresh(loginB.refreshToken), (error) => error.status === 401);

    const socketLayer = require('../../socket/socket');
    const postChangeSocket = { handshake: { headers: { cookie: `accessToken=${loginB.token}` } }, data: {} };
    const authErr = await new Promise((resolve) => socketLayer.__testables.authenticateSocket(postChangeSocket, resolve));
    assert.ok(authErr instanceof Error, '비밀번호 변경 이전 토큰으로의 신규 소켓 연결은 거부되어야 합니다(AC-03/AC-05)');

    // 변경 이후 같은 계정으로의 새 로그인은 새 비밀번호로만 성공해야 한다(직렬화 확인).
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
