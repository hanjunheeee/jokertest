'use strict';

// F-08 backend/db/migrations/0006-add-economy.js 단위 시험. migrationRunner.test.js와
// 같은 이유로(이 환경은 격리 MySQL 자격 증명을 구할 수 없다) 실제 MySQL 없이 DDL
// 순서·재실행 안전성(rerun-safe)·verify·down을 결정론적으로 검증한다. 실제 MySQL의
// 유일 인덱스·트랜잭션 위에서 이 스키마가 economy.service.js와 함께 어떻게 동작하는지는
// backend/tests/db/f08-economy.integration.test.js가(F01_TEST_DATABASE_URL이 있을 때)
// 검증한다 — 이 파일은 마이그레이션 파일 자체의 DDL·재실행 계약만 다룬다.

const test = require('node:test');
const assert = require('node:assert/strict');

const addEconomy = require('../db/migrations/0006-add-economy');
const migrationRunner = require('../db/migrationRunner');

// 0006-add-economy.js가 up()/down()/verify()에서 실제로 쓰는 queryInterface 메서드
// (createTable/addIndex/dropTable/showAllTables)만 인메모리로 흉내 낸다. createTable을
// 이미 존재하는 이름으로 다시 부르면 에러를 던져, "재실행 시 다시 만들려 하지 않는다"는
// 계약을 이 fake 스스로 강제한다.
const createFakeQueryInterface = () => {
    const tables = new Map(); // name -> { columns, indexes: [] }
    return {
        async showAllTables() { return [...tables.keys()]; },
        async createTable(name, columns) {
            if (tables.has(name)) throw new Error(`이미 존재하는 테이블을 다시 만들려 했습니다: ${name}`);
            tables.set(name, { columns, indexes: [] });
        },
        async addIndex(name, fields, options) {
            const table = tables.get(name);
            if (!table) throw new Error(`존재하지 않는 테이블에 인덱스를 추가하려 했습니다: ${name}`);
            table.indexes.push({ fields, ...options });
        },
        async dropTable(name) { tables.delete(name); },
        _tables: tables,
    };
};

// 0006-add-economy.js up()이 실제로 참조하는 Sequelize 타입 이름만 흉내 낸다.
const FakeSequelize = {
    UUID: 'UUID',
    BIGINT: 'BIGINT',
    INTEGER: 'INTEGER',
    STRING: (n) => `STRING(${n})`,
    DATE: 'DATE',
    NOW: 'NOW',
};

const EXPECTED_TABLES = ['economy_wallets', 'economy_ledger_entries', 'economy_entitlements', 'economy_loadouts'];

// ── up()/verify()/down() 단독 계약 ────────────────────────────────────────────

test('up(): 4개 테이블을 모두 만들고, (user_id, reference_event_id)·(user_id, item_id) 복합 유일 인덱스를 건다', async () => {
    const qi = createFakeQueryInterface();
    await addEconomy.up(qi, FakeSequelize);

    for (const table of EXPECTED_TABLES) assert.ok(qi._tables.has(table), `${table}가 생성되어야 한다`);

    // R-IMPL(2026-09-10): 재처리 방지 키는 전역이 아니라 계정 범위여야 한다(economy.service.js
    // 참고) — 그 계약이 실제 DDL에도 반영됐는지 여기서 직접 확인한다.
    const ledgerIndexes = qi._tables.get('economy_ledger_entries').indexes;
    assert.ok(
        ledgerIndexes.some((idx) => idx.unique && idx.fields.join(',') === 'user_id,reference_event_id'),
        'economy_ledger_entries는 (user_id, reference_event_id) 복합 유일 인덱스를 가져야 한다',
    );
    assert.ok(
        !ledgerIndexes.some((idx) => idx.unique && idx.fields.length === 1 && idx.fields[0] === 'reference_event_id'),
        'reference_event_id 단독 전역 유일 인덱스가 남아 있으면 안 된다(계정 간 정보 노출 재발 방지)',
    );

    const entitlementIndexes = qi._tables.get('economy_entitlements').indexes;
    assert.ok(
        entitlementIndexes.some((idx) => idx.unique && idx.fields.join(',') === 'user_id,item_id'),
        'economy_entitlements는 (user_id, item_id) 복합 유일 인덱스를 가져야 한다',
    );

    const walletColumns = qi._tables.get('economy_wallets').columns;
    assert.ok(walletColumns.balance_gold && walletColumns.balance_diamond,
        'economy_wallets는 GOLD·DIAMOND 두 재화 컬럼을 모두 가져야 한다(F-08 요구사항)');
    assert.equal(walletColumns.balance_gold.defaultValue, 0);
    assert.equal(walletColumns.balance_diamond.defaultValue, 0);

    const ledgerColumns = qi._tables.get('economy_ledger_entries').columns;
    assert.ok(ledgerColumns.currency, 'economy_ledger_entries는 재화 종류를 명시하는 currency 컬럼을 가져야 한다');
});

