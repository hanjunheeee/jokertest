'use strict';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f19-friends-invites-test-secret';

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
const {
    buildManagedSchema, resetManagedSchema, resetManagedData, findNonEmptyManagedTables,
} = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');

const F19_MIGRATION_INDEX = MIGRATIONS.findIndex((migration) => migration.name === '0013-f19-friends-invites');
if (F19_MIGRATION_INDEX === -1) {
    throw new Error('MIGRATIONS 목록에서 0013-f19-friends-invites를 찾을 수 없습니다.');
}

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
const friendService = require('../../services/friend');
const gameInviteService = require('../../services/friend/gameInvite');
const notificationService = require('../../services/notification');
const { hashPassword } = require('../../utils/hash');
const { generateToken } = require('../../utils/jwt');
const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

let clockMs = Date.UTC(2026, 8, 13, 0, 0, 0);
const nowFn = () => new Date(clockMs);

let emitted = [];
const recordingEmit = (userId, event, payload) => {
    emitted.push({ userId, event, payload });
};

const roomAccess = {
    bootEpoch: 'boot-f19-test',
    rooms: new Map(),
    userRoom: new Map(),
    receiverAvailability: { available: true },
    describeRoomForInvite(roomId) {
        return roomAccess.rooms.get(roomId) ?? null;
    },
    getRoomIdForUser(uuid) {
        return roomAccess.userRoom.get(uuid) ?? null;
    },
    describeReceiverAvailability() {
        return roomAccess.receiverAvailability;
    },
};

const placeInRoom = (uuid, roomId, overrides = {}) => {
    roomAccess.rooms.set(roomId, {
        roomId, roomInstanceId: `${roomId}-inst-1`, isFull: false, ...overrides,
    });
    roomAccess.userRoom.set(uuid, roomId);
};

let schemaState = 'unknown';

const fixtureCost = { rebuilds: 0, cleans: 0, schemaMs: 0, dataMs: 0 };

const resetRuntimeFixtures = () => {
    clockMs = Date.UTC(2026, 8, 13, 0, 0, 0);
    emitted = [];
    roomAccess.rooms.clear();
    roomAccess.userRoom.clear();
    roomAccess.receiverAvailability = { available: true };

    gameInviteService.__setRoomAccessForRuntime(roomAccess);
    gameInviteService.__internal.__setDepsForTests({ emitToUser: recordingEmit, now: nowFn });
    notificationService.__internal.__setDepsForTests({ emitToUser: recordingEmit, now: nowFn });
};

const rebuildSchema = async () => {
    const startedAt = performance.now();
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    fixtureCost.rebuilds += 1;
    fixtureCost.schemaMs += performance.now() - startedAt;
    schemaState = 'migrated';
};

const beginCase = (t, mode, setupMs) => {
    const startedAt = performance.now();
    t.after(() => {
        t.diagnostic(
            `[f19-fixture] mode=${mode} setup=${setupMs.toFixed(1)}ms body=${(performance.now() - startedAt).toFixed(1)}ms`,
        );
    });
};

const setUpFreshSchema = async (t) => {
    const startedAt = performance.now();
    await rebuildSchema();
    schemaState = 'dirty';
    resetRuntimeFixtures();
    beginCase(t, 'fresh-schema', performance.now() - startedAt);
};

const setUpBareSchema = async (t) => {
    const startedAt = performance.now();
    await resetSchema();
    schemaState = 'dirty';
    resetRuntimeFixtures();
    beginCase(t, 'bare-schema', performance.now() - startedAt);
};

const setUp = async (t) => {
    const startedAt = performance.now();
    let mode = 'clean-data';

    if (schemaState !== 'migrated') {
        await rebuildSchema();
        mode = 'rebuilt';
    } else {
        const cleanStartedAt = performance.now();
        const result = await resetManagedData(sequelize, TEST_DB_URL, {
            managedTables: MANAGED_TABLES,
            dropOrder: DROP_ORDER,
            keepTables: [migrationRunner.META_TABLE],
        });
        if (!result.cleaned) {
            await rebuildSchema();
            mode = `rebuilt-missing:${result.missingTables.join(',')}`;
        } else {
            fixtureCost.cleans += 1;
            fixtureCost.dataMs += performance.now() - cleanStartedAt;
        }
    }

    assert.deepEqual(
        await findNonEmptyManagedTables(sequelize, DATA_TABLES), [],
        '앞 케이스의 행이 남아 있으면 이 케이스의 단정은 의미가 없다',
    );

    await addF19FriendsInvites.verify(sequelize.getQueryInterface());

    resetRuntimeFixtures();
    beginCase(t, mode, performance.now() - startedAt);
};

test.after(() => {
    if (!TEST_DB_URL) return;
    console.log(
        `# [f19-fixture] 전체 재구축 ${fixtureCost.rebuilds}회 ${fixtureCost.schemaMs.toFixed(0)}ms · `
        + `데이터 격리 ${fixtureCost.cleans}회 ${fixtureCost.dataMs.toFixed(0)}ms`,
    );
});

test.afterEach(() => {
    gameInviteService.__setRoomAccessForRuntime(null);
    gameInviteService.__internal.__setDepsForTests(null);
    notificationService.__internal.__setDepsForTests(null);
});

let sharedPasswordHash = null;
const testPasswordHash = async () => {
    if (sharedPasswordHash === null) sharedPasswordHash = await hashPassword('correct-horse-battery-1');
    return sharedPasswordHash;
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, Math.max(1, 8 - label.length))}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await testPasswordHash(),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    await db.UserStats.create({ user_id: uuid });
    await db.UserSession.create({ id: `session-${uuid}`, user_id: uuid, is_online: true });
    return uuid;
};

const createLocalUserBeforeReset = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, Math.max(1, 8 - label.length))}`.slice(0, 8);
    await sequelize.query(
        'INSERT INTO users (uuid, password_hash, nickname, email, role, status, email_verified, failed_login_count, created_at, updated_at) '
        + 'VALUES (:uuid, :password_hash, :nickname, :email, :role, :status, :email_verified, :failed_login_count, NOW(), NOW())',
        {
            replacements: {
                uuid, password_hash: await testPasswordHash(), nickname,
                email: `${label}-${uuid}@example.com`, role: 'USER', status: 'ACTIVE',
                email_verified: false, failed_login_count: 0,
            },
        },
    );
    return uuid;
};

const startRouteServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/friends', require('../../routes/friend.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const tokenFor = (uuid) => generateToken({ uuid, role: 'USER', sessionId: `session-${uuid}` });
const authFetch = (base, uuid, path, init = {}) =>
    fetch(`${base}${path}`, {
        ...init,
        headers: {
            cookie: `accessToken=${tokenFor(uuid)}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
        },
    });

const befriend = async (a, b) => {
    const request = await friendService.sendFriendRequest(a, b);
    await friendService.acceptRequest(b, request.id);
    return request.id;
};

const countRows = async (model, where) => await model.count({ where });

const eventsNamed = (name) => emitted.filter((entry) => entry.event === name);

