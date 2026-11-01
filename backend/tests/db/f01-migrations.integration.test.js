'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
if (TEST_DB_URL) process.env.DATABASE_URL = TEST_DB_URL;

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory];
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

const queryRows = async (sql, replacements) => {
    const [rows] = await sequelize.query(sql, { replacements });
    return rows;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

const backupDatabase = async () => {
    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    const dump = {};
    for (const table of tables) {
        const createRows = await queryRows(`SHOW CREATE TABLE \`${table}\``);
        const dataRows = await queryRows(`SELECT * FROM \`${table}\``);
        dump[table] = { createSql: createRows[0]['Create Table'], rows: dataRows };
    }
    return dump;
};

const restoreDatabaseInto = async (targetSequelize, dump) => {
    const queryInterface = targetSequelize.getQueryInterface();
    await targetSequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
        const existing = await queryInterface.showAllTables();
        for (const table of existing) await queryInterface.dropTable(table);
        for (const [table, { createSql }] of Object.entries(dump)) {
            await targetSequelize.query(createSql);
        }
        for (const [table, { rows }] of Object.entries(dump)) {
            if (rows.length > 0) await queryInterface.bulkInsert(table, rows);
        }
    } finally {
        await targetSequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    }
};

const restoreDatabase = (dump) => restoreDatabaseInto(sequelize, dump);

