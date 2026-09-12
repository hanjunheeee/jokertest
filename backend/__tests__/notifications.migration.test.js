'use strict';

// F-17 backend/db/migrations/0012-add-notifications.js 단위 시험.
//
// economy.migration.test.js와 같은 이유·같은 관례로(이 환경은 격리 MySQL 자격 증명을 항상
// 구할 수 없다) 실제 MySQL 없이 DDL·재실행 안전성·verify의 거부 조건을 결정론적으로
// 검증한다. 실제 MySQL 위에서의 유일 제약·트랜잭션·권한은
// backend/tests/db/f17-notifications.integration.test.js가(F01_TEST_DATABASE_URL이 있을 때)
// 검증한다.
//
// 이 파일이 특별히 노리는 회귀는 R-IMPL #4다: 예전 verify는 인덱스의 **이름과 unique
// 플래그만** 봤으므로, `UNIQUE(id)`에 notifications_user_source_unique라는 이름만 붙여 둔
// 불일치 스키마가 "적용됨"으로 통과했다. 그 상태에서는 같은 계정·같은 원본 사건의 알림이
// 둘 이상 쌓여 AC-03이 깨진다.

const test = require('node:test');
const assert = require('node:assert/strict');

const addNotifications = require('../db/migrations/0012-add-notifications');

const TABLE = addNotifications.TABLE_NAMES.NOTIFICATIONS;
const UNIQUE_INDEX_NAME = addNotifications.UNIQUE_INDEX_NAME;
const LIST_INDEX_NAME = addNotifications.LIST_INDEX_NAME;

// 0012가 실제로 쓰는 queryInterface 메서드만 인메모리로 흉내 낸다. describeTable·showIndex·
// getForeignKeyReferencesForTable은 **up()이 선언한 것에서 파생**시킨다 — 그래야 "up이 만든
// 모양을 verify가 통과시킨다"는 것이 시험 대역의 가정이 아니라 실제 대조가 된다.
// rows는 "이미 쌓인 사용자 알림"을 세워 두고, 재실행·verify 실패가 데이터를 건드리지
// 않는지 확인하는 데 쓴다.
const createFakeQueryInterface = () => {
    const tables = new Map();
    return {
        async showAllTables() { return [...tables.keys()]; },
        async createTable(name, columns) {
            if (tables.has(name)) throw new Error(`이미 존재하는 테이블을 다시 만들려 했습니다: ${name}`);
            tables.set(name, { columns, indexes: [], rows: [] });
        },
        async addIndex(name, fields, options = {}) {
            const table = tables.get(name);
            if (!table) throw new Error(`존재하지 않는 테이블에 인덱스를 추가하려 했습니다: ${name}`);
            if (table.indexes.some((index) => index.name === options.name)) {
                throw new Error(`이미 존재하는 인덱스를 다시 만들려 했습니다: ${options.name}`);
            }
            table.indexes.push({
                name: options.name,
                unique: options.unique === true,
                // MySQL showIndex와 같은 모양으로 돌려주려고 attribute 객체로 보관한다.
                fields: fields.map((field) => ({ attribute: field, order: 'ASC' })),
            });
        },
        async removeIndex(name, indexName) {
            const table = tables.get(name);
            if (!table) return;
            table.indexes = table.indexes.filter((index) => index.name !== indexName);
        },
        async dropTable(name) { tables.delete(name); },
        async describeTable(name) {
            const table = tables.get(name);
            if (!table) throw new Error(`존재하지 않는 테이블을 describe했습니다: ${name}`);
            return Object.fromEntries(Object.entries(table.columns).map(([column, definition]) => [column, {
                type: String(definition.type),
                allowNull: definition.allowNull !== false,
                primaryKey: definition.primaryKey === true,
                defaultValue: definition.defaultValue ?? null,
            }]));
        },
        async showIndex(name) {
            const table = tables.get(name);
            if (!table) throw new Error(`존재하지 않는 테이블의 인덱스를 조회했습니다: ${name}`);
            return table.indexes.map((index) => ({ ...index, tableName: name }));
        },
        async getForeignKeyReferencesForTable(name) {
            const table = tables.get(name);
            if (!table) return [];
            return Object.entries(table.columns)
                .filter(([, definition]) => definition.references)
                .map(([column, definition]) => ({
                    constraintName: `${name}_${column}_fk`,
                    tableName: name,
                    columnName: column,
                    referencedTableName: definition.references.model,
                    referencedColumnName: definition.references.key,
                }));
        },
        _tables: tables,
    };
};