test('AC-05: 0013 재실행은 스키마·행을 그대로 두고 이력을 한 건만 남긴다', async (t) => {
    if (unavailable(t)) return;
    await setUpFreshSchema(t);

    const a = await createLocalUser('mig-a');
    const b = await createLocalUser('mig-b');
    await friendService.sendFriendRequest(a, b);

    const before = {
        requests: await countRows(db.FriendRequest, {}),
        favorites: await countRows(db.FriendFavorite, {}),
        blocks: await countRows(db.FriendBlock, {}),
        invites: await countRows(db.GameInvite, {}),
    };

    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const [historyRows] = await sequelize.query(
        `SELECT status FROM ${migrationRunner.META_TABLE} WHERE name = '0013-f19-friends-invites'`,
    );
    assert.equal(historyRows.length, 1, '0013 이력은 재실행 뒤에도 한 건이어야 한다');
    assert.equal(historyRows[0].status, 'applied');

    assert.deepEqual(
        {
            requests: await countRows(db.FriendRequest, {}),
            favorites: await countRows(db.FriendFavorite, {}),
            blocks: await countRows(db.FriendBlock, {}),
            invites: await countRows(db.GameInvite, {}),
        },
        before,
        '재실행이 기존 행을 건드리면 안 된다',
    );

    const tables = await sequelize.getQueryInterface().showAllTables();
    for (const table of ['friend_favorites', 'friend_blocks', 'game_invites']) {
        assert.ok(tables.includes(table), `${table}이 실제로 만들어져야 한다`);
        assert.ok(MANAGED_TABLES.includes(table), `${table}이 격리 DB 관리 목록에 있어야 한다`);
    }
});

test('A-09: 실제 MySQL의 creation_seq는 AUTO_INCREMENT이고 이름 있는 유일 키가 덮는다', async (t) => {
    if (unavailable(t)) return;
    await setUpFreshSchema(t);

    const queryInterface = sequelize.getQueryInterface();

    const describe = await queryInterface.describeTable('game_invites');
    assert.equal(describe.creation_seq.autoIncrement, true, 'creation_seq는 서버가 정하는 자동 증가 순번이어야 한다');
    assert.equal(describe.creation_seq.allowNull, false);
    assert.equal(describe.id.primaryKey, true, '기본 키는 노출용 UUID다');

    const indexes = await queryInterface.showIndex('game_invites');
    const seqIndex = indexes.find((index) => index.name === 'game_invites_creation_seq_unique');
    assert.ok(seqIndex, 'creation_seq를 덮는 이름 있는 유일 키가 실제로 있어야 한다');
    assert.equal(seqIndex.unique, true);
    assert.deepEqual(
        seqIndex.fields.map((field) => field.attribute ?? field),
        ['creation_seq'],
    );

    const a = await createLocalUser('seq-a');
    const b = await createLocalUser('seq-b');
    const makeRow = async (key) => await db.GameInvite.create({
        id: crypto.randomUUID(),
        sender_id: a, receiver_id: b,
        room_id: 'room-seq', room_instance_id: 'room-seq-inst-1', boot_epoch: 'boot-f19-test',
        creation_key: key, revision: 1, status: 'PENDING',
        created_at: nowFn(), expires_at: new Date(clockMs + 60_000),
    });

    const first = await makeRow('seq-key-1');
    const second = await makeRow('seq-key-2');
    assert.ok(
        BigInt(String(second.creation_seq)) > BigInt(String(first.creation_seq)),
        '두 번째 초대의 순번이 더 커야 커서가 신규 수신을 판정할 수 있다',
    );
});

test('A-09: verify는 실제 MySQL에서 깨진 creation_seq 계약을 통과시키지 않고, up은 빠진 키만 메운다', async (t) => {
    if (unavailable(t)) return;
    await setUpFreshSchema(t);

    const queryInterface = sequelize.getQueryInterface();
    const a = await createLocalUser('vrf-a');
    const b = await createLocalUser('vrf-b');
    await db.GameInvite.create({
        id: crypto.randomUUID(),
        sender_id: a, receiver_id: b,
        room_id: 'room-vrf', room_instance_id: 'room-vrf-inst-1', boot_epoch: 'boot-f19-test',
        creation_key: 'vrf-key-1', revision: 1, status: 'PENDING',
        created_at: nowFn(), expires_at: new Date(clockMs + 60_000),
    });

    await sequelize.query('ALTER TABLE game_invites MODIFY COLUMN creation_seq BIGINT NOT NULL');
    await assert.rejects(() => addF19FriendsInvites.verify(queryInterface), /AUTO_INCREMENT가 아닙니다/);

    await sequelize.query('ALTER TABLE game_invites ADD INDEX f19_seq_guard (creation_seq)');
    await sequelize.query('ALTER TABLE game_invites MODIFY COLUMN creation_seq BIGINT NOT NULL AUTO_INCREMENT');
    await sequelize.query('ALTER TABLE game_invites DROP INDEX game_invites_creation_seq_unique');
    await assert.rejects(
        () => addF19FriendsInvites.verify(queryInterface),
        /game_invites_creation_seq_unique 인덱스가 없습니다/,
    );

    await addF19FriendsInvites.up(queryInterface, Sequelize, sequelize);
    const restored = (await queryInterface.showIndex('game_invites'))
        .find((index) => index.name === 'game_invites_creation_seq_unique');
    assert.ok(restored && restored.unique === true, '빠진 유일 키는 복구돼야 한다');
    assert.equal(await countRows(db.GameInvite, {}), 1, '복구가 기존 초대를 지우면 안 된다');

    await sequelize.query('ALTER TABLE game_invites DROP INDEX f19_seq_guard');
    await sequelize.query('ALTER TABLE game_invites MODIFY COLUMN creation_seq BIGINT NOT NULL');
    await assert.rejects(() => addF19FriendsInvites.verify(queryInterface), /AUTO_INCREMENT가 아닙니다/);

    await sequelize.query('ALTER TABLE game_invites MODIFY COLUMN creation_seq BIGINT NOT NULL AUTO_INCREMENT');
    await assert.doesNotReject(() => addF19FriendsInvites.verify(queryInterface));
    assert.equal(await countRows(db.GameInvite, {}), 1);
});