const createLegacyDatabaseSchema = async () => {
    const statements = [
        `CREATE TABLE users (
            uuid CHAR(36) NOT NULL PRIMARY KEY,
            password_hash VARCHAR(255) NOT NULL,
            nickname VARCHAR(50) NOT NULL,
            email VARCHAR(100) NOT NULL,
            phone VARCHAR(20) NULL,
            role VARCHAR(20) NULL DEFAULT 'USER',
            status VARCHAR(20) NULL DEFAULT 'ACTIVE',
            profile_image_url TEXT NULL,
            email_verified TINYINT(1) NULL DEFAULT 0,
            failed_login_count INT NULL DEFAULT 0,
            locked_until DATETIME NULL,
            last_login_at DATETIME NULL,
            birth_date DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            deleted_at DATETIME NULL,
            UNIQUE KEY users_nickname_unique (nickname),
            UNIQUE KEY users_email_unique (email)
        ) ENGINE=InnoDB`,
        `CREATE TABLE account_find_requests (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(100) NOT NULL,
            request_type VARCHAR(30) NULL,
            ip_address VARCHAR(45) NULL,
            created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB`,
        `CREATE TABLE password_reset_tokens (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id CHAR(36) NOT NULL,
            token VARCHAR(255) NOT NULL,
            expired_at DATETIME NOT NULL,
            used TINYINT(1) NULL DEFAULT 0,
            created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(uuid)
        ) ENGINE=InnoDB`,
        `CREATE TABLE user_sessions (
            id VARCHAR(255) NOT NULL PRIMARY KEY,
            user_id CHAR(36) NOT NULL,
            ip_address VARCHAR(45) NULL,
            connected_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
            last_ping_at DATETIME NULL,
            is_online TINYINT(1) NULL DEFAULT 1,
            CONSTRAINT fk_us_user FOREIGN KEY (user_id) REFERENCES users(uuid)
        ) ENGINE=InnoDB`,
        `CREATE TABLE user_bans (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id CHAR(36) NOT NULL,
            reason TEXT NULL,
            banned_by INT NULL,
            is_permanent TINYINT(1) NULL DEFAULT 0,
            start_at DATETIME NULL,
            end_at DATETIME NULL,
            created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_ub_user FOREIGN KEY (user_id) REFERENCES users(uuid)
        ) ENGINE=InnoDB`,
        `CREATE TABLE user_stats (
            user_id CHAR(36) NOT NULL PRIMARY KEY,
            reputation INT NULL DEFAULT 0,
            title VARCHAR(50) NULL DEFAULT '신참',
            total_games INT NULL DEFAULT 0,
            survival_count INT NULL DEFAULT 0,
            execution_count INT NULL DEFAULT 0,
            most_played_role VARCHAR(50) NULL,
            CONSTRAINT fk_ust_user FOREIGN KEY (user_id) REFERENCES users(uuid)
        ) ENGINE=InnoDB`,
        `CREATE TABLE login_history (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id CHAR(36) NOT NULL,
            ip_address VARCHAR(45) NULL,
            user_agent TEXT NULL,
            device_type VARCHAR(20) NULL,
            login_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
            logout_at DATETIME NULL,
            success TINYINT(1) NOT NULL,
            CONSTRAINT fk_lh_user FOREIGN KEY (user_id) REFERENCES users(uuid)
        ) ENGINE=InnoDB`,
        `CREATE TABLE online_presence (
            user_id CHAR(36) NOT NULL PRIMARY KEY,
            status VARCHAR(20) NULL DEFAULT 'ONLINE',
            last_active_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
            current_room_id INT NULL,
            CONSTRAINT fk_op_user FOREIGN KEY (user_id) REFERENCES users(uuid)
        ) ENGINE=InnoDB`,
        `CREATE TABLE friend_requests (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            requester_id CHAR(36) NOT NULL,
            receiver_id CHAR(36) NOT NULL,
            status VARCHAR(20) NULL DEFAULT 'PENDING',
            message TEXT NULL,
            created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
            responded_at DATETIME NULL,
            UNIQUE KEY friend_requests_requester_receiver_status (requester_id, receiver_id, status),
            CONSTRAINT fk_fr_requester FOREIGN KEY (requester_id) REFERENCES users(uuid),
            CONSTRAINT fk_fr_receiver FOREIGN KEY (receiver_id) REFERENCES users(uuid)
        ) ENGINE=InnoDB`,
        `CREATE TABLE friendships (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            requester_id CHAR(36) NOT NULL,
            receiver_id CHAR(36) NOT NULL,
            status VARCHAR(20) NULL DEFAULT 'ACCEPTED',
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE KEY friendships_requester_receiver (requester_id, receiver_id),
            CONSTRAINT fk_fs_requester FOREIGN KEY (requester_id) REFERENCES users(uuid),
            CONSTRAINT fk_fs_receiver FOREIGN KEY (receiver_id) REFERENCES users(uuid)
        ) ENGINE=InnoDB`,
        `CREATE TABLE traffic_logs (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            url TEXT NOT NULL,
            method VARCHAR(10) NOT NULL,
            response_status INT NULL,
            ip_address VARCHAR(45) NULL,
            response_time_ms INT NULL,
            accessed_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB`,
        `CREATE TABLE game_results (
            id CHAR(36) NOT NULL PRIMARY KEY,
            room_id CHAR(36) NULL,
            started_at DATETIME NOT NULL,
            ended_at DATETIME NOT NULL,
            winner VARCHAR(20) NOT NULL,
            win_reason VARCHAR(40) NULL,
            day_index INT NOT NULL,
            player_count INT NOT NULL,
            settings JSON NULL,
            completed TINYINT(1) NOT NULL DEFAULT 1
        ) ENGINE=InnoDB`,
        `CREATE TABLE game_result_players (
            game_id CHAR(36) NOT NULL,
            user_id CHAR(36) NOT NULL,
            nickname_snapshot VARCHAR(30) NOT NULL,
            role VARCHAR(20) NOT NULL,
            team VARCHAR(20) NOT NULL,
            won TINYINT(1) NULL,
            is_alive TINYINT(1) NOT NULL,
            death_reason VARCHAR(20) NULL,
            PRIMARY KEY (game_id, user_id),
            CONSTRAINT fk_grp_game FOREIGN KEY (game_id) REFERENCES game_results(id),
            CONSTRAINT fk_grp_user FOREIGN KEY (user_id) REFERENCES users(uuid)
        ) ENGINE=InnoDB`,
        `CREATE TABLE concurrent_snapshots (
            id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            captured_at DATETIME NOT NULL,
            total INT NOT NULL,
            lobby INT NOT NULL,
            in_game INT NOT NULL,
            room_count INT NOT NULL,
            KEY concurrent_snapshots_captured_at (captured_at)
        ) ENGINE=InnoDB`,
    ];
    for (const statement of statements) await sequelize.query(statement);
};

const LEGACY_FIXTURE = {
    user1: '66666666-6666-6666-6666-666666666666',
    user2: '77777777-7777-7777-7777-777777777777',
    gameId: '88888888-8888-8888-8888-888888888888',
};

