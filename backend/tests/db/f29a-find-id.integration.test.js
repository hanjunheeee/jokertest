'use strict';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f29a-find-id-test-secret';
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

const postJson = (base, path, body) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
});

const startDefaultLimitRouteServer = async (t) => {
    const routesPath = require.resolve('../../routes/auth.routes');
    const rateLimitPath = require.resolve('../../middleware/rateLimit');
    const savedIpMax = process.env.FIND_ID_IP_MAX;
    const savedTargetMax = process.env.FIND_ID_TARGET_MAX;
    delete process.env.FIND_ID_IP_MAX;
    delete process.env.FIND_ID_TARGET_MAX;

    delete require.cache[routesPath];
    delete require.cache[rateLimitPath];
    let router;
    try {
        router = require(routesPath);
    } finally {
        delete require.cache[routesPath];
        delete require.cache[rateLimitPath];
        if (savedIpMax === undefined) delete process.env.FIND_ID_IP_MAX;
        else process.env.FIND_ID_IP_MAX = savedIpMax;
        if (savedTargetMax === undefined) delete process.env.FIND_ID_TARGET_MAX;
        else process.env.FIND_ID_TARGET_MAX = savedTargetMax;
    }

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', router);
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

test('AC-06: 0014 up·verify를 두 번 실행해도 오류 없고 기존 행은 그대로 보존된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    const findIdRequestsIndex = MIGRATIONS.findIndex((m) => m.name === addFindIdRequests.name);
    assert.notEqual(findIdRequestsIndex, -1, 'MIGRATIONS에서 0014-find-id-requests를 찾을 수 없습니다');
    const priorMigrations = MIGRATIONS.slice(0, findIdRequestsIndex);
    await migrationRunner.applyMigrations({ sequelize, migrations: priorMigrations });
    schemaState = 'dirty';

    const queryInterface = sequelize.getQueryInterface();

    await sequelize.query(
        "INSERT INTO account_find_requests (email, request_type, ip_address) VALUES ('legacy@example.com', 'LEGACY', '127.0.0.1')",
    );

    await addFindIdRequests.up(queryInterface, Sequelize);
    await addFindIdRequests.verify(queryInterface);
    await addFindIdRequests.up(queryInterface, Sequelize);
    await addFindIdRequests.verify(queryInterface);

    const [legacyRows] = await sequelize.query(
        "SELECT email, request_type FROM account_find_requests WHERE request_type = 'LEGACY'",
    );
    assert.equal(legacyRows.length, 1, '기존 행이 사라지거나 중복되면 안 됩니다');
    assert.equal(legacyRows[0].email, 'legacy@example.com', '기존 이메일 값이 바뀌면 안 됩니다');

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

    const afterReject = await queryInterface.describeTable('account_find_requests');
    assert.equal(afterReject.email.allowNull, true);
    const [stillThere] = await sequelize.query("SELECT COUNT(*) AS c FROM account_find_requests WHERE request_type = 'FIND_ID'");
    assert.equal(Number(stillThere[0].c), 1);

    await sequelize.query("DELETE FROM account_find_requests WHERE request_type = 'FIND_ID'");
    await addFindIdRequests.down(queryInterface, Sequelize);
    const afterDown = await queryInterface.describeTable('account_find_requests');
    assert.equal(afterDown.email.allowNull, false);

    await addFindIdRequests.up(queryInterface, Sequelize);
    schemaState = 'dirty';
});

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

test('AC-01/AC-03: 짧은 로컬 부분을 포함해 마스킹 결과는 고정된 값이고 원문은 어디에도 남지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const cases = [
        { nickname: '한글자로컬', email: 'a@b.co', expected: '*@b***.co' },
        { nickname: '두글자로컬', email: 'ab@b.co', expected: 'a*@b***.co' },
        { nickname: '보통로컬', email: 'abc@example.com', expected: 'a***c@e***.com' },
        { nickname: '점없는도메인', email: 'abcd@localdomain', expected: 'a***d@l***' },
    ];
    for (const item of cases) {
        await createLocalUser({ nickname: item.nickname, email: item.email, birthDate: new Date(Date.UTC(1993, 3, 4)) });
    }
    const base = await startRouteServer(t);

    for (const item of cases) {
        const res = await postFindId(base, { nickname: item.nickname, birthDate: '1993-04-04' });
        const body = await res.json();
        assert.deepEqual(body, { ok: true, maskedEmail: item.expected }, `${item.email}의 마스킹 결과`);
        assert.equal(JSON.stringify(body).includes(item.email), false, `${item.email} 원문이 응답에 남으면 안 됩니다`);
    }
});