test('AC-05: 실제 MySQL 전체 마이그레이션은 예전 UNIQUE를 받침 인덱스로 갈아타고 두 외래 키·모든 행을 보존한다', async (t) => {
    if (unavailable(t)) return;
    await setUpBareSchema(t);

    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS.slice(0, F19_MIGRATION_INDEX) });

    const queryInterface = sequelize.getQueryInterface();
    const leftmostOf = (index) => (index.fields ?? []).map((field) => field.attribute ?? field)[0];

    {
        const before = await queryInterface.showIndex('friend_requests');
        const legacy = addF19FriendsInvites.findLegacyRequestUniqueIndexes(before);
        assert.ok(legacy.length >= 1, '0013 이전에는 예전 3컬럼 UNIQUE가 있어야 한다');
        assert.equal(
            before.filter((index) => index.name === addF19FriendsInvites.PENDING_PAIR_INDEX).length, 0,
            '0013 이전에는 계정쌍 유일 키가 없어야 한다',
        );
        await assert.rejects(
            () => sequelize.query(`ALTER TABLE friend_requests DROP INDEX ${legacy[0].name}`),
            /needed in a foreign key constraint/,
            '받침을 세우지 않고 예전 UNIQUE를 떼는 것이 실제로 거부돼야 이 회귀가 재현된다',
        );
        assert.equal(
            addF19FriendsInvites.findLegacyRequestUniqueIndexes(
                await queryInterface.showIndex('friend_requests'),
            ).length, legacy.length,
            '거부된 DROP은 스키마를 바꾸지 않아야 한다',
        );
    }

    const u1 = await createLocalUserBeforeReset('fk-1');
    const u2 = await createLocalUserBeforeReset('fk-2');
    const u3 = await createLocalUserBeforeReset('fk-3');

    const declined = await db.FriendRequest.create({ requester_id: u1, receiver_id: u2, status: 'DECLINED' });
    const keptPending = await db.FriendRequest.create({ requester_id: u1, receiver_id: u3, status: 'PENDING' });
    const otherPending = await db.FriendRequest.create({ requester_id: u2, receiver_id: u3, status: 'PENDING' });
    const crossPending = await db.FriendRequest.create({ requester_id: u3, receiver_id: u1, status: 'PENDING' });

    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const after = await queryInterface.showIndex('friend_requests');
    assert.equal(
        addF19FriendsInvites.findLegacyRequestUniqueIndexes(after).length, 0,
        '예전 UNIQUE가 실제로 떨어져야 한다',
    );
    const pair = after.find((index) => index.name === addF19FriendsInvites.PENDING_PAIR_INDEX);
    assert.ok(pair && pair.unique === true, 'PENDING 계정쌍 유일 키가 자리를 대신해야 한다');

    for (const [column, indexName] of Object.entries(addF19FriendsInvites.REQUEST_FK_SUPPORT_INDEXES)) {
        const support = after.find((index) => index.name === indexName);
        assert.ok(support, `${indexName} 받침 인덱스가 실제로 만들어져야 한다`);
        assert.equal(support.unique, false, '받침은 비유일이어야 요청 이력이 한 건으로 제한되지 않는다');
        assert.equal(leftmostOf(support), column, `${indexName}의 선두 컬럼은 ${column}이어야 한다`);
    }

    const references = await queryInterface.getForeignKeyReferencesForTable('friend_requests');
    for (const column of Object.keys(addF19FriendsInvites.REQUEST_FK_SUPPORT_INDEXES)) {
        assert.ok(
            references.some((reference) => reference.columnName === column
                && String(reference.referencedTableName).toLowerCase() === 'users'
                && String(reference.referencedColumnName).toLowerCase() === 'uuid'),
            `${column} → users.uuid 외래 키가 보존돼야 한다`,
        );
    }
    await assert.rejects(
        () => db.FriendRequest.create({
            requester_id: crypto.randomUUID(), receiver_id: u1, status: 'PENDING',
        }),
        '없는 계정의 요청은 외래 키가 막아야 한다',
    );

    assert.equal(await countRows(db.FriendRequest, {}), 4, '이관이 행을 지우면 안 된다');
    const statusOf = async (id) => (await db.FriendRequest.findByPk(id)).status;
    assert.equal(await statusOf(declined.id), 'DECLINED', 'terminal 이력은 그대로다');
    assert.equal(await statusOf(otherPending.id), 'PENDING', '다른 계정쌍의 대기는 영향이 없다');
    assert.equal(await statusOf(keptPending.id), 'PENDING', '더 이른 id가 유효 대기로 남는다');
    const cancelled = await db.FriendRequest.findByPk(crossPending.id);
    assert.equal(cancelled.status, 'CANCELLED');
    assert.match(
        cancelled.message ?? '', new RegExp(addF19FriendsInvites.MIGRATION_CANCEL_REASON),
        '어떤 행이 왜 취소됐는지 DB만 보고 답할 수 있어야 한다',
    );

    await assert.doesNotReject(() => addF19FriendsInvites.verify(queryInterface));

    await assert.doesNotReject(
        () => db.FriendRequest.create({ requester_id: u1, receiver_id: u2, status: 'DECLINED' }),
        '거절 후 재신청·재거절 이력이 두 행으로 남을 수 있어야 한다',
    );
    await assert.rejects(
        () => db.FriendRequest.create({ requester_id: u1, receiver_id: u3, status: 'PENDING' }),
        '같은 계정쌍의 두 번째 유효 대기는 계정쌍 유일 키가 막아야 한다',
    );
});

test('AC-05: 받침 인덱스는 실제 MySQL에서 외래 키가 요구하는 인덱스가 되고, 빠지면 verify가 거부한다', async (t) => {
    if (unavailable(t)) return;
    await setUpFreshSchema(t);

    const queryInterface = sequelize.getQueryInterface();
    const supportIndex = addF19FriendsInvites.REQUEST_REQUESTER_SUPPORT_INDEX;

    await assert.rejects(
        () => sequelize.query(`ALTER TABLE friend_requests DROP INDEX ${supportIndex}`),
        /needed in a foreign key constraint/,
    );

    await sequelize.query('ALTER TABLE friend_requests ADD INDEX f19_fk_guard (requester_id)');
    await sequelize.query(`ALTER TABLE friend_requests DROP INDEX ${supportIndex}`);
    await assert.rejects(
        () => addF19FriendsInvites.verify(queryInterface),
        new RegExp(`${supportIndex} 인덱스가 없습니다`),
        'guard가 있어 외래 키는 멀쩡하더라도 계약된 받침이 없으면 통과시키지 않는다',
    );

    const a = await createLocalUser('sup-a');
    const b = await createLocalUser('sup-b');
    await friendService.sendFriendRequest(a, b);
    await addF19FriendsInvites.up(queryInterface, Sequelize, sequelize);

    const restored = (await queryInterface.showIndex('friend_requests'))
        .find((index) => index.name === supportIndex);
    assert.ok(restored, '빠진 받침은 복구돼야 한다');
    assert.equal(restored.unique, false);
    assert.equal(await countRows(db.FriendRequest, {}), 1, '복구가 기존 요청을 지우면 안 된다');

    await sequelize.query('ALTER TABLE friend_requests DROP INDEX f19_fk_guard');
    await assert.doesNotReject(() => addF19FriendsInvites.verify(queryInterface));
});

test('AC-05: 기동 sync()는 0013이 뗀 예전 UNIQUE를 실제 MySQL에서 되살리지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUpFreshSchema(t);

    const queryInterface = sequelize.getQueryInterface();
    const legacyCount = async () => addF19FriendsInvites
        .findLegacyRequestUniqueIndexes(await queryInterface.showIndex('friend_requests')).length;

    assert.equal(await legacyCount(), 0, '마이그레이션 직후에는 예전 UNIQUE가 없다');

    await db.FriendRequest.sync();

    assert.equal(
        await legacyCount(),
        0,
        '모델이 예전 UNIQUE를 선언하고 있으면 sync가 다시 만들어 AC-05 계약이 부팅 한 번에 무효가 된다',
    );

    const a = await createLocalUser('sync-a');
    const b = await createLocalUser('sync-b');

    const first = await friendService.sendFriendRequest(a, b);
    await friendService.declineRequest(b, first.id);
    const second = await friendService.sendFriendRequest(a, b);
    await friendService.declineRequest(b, second.id);
    assert.equal(
        await countRows(db.FriendRequest, { requester_id: a, receiver_id: b, status: 'DECLINED' }),
        2,
        'sync 이후에도 거절 → 재신청 → 재거절이 두 행으로 남아야 한다',
    );

    await friendService.sendFriendRequest(a, b);
    await assert.rejects(
        () => friendService.sendFriendRequest(b, a),
        (error) => error.status === 409,
        'sync 이후에도 계정쌍 교차 PENDING은 하나로 좁혀져야 한다',
    );

    await assert.doesNotReject(() => addF19FriendsInvites.verify(queryInterface));
});