const seedLegacyData = async () => {
    const { user1, user2, gameId } = LEGACY_FIXTURE;
    await sequelize.query(
        `INSERT INTO users (uuid, password_hash, nickname, email, phone, role, status, email_verified, failed_login_count, created_at, updated_at)
         VALUES (:user1, 'hash1', '보존유저1', 'preserve1@example.com', '010-0000-0001', 'USER', 'ACTIVE', true, 0, NOW(), NOW()),
                (:user2, 'hash2', '보존유저2', 'preserve2@example.com', '010-0000-0002', 'ADMIN', 'ACTIVE', false, 2, NOW(), NOW())`,
        { replacements: { user1, user2 } },
    );
    await sequelize.query(
        `INSERT INTO account_find_requests (email, request_type, ip_address) VALUES ('preserve1@example.com', 'ID', '127.0.0.1')`,
    );
    await sequelize.query(
        `INSERT INTO password_reset_tokens (user_id, token, expired_at, used) VALUES (:user1, 'legacy-token', NOW(), false)`,
        { replacements: { user1 } },
    );
    await sequelize.query(
        `INSERT INTO user_sessions (id, user_id, ip_address, is_online) VALUES ('legacy-session-1', :user1, '127.0.0.1', true)`,
        { replacements: { user1 } },
    );
    await sequelize.query(
        `INSERT INTO user_bans (user_id, reason, is_permanent) VALUES (:user2, '욕설', false)`,
        { replacements: { user2 } },
    );
    await sequelize.query(
        `INSERT INTO user_stats (user_id, reputation, title, total_games) VALUES (:user1, 42, '베테랑', 10)`,
        { replacements: { user1 } },
    );
    await sequelize.query(
        `INSERT INTO login_history (user_id, ip_address, success) VALUES (:user1, '127.0.0.1', true)`,
        { replacements: { user1 } },
    );
    await sequelize.query(
        `INSERT INTO online_presence (user_id, status) VALUES (:user1, 'ONLINE')`,
        { replacements: { user1 } },
    );
    await sequelize.query(
        `INSERT INTO friend_requests (requester_id, receiver_id, status) VALUES (:user1, :user2, 'PENDING')`,
        { replacements: { user1, user2 } },
    );
    await sequelize.query(
        `INSERT INTO friendships (requester_id, receiver_id, status, created_at, updated_at) VALUES (:user2, :user1, 'ACCEPTED', NOW(), NOW())`,
        { replacements: { user1, user2 } },
    );
    await sequelize.query(
        `INSERT INTO traffic_logs (url, method, response_status) VALUES ('/auth/login', 'POST', 200)`,
    );
    await sequelize.query(
        `INSERT INTO game_results (id, started_at, ended_at, winner, day_index, player_count, completed)
         VALUES (:gameId, NOW(), NOW(), 'CITIZEN', 3, 2, true)`,
        { replacements: { gameId } },
    );
    await sequelize.query(
        `INSERT INTO game_result_players (game_id, user_id, nickname_snapshot, role, team, won, is_alive)
         VALUES (:gameId, :user1, '보존유저1', 'CITIZEN', 'CITIZEN', true, true)`,
        { replacements: { gameId, user1 } },
    );
    await sequelize.query(
        `INSERT INTO concurrent_snapshots (captured_at, total, lobby, in_game, room_count) VALUES (NOW(), 10, 4, 6, 3)`,
    );
};

const captureAllRows = async () => {
    const snapshot = {};
    for (const table of baseline.TABLE_ORDER) {
        snapshot[table] = await queryRows(`SELECT * FROM \`${table}\` ORDER BY 1`);
    }
    return snapshot;
};

const buildAlternateDatabaseUrl = (url, suffix) => {
    const parsed = new URL(url);
    const originalDb = parsed.pathname.replace(/^\//, '');
    parsed.pathname = `/${originalDb}${suffix}`;
    return parsed.toString();
};

test('AC-01: 빈 DB에서 최초 마이그레이션 적용 시 14개 테이블이 모두 생성된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();

    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(applied, MIGRATIONS.map((m) => m.name));

    const tables = new Set(await sequelize.getQueryInterface().showAllTables());
    assert.equal(baseline.TABLE_ORDER.length, 14, '기준선 테이블 목록 자체가 14개여야 한다');
    for (const table of baseline.TABLE_ORDER) {
        assert.ok(tables.has(table), `${table}가 생성되지 않았습니다`);
    }
});