test('up(): 이미 테이블이 있으면 재실행해도 다시 만들지 않는다(rerun-safe)', async () => {
    const qi = createFakeQueryInterface();
    await addEconomy.up(qi, FakeSequelize);

    // 두 번째 실행이 createTable을 다시 호출하면 fake가 "이미 존재하는 테이블" 에러를
    // 던진다 — 에러 없이 통과해야 멱등하다는 뜻이다.
    await assert.doesNotReject(() => addEconomy.up(qi, FakeSequelize));
    assert.equal(qi._tables.size, EXPECTED_TABLES.length, '재실행이 테이블을 중복 생성하면 안 된다');
});

test('verify(): 모든 테이블이 있으면 통과하고, 하나라도 없으면 실패한다', async () => {
    const qi = createFakeQueryInterface();
    await addEconomy.up(qi, FakeSequelize);
    await assert.doesNotReject(() => addEconomy.verify(qi));

    qi._tables.delete('economy_loadouts');
    await assert.rejects(() => addEconomy.verify(qi), /economy_loadouts/);
});

test('down(): 존재하는 테이블만 생성 역순으로 드롭하고, 이미 지워진 상태에서 다시 불러도 안전하다', async () => {
    const qi = createFakeQueryInterface();
    await addEconomy.up(qi, FakeSequelize);
    await addEconomy.down(qi);
    assert.equal(qi._tables.size, 0);
    await assert.doesNotReject(() => addEconomy.down(qi));
});

// ── migrationRunner와 함께: 이력 기반 재실행 안전성(preservation) ────────────

// backend/__tests__/migrationRunner.test.js의 fake sequelize와 같은 패턴 — schema_migrations
// 이력만 메모리로 흉내내고, getQueryInterface()는 위 fake queryInterface를 그대로 준다.
const createFakeSequelize = (queryInterface) => {
    const rows = [];
    const sequelize = {
        constructor: {},
        getQueryInterface: () => queryInterface,
        query: async (sql, options = {}) => {
            const replacements = options.replacements || {};
            const trimmed = sql.trim();
            if (trimmed.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
            if (trimmed.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]];
            if (trimmed.startsWith('SELECT id, name, checksum')) {
                const row = rows.find((r) => r.name === replacements.name);
                return [row ? [{ ...row }] : []];
            }
            if (trimmed.startsWith('INSERT INTO')) {
                rows.push({ name: replacements.name, checksum: replacements.checksum, status: 'running', started_at: new Date(0), finished_at: null, error_message: null });
                return [{}];
            }
            if (trimmed.startsWith('UPDATE')) {
                const row = rows.find((r) => r.name === replacements.name);
                if (row) {
                    row.status = replacements.status;
                    row.checksum = replacements.checksum;
                    row.finished_at = new Date(1);
                    row.error_message = replacements.errorMessage;
                }
                return [{}];
            }
            if (trimmed.startsWith('DELETE FROM')) {
                const idx = rows.findIndex((r) => r.name === replacements.name);
                if (idx >= 0) rows.splice(idx, 1);
                return [{}];
            }
            if (trimmed.startsWith('SELECT * FROM')) return [rows.map((r) => ({ ...r }))];
            throw new Error(`fake sequelize가 처리할 수 없는 쿼리: ${trimmed}`);
        },
    };
    return { sequelize, rows };
};

// migrationRunner의 ensureMetaTable은 showAllTables 결과에 schema_migrations가 이미
// 있으면 createTable을 타지 않는다 — fake queryInterface에 미리 넣어둔다.
const seedMetaTable = (qi) => qi._tables.set('schema_migrations', { columns: {}, indexes: [] });

test('migrationRunner.applyMigrations: 0006을 두 번 적용해도 up()은 한 번만 실행되고 기존 테이블이 보존된다', async () => {
    const qi = createFakeQueryInterface();
    seedMetaTable(qi);
    const { sequelize } = createFakeSequelize(qi);

    // migrationRunner는 migration.up(queryInterface, Sequelize, sequelize)로 부르는데
    // 실제 Sequelize 타입 상수 대신 위 FakeSequelize를 쓰도록 얇게 감싼다.
    const wrapped = {
        name: addEconomy.name,
        up: (queryInterface) => addEconomy.up(queryInterface, FakeSequelize),
        verify: (queryInterface) => addEconomy.verify(queryInterface),
    };

    const first = await migrationRunner.applyMigrations({ sequelize, migrations: [wrapped] });
    assert.deepEqual(first.applied, [wrapped.name]);
    for (const table of EXPECTED_TABLES) assert.ok(qi._tables.has(table));

    const second = await migrationRunner.applyMigrations({ sequelize, migrations: [wrapped] });
    assert.deepEqual(second.applied, [], '이미 applied된 마이그레이션은 다시 적용되면 안 된다');
    assert.equal(
        qi._tables.size, EXPECTED_TABLES.length + 1,
        '재실행이 테이블을 중복 생성하거나 지우면 안 된다(+1은 schema_migrations 메타 테이블)',
    );
});