test('격리: 데이터 정리는 모든 관리 테이블의 행을 실제로 비우고 스키마·외래 키·이관 이력은 남긴다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('iso-a');
    const b = await createLocalUser('iso-b');
    await befriend(a, b);
    await friendService.setFriendFavorite(a, b, true);
    placeInRoom(a, 'room-iso');
    await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'iso' });
    await friendService.blockUser(a, b);

    const populated = [
        [db.User, 'users'], [db.UserStats, 'user_stats'], [db.UserSession, 'user_sessions'],
        [db.FriendRequest, 'friend_requests'], [db.Friendship, 'friendships'],
        [db.FriendFavorite, 'friend_favorites'], [db.FriendBlock, 'friend_blocks'],
        [db.GameInvite, 'game_invites'], [db.Notification, 'notifications'],
    ];
    for (const [model, table] of populated) {
        assert.ok(
            await countRows(model, {}) > 0,
            `${table}에 행이 없으면 이 시험은 정리를 검증하는 것이 아니라 빈 DB를 확인하는 것이 된다`,
        );
    }

    const result = await resetManagedData(sequelize, TEST_DB_URL, {
        managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER,
        keepTables: [migrationRunner.META_TABLE],
    });
    assert.equal(result.cleaned, true);
    assert.deepEqual(
        result.deleted, DATA_TABLES,
        '관리 테이블 하나라도 빼놓으면 다음 케이스가 남은 행을 물려받는다',
    );

    assert.deepEqual(await findNonEmptyManagedTables(sequelize, DATA_TABLES), []);

    const [history] = await sequelize.query(
        `SELECT COUNT(*) AS applied_count FROM ${migrationRunner.META_TABLE} WHERE status = 'applied'`,
    );
    assert.equal(
        Number(history[0].applied_count), MIGRATIONS.length,
        '데이터 정리가 이관 이력을 지우면 다음 실행이 이미 있는 스키마에 다시 이관을 시도한다',
    );
    await assert.doesNotReject(() => addF19FriendsInvites.verify(sequelize.getQueryInterface()));

    await assert.rejects(
        () => db.FriendRequest.create({ requester_id: crypto.randomUUID(), receiver_id: b, status: 'PENDING' }),
        '정리 뒤에도 없는 계정의 요청은 외래 키가 막아야 한다',
    );

    const c = await createLocalUser('iso-c');
    const d = await createLocalUser('iso-d');
    await befriend(c, d);
    assert.equal(await countRows(db.Friendship, {}), 1);
});

test('AC-05: 거절 → 재신청 → 재거절이 terminal 이력을 두 행으로 보존한다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('hist-a');
    const b = await createLocalUser('hist-b');

    const first = await friendService.sendFriendRequest(a, b);
    await friendService.declineRequest(b, first.id);

    const second = await friendService.sendFriendRequest(a, b);
    await friendService.declineRequest(b, second.id);

    const declined = await db.FriendRequest.findAll({
        where: { requester_id: a, receiver_id: b, status: 'DECLINED' },
        order: [['id', 'ASC']],
    });
    assert.equal(declined.length, 2, '같은 방향의 거절 이력이 두 행 남아야 한다');
    assert.notEqual(declined[0].id, declined[1].id);

    const third = await friendService.sendFriendRequest(a, b);
    assert.equal(await countRows(db.FriendRequest, { status: 'PENDING' }), 1);
    assert.ok(Number.isInteger(third.id));
});

test('AC-05: 교차 방향 동시 신청은 유효 PENDING 하나로 좁혀진다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('pair-a');
    const b = await createLocalUser('pair-b');

    await friendService.sendFriendRequest(a, b);

    await assert.rejects(
        () => friendService.sendFriendRequest(b, a),
        (error) => error.status === 409,
        '같은 계정쌍의 교차 PENDING은 거부돼야 한다',
    );

    assert.equal(await countRows(db.FriendRequest, { status: 'PENDING' }), 1);
});

test('AC-02: 요청 당사자만 결과를 읽고 남의 요청 id는 결과에 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);
    const base = await startRouteServer(t);

    const a = await createLocalUser('res-a');
    const b = await createLocalUser('res-b');
    const c = await createLocalUser('res-c');
    const d = await createLocalUser('res-d');

    const mine = await friendService.sendFriendRequest(a, b);
    const theirs = await friendService.sendFriendRequest(c, d);
    await friendService.acceptRequest(b, mine.id);

    const response = await authFetch(base, b, `/friends/requests/results?ids=${mine.id},${theirs.id}`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.data.length, 1, '남의 요청 행은 결과에 포함되면 안 된다');
    assert.equal(body.data[0].request_id, mine.id);
    assert.equal(body.data[0].status, 'ACCEPTED');

    const outsider = await authFetch(base, c, `/friends/requests/results?ids=${mine.id}`);
    assert.deepEqual((await outsider.json()).data, []);
});

test('AC-03: 같은 PUT을 두 번 보내도 행은 하나이고 다른 접속에서 그대로 복원된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);
    const base = await startRouteServer(t);

    const a = await createLocalUser('fav-a');
    const b = await createLocalUser('fav-b');
    await befriend(a, b);

    const put = (favorite) => authFetch(base, a, `/friends/favorites/${b}`, {
        method: 'PUT', body: JSON.stringify({ favorite }),
    });

    assert.equal((await put(true)).status, 200);
    assert.equal((await put(true)).status, 200);

    assert.equal(await countRows(db.FriendFavorite, { owner_id: a, friend_id: b }), 1);

    const restored = await (await authFetch(base, a, '/friends/favorites')).json();
    assert.deepEqual(restored.data, [b]);

    const friends = await (await authFetch(base, a, '/friends')).json();
    assert.equal(friends.data.find((friend) => friend.id === b).isFavorite, true);

    assert.equal((await put(false)).status, 200);
    assert.equal((await put(false)).status, 200);
    assert.equal(await countRows(db.FriendFavorite, { owner_id: a, friend_id: b }), 0);
});

test('AC-03: 친구가 아닌 계정은 즐겨찾기할 수 없고 다른 계정의 즐겨찾기는 바뀌지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);
    const base = await startRouteServer(t);

    const a = await createLocalUser('fav2-a');
    const b = await createLocalUser('fav2-b');
    const c = await createLocalUser('fav2-c');
    await befriend(a, b);

    await authFetch(base, a, `/friends/favorites/${b}`, { method: 'PUT', body: JSON.stringify({ favorite: true }) });

    const notFriend = await authFetch(base, a, `/friends/favorites/${c}`, {
        method: 'PUT', body: JSON.stringify({ favorite: true }),
    });
    assert.equal(notFriend.status, 404);

    await authFetch(base, c, `/friends/favorites/${b}`, { method: 'PUT', body: JSON.stringify({ favorite: false }) });
    assert.equal(await countRows(db.FriendFavorite, { owner_id: a, friend_id: b }), 1, 'A의 즐겨찾기는 그대로여야 한다');

    assert.deepEqual((await (await authFetch(base, c, '/friends/favorites')).json()).data, []);

    const bad = await authFetch(base, a, `/friends/favorites/${b}`, {
        method: 'PUT', body: JSON.stringify({ favorite: 'yes' }),
    });
    assert.equal(bad.status, 400);
    assert.equal(await countRows(db.FriendFavorite, { owner_id: a, friend_id: b }), 1);
});

