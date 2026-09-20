'use strict';

// F-29a 아이디 찾기 — 실제 격리 MySQL DB에서 AC-01/AC-02/AC-04/AC-06을 검증한다.
//
// backend/tests/helpers/isolatedTestDb.js의 관리 목록·대상 DB 확인 원칙을 따른다.
// F01_TEST_DATABASE_URL이 없으면 각 테스트는 실패로 표시하지 않고 명시적으로 skip한다
// (f01~f19와 같은 관례 — skip은 통과가 아니라 미검증이다).
//
// f01-migrations.integration.test.js 다음에 같은 명령의 뒤쪽에서 직렬로 실행되어야 한다 —
// 그 스위트가 격리 스키마를 깨끗이 재구축한 뒤에야 이 파일의 판정이 결정적이다.

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f29a-find-id-test-secret';
// 이 파일 안의 여러 케이스가 같은 프로세스(같은 auth.routes.js 모듈, 같은 메모리 카운터)를
// 공유한다 — 요청 빈도 제한 자체는 rateLimit.test.js가 순수 로직으로 이미 검증했으므로,
// 여기서는 실제 DB 왕복 케이스가 우연히 429에 걸려 오염되지 않도록 한도를 넉넉히 올린다.
process.env.FIND_ID_IP_MAX = '1000';
process.env.FIND_ID_TARGET_MAX = '1000';

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
const addNotifications = require('../../db/migrations/0012-add-notifications');
const addF19FriendsInvites = require('../../db/migrations/0013-f19-friends-invites');
const addFindIdRequests = require('../../db/migrations/0014-find-id-requests');
const {
    buildManagedSchema, resetManagedSchema, resetManagedData, findNonEmptyManagedTables,
} = require('../helpers/isolatedTestDb');

// 0014는 새 테이블을 만들지 않는다(기존 account_find_requests.email의 allowNull만 바꾼다) —
// 그래서 관리 테이블 목록·드롭 순서는 F-19까지의 정의를 그대로 재사용한다.
const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests,
    addVoteParticipations, addAchievementGrants, addNotifications, addF19FriendsInvites,
    migrationRunner,
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

const DATA_TABLES = DROP_ORDER.filter((table) => table !== migrationRunner.META_TABLE);

const db = require('../../models');
const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');
const { maskEmail } = require('../../utils/maskEmail');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

/** 관리 스키마를 통째로 드롭하고 F-29a를 포함한 마이그레이션 전부를 처음부터 적용한다. */
const rebuildSchema = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

let schemaState = 'unknown'; // 'unknown' | 'migrated' | 'dirty'

const setUpFreshSchema = async (t) => {
    await rebuildSchema();
    schemaState = 'dirty'; // 이 케이스는 스키마(0014 up/down)를 직접 다시 조작할 수 있다.
    t.diagnostic('[f29a-fixture] mode=fresh-schema');
};

const setUp = async (t) => {
    if (schemaState !== 'migrated') {
        await rebuildSchema();
        schemaState = 'migrated';
        t.diagnostic('[f29a-fixture] mode=rebuilt');
        return;
    }
    const result = await resetManagedData(sequelize, TEST_DB_URL, {
        managedTables: MANAGED_TABLES,
        dropOrder: DROP_ORDER,
        keepTables: [migrationRunner.META_TABLE],
    });
    if (!result.cleaned) {
        await rebuildSchema();
        schemaState = 'migrated';
        t.diagnostic(`[f29a-fixture] mode=rebuilt-missing:${result.missingTables.join(',')}`);
        return;
    }

    assert.deepEqual(
        await findNonEmptyManagedTables(sequelize, DATA_TABLES), [],
        '앞 케이스의 행이 남아 있으면 이 케이스의 단정은 의미가 없다',
    );
    await addFindIdRequests.verify(sequelize.getQueryInterface());
    t.diagnostic('[f29a-fixture] mode=clean-data');
};

const testPasswordHash = 'not-used-by-this-suite';

const createLocalUser = async ({ nickname, email, birthDate }) => {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: testPasswordHash,
        nickname,
        email,
        birth_date: birthDate,
    });
    return uuid;
};

const startRouteServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', require('../../routes/auth.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const postFindId = (base, body) => fetch(`${base}/auth/find-id`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
});

// ---------------------------------------------------------------------------
// AC-06: 0014 재실행 안전성 — up/verify 두 번, NULL 이메일 삽입, 이력 보존, down 거부
// ---------------------------------------------------------------------------

test('AC-06: 0014 up·verify를 두 번 실행해도 오류 없고 기존 행은 그대로 보존된다', async (t) => {
    if (unavailable(t)) return;
    // 0014 이전 상태(email NOT NULL)부터 직접 세운다 — 이 케이스 자체가 그 전환을 검증한다.
    // F-29b(0015)가 0014 뒤에 추가된 뒤로는 이름 제외 filter가 0015까지 함께 남겨 "0014
    // 이전"이 아니게 됐다 — f19의 F19_MIGRATION_INDEX와 같은 원칙으로 0014의 실제 위치를
    // 찾아 그 앞 prefix만 적용한다.
    await resetSchema();
    const findIdRequestsIndex = MIGRATIONS.findIndex((m) => m.name === addFindIdRequests.name);
    assert.notEqual(findIdRequestsIndex, -1, 'MIGRATIONS에서 0014-find-id-requests를 찾을 수 없습니다');
    const priorMigrations = MIGRATIONS.slice(0, findIdRequestsIndex);
    await migrationRunner.applyMigrations({ sequelize, migrations: priorMigrations });
    schemaState = 'dirty';

    const queryInterface = sequelize.getQueryInterface();

    // 0014 이전 기존 행(email이 값을 가진 정상 행)이 보존되는지 확인한다.
    await sequelize.query(
        "INSERT INTO account_find_requests (email, request_type, ip_address) VALUES ('legacy@example.com', 'LEGACY', '127.0.0.1')",
    );

    await addFindIdRequests.up(queryInterface, Sequelize);
    await addFindIdRequests.verify(queryInterface);
    // 두 번째 실행 — 멱등해야 하고 오류가 나면 안 된다.
    await addFindIdRequests.up(queryInterface, Sequelize);
    await addFindIdRequests.verify(queryInterface);

    const [legacyRows] = await sequelize.query(
        "SELECT email, request_type FROM account_find_requests WHERE request_type = 'LEGACY'",
    );
    assert.equal(legacyRows.length, 1, '기존 행이 사라지거나 중복되면 안 됩니다');
    assert.equal(legacyRows[0].email, 'legacy@example.com', '기존 이메일 값이 바뀌면 안 됩니다');

    // email 없이 FIND_ID/PASSWORD_RESET 사건을 기록할 수 있다.
    await sequelize.query(
        "INSERT INTO account_find_requests (email, request_type, ip_address) VALUES (NULL, 'FIND_ID', '127.0.0.1')",
    );
    await sequelize.query(
        "INSERT INTO account_find_requests (email, request_type, ip_address) VALUES (NULL, 'PASSWORD_RESET', '127.0.0.1')",
    );
    const [nullRows] = await sequelize.query(
        'SELECT request_type FROM account_find_requests WHERE email IS NULL ORDER BY request_type',
    );
    assert.deepEqual(nullRows.map((r) => r.request_type), ['FIND_ID', 'PASSWORD_RESET']);
});

test('AC-06: NULL 이메일 행이 있으면 down()은 데이터를 보존한 채 거부되고, 없으면 NOT NULL로 되돌린다', async (t) => {
    if (unavailable(t)) return;
    await setUpFreshSchema(t);
    const queryInterface = sequelize.getQueryInterface();

    await sequelize.query(
        "INSERT INTO account_find_requests (email, request_type, ip_address) VALUES (NULL, 'FIND_ID', '127.0.0.1')",
    );

    await assert.rejects(() => addFindIdRequests.down(queryInterface, Sequelize));

    // 거부된 뒤에도 컬럼은 여전히 nullable이고 행은 그대로다(데이터 손실 없음).
    const afterReject = await queryInterface.describeTable('account_find_requests');
    assert.equal(afterReject.email.allowNull, true);
    const [stillThere] = await sequelize.query("SELECT COUNT(*) AS c FROM account_find_requests WHERE request_type = 'FIND_ID'");
    assert.equal(Number(stillThere[0].c), 1);

    // NULL 행을 치운 뒤에는 down()이 정상적으로 NOT NULL로 되돌린다.
    await sequelize.query("DELETE FROM account_find_requests WHERE request_type = 'FIND_ID'");
    await addFindIdRequests.down(queryInterface, Sequelize);
    const afterDown = await queryInterface.describeTable('account_find_requests');
    assert.equal(afterDown.email.allowNull, false);

    // 이 케이스는 스키마를 0014 이전으로 되돌려 놨다 — 뒤에 오는 케이스를 위해 다시 올린다.
    await addFindIdRequests.up(queryInterface, Sequelize);
    schemaState = 'dirty';
});