const FakeSequelize = {
    UUID: 'UUID',
    STRING: (n) => `STRING(${n})`,
    JSON: 'JSON',
    DATE: 'DATE',
    NOW: 'NOW',
};

/** up()을 적용하고, "이미 쌓인 알림" 한 행을 세워 둔다. */
const applyWithExistingRow = async () => {
    const qi = createFakeQueryInterface();
    await addNotifications.up(qi, FakeSequelize);
    qi._tables.get(TABLE).rows.push({
        id: 'aaaaaaaa-0000-4000-8000-000000000001',
        user_id: '11111111-1111-4111-8111-111111111111',
        type: 'system',
        source_key: 'system:notifications-available:v1',
        read_at: new Date(0),
    });
    return qi;
};

const indexNamed = (qi, name) => qi._tables.get(TABLE).indexes.find((index) => index.name === name);
const fieldsOf = (index) => index.fields.map((field) => field.attribute);

// ── up() ────────────────────────────────────────────────────────────────────

test('up(): notifications 테이블과 (user_id, source_key) 유일 인덱스·(user_id, created_at) 목록 인덱스를 만든다', async () => {
    const qi = createFakeQueryInterface();
    await addNotifications.up(qi, FakeSequelize);

    assert.ok(qi._tables.has(TABLE));

    const unique = indexNamed(qi, UNIQUE_INDEX_NAME);
    assert.equal(unique.unique, true);
    assert.deepEqual(fieldsOf(unique), ['user_id', 'source_key'], '중복 판정은 계정 범위여야 한다');

    const list = indexNamed(qi, LIST_INDEX_NAME);
    assert.equal(list.unique, false);
    assert.deepEqual(fieldsOf(list), ['user_id', 'created_at']);

    const columns = qi._tables.get(TABLE).columns;
    assert.deepEqual(columns.user_id.references, { model: 'users', key: 'uuid' });
    assert.equal(columns.read_at.allowNull, true, '미확인 알림을 표현할 수 있어야 한다');
    assert.equal(columns.user_id.allowNull, false);
    assert.equal(columns.id.primaryKey, true);

    await assert.doesNotReject(() => addNotifications.verify(qi), 'up이 만든 모양은 verify를 통과해야 한다');
});

test('up(): 재실행해도 테이블·인덱스를 중복 생성하지 않고 기존 알림 행을 보존한다', async () => {
    const qi = await applyWithExistingRow();

    // fake는 중복 createTable/addIndex를 에러로 막는다 — 통과하면 멱등하다는 뜻이다.
    await assert.doesNotReject(() => addNotifications.up(qi, FakeSequelize));
    await assert.doesNotReject(() => addNotifications.verify(qi));

    assert.equal(qi._tables.get(TABLE).indexes.length, 2);
    assert.equal(qi._tables.get(TABLE).rows.length, 1, '재실행이 기존 알림을 지우면 안 된다');
    assert.equal(qi._tables.get(TABLE).rows[0].read_at.getTime(), 0, 'read_at도 그대로여야 한다');
});

test('up(): 테이블은 있고 인덱스만 없는 중간 실패 상태를 복구한다(데이터는 건드리지 않는다)', async () => {
    const qi = await applyWithExistingRow();
    await qi.removeIndex(TABLE, UNIQUE_INDEX_NAME);
    await qi.removeIndex(TABLE, LIST_INDEX_NAME);

    await addNotifications.up(qi, FakeSequelize);

    assert.deepEqual(fieldsOf(indexNamed(qi, UNIQUE_INDEX_NAME)), ['user_id', 'source_key']);
    assert.deepEqual(fieldsOf(indexNamed(qi, LIST_INDEX_NAME)), ['user_id', 'created_at']);
    assert.equal(qi._tables.get(TABLE).rows.length, 1);
});

// ── verify(): 불일치 스키마를 통과시키지 않는다 ────────────────────────────────

test('verify(): 테이블이 없으면 실패한다', async () => {
    const qi = createFakeQueryInterface();
    await assert.rejects(() => addNotifications.verify(qi), /notifications/);
});