test('AC-04: 차단하면 양방향 친구 신청이 거부되고 해제 권한은 소유자에게만 있다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);
    const base = await startRouteServer(t);

    const a = await createLocalUser('blk-a');
    const b = await createLocalUser('blk-b');
    const c = await createLocalUser('blk-c');

    const blocked = await authFetch(base, a, '/friends/blocks', {
        method: 'POST', body: JSON.stringify({ targetId: b }),
    });
    assert.equal(blocked.status, 200);

    await assert.rejects(() => friendService.sendFriendRequest(a, b), (error) => error.status === 403);
    await assert.rejects(() => friendService.sendFriendRequest(b, a), (error) => error.status === 403);
    assert.equal(await countRows(db.FriendRequest, {}), 0, '거부된 신청은 행을 만들지 않는다');

    const mine = await (await authFetch(base, a, '/friends/blocks')).json();
    assert.deepEqual(mine.data.map((row) => row.id), [b]);
    assert.deepEqual((await (await authFetch(base, b, '/friends/blocks')).json()).data, []);

    assert.equal((await authFetch(base, c, `/friends/blocks/${b}`, { method: 'DELETE' })).status, 404);
    assert.equal((await authFetch(base, b, `/friends/blocks/${b}`, { method: 'DELETE' })).status, 404);
    assert.equal(await countRows(db.FriendBlock, { owner_id: a, blocked_id: b }), 1);

    assert.equal((await authFetch(base, a, `/friends/blocks/${b}`, { method: 'DELETE' })).status, 200);
    assert.equal(await countRows(db.FriendBlock, { owner_id: a, blocked_id: b }), 0);

    const request = await friendService.sendFriendRequest(a, b);
    assert.ok(Number.isInteger(request.id));
});

test('AC-05: 차단은 PENDING 요청·초대만 무효화하고 친구 관계·즐겨찾기 원본은 보존한다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);
    const base = await startRouteServer(t);

    const a = await createLocalUser('inv-a');
    const b = await createLocalUser('inv-b');
    const c = await createLocalUser('inv-c');

    await befriend(a, b);
    await befriend(a, c);
    await friendService.setFriendFavorite(a, b, true);

    placeInRoom(a, 'room-invalidate');
    await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'key-1' });

    const unrelated = await friendService.sendFriendRequest(c, b);

    const friendshipsBefore = await countRows(db.Friendship, {});
    assert.equal(await countRows(db.GameInvite, { status: 'PENDING' }), 1);

    await authFetch(base, a, '/friends/blocks', { method: 'POST', body: JSON.stringify({ targetId: b }) });

    const invite = await db.GameInvite.findOne({ where: { sender_id: a, receiver_id: b } });
    assert.equal(invite.status, 'CANCELLED');
    assert.equal(invite.end_reason, 'BLOCKED');
    assert.equal(invite.revision, 2);

    assert.equal(await countRows(db.Friendship, {}), friendshipsBefore);
    assert.equal(await countRows(db.FriendFavorite, { owner_id: a, friend_id: b }), 1);

    await unrelated.reload();
    assert.equal(unrelated.status, 'PENDING');

    const duringBlock = await (await authFetch(base, a, '/friends')).json();
    assert.deepEqual(duringBlock.data.map((friend) => friend.id), [c]);

    await assert.rejects(
        () => gameInviteService.recordAcceptDecision({
            receiverId: b, inviteId: invite.id, attemptId: 'attempt-blocked', bootEpoch: roomAccess.bootEpoch,
        }),
        (error) => error.status === 409 || error.status === 403,
    );

    await authFetch(base, a, `/friends/blocks/${b}`, { method: 'DELETE' });
    await invite.reload();
    assert.equal(invite.status, 'CANCELLED', '해제만으로 초대가 PENDING으로 돌아오면 안 된다');
    assert.equal(await countRows(db.GameInvite, { status: 'PENDING' }), 0);

    const afterUnblock = await (await authFetch(base, a, '/friends')).json();
    assert.deepEqual(afterUnblock.data.map((friend) => friend.id).sort(), [b, c].sort());
    assert.equal(afterUnblock.data.find((friend) => friend.id === b).isFavorite, true);
});

test('AC-05: 차단은 PENDING 친구 요청을 CANCELLED로 확정하고 행을 지우지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);
    const base = await startRouteServer(t);

    const a = await createLocalUser('req-a');
    const b = await createLocalUser('req-b');

    const pending = await friendService.sendFriendRequest(b, a);
    assert.equal(await countRows(db.FriendRequest, { status: 'PENDING' }), 1);

    await authFetch(base, a, '/friends/blocks', { method: 'POST', body: JSON.stringify({ targetId: b }) });

    await pending.reload();
    assert.equal(pending.status, 'CANCELLED');
    assert.ok(pending.responded_at !== null);
    assert.equal(await countRows(db.FriendRequest, {}), 1, '이력 행은 보존한다');

    await authFetch(base, a, `/friends/blocks/${b}`, { method: 'DELETE' });
    await pending.reload();
    assert.equal(pending.status, 'CANCELLED');
    assert.equal(await countRows(db.FriendRequest, { status: 'PENDING' }), 0);
});

test('AC-06/AC-07: 초대 생성은 행·알림·신규 사건을 하나씩 만들고 같은 키 재시도는 늘리지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('crt-a');
    const b = await createLocalUser('crt-b');
    await befriend(a, b);
    placeInRoom(a, 'room-create');

    emitted = [];
    const first = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'key-idem' });
    assert.equal(first.created, true);

    assert.equal(Object.hasOwn(first.invite, 'roomId'), false);
    assert.equal(Object.hasOwn(first.invite, 'roomCode'), false);
    assert.equal(first.invite.receiverId, b);
    assert.equal(first.invite.status, 'PENDING');
    assert.equal(typeof first.invite.creationSeq, 'string', 'BIGINT 순번은 문자열로 나가야 한다');

    assert.equal(await countRows(db.GameInvite, {}), 1);
    const inviteNotificationWhere = {
        user_id: b, source_key: notificationService.gameInviteSourceKey(first.invite.inviteId),
    };
    const notification = await db.Notification.findOne({ where: inviteNotificationWhere });
    assert.equal(notification.type, 'game-invite');
    assert.equal(notification.source_key, notificationService.gameInviteSourceKey(first.invite.inviteId));
    assert.deepEqual(notification.target, { kind: 'game-invite', inviteId: first.invite.inviteId });

    const received = eventsNamed('game_invite_received');
    assert.equal(received.length, 1);
    assert.equal(received[0].userId, b);
    assert.equal(received[0].payload.sfxEvent.kind, 'game-invite');
    assert.equal(received[0].payload.sfxEvent.accountId, b);
    assert.equal(
        received[0].payload.sfxEvent.eventId,
        notificationService.gameInviteSourceKey(first.invite.inviteId),
    );
    const created = eventsNamed('notification_created');
    assert.equal(created.length, 1);
    assert.equal(Object.hasOwn(created[0].payload, 'sfxEvent'), false, '초대 알림에는 소리 봉투가 없다');

    emitted = [];
    const retry = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'key-idem' });
    assert.equal(retry.created, false);
    assert.equal(retry.invite.inviteId, first.invite.inviteId);
    assert.equal(await countRows(db.GameInvite, {}), 1);
    assert.equal(await countRows(db.Notification, inviteNotificationWhere), 1);
    assert.equal(await countRows(db.Notification, { user_id: b, type: 'friend-request' }), 1, '친구 신청 알림도 보존된다');
    assert.equal(emitted.length, 0, '재시도는 신규 수신 사건을 재발행하지 않는다');
});