test('AC-02: 기존 데이터가 있는 DB에 마이그레이션을 적용해도 데이터가 보존된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();

    await createLegacyDatabaseSchema();
    await seedLegacyData();

    const beforeRows = await captureAllRows();
    assert.ok(beforeRows.users.length >= 2, '유저 데이터가 실제로 심어졌어야 한다');
    for (const table of baseline.TABLE_ORDER) {
        assert.ok(beforeRows[table].length >= 1, `${table}에 최소 1행은 심어져 있어야 AC-02가 의미 있다`);
    }

    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(applied, MIGRATIONS.map((m) => m.name));

    const NEW_USER_SESSION_COLUMNS = [
        'refresh_token_hash',
        'refresh_previous_hash',
        'refresh_previous_expires_at',
        'refresh_token_expires_at',
        'revoked_at',
    ];
    const afterRows = await captureAllRows();
    for (const table of baseline.TABLE_ORDER) {
        if (table === 'user_sessions') {
            assert.equal(afterRows[table].length, beforeRows[table].length,
                'user_sessions의 행 개수가 마이그레이션 전후로 같아야 한다');
            afterRows[table].forEach((afterRow, index) => {
                const beforeRow = beforeRows[table][index];
                const afterExistingColumnsOnly = { ...afterRow };
                for (const column of NEW_USER_SESSION_COLUMNS) delete afterExistingColumnsOnly[column];
                assert.deepEqual(afterExistingColumnsOnly, beforeRow,
                    `user_sessions의 기존 컬럼 값이 마이그레이션 전후로 완전히 같아야 한다(행 ${index})`);
                for (const column of NEW_USER_SESSION_COLUMNS) {
                    assert.equal(afterRow[column], null,
                        `user_sessions.${column}은 기존 행에 기본값 NULL로 채워져야 한다(행 ${index})`);
                }
            });
            continue;
        }
        assert.deepEqual(afterRows[table], beforeRows[table], `${table}의 전체 행이 마이그레이션 전후로 완전히 같아야 한다`);
    }
});

test('AC-03: 동일 마이그레이션을 반복 실행해도 오류 없이 동일한 최종 스키마가 유지된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();

    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const queryInterface = sequelize.getQueryInterface();
    const snapshotBefore = {};
    for (const table of baseline.TABLE_ORDER) snapshotBefore[table] = await queryInterface.describeTable(table);

    const { applied: appliedAgain } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(appliedAgain, [], '이미 적용된 마이그레이션은 재실행에서 건너뛰어야 한다');

    const snapshotAfter = {};
    for (const table of baseline.TABLE_ORDER) snapshotAfter[table] = await queryInterface.describeTable(table);
    assert.deepEqual(snapshotAfter, snapshotBefore, '반복 실행 후에도 스키마가 완전히 같아야 한다');

    const status = await migrationRunner.getStatus({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(
        status.map((s) => ({ name: s.name, status: s.status })),
        MIGRATIONS.map((m) => ({ name: m.name, status: 'applied' })),
        '적용된 4개 마이그레이션 각각의 이름과 상태가 정확히 일치해야 한다(0003/0004 추가분 포함)',
    );

    const historyRows = await queryRows(
        `SELECT name, COUNT(*) AS cnt FROM ${migrationRunner.META_TABLE} GROUP BY name`,
    );
    for (const row of historyRows) assert.equal(Number(row.cnt), 1, `${row.name} 이력이 중복되면 안 된다`);
});

test('F-03: 0003 마이그레이션이 user_sessions에 회전형 갱신 자격 컬럼을 추가하고, 재실행해도 데이터가 보존된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const queryInterface = sequelize.getQueryInterface();
    const table = await queryInterface.describeTable('user_sessions');
    for (const column of [
        'refresh_token_hash',
        'refresh_previous_hash',
        'refresh_previous_expires_at',
        'refresh_token_expires_at',
        'revoked_at',
    ]) {
        assert.ok(table[column], `user_sessions.${column} 컬럼이 있어야 한다`);
    }

    const userId = '55555555-5555-5555-5555-555555555555';
    await queryRows(
        `INSERT INTO users (uuid, password_hash, nickname, email, created_at, updated_at)
         VALUES (:uuid, 'hash', 'refresh-nick', 'refresh-nick@example.com', NOW(), NOW())`,
        { uuid: userId },
    );
    await queryRows(
        `INSERT INTO user_sessions (id, user_id, is_online, connected_at)
         VALUES ('sess-refresh-1', :uuid, true, NOW())`,
        { uuid: userId },
    );

    const { applied: appliedAgain } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(appliedAgain, [], '이미 적용된 0003도 재실행에서 건너뛰어야 한다');

    const preserved = await queryRows(`SELECT id, user_id FROM user_sessions WHERE id = 'sess-refresh-1'`);
    assert.equal(preserved.length, 1, '재실행 후에도 기존 세션 행이 보존되어야 한다');
    assert.equal(preserved[0].user_id, userId);
});