test('verify(): 이름은 같지만 UNIQUE(id)인 인덱스를 통과시키지 않는다(R-IMPL #4)', async () => {
    const qi = await applyWithExistingRow();

    // 같은 이름으로 id 하나만 덮는 유일 인덱스 — 이름·unique 플래그만 보면 구별되지 않는다.
    const table = qi._tables.get(TABLE);
    table.indexes = table.indexes.map((index) => (
        index.name === UNIQUE_INDEX_NAME
            ? { ...index, fields: [{ attribute: 'id', order: 'ASC' }] }
            : index
    ));

    await assert.rejects(
        () => addNotifications.verify(qi),
        /기대 \[user_id, source_key\], 실제 \[id\]/,
    );

    // 실패가 테이블·데이터를 건드리지 않는다(운영 복구를 삭제로 처리하지 않는다).
    assert.ok(qi._tables.has(TABLE));
    assert.equal(qi._tables.get(TABLE).rows.length, 1);
});

test('verify(): 유일 인덱스가 unique가 아니면 실패한다', async () => {
    const qi = await applyWithExistingRow();
    const table = qi._tables.get(TABLE);
    table.indexes = table.indexes.map((index) => (
        index.name === UNIQUE_INDEX_NAME ? { ...index, unique: false } : index
    ));

    await assert.rejects(() => addNotifications.verify(qi), /중복 알림을 막지 못합니다/);
    assert.equal(qi._tables.get(TABLE).rows.length, 1);
});

test('verify(): 목록 인덱스가 기대한 컬럼을 덮지 않으면 실패한다', async () => {
    const qi = await applyWithExistingRow();
    const table = qi._tables.get(TABLE);
    table.indexes = table.indexes.map((index) => (
        index.name === LIST_INDEX_NAME
            ? { ...index, fields: [{ attribute: 'user_id', order: 'ASC' }] }
            : index
    ));

    await assert.rejects(() => addNotifications.verify(qi), new RegExp(LIST_INDEX_NAME));
});

test('verify(): 인덱스가 아예 없으면 실패하고, up()이 그 상태를 복구한다', async () => {
    const qi = await applyWithExistingRow();
    await qi.removeIndex(TABLE, UNIQUE_INDEX_NAME);

    await assert.rejects(() => addNotifications.verify(qi), new RegExp(UNIQUE_INDEX_NAME));

    await addNotifications.up(qi, FakeSequelize);
    await assert.doesNotReject(() => addNotifications.verify(qi));
});

test('verify(): user_id → users.uuid 외래 키가 없으면 실패한다', async () => {
    const qi = await applyWithExistingRow();
    delete qi._tables.get(TABLE).columns.user_id.references;

    await assert.rejects(() => addNotifications.verify(qi), /외래 키가 없습니다/);
    assert.equal(qi._tables.get(TABLE).rows.length, 1);
});

test('verify(): 다른 테이블을 가리키는 외래 키는 users.uuid 참조로 인정하지 않는다', async () => {
    const qi = await applyWithExistingRow();
    qi._tables.get(TABLE).columns.user_id.references = { model: 'user_sessions', key: 'id' };

    await assert.rejects(() => addNotifications.verify(qi), /외래 키가 없습니다/);
});

test('verify(): user_id가 nullable이면 실패한다(소유자 없는 알림)', async () => {
    const qi = await applyWithExistingRow();
    qi._tables.get(TABLE).columns.user_id.allowNull = true;

    await assert.rejects(() => addNotifications.verify(qi), /user_id 컬럼 NULL 허용/);
});

test('verify(): read_at이 NOT NULL이면 실패한다(미확인 상태를 표현할 수 없다)', async () => {
    const qi = await applyWithExistingRow();
    qi._tables.get(TABLE).columns.read_at.allowNull = false;

    await assert.rejects(() => addNotifications.verify(qi), /read_at 컬럼 NULL 허용/);
});

test('verify(): 컬럼이 빠진 예전 스키마를 통과시키지 않는다', async () => {
    const qi = await applyWithExistingRow();
    delete qi._tables.get(TABLE).columns.source_key;

    await assert.rejects(() => addNotifications.verify(qi), /누락된 컬럼: \[source_key\]/);
    assert.ok(qi._tables.has(TABLE), 'verify 실패가 테이블을 드롭하면 안 된다');
});

// ── down() ──────────────────────────────────────────────────────────────────

test('down(): 존재할 때만 드롭하고, 이미 없는 상태에서 다시 불러도 안전하다', async () => {
    const qi = createFakeQueryInterface();
    await addNotifications.up(qi, FakeSequelize);
    await addNotifications.down(qi);
    assert.equal(qi._tables.size, 0);
    await assert.doesNotReject(() => addNotifications.down(qi));
});