test('AC-06: 같은 생성 키에 다른 대상을 실어 보내면 충돌이다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('key-a');
    const b = await createLocalUser('key-b');
    const c = await createLocalUser('key-c');
    await befriend(a, b);
    await befriend(a, c);
    placeInRoom(a, 'room-key');

    await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'same-key' });

    await assert.rejects(
        () => gameInviteService.createInvite({ senderId: a, receiverId: c, creationKey: 'same-key' }),
        (error) => error.status === 409,
    );
    assert.equal(await countRows(db.GameInvite, {}), 1);
});

test('AC-04/AC-06: 친구가 아니거나 차단 관계면 초대가 만들어지지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('den-a');
    const b = await createLocalUser('den-b');
    const stranger = await createLocalUser('den-s');
    await befriend(a, b);
    placeInRoom(a, 'room-deny');

    await assert.rejects(
        () => gameInviteService.createInvite({ senderId: a, receiverId: stranger, creationKey: 'k1' }),
        (error) => error.status === 403,
    );

    await friendService.blockUser(b, a);
    await assert.rejects(
        () => gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'k2' }),
        (error) => error.status === 403,
    );

    assert.equal(await countRows(db.GameInvite, {}), 0);
});

test('AC-06: 발송자에게 현재 방이 없으면 초대를 만들지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('nor-a');
    const b = await createLocalUser('nor-b');
    await befriend(a, b);

    await assert.rejects(
        () => gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'k' }),
        (error) => error.status === 409,
    );
    assert.equal(await countRows(db.GameInvite, {}), 0);
});

test('AC-06: 잠금을 잡은 뒤 발송자의 방이 바뀌면 초대를 만들지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('mid-a');
    const b = await createLocalUser('mid-b');
    await befriend(a, b);
    placeInRoom(a, 'room-mid');

    const originalAvailability = roomAccess.describeReceiverAvailability;
    roomAccess.describeReceiverAvailability = () => {
        roomAccess.userRoom.delete(a);
        roomAccess.rooms.delete('room-mid');
        return { available: true };
    };
    t.after(() => { roomAccess.describeReceiverAvailability = originalAvailability; });

    emitted = [];
    await assert.rejects(
        () => gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'k-mid' }),
        (error) => error.status === 409,
    );
    assert.equal(await countRows(db.GameInvite, {}), 0, '없는 방의 초대가 durable해지면 안 된다');
    assert.equal(await countRows(db.Notification, { user_id: b, type: 'game-invite' }), 0);
    assert.equal(eventsNamed('game_invite_received').length, 0);
});

test('AC-06: 같은 방으로 아직 살아 있는 초대가 있으면 새 키여도 두 번째 초대를 만들지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('dup-a');
    const b = await createLocalUser('dup-b');
    await befriend(a, b);
    placeInRoom(a, 'room-dup');

    const first = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'send-1' });
    assert.equal(first.created, true);

    emitted = [];
    const second = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'send-2' });

    assert.equal(second.created, false);
    assert.equal(second.invite.inviteId, first.invite.inviteId, '살아 있는 초대를 그대로 돌려줘야 한다');
    assert.equal(await countRows(db.GameInvite, {}), 1);
    assert.equal(await countRows(db.Notification, { user_id: b, type: 'game-invite' }), 1);
    assert.equal(eventsNamed('game_invite_received').length, 0, '두 번째 소리가 나면 안 된다');

    await gameInviteService.declineInvite(b, first.invite.inviteId);
    emitted = [];
    const third = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'send-3' });

    assert.equal(third.created, true, '종료된 초대 뒤의 재초대가 막히면 안 된다');
    assert.notEqual(third.invite.inviteId, first.invite.inviteId);
    assert.equal(await countRows(db.GameInvite, {}), 2);
    assert.equal(eventsNamed('game_invite_received').length, 1);
});

test('AC-04/AC-06: 차단과 초대 생성이 겹쳐도 차단된 쌍에 PENDING 초대가 남지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('race-a');
    const b = await createLocalUser('race-b');
    await befriend(a, b);
    placeInRoom(a, 'room-race');

    await Promise.allSettled([
        gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'race-key' }),
        friendService.blockUser(b, a),
    ]);

    const blocks = await countRows(db.FriendBlock, { owner_id: b, blocked_id: a });
    assert.equal(blocks, 1, '차단은 확정돼야 한다');
    assert.equal(
        await countRows(db.GameInvite, { sender_id: a, receiver_id: b, status: 'PENDING' }), 0,
        '차단된 쌍에 처리 가능한 초대가 남으면 차단이 무의미해진다',
    );
});

test('AC-04/AC-05: 차단과 해제가 겹쳐도 취소된 요청이 PENDING으로 되살아나지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('ub-a');
    const b = await createLocalUser('ub-b');
    await friendService.sendFriendRequest(a, b);
    assert.equal(await countRows(db.FriendRequest, { status: 'PENDING' }), 1);

    await friendService.blockUser(b, a);
    await Promise.allSettled([
        friendService.unblockUser(b, a),
        friendService.blockUser(b, a).catch(() => null),
    ]);

    assert.equal(
        await countRows(db.FriendRequest, { status: 'PENDING' }), 0,
        '해제만으로 CANCELLED가 PENDING으로 돌아가면 안 된다',
    );
    assert.equal(await countRows(db.FriendRequest, { status: 'CANCELLED' }), 1, '이력 행은 지우지 않는다');

    await assert.rejects(() => friendService.unblockUser(a, b), (error) => error.status === 404);
});

test('AC-07: snapshot 커서는 종료된 초대까지 포함한 최대 순번이다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('cur-a');
    const b = await createLocalUser('cur-b');
    const s = await createLocalUser('cur-s');
    await befriend(a, b);
    await befriend(s, b);
    placeInRoom(a, 'room-cursor');
    placeInRoom(s, 'room-cursor-2');

    const first = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'c1' });
    const second = await gameInviteService.createInvite({ senderId: s, receiverId: b, creationKey: 'c2' });

    assert.equal(first.created, true);
    assert.equal(second.created, true);
    assert.notEqual(
        second.invite.inviteId, first.invite.inviteId,
        '두 초대가 같은 행이면 아래의 "종료된 초대까지 포함한 최대 순번" 단정이 성립하지 않는다',
    );
    assert.equal(
        gameInviteService.compareSeq(second.invite.creationSeq, first.invite.creationSeq) > 0, true,
        '나중에 만든 초대의 생성 순번이 더 커야 한다',
    );

    await gameInviteService.declineInvite(b, second.invite.inviteId);

    const snapshot = await gameInviteService.getReceiverSnapshot(b);
    assert.deepEqual(snapshot.invites.map((row) => row.inviteId), [first.invite.inviteId],
        'PENDING만 목록에 남는다');
    assert.equal(
        snapshot.cursor, second.invite.creationSeq,
        '커서는 종료된 초대까지 포함한 전체 최대 순번이어야 한다 — PENDING 최댓값이면 끝난 초대가 새 사건으로 오인된다',
    );
    assert.equal(gameInviteService.compareSeq(snapshot.cursor, first.invite.creationSeq) > 0, true);

    const outsider = await createLocalUser('cur-c');
    await assert.rejects(
        () => gameInviteService.getInviteForUser(outsider, first.invite.inviteId),
        (error) => error.status === 404,
    );
});

