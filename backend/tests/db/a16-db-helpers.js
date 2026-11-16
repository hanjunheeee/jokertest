'use strict';

// A16 DB·마이그레이션 시험 공용 준비 (a16- DB 시험 파일만 씀)
// 시험 DB 비우기·앞 n개 올리기·줄 넣기·겹침/외래키 거절 보기·명령 파일 따로 띄우기·끝나면 34개 처음 모양으로 되돌리기
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 시험에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const migrationRunner = require('../../db/migrationRunner');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호) — 표 지우기는 전부 이 도우미를 거침
const iso = require('../helpers/isolatedTestDb');
const db = require('../../models');

const { Sequelize } = db;
const { QueryTypes } = Sequelize;

// 번호 네 자리로 마이그레이션 찾기 ('0034' → 0034-add-game-settings)
const M = (num) => MIGRATIONS.find((migration) => migration.name.startsWith(`${num}-`));
const NAMES = MIGRATIONS.map((migration) => migration.name);

const schema = iso.buildManagedSchema({
    baseline: M('0001'), addRefreshTokenHistory: M('0004'), addSocialAuth: M('0005'), migrationRunner,
});

// 목록 부록 1: 끝까지 올린 DB 표 49개
const EXPECTED_TABLES = Object.freeze([
    'users', 'account_find_requests', 'password_reset_tokens', 'user_sessions', 'user_bans', 'user_stats',
    'login_history', 'online_presence', 'friend_requests', 'friendships', 'game_results', 'game_result_players',
    'concurrent_snapshots',
    'refresh_token_history',
    'external_identities', 'oauth_states', 'social_signup_intents',
    'economy_wallets', 'economy_ledger_entries', 'economy_entitlements', 'economy_loadouts',
    'economy_purchase_requests',
    'vote_participations',
    'achievement_grants',
    'notifications',
    'friend_blocks', 'friend_favorites', 'game_invites',
    'signup_email_verifications',
    'economy_currency_products', 'economy_topup_orders',
    'economy_emoji_palettes',
    'reports', 'report_chat_evidence', 'banned_words', 'maintenance_state', 'admin_users', 'admin_audit_logs',
    'coupons', 'coupon_redemptions',
    'terms_versions', 'user_terms_agreements',
    'admin_sessions', 'admin_login_attempts',
    'inquiries', 'inquiry_replies',
    'game_desertions',
    'game_settings',
    'schema_migrations',
].slice().sort());

// 처음 값 넣어 두는 표 (점검 한 줄·약관 자리 2개·판 골드 한 줄)
const SEEDED_TABLES = Object.freeze(['maintenance_state', 'terms_versions', 'game_settings']);

// 시험이 만드는 표 이름 앞글자 (끝나면 이것만 지움)
const OWN_TABLE = /^zz_a16_[a-z0-9_]+$/;

const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

const qi = () => db.sequelize.getQueryInterface();

// 표 이름 차례대로
const listTables = async (sequelize = db.sequelize) => (await sequelize.getQueryInterface().showAllTables()).slice().sort();

// 시험이 만든 zz_a16_ 표만 지움 (먼저 시험 DB가 맞는지 도우미 검사)
async function dropOwnTables() {
    await iso.assertDedicatedTestDatabase(db.sequelize, TEST_DB_URL);
    for (const table of await listTables()) {
        if (OWN_TABLE.test(table)) await qi().dropTable(table);
    }
}

// 시험이 쓸 zz_a16_ 표 하나 만듦 (먼저 시험 DB가 맞는지 도우미 검사)
async function createOwnTable(name) {
    assert.match(name, OWN_TABLE);
    await iso.assertDedicatedTestDatabase(db.sequelize, TEST_DB_URL);
    await qi().createTable(name, { id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true } });
}

// 빈 DB (표 0개, 이력 표도 없음)
async function emptyDb() {
    await dropOwnTables();
    await iso.resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
}

// 빈 DB에 앞 n개만 올림 (n = 34면 끝까지)
async function migrateTo(n = MIGRATIONS.length) {
    await emptyDb();
    if (n === 0) return { applied: [] };
    return migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS.slice(0, n) });
}

// 다음 사람(B-A18·전체 실행)이 쓰는 처음 모양: 34개 다 올리고 처음 값만 있는 DB
const restoreFull = () => migrateTo(MIGRATIONS.length);

// 마이그레이션 함수 직접 부르기 (실행기와 같은 세 인자)
const callStep = (migration, step) => migration[step](qi(), Sequelize, db.sequelize);

// 줄 하나 넣기 (값은 이름 붙은 자리로), 자동 번호 돌려줌
async function insert(table, row) {
    const columns = Object.keys(row);
    const sql = `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) `
        + `VALUES (${columns.map((c) => `:${c}`).join(', ')})`;
    const [insertId] = await db.sequelize.query(sql, { replacements: row, type: QueryTypes.INSERT });
    return insertId;
}