test('AC-04: 50자 닉네임이 실제 경기 저장 경로를 통해 잘리지 않고 저장된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const db = require('../../models');
    const { persistGameResult } = require('../helpers/persistGameResult');

    t.after(async () => {
        await db.sequelize.close();
    });

    const longNickname = '나'.repeat(50);
    const userId = '33333333-3333-3333-3333-333333333333';
    const gameId = '44444444-4444-4444-4444-444444444444';

    await sequelize.query(
        'INSERT INTO users (uuid, password_hash, nickname, email, role, status, email_verified, failed_login_count, created_at, updated_at) '
        + "VALUES (:uuid, 'hash', :nickname, 'long-nick@example.com', 'USER', 'ACTIVE', false, 0, NOW(), NOW())",
        { replacements: { uuid: userId, nickname: longNickname } },
    );
    await db.UserStats.create({ user_id: userId });

    const session = {
        id: gameId,
        roomId: null,
        startedAt: 1_000,
        endedAt: 2_000,
        dayIndex: 1,
        players: new Map([[userId, {
            uuid: userId, nickname: longNickname, role: 'CITIZEN', team: 'CITIZEN', alive: true, deathReason: null,
        }]]),
        winResult: { winner: 'CITIZEN' },
    };

    const outcome = await persistGameResult(session, { completed: true });
    assert.deepEqual(outcome, { persisted: true, gameId });

    const rows = await queryRows(
        'SELECT nickname_snapshot FROM game_result_players WHERE game_id = :gameId AND user_id = :userId',
        { gameId, userId },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].nickname_snapshot, longNickname);
    assert.equal(rows[0].nickname_snapshot.length, 50, '50자 그대로 저장되어야 한다(잘림 없음)');
});

const wrapWithHistoryWriteFailure = (realSequelize, { targetName, failStatus }) => new Proxy(realSequelize, {
    get(target, prop, receiver) {
        if (prop === 'query') {
            return async (sql, options = {}) => {
                const replacements = options.replacements || {};
                if (
                    typeof sql === 'string' &&
                    sql.trim().startsWith('UPDATE') &&
                    sql.includes(migrationRunner.META_TABLE) &&
                    replacements.name === targetName &&
                    replacements.status === failStatus
                ) {
                    throw new Error(`[테스트 주입] ${targetName}의 이력 쓰기(status=${failStatus}) 실패 — 실제 DB 오류를 흉내낸다`);
                }
                return target.query(sql, options);
            };
        }
        if (prop === 'constructor') return target.constructor;
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
    },
});