test('AC-06: 만료는 서버 시각으로 조회 경계에서 멱등하게 확정된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('exp-a');
    const b = await createLocalUser('exp-b');
    await befriend(a, b);
    placeInRoom(a, 'room-expire');

    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'e1' });

    clockMs += gameInviteService.INVITE_TTL_MS + 1000;

    const snapshot = await gameInviteService.getReceiverSnapshot(b);
    assert.deepEqual(snapshot.invites, [], '만료된 초대는 목록에서 빠진다');

    const row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.status, 'EXPIRED');
    assert.equal(row.end_reason, 'EXPIRED');
    assert.equal(row.revision, 2, '만료 확정도 revision을 올린다');

    await gameInviteService.getReceiverSnapshot(b);
    await row.reload();
    assert.equal(row.revision, 2);

    await assert.rejects(
        () => gameInviteService.recordAcceptDecision({
            receiverId: b, inviteId: invite.inviteId, attemptId: 'a1', bootEpoch: roomAccess.bootEpoch,
        }),
        (error) => error.status === 409,
    );
});

test('AC-06: 거절은 멱등이고 이미 수락된 초대를 뒤집지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('dec-a');
    const b = await createLocalUser('dec-b');
    await befriend(a, b);
    placeInRoom(a, 'room-decline');

    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'd1' });

    const declined = await gameInviteService.declineInvite(b, invite.inviteId);
    assert.equal(declined.status, 'DECLINED');
    assert.equal(declined.revision, 2);

    const again = await gameInviteService.declineInvite(b, invite.inviteId);
    assert.equal(again.status, 'DECLINED');
    assert.equal(again.revision, 2, '멱등 거절이 revision을 더 올리면 안 된다');

    await assert.rejects(
        () => gameInviteService.declineInvite(a, invite.inviteId),
        (error) => error.status === 404,
    );
});

test('A-10: 수락 결정과 영수증이 두 단계로 확정된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('acc-a');
    const b = await createLocalUser('acc-b');
    await befriend(a, b);
    placeInRoom(a, 'room-accept');

    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'acc' });

    const decision = await gameInviteService.recordAcceptDecision({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-1', bootEpoch: roomAccess.bootEpoch,
    });
    assert.equal(decision.ok, true);
    assert.equal(decision.roomId, 'room-accept');

    let row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.status, 'ACCEPTED');
    assert.equal(row.attempt_id, 'attempt-1');
    assert.equal(row.entry_outcome, 'UNCONFIRMED');

    const resumed = await gameInviteService.recordAcceptDecision({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-1', bootEpoch: roomAccess.bootEpoch,
    });
    assert.equal(resumed.resumed, true);

    let publishCalls = 0;
    const finalized = await gameInviteService.finalizeAcceptedEntry({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-1', bootEpoch: roomAccess.bootEpoch,
        publish: () => { publishCalls += 1; return { ok: true }; },
        unpublish: () => { assert.fail('성공 경로에서 보상이 불려서는 안 된다'); },
    });
    assert.equal(finalized.ok, true);
    assert.equal(publishCalls, 1);

    row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.entry_outcome, 'PUBLISHED');

    const outcome = await gameInviteService.getAttemptOutcome({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-1',
    });
    assert.equal(outcome.entryOutcome, 'PUBLISHED');
    assert.equal(outcome.roomId, 'room-accept');
    assert.equal(outcome.bootEpoch, roomAccess.bootEpoch);

    const stale = await gameInviteService.getAttemptOutcome({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-other',
    });
    assert.equal(stale.staleAttempt, true);

    assert.equal(
        await gameInviteService.recordEntryInterrupted({
            inviteId: invite.inviteId, attemptId: 'attempt-1', reason: 'LATE',
        }),
        false,
    );
    row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.entry_outcome, 'PUBLISHED');
});

test('A-10/RESULT-3: 보상은 확정 커밋과 겹쳐도 PUBLISHED를 덮지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('race-a');
    const b = await createLocalUser('race-b');
    await befriend(a, b);
    placeInRoom(a, 'room-race');

    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'race' });
    await gameInviteService.recordAcceptDecision({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-race', bootEpoch: roomAccess.bootEpoch,
    });

    const tx = await sequelize.transaction();
    await db.GameInvite.update(
        { entry_outcome: 'PUBLISHED' },
        { where: { id: invite.inviteId }, transaction: tx },
    );

    const dirtyView = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(
        dirtyView.entry_outcome, 'UNCONFIRMED',
        '커밋 전 비잠금 읽기가 이미 PUBLISHED면 이 시험은 경합 창을 만들지 못한 것이다',
    );

    const compensating = gameInviteService.recordEntryInterrupted({
        inviteId: invite.inviteId, attemptId: 'attempt-race', reason: 'JOIN_TIMEOUT',
    });
    await tx.commit();

    assert.equal(
        await compensating, false,
        '확정된 영수증 위에 보상이 성공을 주장하면 안 된다',
    );
    let row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.entry_outcome, 'PUBLISHED', '보상이 확정된 publication 영수증을 덮었다');

    const { invite: second } = await gameInviteService.createInvite({
        senderId: a, receiverId: b, creationKey: 'race-2',
    });
    await gameInviteService.recordAcceptDecision({
        receiverId: b, inviteId: second.inviteId, attemptId: 'attempt-live', bootEpoch: roomAccess.bootEpoch,
    });
    assert.equal(
        await gameInviteService.recordEntryInterrupted({
            inviteId: second.inviteId, attemptId: 'attempt-live', reason: 'JOIN_TIMEOUT',
        }),
        true,
        '정상 보상까지 막으면 실패한 입장이 UNCONFIRMED로 영원히 남는다',
    );
    row = await db.GameInvite.findOne({ where: { id: second.inviteId } });
    assert.equal(row.entry_outcome, 'INTERRUPTED');
    assert.equal(row.end_reason, 'JOIN_TIMEOUT');
    assert.equal(row.status, 'ACCEPTED', '역사적 수락 결정은 보상으로 되돌리지 않는다');

    assert.equal(
        await gameInviteService.recordEntryInterrupted({
            inviteId: second.inviteId, attemptId: 'attempt-live', reason: 'OTHER',
        }),
        false,
    );
    assert.equal(
        (await db.GameInvite.findOne({ where: { id: second.inviteId } })).end_reason, 'JOIN_TIMEOUT',
        '두 번째 보상이 사유를 덮어쓰면 최초 중단 원인을 잃는다',
    );

    await db.GameInvite.update(
        { attempt_id: 'attempt-new', entry_outcome: 'UNCONFIRMED' },
        { where: { id: second.inviteId } },
    );
    assert.equal(
        await gameInviteService.recordEntryInterrupted({
            inviteId: second.inviteId, attemptId: 'attempt-live', reason: 'LATE',
        }),
        false,
    );
    assert.equal(
        (await db.GameInvite.findOne({ where: { id: second.inviteId } })).entry_outcome, 'UNCONFIRMED',
        '옛 시도의 보상이 새 시도의 결과를 확정해 버리면 안 된다',
    );

    assert.equal(
        await gameInviteService.recordEntryInterrupted({ inviteId: second.inviteId, reason: 'NO_ATTEMPT' }),
        false,
    );
    assert.equal(
        (await db.GameInvite.findOne({ where: { id: second.inviteId } })).entry_outcome, 'UNCONFIRMED',
    );
});