// ---------------------------------------------------------------------------
// AC-01/AC-02/AC-04/AC-06: 실제 라우터·서비스·모델·DB 왕복
// ---------------------------------------------------------------------------

test('AC-01/AC-06: 실제 DB에서 정상 조회는 마스킹된 이메일을 돌려주고 FIND_ID 사건을 이메일 없이 남긴다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const email = 'real-user@example.com';
    await createLocalUser({ nickname: '실제유저', email, birthDate: new Date(Date.UTC(1995, 5, 20)) });
    const base = await startRouteServer(t);

    const res = await postFindId(base, { nickname: '실제유저', birthDate: '1995-06-20' });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(body).sort(), ['maskedEmail', 'ok']);
    assert.equal(body.ok, true);
    assert.equal(body.maskedEmail, maskEmail(email));

    const logged = await db.AccountFindRequest.findAll({ where: { request_type: 'FIND_ID' }, raw: true });
    assert.equal(logged.length, 1);
    assert.equal(logged[0].email, null);
});

test('AC-03: 마스킹 힌트는 실제 이메일이 아니므로 그 값으로는 로그인할 수 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const email = 'real-login-user@example.com';
    await createLocalUser({ nickname: '로그인시도', email, birthDate: new Date(Date.UTC(1998, 2, 3)) });
    const base = await startRouteServer(t);

    const findRes = await postFindId(base, { nickname: '로그인시도', birthDate: '1998-03-03' });
    const { maskedEmail } = await findRes.json();
    assert.notEqual(maskedEmail, email);

    const loginRes = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: maskedEmail, password: 'whatever-password-1' }),
    });
    assert.equal(loginRes.status, 401, '마스킹 힌트는 실제 계정 이메일이 아니므로 로그인이 거부되어야 합니다');
});

test('AC-04: 8자를 초과하는 기존 긴 닉네임 계정도 실제 DB에서 조회된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const longNickname = '아홉자이상의긴닉네임';
    assert.ok(longNickname.length > 8);
    const email = 'long-nick@example.com';
    await createLocalUser({ nickname: longNickname, email, birthDate: new Date(Date.UTC(2001, 10, 3)) });
    const base = await startRouteServer(t);

    const res = await postFindId(base, { nickname: longNickname, birthDate: '2001-11-03' });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.maskedEmail, maskEmail(email));
});

test('AC-02: 날짜 불일치·미등록 계정 모두 실제 DB에서 같은 NOT_FOUND로 응답한다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    await createLocalUser({ nickname: '날짜불일치', email: 'mismatch@example.com', birthDate: new Date(Date.UTC(1990, 0, 1)) });
    const base = await startRouteServer(t);

    const mismatch = await postFindId(base, { nickname: '날짜불일치', birthDate: '1990-01-02' });
    const missing = await postFindId(base, { nickname: '없는닉네임', birthDate: '1990-01-01' });

    assert.deepEqual(await mismatch.json(), { ok: false, code: 'NOT_FOUND' });
    assert.deepEqual(await missing.json(), { ok: false, code: 'NOT_FOUND' });
    assert.equal(mismatch.status, 200);
    assert.equal(missing.status, 200);

    // 계정이 없어도, 날짜가 달라도 조회 시도 자체는 이메일 없이 기록된다.
    const loggedCount = await db.AccountFindRequest.count({ where: { request_type: 'FIND_ID' } });
    assert.equal(loggedCount, 2);
});
