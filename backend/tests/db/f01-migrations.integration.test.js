'use strict';

// F-01 격리 DB 마이그레이션 검증 — AC-01~AC-05를 실제 프로젝트와 같은 DB 엔진(MySQL)의
// 격리 DB에서 검증한다.
//
// 이 스위트는 F01_TEST_DATABASE_URL 환경변수가 가리키는 전용 MySQL 데이터베이스에서만
// 동작한다. 이 값이 없거나 연결에 실패하면 각 테스트는 실패로 표시하지 않고 명시적으로
// skip하며, "미검증"임을 로그에 남긴다(격리 DB를 구할 수 없다고 통과를 꾸미지 않는다 — A-04).
// backend/.env.test의 기본 DATABASE_URL(더미 값)은 절대 이 용도로 재사용하지 않는다 —
// 그래서 별도 환경변수 이름을 쓴다.
//
// node --test는 파일마다 별도 프로세스로 격리해 실행하므로, 이 파일 안에서
// process.env.DATABASE_URL을 F01_TEST_DATABASE_URL로 덮어써도 다른 테스트 파일에는
// 영향을 주지 않는다. backend/models/index.js가 그 값을 읽어 연결을 만든다.

const test = require('node:test');
const assert = require('node:assert/strict');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
if (TEST_DB_URL) process.env.DATABASE_URL = TEST_DB_URL;

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
// F-03 R-IMPL #11: refresh_token_history는 user_sessions.id를 참조하는 자식 테이블이다.
// 이 스위트가 모르는 채로 두면(같은 격리 DB를 공유하는 f02/f03 DB 스위트가 이 테이블을
// 만든 뒤) resetSchema()가 "F-01이 모르는 테이블"로 오판해 진행을 거부한다 — 세 DB
// 스위트 모두 같은 관리 테이블/삭제 순서를 알아야 한다.
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
// F-05 R-IMPL(CODEX-2/VERIFY-10): external_identities/oauth_states/social_signup_intents도
// 같은 격리 DB를 공유한다 — f05-social-auth.integration.test.js가 만든 이 세 테이블을 이
// 스위트가 모르면 resetSchema()가 "모르는 테이블"로 오판해 거부한다. 관리 목록·드롭
// 순서·대상 DB 확인은 backend/tests/helpers/isolatedTestDb.js에 공통으로 모아 다섯 스위트
// (f01~f05, user.accountPaths)가 항상 같은 정의를 쓰게 한다.
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

// 격리 DB가 없으면 이 함수가 true를 돌려주며 t.skip으로 이유를 남긴다. 호출부는
// `if (unavailable(t)) return;`로 바로 빠져나간다 — 실패(fail)가 아니라 미검증(skip)이다.
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

// 매 테스트를 완전히 빈 스키마에서 시작한다. 대상 DB가 승인된 전용 테스트 DB가 아니거나,
// 우리가 모르는 테이블이 있으면(다른 앱/사람의 데이터일 위험) 진행을 거부한다.
const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

// SHOW CREATE TABLE + 전체 행을 떠서 SQL 레벨 백업을 만든다. 운영에서는 mysqldump로
// 같은 일을 하지만, 이 스위트는 외부 CLI 없이 같은 절차(스키마+데이터 전체 캡처 →
// 초기화 → 재생성 → 재적재)를 그대로 증명한다. 문서(runbook)는 이 로직을 mysqldump
// 명령으로 대응시켜 운영 절차로 옮긴다.
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

// ── 독립적인 "기존 프로덕션 DB" 시뮬레이션 (AC-02/AC-05 공용) ──────────────────────────
//
// 이전 회차 검토에서 "AC-02가 0001-legacy-baseline.js의 baseline.up()을 그대로 호출해
// '기존 DB'를 만들기 때문에, diffTable과 같은 코드로 만든 데이터를 같은 코드로 검증하는
// 자기 참조 테스트다"라는 지적을 받았다. 여기서는 buildDefinitions()/createTable()을
// 전혀 거치지 않고, raw SQL DDL로 14개 테이블을 독립적으로 만든다. 이 DDL은 실제 배포
// (backend/models/*.model.js를 sync({force:false})했을 때 생성되는 구조 — 컬럼 타입,
// NOT NULL, 기본값, users.nickname/email 유니크, friend_requests/friendships 복합
// 유니크, user_id류 컬럼의 실제 FK)를 손으로 옮겨 적은 것이다. game_result_players만
// nickname_snapshot을 0002 적용 전 상태(VARCHAR(30))로 만든다. 이 DDL이 0001의
// buildDefinitions()와 실제로 같은 구조를 기술하는지는 diffTable이 검증하고, 다르면
// AC-02/AC-05 테스트 자체가 (기존 DB 등록 거부로) 실패한다 — 즉 이 두 코드 경로가
// 갈라지면 테스트가 그 사실을 스스로 드러낸다.
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