// 표 줄 수 (조건 SQL 조각은 시험 안 고정 글만)
async function count(table, where = '1=1', replacements = {}) {
    const [rows] = await db.sequelize.query(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${where}`, { replacements });
    return Number(rows[0].n);
}

async function select(sql, replacements = {}) {
    const [rows] = await db.sequelize.query(sql, { replacements });
    return rows;
}

// 이력 표 줄 (이름 차례)
const historyRows = () => select('SELECT id, name, checksum, status, started_at, finished_at, error_message FROM schema_migrations ORDER BY id');

const historyRow = async (name) => (await select('SELECT * FROM schema_migrations WHERE name = :name', { name }))[0] ?? null;

// 회원 한 명 (이름 앞글자 + 겹치지 않는 꼬리)
async function createUser(label = 'u') {
    const uuid = crypto.randomUUID();
    await insert('users', {
        uuid,
        password_hash: 'not-a-real-hash',
        nickname: `${label}${uuid.slice(0, 8)}`,
        email: `${label}-${uuid}@example.test`,
        created_at: new Date(),
        updated_at: new Date(),
    });
    return uuid;
}

// 관리자 한 명
async function createAdmin(label = 'adm', extra = {}) {
    const id = crypto.randomUUID();
    await insert('admin_users', {
        id, login_id: `${label}${id.slice(0, 8)}`, password_hash: 'not-a-real-hash',
        created_at: new Date(), updated_at: new Date(), ...extra,
    });
    return id;
}

// MySQL 원래 오류 꺼내기 (Sequelize가 한 겹 감쌈)
const originalOf = (error) => error?.parent ?? error?.original ?? error;

// 겹침 거절: 중복 오류 + (기대 이름 있으면) 목차 이름이 같음
async function expectDuplicate(run, indexName) {
    await assert.rejects(run, (error) => {
        const original = originalOf(error);
        assert.equal(original.code, 'ER_DUP_ENTRY', `중복 오류가 아님: ${original.code} ${original.sqlMessage ?? original.message}`);
        if (indexName) {
            const message = String(original.sqlMessage ?? original.message);
            const key = /for key '([^']+)'/.exec(message)?.[1] ?? '';
            assert.equal(key.split('.').pop(), indexName, `막은 목차 이름이 다름: ${message}`);
        }
        return true;
    });
}

// 외래키 거절: 없는 부모 값 오류
async function expectForeignKeyReject(run) {
    await assert.rejects(run, (error) => {
        const original = originalOf(error);
        assert.equal(original.code, 'ER_NO_REFERENCED_ROW_2', `외래키 오류가 아님: ${original.code} ${original.sqlMessage ?? original.message}`);
        return true;
    });
}

// 거절 (어떤 MySQL 오류든), 코드 있으면 그 코드
async function expectDbReject(run, codes) {
    await assert.rejects(run, (error) => {
        const original = originalOf(error);
        if (codes) assert.ok(codes.includes(original.code), `기대한 거절이 아님: ${original.code} ${original.sqlMessage ?? original.message}`);
        return true;
    });
}

// 같은 시험 DB에 붙는 두 번째 연결 (잠금 흉내용, 한 연결만 쓰게 풀 1)
// 쉬는 연결을 금방 닫으면 쥔 잠금도 같이 풀려서 오래 둠 (시험 끝에 close로 닫음)
const secondConnection = () => new Sequelize(TEST_DB_URL, {
    dialect: 'mysql', logging: false, pool: { max: 1, min: 0, idle: 600_000, acquire: 30000 },
});

const scalar = async (sequelize, sql, replacements = {}) => {
    const [rows] = await sequelize.query(sql, { replacements });
    return Object.values(rows[0])[0];
};

// 시험용 마이그레이션 (목록 끝에 붙여 실패·verify 실패를 일부러 냄, 진짜 migrations 폴더엔 없음)
const failingMigration = (name = '9901-test-fail', message = '시험 실패') => ({
    name,
    async up() { throw new Error(message); },
});
const tableMakingMigration = (name, table) => ({
    name,
    async up(queryInterface, S) { await queryInterface.createTable(table, { id: { type: S.INTEGER, primaryKey: true } }); },
});

// 운영체제 임시 폴더 아래 내 이름 폴더 (끝나면 지움)
function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'b-a16-'));
}
const removeTempDir = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// 명령 파일(migrate-db.js)을 따로 띄움: 빈 임시 폴더에서, 주소는 환경값으로만 (출력에 주소 안 찍힘)
function runMigrateCommand(args, { cwd, timeoutMs = 90_000 } = {}) {
    const script = path.join(__dirname, '..', '..', 'scripts', 'migrate-db.js');
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [script, ...args], {
            cwd,
            env: { ...process.env, DATABASE_URL: TEST_DB_URL, NODE_ENV: 'development' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        // 안 끝나면 끊음 (멈춘 채로 시험이 안 끝나는 일 막기)
        const timer = setTimeout(() => { child.kill(); reject(new Error(`migrate-db ${args[0]} 시간 넘김`)); }, timeoutMs);
        timer.unref();
        child.on('error', (error) => { clearTimeout(timer); reject(error); });
        child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    });
}

module.exports = {
    TEST_DB_URL,
    db,
    Sequelize,
    QueryTypes,
    migrationRunner,
    MIGRATIONS,
    NAMES,
    M,
    iso,
    schema,
    EXPECTED_TABLES,
    SEEDED_TABLES,
    noDb,
    qi,
    listTables,
    dropOwnTables,
    createOwnTable,
    emptyDb,
    migrateTo,
    restoreFull,
    callStep,
    insert,
    count,
    select,
    historyRows,
    historyRow,
    createUser,
    createAdmin,
    expectDuplicate,
    expectForeignKeyReject,
    expectDbReject,
    secondConnection,
    scalar,
    failingMigration,
    tableMakingMigration,
    makeTempDir,
    removeTempDir,
    runMigrateCommand,
};