test('AC-05: DDL 부분 실패 후 전체 백업 복원으로 실패 이전 상태(14개 테이블 전부)를 완전히 되돌린다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await createLegacyDatabaseSchema();
    await seedLegacyData();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const backup = await backupDatabase();
    const beforeRows = await captureAllRows();

    const queryInterfaceForSchema = sequelize.getQueryInterface();
    const schemaBeforeFailure = {};
    for (const table of baseline.TABLE_ORDER) {
        schemaBeforeFailure[table] = await queryInterfaceForSchema.describeTable(table);
    }
    const historyBeforeFailure = await queryRows(`SELECT * FROM ${migrationRunner.META_TABLE} ORDER BY id`);

    const poisonMigration = {
        name: 'zz-test-poison-migration',
        async up(queryInterface, Sequelize) {
            await queryInterface.addColumn('users', 'poison_column', { type: Sequelize.STRING(10) });
            throw new Error('의도적으로 주입한 실패 — poison_column은 남고 이후 단계는 실행되지 않는다');
        },
    };

    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize, migrations: [...MIGRATIONS, poisonMigration] }),
        /의도적으로 주입한 실패/,
    );

    const failedStatus = await migrationRunner.getStatus({ sequelize, migrations: [poisonMigration] });
    assert.equal(failedStatus[0].status, 'failed');

    const usersAfterFailure = await sequelize.getQueryInterface().describeTable('users');
    assert.ok(usersAfterFailure.poison_column, '부분 DDL 흔적이 실제로 남아있어야 복구 절차의 필요성이 증명된다');

    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize, migrations: [...MIGRATIONS, poisonMigration] }),
        /실패 이력이 있어 무조건 재적용할 수 없습니다/,
    );

    const restoreCheckUrl = buildAlternateDatabaseUrl(TEST_DB_URL, '_restore_check');
    const restoreCheckDbName = new URL(restoreCheckUrl).pathname.replace(/^\//, '');
    try {
        await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${restoreCheckDbName}\``);
    } catch (error) {
        t.skip(`별도 격리 DB(CREATE DATABASE) 권한이 없어 AC-05의 독립 복구 검증을 할 수 없습니다 — 미검증: ${error.message}`);
        return;
    }

    const restoreCheckDb = new Sequelize(restoreCheckUrl, { logging: false });
    try {
        await restoreDatabaseInto(restoreCheckDb, backup);

        for (const table of baseline.TABLE_ORDER) {
            const [rows] = await restoreCheckDb.query(`SELECT * FROM \`${table}\` ORDER BY 1`);
            assert.deepEqual(rows, beforeRows[table], `별도 DB로 복원한 ${table}이 백업과 완전히 같아야 한다(전체 비교)`);
        }

        const checkUsersDescribe = await restoreCheckDb.getQueryInterface().describeTable('users');
        assert.ok(!checkUsersDescribe.poison_column, '별도 DB로 복원한 결과에는 부분 DDL 흔적이 없어야 한다');

        const checkStatus = await migrationRunner.getStatus({ sequelize: restoreCheckDb, migrations: MIGRATIONS });
        assert.deepEqual(
            checkStatus.map((s) => ({ name: s.name, status: s.status })),
            MIGRATIONS.map((m) => ({ name: m.name, status: 'applied' })),
            '별도 DB로 복원한 이력도 4개 마이그레이션의 이름·상태가 정확히 일치해야 한다',
        );
        const checkPoisonStatus = await migrationRunner.getStatus({ sequelize: restoreCheckDb, migrations: [poisonMigration] });
        assert.equal(checkPoisonStatus[0].status, 'pending', '백업은 poison 마이그레이션 시도 이전 시점이라 이력 자체가 없어야 한다');
    } finally {
        await restoreCheckDb.close();
        await sequelize.query(`DROP DATABASE IF EXISTS \`${restoreCheckDbName}\``);
    }

    await restoreDatabase(backup);

    const usersAfterRestore = await sequelize.getQueryInterface().describeTable('users');
    assert.ok(!usersAfterRestore.poison_column, '복원 후에는 부분 DDL 흔적이 사라져야 한다');

    const afterRestoreRows = await captureAllRows();
    for (const table of baseline.TABLE_ORDER) {
        assert.deepEqual(afterRestoreRows[table], beforeRows[table], `복원된 ${table}이 실패 이전 상태와 완전히 같아야 한다`);
    }

    const schemaAfterRestore = {};
    for (const table of baseline.TABLE_ORDER) {
        schemaAfterRestore[table] = await queryInterfaceForSchema.describeTable(table);
    }
    assert.deepEqual(schemaAfterRestore, schemaBeforeFailure, '복원 후 14개 테이블 전체 스키마가 실패 이전과 완전히 같아야 한다');

    const historyAfterRestore = await queryRows(`SELECT * FROM ${migrationRunner.META_TABLE} ORDER BY id`);
    assert.deepEqual(historyAfterRestore, historyBeforeFailure, '복원 후 schema_migrations 이력 값 전체가 실패 이전과 완전히 같아야 한다');

    const restoredStatus = await migrationRunner.getStatus({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(
        restoredStatus.map((s) => ({ name: s.name, status: s.status })),
        MIGRATIONS.map((m) => ({ name: m.name, status: 'applied' })),
        '복원된 DB는 실패 이전의 정상 이력(4개 마이그레이션 이름·상태)을 그대로 갖는다',
    );

    const restoredPoisonStatus = await migrationRunner.getStatus({ sequelize, migrations: [poisonMigration] });
    assert.equal(restoredPoisonStatus[0].status, 'pending', '전체 백업 복원은 실패 이력 자체를 지운다 — resolve-failure 불필요');
});

