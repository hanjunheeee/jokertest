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

const MIGRATIONS = [baseline, expandNicknameSnapshot];
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

// 매 테스트를 완전히 빈 스키마에서 시작한다. 우리가 모르는 테이블이 있으면 전용 격리 DB가
// 아닐 수 있으므로(다른 앱/사람의 데이터일 위험) 진행을 거부한다.
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

    // "기존 배포"를 흉내낸다 — sync({force:false})가 예전에 만들어 뒀을 법한 레거시 스키마를
    // 0001의 up()을 직접 호출해 그대로 만들고, 계정·인증·경기 기록을 심는다.
    const queryInterface = sequelize.getQueryInterface();
    await baseline.up(queryInterface, Sequelize, sequelize);

    const userId = '11111111-1111-1111-1111-111111111111';
    const gameId = '22222222-2222-2222-2222-222222222222';
    await sequelize.query(
        `INSERT INTO users (uuid, password_hash, nickname, email, created_at, updated_at)
         VALUES (:uuid, 'hash', '기존유저', 'existing@example.com', NOW(), NOW())`,
        { replacements: { uuid: userId } },
    );
    await sequelize.query(
        `INSERT INTO password_reset_tokens (user_id, token, expired_at, used, created_at)
         VALUES (:uuid, 'tok-123', NOW(), false, NOW())`,
        { replacements: { uuid: userId } },
    );
    await sequelize.query(
        `INSERT INTO game_results (id, started_at, ended_at, winner, day_index, player_count, completed)
         VALUES (:id, NOW(), NOW(), 'CITIZEN', 1, 1, true)`,
        { replacements: { id: gameId } },
    );
    await sequelize.query(
        `INSERT INTO game_result_players (game_id, user_id, nickname_snapshot, role, team, is_alive)
         VALUES (:gameId, :userId, '기존닉네임', 'CITIZEN', 'CITIZEN', true)`,
        { replacements: { gameId, userId } },
    );

    // 이 시점에 schema_migrations이 없으므로, 0001을 다시 적용하면 "14개 모두 존재 + 구조 일치"로
    // 판단해 DDL 없이 기준선으로만 등록되어야 한다. 0002는 실제로 컬럼을 넓힌다.
    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(applied, MIGRATIONS.map((m) => m.name));

    const userRows = await queryRows('SELECT * FROM users WHERE uuid = :uuid', { uuid: userId });
    assert.equal(userRows.length, 1);
    assert.equal(userRows[0].nickname, '기존유저');
    assert.equal(userRows[0].email, 'existing@example.com');

    const tokenRows = await queryRows('SELECT * FROM password_reset_tokens WHERE user_id = :uuid', { uuid: userId });
    assert.equal(tokenRows.length, 1);
    assert.equal(tokenRows[0].token, 'tok-123');

    const gameRows = await queryRows('SELECT * FROM game_results WHERE id = :id', { id: gameId });
    assert.equal(gameRows.length, 1);
    assert.equal(gameRows[0].winner, 'CITIZEN');

    const playerRows = await queryRows(
        'SELECT * FROM game_result_players WHERE game_id = :gameId AND user_id = :userId',
        { gameId, userId },
    );
    assert.equal(playerRows.length, 1);
    // 값 자체는 마이그레이션으로 바뀌지 않는다 — 컬럼 폭만 넓어진다.
    assert.equal(playerRows[0].nickname_snapshot, '기존닉네임');
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
    assert.deepEqual(status.map((s) => s.status), ['applied', 'applied']);

    const historyRows = await queryRows(
        `SELECT name, COUNT(*) AS cnt FROM ${migrationRunner.META_TABLE} GROUP BY name`,
    );
    for (const row of historyRows) assert.equal(Number(row.cnt), 1, `${row.name} 이력이 중복되면 안 된다`);
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

    await db.User.create({ uuid: userId, password_hash: 'hash', nickname: longNickname, email: 'long-nick@example.com' });
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

test('AC-05: 마이그레이션 실패 시 문서화된 백업 복원 절차로 이전 상태로 되돌릴 수 있다', async (t) => {
    if (unavailable(t)) return;
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const userId = '55555555-5555-5555-5555-555555555555';
    await sequelize.query(
        `INSERT INTO users (uuid, password_hash, nickname, email, created_at, updated_at)
         VALUES (:uuid, 'hash', '복구대상유저', 'recover@example.com', NOW(), NOW())`,
        { replacements: { uuid: userId } },
    );

    // 적용 전 백업(runbook의 1단계). 실제 운영에서는 mysqldump로 같은 일을 한다.
    const backup = await backupDatabase();

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
    // 먼저 복원하고 데이터·스키마·이력이 실패 이전 상태와 같은지 대조한다(운영에서는 이
    // 단계로 백업 자체가 온전한지 먼저 확인하고, 확인된 뒤에만 실제 DB를 되돌린다).
    const restoreCheckUrl = buildAlternateDatabaseUrl(TEST_DB_URL, '_restore_check');
    const restoreCheckDbName = new URL(restoreCheckUrl).pathname.replace(/^\//, '');
    let canCreateSeparateDb = true;
    try {
        await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${restoreCheckDbName}\``);
    } catch (error) {
        canCreateSeparateDb = false;
        console.log(`[AC-05] 별도 격리 DB 생성 권한이 없어 이 단계는 건너뜁니다: ${error.message}`);
    }

    if (canCreateSeparateDb) {
        const restoreCheckDb = new Sequelize(restoreCheckUrl, { logging: false });
        try {
            await restoreDatabaseInto(restoreCheckDb, backup);

            const [checkUserRows] = await restoreCheckDb.query(
                'SELECT * FROM users WHERE uuid = :uuid',
                { replacements: { uuid: userId } },
            );
            assert.equal(checkUserRows.length, 1);
            assert.equal(checkUserRows[0].nickname, '복구대상유저');

            const checkUsersDescribe = await restoreCheckDb.getQueryInterface().describeTable('users');
            assert.ok(!checkUsersDescribe.poison_column, '별도 DB로 복원한 결과에는 부분 DDL 흔적이 없어야 한다');

            const checkStatus = await migrationRunner.getStatus({ sequelize: restoreCheckDb, migrations: MIGRATIONS });
            assert.deepEqual(checkStatus.map((s) => s.status), ['applied', 'applied']);
        } finally {
            await restoreCheckDb.close();
            await sequelize.query(`DROP DATABASE IF EXISTS \`${restoreCheckDbName}\``);
        }
    }

    // 복구 2단계: 별도 DB에서 백업이 온전함을 확인했으니, 실제 장애난 DB 자체를 같은 백업으로 되돌린다.
    await restoreDatabase(backup);

    const usersAfterRestore = await sequelize.getQueryInterface().describeTable('users');
    assert.ok(!usersAfterRestore.poison_column, '복원 후에는 부분 DDL 흔적이 사라져야 한다');

    const restoredUserRows = await queryRows('SELECT * FROM users WHERE uuid = :uuid', { uuid: userId });
    assert.equal(restoredUserRows.length, 1);
    assert.equal(restoredUserRows[0].nickname, '복구대상유저');

    const restoredStatus = await migrationRunner.getStatus({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(restoredStatus.map((s) => s.status), ['applied', 'applied'], '복원된 DB는 실패 이전의 정상 이력을 그대로 갖는다');
});