// 14개 테이블 전체에 계정·인증·소셜·경기 도메인을 아우르는 데이터를 심는다. AC-02/AC-05가
// "몇 개 필드만"이 아니라 이 전체 데이터셋을 마이그레이션 전후로 비교한다.
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

// baseline.TABLE_ORDER의 14개 테이블 전체에서 전체 행을 PK 순으로 캡처한다. deepEqual로
// 마이그레이션 전후를 비교하기 위한 스냅샷.
const captureAllRows = async () => {
    const snapshot = {};
    for (const table of baseline.TABLE_ORDER) {
        snapshot[table] = await queryRows(`SELECT * FROM \`${table}\` ORDER BY 1`);
    }
    return snapshot;
};

// F01_TEST_DATABASE_URL의 데이터베이스 이름 부분만 바꿔 같은 서버의 다른(별도 격리) DB를
// 가리키는 URL을 만든다. AC-05가 백업을 "별도 격리 DB"에 먼저 복원해 대조하는 데 쓴다.
const buildAlternateDatabaseUrl = (url, suffix) => {
    const parsed = new URL(url);
    const originalDb = parsed.pathname.replace(/^\//, '');
    parsed.pathname = `/${originalDb}${suffix}`;
    return parsed.toString();
};

// ── AC-01 ───────────────────────────────────────────────────────────────────

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

// ── AC-02 ───────────────────────────────────────────────────────────────────

test('AC-02: 기존 데이터가 있는 DB에 마이그레이션을 적용해도 데이터가 보존된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();

    // "기존 배포"를 흉내낸다 — 0001-legacy-baseline.js의 buildDefinitions()/createTable()을
    // 전혀 거치지 않고, 독립적으로 작성한 raw SQL DDL(createLegacyDatabaseSchema)로 14개
    // 테이블을 만든다. 같은 코드로 만들고 같은 코드로 검증하는 자기 참조를 없애야 diffTable이
    // "진짜 기존 DB"를 올바르게 인식하는지 증명할 수 있다(이전 회차 검토 지적).
    await createLegacyDatabaseSchema();
    await seedLegacyData();

    const beforeRows = await captureAllRows();
    // 최소 한 테이블은 실제로 데이터를 심었어야 이 테스트가 "빈 테이블끼리 같다"는 착시로
    // 통과하지 않는다.
    assert.ok(beforeRows.users.length >= 2, '유저 데이터가 실제로 심어졌어야 한다');
    for (const table of baseline.TABLE_ORDER) {
        assert.ok(beforeRows[table].length >= 1, `${table}에 최소 1행은 심어져 있어야 AC-02가 의미 있다`);
    }

    // 이 시점에 schema_migrations이 없으므로, 0001을 적용하면 diffTable이 독립적으로 만든
    // 스키마와 buildDefinitions()를 대조해 "14개 모두 존재 + 구조 일치"로 판단하고
    // DDL 없이 기준선으로만 등록해야 한다. 구조가 하나라도 어긋나면(FK/유니크/기본값 포함)
    // 여기서 applyMigrations 자체가 reject되어 이 테스트가 실패한다.
    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(applied, MIGRATIONS.map((m) => m.name));

    // 값 자체는 마이그레이션으로 바뀌지 않는다(0002는 nickname_snapshot 컬럼 폭만 넓히고,
    // 0003은 user_sessions에 nullable 컬럼 5개만 더한다) — 14개 테이블 전체의 모든 행·모든
    // 컬럼이 마이그레이션 전후로 완전히 같아야 한다. 몇 개 필드만 뽑아 비교하던 이전 회차와
    // 달리, 계정(users/account_find_requests)·인증(password_reset_tokens/user_sessions/
    // user_bans/login_history)·소셜(friend_requests/friendships/online_presence/user_stats)·
    // 경기(game_results/game_result_players)·운영(traffic_logs/concurrent_snapshots) 전
    // 도메인을 포괄한다. user_sessions만은 0003이 추가한 5개 컬럼만큼 컬럼 집합 자체가
    // 늘어나는 것이 정상이므로(스키마 확장, 값 유실이 아님), 그 5개를 뺀 기존 컬럼 값이
    // 완전히 같은지와 새 컬럼이 기존 행에 기본값(NULL)으로 채워졌는지를 각각 확인한다.
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

// ── AC-03 ───────────────────────────────────────────────────────────────────

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

// ── F-03: 0003-add-refresh-token-rotation ─────────────────────────────────────

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

    // 기존 계정·세션 데이터가 컬럼 추가로 손실되지 않는지 확인한다(A-06).
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

// ── AC-04 ───────────────────────────────────────────────────────────────────

test('AC-04: 50자 닉네임이 실제 경기 저장 경로를 통해 잘리지 않고 저장된다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    // backend/models와 repositories는 require 캐시 싱글턴이라, 파일 맨 위에서 이미 맞춰둔
    // process.env.DATABASE_URL(F01_TEST_DATABASE_URL)로 처음 require되는 이 시점에 격리 DB에
    // 연결된다 — 실제 저장 경로(gameResult.repositories → game-core/gameSession)를 그대로 태운다.
    const db = require('../../models');
    const gameResultRepository = require('../../repositories/gameResult.repositories');

    t.after(async () => {
        await db.sequelize.close();
    });

    const longNickname = '나'.repeat(50);
    const userId = '33333333-3333-3333-3333-333333333333';
    const gameId = '44444444-4444-4444-4444-444444444444';

    // F-29b(0015) 회귀 대응: 이 스위트는 독립된 0001~0004 배열만 적용한다 — has_local_password는
    // 0015가 추가하므로 여기서는 아직 없다. db.User.create(런타임 모델)는 그 컬럼을 기본값과
    // 함께 INSERT하려다 "Unknown column" 오류를 낸다. 이 시점에 실제로 존재하는 컬럼만 raw
    // SQL로 직접 넣는다(모델 기본값에 기대지 않는다) — 0001~0004 본문은 건드리지 않는다.
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

    const outcome = await gameResultRepository.persistGameResult(session, { completed: true });
    assert.deepEqual(outcome, { persisted: true, gameId });

    const rows = await queryRows(
        'SELECT nickname_snapshot FROM game_result_players WHERE game_id = :gameId AND user_id = :userId',
        { gameId, userId },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].nickname_snapshot, longNickname);
    assert.equal(rows[0].nickname_snapshot.length, 50, '50자 그대로 저장되어야 한다(잘림 없음)');
});