test('A-10/상태표 5: 두 번째 잠금 전에 차단이 커밋되면 역사적 ACCEPTED는 남고 입장만 INTERRUPTED다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('int-a');
    const b = await createLocalUser('int-b');
    await befriend(a, b);
    placeInRoom(a, 'room-interrupt');

    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'int' });
    await gameInviteService.recordAcceptDecision({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-int', bootEpoch: roomAccess.bootEpoch,
    });

    await friendService.blockUser(a, b);

    let publishCalls = 0;
    const finalized = await gameInviteService.finalizeAcceptedEntry({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-int', bootEpoch: roomAccess.bootEpoch,
        publish: () => { publishCalls += 1; return { ok: true }; },
        unpublish: () => {},
    });

    assert.equal(finalized.ok, false);
    assert.equal(finalized.code, 'BLOCKED');
    assert.equal(publishCalls, 0, '차단이 확인되면 Map publication 자체가 일어나지 않는다');

    const row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.status, 'ACCEPTED', '역사적 수락 결정은 되돌리지 않는다');
    assert.equal(row.entry_outcome, 'INTERRUPTED');
    assert.equal(row.end_reason, 'BLOCKED_BEFORE_ENTRY');
});

test('AC-06: 조회 없이 만료 초대를 수락해도 EXPIRED가 커밋되고 재시도는 멱등하다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);
    const a = await createLocalUser('ed-a');
    const b = await createLocalUser('ed-b');
    await befriend(a, b);
    placeInRoom(a, 'room-expire-direct');
    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'expire-direct' });
    clockMs += gameInviteService.INVITE_TTL_MS + 1000;
    for (let retry = 0; retry < 2; retry += 1) {
        await assert.rejects(
            () => gameInviteService.recordAcceptDecision({ receiverId: b, inviteId: invite.inviteId,
                attemptId: 'expired-attempt', bootEpoch: roomAccess.bootEpoch }),
            (error) => error.status === 409 && error.code === 'EXPIRED',
        );
        const row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
        assert.equal(row.status, 'EXPIRED');
        assert.equal(row.end_reason, 'EXPIRED');
        assert.equal(row.revision, 2);
        assert.equal(row.attempt_id, null);
        assert.equal(row.entry_outcome, null);
    }
});

test('A-11: 옛 boot epoch의 초대는 수락 결정 자체가 거부되고 CANCELLED로 확정된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('boot-a');
    const b = await createLocalUser('boot-b');
    await befriend(a, b);
    placeInRoom(a, 'room-boot');

    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'boot' });

    await assert.rejects(
        () => gameInviteService.recordAcceptDecision({
            receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-boot', bootEpoch: 'boot-different',
        }),
        (error) => error.status === 409 && error.code === 'SERVER_RESTARTED',
    );

    const row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.status, 'CANCELLED');
    assert.equal(row.end_reason, 'SERVER_RESTARTED');
    assert.equal(row.revision, 2);
    assert.equal(row.attempt_id, null);
    assert.equal(row.entry_outcome, null, '입장 영수증은 만들어지지 않는다');
});

test('AC-06: 방이 사라지면 그 방의 PENDING 초대가 종료된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('rm-a');
    const b = await createLocalUser('rm-b');
    const c = await createLocalUser('rm-c');
    await befriend(a, b);
    await befriend(a, c);
    placeInRoom(a, 'room-gone');

    const gone = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'g1' });

    placeInRoom(a, 'room-alive');
    const alive = await gameInviteService.createInvite({ senderId: a, receiverId: c, creationKey: 'g2' });

    emitted = [];
    const cancelled = await gameInviteService.cancelPendingInvitesForRoom('room-gone', 'ROOM_DELETED');
    assert.deepEqual(cancelled, [gone.invite.inviteId]);

    const goneRow = await db.GameInvite.findOne({ where: { id: gone.invite.inviteId } });
    assert.equal(goneRow.status, 'CANCELLED');
    assert.equal(goneRow.end_reason, 'ROOM_DELETED');

    const aliveRow = await db.GameInvite.findOne({ where: { id: alive.invite.inviteId } });
    assert.equal(aliveRow.status, 'PENDING');

    const updates = eventsNamed('game_invite_updated');
    assert.ok(updates.length > 0);
    for (const update of updates) {
        assert.equal(Object.hasOwn(update.payload, 'sfxEvent'), false);
    }
    assert.equal(eventsNamed('game_invite_received').length, 0);
});


test('review5 RR: block committed after initial read must prevent finalization', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);
    const a = await createLocalUser('rr-a');
    const b = await createLocalUser('rr-b');
    await befriend(a, b);
    placeInRoom(a, 'room-rr-block');
    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'rr-block' });
    await gameInviteService.recordAcceptDecision({ receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-rr', bootEpoch: roomAccess.bootEpoch });
    const repository = require('../../repositories/friend.repositories');
    const original = repository.lockAccountsInOrder;
    let held = false;
    repository.lockAccountsInOrder = async function(...args) {
        if (!held) {
            held = true;
            await friendService.blockUser(a, b);
        }
        return original.apply(this, args);
    };
    t.after(() => { repository.lockAccountsInOrder = original; });
    let published = 0;
    const result = await gameInviteService.finalizeAcceptedEntry({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-rr', bootEpoch: roomAccess.bootEpoch,
        publish: () => { published++; return { ok: true }; }, unpublish: () => {},
    });
    assert.equal(held, true);
    assert.equal(result.code, 'BLOCKED');
    assert.equal(published, 0);
    const row = await db.GameInvite.findByPk(invite.inviteId);
    assert.equal(row.status, 'ACCEPTED');
    assert.equal(row.entry_outcome, 'INTERRUPTED');
});


test('review5 migration: preserve existing CANCELLED history when normalizing cross pending', async (t) => {
    if (unavailable(t)) return;
    await setUpBareSchema(t);
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS.slice(0, F19_MIGRATION_INDEX) });
    const a = await createLocalUserBeforeReset('mh-a');
    const b = await createLocalUserBeforeReset('mh-b');
    const history = await db.FriendRequest.create({ requester_id: b, receiver_id: a, status: 'CANCELLED' });
    const keep = await db.FriendRequest.create({ requester_id: a, receiver_id: b, status: 'PENDING' });
    const cross = await db.FriendRequest.create({ requester_id: b, receiver_id: a, status: 'PENDING' });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.equal(await countRows(db.FriendRequest, {}), 3);
    assert.equal((await db.FriendRequest.findByPk(history.id)).status, 'CANCELLED');
    assert.equal((await db.FriendRequest.findByPk(keep.id)).status, 'PENDING');
    assert.equal((await db.FriendRequest.findByPk(cross.id)).status, 'CANCELLED');
    await addF19FriendsInvites.up(sequelize.getQueryInterface(), Sequelize, sequelize);
    await addF19FriendsInvites.verify(sequelize.getQueryInterface());
    assert.equal(await countRows(db.FriendRequest, {}), 3, 'rerun retains every history row');
});


test('review5 RR: block during decision lock acquisition preserves cancellation', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);
    const a = await createLocalUser('rd-a');
    const b = await createLocalUser('rd-b');
    await befriend(a, b);
    placeInRoom(a, 'room-rr-decision');
    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'rr-decision' });
    const repository = require('../../repositories/friend.repositories');
    const original = repository.lockAccountsInOrder;
    let paused = false;
    repository.lockAccountsInOrder = async function(...args) {
        if (!paused) { paused = true; await friendService.blockUser(a, b); }
        return original.apply(this, args);
    };
    t.after(() => { repository.lockAccountsInOrder = original; });
    await assert.rejects(() => gameInviteService.recordAcceptDecision({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-rd', bootEpoch: roomAccess.bootEpoch,
    }));
    assert.equal(paused, true);
    const row = await db.GameInvite.findByPk(invite.inviteId);
    assert.equal(row.status, 'CANCELLED');
    assert.equal(row.attempt_id, null);
});