test('AC-02: 생년월일이 등록되지 않은 계정도 같은 NOT_FOUND로 응답한다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    await createLocalUser({ nickname: '생일없음', email: 'no-birth@example.com', birthDate: null });
    const base = await startRouteServer(t);

    const res = await postFindId(base, { nickname: '생일없음', birthDate: '1990-01-01' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: false, code: 'NOT_FOUND' });
});

test('AC-03: 마스킹 힌트는 재설정 요청에서도 계정으로 인정되지 않고, 토큰으로도 쓸 수 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const email = 'hint-abuse@example.com';
    const uuid = await createLocalUser({ nickname: '힌트악용', email, birthDate: new Date(Date.UTC(1994, 4, 5)) });
    const base = await startRouteServer(t);

    const findRes = await postFindId(base, { nickname: '힌트악용', birthDate: '1994-05-05' });
    const { maskedEmail } = await findRes.json();
    assert.equal(maskedEmail, 'h***e@e***.com');

    const requestRes = await postJson(base, '/auth/password-reset/request', { email: maskedEmail });
    assert.equal(requestRes.status, 200);
    assert.deepEqual(await requestRes.json(), { ok: true });
    assert.equal(await db.PasswordResetToken.count(), 0, '존재하지 않는 계정에 토큰이 생기면 안 됩니다');

    const before = await db.User.findByPk(uuid);
    const confirmRes = await postJson(base, '/auth/password-reset/confirm', { token: maskedEmail, newPassword: 'hint-abuse-pw-1' });
    assert.equal(confirmRes.status, 400);
    assert.deepEqual(await confirmRes.json(), { ok: false, code: 'INVALID' });
    const after = await db.User.findByPk(uuid);
    assert.equal(after.password_hash, before.password_hash);
});

test('AC-05(기본 한도): 대상 5회·IP 10회를 넘으면 429이고, 날짜·앞뒤 공백·계정 유무로 우회되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const base = await startDefaultLimitRouteServer(t);
    await createLocalUser({ nickname: '한도대상', email: 'limit-target@example.com', birthDate: new Date(Date.UTC(1996, 6, 7)) });

    const targetAttempts = [
        { nickname: '한도대상', birthDate: '1996-07-07' }, // 실제로 일치하는 요청
        { nickname: '한도대상', birthDate: '1996-07-08' }, // 날짜만 다름
        { nickname: ' 한도대상 ', birthDate: '1996-07-09' }, // 앞뒤 공백
        { nickname: '한도대상', birthDate: '1996-07-10' },
        { nickname: ' 한도대상', birthDate: '1996-07-11' },
    ];
    for (const [index, attempt] of targetAttempts.entries()) {
        const res = await postFindId(base, attempt);
        assert.equal(res.status, 200, `대상 제한 안의 ${index + 1}번째 요청은 통과해야 합니다`);
    }

    const overTarget = await postFindId(base, { nickname: '한도대상', birthDate: '1996-07-12' });
    assert.equal(overTarget.status, 429, '같은 대상 6번째 요청은 429여야 합니다');
    assert.deepEqual(await overTarget.json(), { ok: false, code: 'RATE_LIMITED' });

    for (const nickname of ['없는대상하나', '없는대상둘', '없는대상셋', '없는대상넷']) {
        const res = await postFindId(base, { nickname, birthDate: '1996-07-07' });
        assert.equal(res.status, 200, `${nickname}은 대상 제한 안이므로 통과해야 합니다`);
    }

    const overIp = await postFindId(base, { nickname: '또다른대상', birthDate: '1996-07-07' });
    assert.equal(overIp.status, 429, 'IP 11번째 요청은 대상이 달라도 429여야 합니다');
    assert.deepEqual(await overIp.json(), { ok: false, code: 'RATE_LIMITED' });
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

    const loggedCount = await db.AccountFindRequest.count({ where: { request_type: 'FIND_ID' } });
    assert.equal(loggedCount, 2);
});