// ── AC-05 ───────────────────────────────────────────────────────────────────
//
// 이전 회차 검토 지적 3가지를 각각 아래에서 다룬다:
//   1) "부분 DDL 실패만 주입하고 역사 쓰기 실패는 없다" → 두 번째 테스트가 DDL은 성공하지만
//      schema_migrations 기록(UPDATE) 자체가 실패하는 경로를 별도로 주입한다.
//   2) "전체 복구 비교가 없다" → 두 테스트 모두 14개 테이블 전체를 captureAllRows()로 비교한다.
//   3) "독립 복구 DB 생성이 실패해도 테스트가 계속 통과한다" → 첫 번째 테스트는 별도 DB 생성이
//      안 되면 그 지점에서 t.skip으로 멈춘다(부분 검증한 채 통과로 표시하지 않는다).
//   4) "runbook 복구 절차와 테스트가 불일치" → runbook 5절을 "전체 백업 복원"(resolve-failure
//      불필요 — schema_migrations도 함께 복원되므로)과 "부분 복구"(resolve-failure 필수) 두
//      경로로 나눠 기술하고, 아래 두 테스트가 각각을 그대로 실행한다.

// sequelize.query만 골라 가로채는 얇은 Proxy. migrationRunner의 findRow/insertRunningRow/
// markFinished/withLock은 모두 자신에게 주어진 sequelize.query(...)를 통해서만 schema_migrations를
// 건드리므로, 여기서 특정 UPDATE 한 건만 실패하도록 만들면 "DDL은 성공했지만 이력 기록만
// 실패"하는 시나리오를 실제 DB에 대고 재현할 수 있다. migration.up()에 전달되는 queryInterface는
// 원본 sequelize에 바인딩돼 있어 이 Proxy를 거치지 않으므로 DDL 자체는 정상적으로 실행된다.
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
        if (prop === 'constructor') return target.constructor; // 클래스 참조는 그대로 — bind하면 정적 프로퍼티 접근이 깨질 수 있다
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

    // 적용 전 백업(runbook 3절 1단계 / 5절 "전체 백업 복원" 경로). 실제 운영에서는 mysqldump로
    // 같은 일을 한다. 이 백업은 schema_migrations도 포함하므로, 복원하면 이력까지 함께 되돌아간다.
    const backup = await backupDatabase();
    const beforeRows = await captureAllRows();

    // 전체 스키마(describeTable)와 이력(schema_migrations) 값 전체도 실패 이전 시점에
    // 캡처한다 — 이전 회차는 데이터 행만 비교하고 스키마·이력 원복은 검증하지 않았다는
    // 지적을 받았다(재검토 지적). AC-03처럼 describeTable 스냅샷으로 스키마 구조 전체를,
    // schema_migrations는 id·checksum·상태·시각·오류메시지까지 전 컬럼을 비교한다.
    const queryInterfaceForSchema = sequelize.getQueryInterface();
    const schemaBeforeFailure = {};
    for (const table of baseline.TABLE_ORDER) {
        schemaBeforeFailure[table] = await queryInterfaceForSchema.describeTable(table);
    }
    const historyBeforeFailure = await queryRows(`SELECT * FROM ${migrationRunner.META_TABLE} ORDER BY id`);

    // 실패를 주입한다: 첫 DDL은 성공해 흔적을 남기고, 두 번째 단계에서 던진다 — MySQL DDL은
    // 트랜잭션으로 묶여도 암묵적 커밋을 일으키므로(A-05), 트랜잭션 롤백만으로는 이 흔적이
    // 지워지지 않는다는 것을 함께 보인다.
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

    // 실패가 schema_migrations에 기록되고, 부분 DDL 흔적(poison_column)이 실제로 남아 있어야
    // "실패 후 상태 대조"가 의미 있는 것이 증명된다.
    const failedStatus = await migrationRunner.getStatus({ sequelize, migrations: [poisonMigration] });
    assert.equal(failedStatus[0].status, 'failed');

    const usersAfterFailure = await sequelize.getQueryInterface().describeTable('users');
    assert.ok(usersAfterFailure.poison_column, '부분 DDL 흔적이 실제로 남아있어야 복구 절차의 필요성이 증명된다');

    // 무조건 재적용은 차단되어야 한다.
    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize, migrations: [...MIGRATIONS, poisonMigration] }),
        /실패 이력이 있어 무조건 재적용할 수 없습니다/,
    );

    // 복구 1단계: 장애난 DB를 직접 건드리기 전에, 별도의 격리 DB를 새로 만들어 백업을
    // 먼저 복원하고 데이터·스키마·이력이 실패 이전 상태와 같은지 대조한다. 이 단계는
    // AC-05의 필수 요구사항이다(계획: "적용 전 백업을 별도 격리 DB에 복원해 비교") — 이전
    // 회차는 CREATE DATABASE 권한이 없으면 이 단계를 건너뛰고도 테스트를 통과시켰는데,
    // 그러면 "독립적으로 검증했다"는 착시만 남고 실제로는 검증되지 않는다. 여기서는 권한이
    // 없으면 그 사실을 t.skip으로 명시해 "미검증"으로 남긴다(A-04와 같은 원칙).
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

    // 복구 2단계: 별도 DB에서 백업이 온전함을 확인했으니, 실제 장애난 DB 자체를 같은 백업으로 되돌린다.
    await restoreDatabase(backup);

    const usersAfterRestore = await sequelize.getQueryInterface().describeTable('users');
    assert.ok(!usersAfterRestore.poison_column, '복원 후에는 부분 DDL 흔적이 사라져야 한다');

    // 14개 테이블 전체·모든 행을 실패 이전 스냅샷과 비교한다 — users 한 테이블·몇 개 필드만
    // 보던 이전 회차와 달리 계정·인증·소셜·경기·운영 전 도메인이 대상이다.
    const afterRestoreRows = await captureAllRows();
    for (const table of baseline.TABLE_ORDER) {
        assert.deepEqual(afterRestoreRows[table], beforeRows[table], `복원된 ${table}이 실패 이전 상태와 완전히 같아야 한다`);
    }

    // 전체 스키마(describeTable) 자체도 실패 이전과 완전히 같아야 한다 — poison_column이
    // users에서 사라진 것은 위에서 개별 확인했지만, 그 확인만으로는 다른 13개 테이블의
    // 컬럼 타입·NOT NULL·기본키 등이 원복됐는지 증명하지 못한다(재검토 지적: "전체 스키마·
    // 이력 값의 원복 비교는 없다").
    const schemaAfterRestore = {};
    for (const table of baseline.TABLE_ORDER) {
        schemaAfterRestore[table] = await queryInterfaceForSchema.describeTable(table);
    }
    assert.deepEqual(schemaAfterRestore, schemaBeforeFailure, '복원 후 14개 테이블 전체 스키마가 실패 이전과 완전히 같아야 한다');

    // schema_migrations 이력도 상태(status) 필드만이 아니라 id·checksum·시각·오류메시지까지
    // 전체 값이 실패 이전과 완전히 같아야 한다.
    const historyAfterRestore = await queryRows(`SELECT * FROM ${migrationRunner.META_TABLE} ORDER BY id`);
    assert.deepEqual(historyAfterRestore, historyBeforeFailure, '복원 후 schema_migrations 이력 값 전체가 실패 이전과 완전히 같아야 한다');

    const restoredStatus = await migrationRunner.getStatus({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(
        restoredStatus.map((s) => ({ name: s.name, status: s.status })),
        MIGRATIONS.map((m) => ({ name: m.name, status: 'applied' })),
        '복원된 DB는 실패 이전의 정상 이력(4개 마이그레이션 이름·상태)을 그대로 갖는다',
    );

    // schema_migrations 자체가 백업에 포함돼 함께 복원되므로, poison 마이그레이션의 실패
    // 이력도 통째로 사라진다 — 이 경로(전체 백업 복원)에서는 resolveFailure를 호출할 필요가
    // 없다(runbook 5절 "경로 A"). 아래 두 번째 테스트가 resolveFailure가 필요한 경로(경로 B)를 다룬다.
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
    // 무해한 컬럼 추가 — DDL 자체는 문제없이 성공해야 "이력 쓰기만 실패"하는 시나리오가 된다.
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

    // DDL은 실제로 반영됐어야 한다 — MySQL DDL의 암묵적 커밋 때문에, "이력 기록 실패"는
    // "DDL 실패"와 달리 스키마 변경 자체를 되돌리지 않는다.
    const trafficLogsAfter = await sequelize.getQueryInterface().describeTable('traffic_logs');
    assert.ok(trafficLogsAfter.diag_note, 'DDL(addColumn)은 이력 쓰기 실패와 무관하게 이미 반영돼 있어야 한다');

    // 이 시나리오는 users/game_results 등 기존 데이터를 전혀 건드리지 않았으므로 그대로여야 한다
    // (14개 테이블 전체 비교). traffic_logs만은 예외다 — migrationWithGoodDdl이 의도적으로
    // diag_note 컬럼을 추가했으므로 SELECT *의 컬럼 집합 자체가 이전과 달라지는 것이 정상
    // 동작이다(추가된 컬럼이 있다는 사실 자체를 "변경되지 않아야 한다"로 비교하면 이 검사가
    // 항상 실패해 아래 복구(resolveFailure) 검증에 도달하지 못한다 — 재검토 지적). traffic_logs는
    // 대신 (a) diag_note를 제외한 원래 컬럼 값이 그대로인지, (b) 새로 생긴 diag_note가 기존
    // 행에는 NULL로 채워졌는지를 각각 확인한다.
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

    // markFinished(applied)가 실패해도 catch 블록의 markFinished(failed) 재시도로 안전하게
    // failed로 기록된다(migrationRunner.js) — "DDL은 성공"했다는 사실이 error_message에 남는다.
    const failedStatus = await migrationRunner.getStatus({ sequelize, migrations: [migrationWithGoodDdl] });
    assert.equal(failedStatus[0].status, 'failed');
    assert.ok(failedStatus[0].error.includes('DDL은 성공'), 'DDL 성공 후 이력 쓰기만 실패했다는 사실이 남아야 복구 방식을 올바르게 고를 수 있다');

    // 무조건 재적용은 여전히 차단된다.
    await assert.rejects(
        () => migrationRunner.applyMigrations({ sequelize, migrations: [...MIGRATIONS, migrationWithGoodDdl] }),
        /실패 이력이 있어 무조건 재적용할 수 없습니다/,
    );

    // 이 시나리오의 올바른 복구는 "전체 백업 복원"이 아니라 "부분 복구"다(runbook 5절 "경로 B") —
    // DDL은 이미 안전하게 반영됐고 문제는 이력 기록뿐이므로, 전체 DB를 되돌릴 필요 없이
    // resolveFailure로 이력만 사람이 확인한 뒤 정리하면 된다.
    const { cleared, previousStatus } = await migrationRunner.resolveFailure({
        sequelize, name: historyWriteFailureName, confirmRecovered: true,
    });
    assert.equal(cleared, historyWriteFailureName);
    assert.equal(previousStatus, 'failed');

    // 정리 후 재시도가 실제로 성공하는지까지 확인한다. 이미 반영된 DDL(addColumn)을 그대로
    // 다시 실행하면 "Duplicate column" 오류가 나야 정상이므로, 재시도용 정의는 이미 컬럼이
    // 있으면 아무 것도 하지 않는 멱등한 형태로 둔다(0002-expand-nickname-snapshot.js와 같은 패턴).
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
