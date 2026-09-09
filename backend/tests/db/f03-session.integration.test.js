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

const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation];
const MANAGED_TABLES = [...baseline.TABLE_ORDER, migrationRunner.META_TABLE];
const DROP_ORDER = [...baseline.TABLE_ORDER].reverse().concat([migrationRunner.META_TABLE]);

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

    // 실제로 회전한 건 한 번뿐이어야 한다(반환된 refreshToken 중 null이 아닌 것은 최대 1개).
    const rotatedCount = fulfilled.filter((v) => v.refreshToken).length;
    assert.equal(rotatedCount, 1, '동시 요청 중 실제 회전(새 갱신 자격 발급)은 정확히 한 번만 일어나야 합니다');
});

// ── R-IMPL #7: 정지 감지 시 전체 세션 영구 폐기, 밴 해제 후에도 복원되지 않는다 ────────

test('R-IMPL #7: 정지 감지 시 세션이 실제로 영구 폐기되고, 밴 해제 후에도 과거 세션이 복원되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email, uuid } = await createUser('ban');
    const { token } = await authService.login({ email, password: PASSWORD, rememberMe: false }, REQ_INFO);
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 정상 세션임을 먼저 확인한다.
    assert.equal((await sessionLifecycle.resolveSession(decoded)).ok, true);

    const ban = await db.UserBan.create({ user_id: uuid, reason: 'R-IMPL 테스트 정지', is_permanent: true });

    const duringBan = await sessionLifecycle.resolveSession(decoded);
    assert.equal(duringBan.ok, false);
    assert.equal(duringBan.status, 403);

    const sessionAfterBan = await db.UserSession.findOne({ where: { id: decoded.sessionId } });
    assert.ok(sessionAfterBan.revoked_at instanceof Date,
        '정지 감지 시점에 세션이 실제로 영구 폐기(revoked_at)되어야 합니다 — 단순 거부만으로는 밴 해제 후 복원을 막지 못합니다(R-IMPL #7)');

    // 밴을 해제한다.
    await ban.destroy();

    // 밴이 풀렸어도 이 세션은 이미 폐기됐으므로 여전히 거부되어야 한다(복원 방지).
    const afterUnban = await sessionLifecycle.resolveSession(decoded);
    assert.equal(afterUnban.ok, false,
        '밴 해제 후에도 밴 이전에 폐기된 세션이 다시 유효해지면 안 됩니다(R-IMPL #7)');
});

// ── R-IMPL #7 / AC-04: 비밀번호 변경은 이미 오프라인인 다른 세션의 갱신 자격도 폐기한다 ──

test('R-IMPL #7/AC-04: 비밀번호 변경은 현재 세션뿐 아니라 이미 오프라인인 이전 세션의 갱신 자격도 함께 폐기한다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const { email, uuid } = await createUser('pwchange');

    // 로그인 정책상 새 로그인은 기존 세션을 offline 처리한다 — "다른 브라우저에서 로그인된
    // 세션"을 흉내내기 위해 두 번 로그인한 뒤, 첫 세션(A)의 회전형 갱신 자격이 비밀번호
    // 변경으로 함께 죽는지 확인한다(A는 is_online=false지만 refresh_token_hash는 여전히
    // 살아있는 상태 — user.repositories.js의 markOnlineSessionsOffline 주석이 명시하는
    // 바로 그 위험).
    const loginA = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);
    const loginB = await authService.login({ email, password: PASSWORD, rememberMe: true }, REQ_INFO);

    const sessionsBeforeChange = await db.UserSession.findAll({ where: { user_id: uuid }, order: [['connected_at', 'ASC']] });
    assert.equal(sessionsBeforeChange.length, 2);
    const sessionA = sessionsBeforeChange[0];
    assert.equal(Number(sessionA.is_online), 0, '두 번째 로그인이 첫 세션을 오프라인 처리했어야 합니다(기존 정책)');
    assert.ok(sessionA.refresh_token_hash, '오프라인 세션도 갱신 자격 해시는 아직 살아있어야 이 테스트가 의미 있습니다');

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
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;

    const decodedB = require('jsonwebtoken').verify(loginB.token, process.env.JWT_SECRET);
    const res = await fetch(`${base}/user/me/password`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: `accessToken=${loginB.token}` },
        body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'new-correct-horse-2' }),
    });
    assert.equal(res.status, 200);

    const sessionsAfterChange = await db.UserSession.findAll({ where: { user_id: uuid } });
    for (const session of sessionsAfterChange) {
        assert.ok(session.revoked_at instanceof Date,
            `세션 ${session.id}은 비밀번호 변경 후 폐기되어야 합니다(이미 오프라인이던 다른 세션 포함)`);
        assert.equal(Number(session.is_online), 0);
    }

    // 오프라인이던 세션 A의 갱신 자격도 이제 refresh()로 되살릴 수 없어야 한다.
    await assert.rejects(authService.refresh(loginA.refreshToken), (error) => error.status === 401);

    // 변경 이후 같은 계정으로의 새 로그인은 새 비밀번호로만 성공해야 한다(직렬화 확인).
    await assert.rejects(
        authService.login({ email, password: PASSWORD, rememberMe: false }, REQ_INFO),
        (error) => error.status === 401,
    );
    const reLogin = await authService.login({ email, password: 'new-correct-horse-2', rememberMe: false }, REQ_INFO);
    assert.ok(reLogin.token);
});