test('AC-05: DDL은 성공했지만 이력 기록이 실패하면 failed로 귀결되고, 부분 복구(resolveFailure)로 재적용 가능해진다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await createLegacyDatabaseSchema();
    await seedLegacyData();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const beforeRows = await captureAllRows();

    const historyWriteFailureName = 'zz-test-history-write-failure';
    const migrationWithGoodDdl = {
        name: historyWriteFailureName,
        async up(queryInterface, SequelizeCtor) {
            await queryInterface.addColumn('traffic_logs', 'diag_note', { type: SequelizeCtor.STRING(20) });
        },
    };

    const wrappedSequelize = wrapWithHistoryWriteFailure(sequelize, { targetName: historyWriteFailureName, failStatus: 'applied' });

    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize: wrappedSequelize, migrations: [...MIGRATIONS, migrationWithGoodDdl] }),
        /\[테스트 주입\]/,
    );

    const trafficLogsAfter = await sequelize.getQueryInterface().describeTable('traffic_logs');
    assert.ok(trafficLogsAfter.diag_note, 'DDL(addColumn)은 이력 쓰기 실패와 무관하게 이미 반영돼 있어야 한다');

    const afterInjectionRows = await captureAllRows();
    for (const table of baseline.TABLE_ORDER) {
        if (table === 'traffic_logs') continue;
        assert.deepEqual(afterInjectionRows[table], beforeRows[table], `${table}은 이력 쓰기 실패 시나리오에서 변경되지 않아야 한다`);
    }

    const trafficLogsOriginalColumns = Object.keys(beforeRows.traffic_logs[0] ?? {});
    assert.ok(trafficLogsOriginalColumns.length > 0, 'traffic_logs에 미리 심어둔 행이 있어야 이 비교가 의미 있다');
    const afterTrafficLogsOriginalColumnsOnly = afterInjectionRows.traffic_logs.map((row) => {
        const projected = {};
        for (const column of trafficLogsOriginalColumns) projected[column] = row[column];
        return projected;
    });
    assert.deepEqual(
        afterTrafficLogsOriginalColumnsOnly, beforeRows.traffic_logs,
        'traffic_logs의 기존 컬럼 값은 diag_note 추가와 무관하게 그대로 보존돼야 한다',
    );
    assert.ok(
        afterInjectionRows.traffic_logs.every((row) => row.diag_note === null),
        '새로 추가된 diag_note는 기존 행에 NULL로 채워져야 한다(값 유실이 아니라 스키마 확장이다)',
    );

    const failedStatus = await migrationRunner.getStatus({ sequelize, migrations: [migrationWithGoodDdl] });
    assert.equal(failedStatus[0].status, 'failed');
    assert.ok(failedStatus[0].error.includes('DDL은 성공'), 'DDL 성공 후 이력 쓰기만 실패했다는 사실이 남아야 복구 방식을 올바르게 고를 수 있다');

    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize, migrations: [...MIGRATIONS, migrationWithGoodDdl] }),
        /실패 이력이 있어 무조건 재적용할 수 없습니다/,
    );

    const { cleared, previousStatus } = await migrationRunner.resolveFailure({
        sequelize, name: historyWriteFailureName, confirmRecovered: true,
    });
    assert.equal(cleared, historyWriteFailureName);
    assert.equal(previousStatus, 'failed');

    const idempotentRetry = {
        name: historyWriteFailureName,
        async up(queryInterface) {
            const described = await queryInterface.describeTable('traffic_logs');
            if (!described.diag_note) throw new Error('diag_note가 있어야 할 상황인데 없습니다 — 테스트 전제가 깨졌습니다');
        },
    };
    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: [idempotentRetry] });
    assert.deepEqual(applied, [historyWriteFailureName]);
    const finalStatus = await migrationRunner.getStatus({ sequelize, migrations: [idempotentRetry] });
    assert.equal(finalStatus[0].status, 'applied');
});
