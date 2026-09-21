'use strict';

// F-32a(AC-06) 신규 스키마·마이그레이션 단위 시험. 실제 모델 메타데이터(로더에 등록된 두 모델)와
// queryInterface 대역으로 0018의 DDL·부분 실패 복구·verify 거부를 검사한다. 실제 DB에서의 반복 적용과
// 기존 경제 데이터 보존은 tests/db/f32a-topup.integration.test.js가 검사한다.
//
// 시험에 나오는 상품 수치는 자동 시험용 임시값이며 최종 상품표가 아니다.

const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');

const { db, modelNames, attributesOf, typeNameOf, referenceOf, belongsToOf } = require('./testHelpers/schemaMeta');
const migration = require('../db/migrations/0018-add-currency-products-topup-orders');

const { TABLE_NAMES } = migration;
const PRODUCTS = TABLE_NAMES.CURRENCY_PRODUCTS;
const ORDERS = TABLE_NAMES.TOPUP_ORDERS;

// ── queryInterface 대역: createTable이 받은 정의에서 describeTable·showIndex 결과를 파생한다 ──

const describeType = (type) => {
    const key = type.key ?? String(type);
    if (key === 'STRING') return `VARCHAR(${type._length ?? type.options?.length ?? 255})`;
    if (key === 'UUID') return 'CHAR(36) BINARY';
    if (key === 'INTEGER') return 'INT';
    if (key === 'DATE') return 'DATETIME';
    return String(key);
};

const createFakeQueryInterface = ({ users = true } = {}) => {
    const tables = new Map();
    if (users) tables.set('users', { columns: { uuid: { type: Sequelize.UUID, primaryKey: true, allowNull: false } }, indexes: [], foreignKeys: [] });
    const log = { createTable: [], addIndex: [] };
    const failures = { addIndexOnce: false };

    const qi = {
        tables,
        log,
        failures,
        async showAllTables() { return [...tables.keys()]; },
        async createTable(name, attributes) {
            log.createTable.push(name);
            const foreignKeys = Object.entries(attributes)
                .filter(([, attribute]) => attribute.references)
                .map(([column, attribute]) => ({
                    columnName: column,
                    referencedTableName: attribute.references.model,
                    referencedColumnName: attribute.references.key,
                }));
            tables.set(name, { columns: { ...attributes }, indexes: [], foreignKeys });
        },
        async addIndex(name, fields, options) {
            log.addIndex.push({ name, index: options.name });
            if (failures.addIndexOnce) {
                failures.addIndexOnce = false;
                throw new Error('addIndex 주입 실패');
            }
            tables.get(name).indexes.push({ name: options.name, unique: options.unique === true, fields });
        },
        async showIndex(name) {
            return tables.get(name).indexes.map((index) => ({
                name: index.name,
                unique: index.unique,
                fields: index.fields.map((attribute) => ({ attribute })),
            }));
        },
        async describeTable(name) {
            const table = tables.get(name);
            return Object.fromEntries(Object.entries(table.columns).map(([column, attribute]) => [column, {
                type: describeType(attribute.type),
                allowNull: attribute.allowNull !== false && attribute.primaryKey !== true,
                primaryKey: attribute.primaryKey === true,
                defaultValue: typeof attribute.defaultValue === 'number' || typeof attribute.defaultValue === 'string'
                    ? String(attribute.defaultValue) : null,
            }]));
        },
        async getForeignKeyReferencesForTable(name) { return tables.get(name).foreignKeys; },
    };
    return qi;
};

const applyUp = (qi) => migration.up(qi, Sequelize);

// ── 로더에 등록된 두 모델 ──────────────────────────────────────────────────────────────

test('로더가 EconomyCurrencyProduct·EconomyTopupOrder를 각각 한 번 등록한다', () => {
    const names = modelNames();
    assert.equal(names.filter((name) => name === 'EconomyCurrencyProduct').length, 1);
    assert.equal(names.filter((name) => name === 'EconomyTopupOrder').length, 1);
    assert.equal(db.EconomyCurrencyProduct.tableName, PRODUCTS);
    assert.equal(db.EconomyTopupOrder.tableName, ORDERS);
});

const PRODUCT_COLUMNS = {
    product_id: 'STRING(64)', kind: 'STRING(20)', display_name: 'STRING(100)', pay_currency: 'STRING(10)',
    pay_amount: 'INTEGER', grant_currency: 'STRING(10)', grant_amount: 'INTEGER', bonus_amount: 'INTEGER',
    status: 'STRING(10)', sort_order: 'INTEGER', version: 'INTEGER', created_at: 'DATE', updated_at: 'DATE',
};
const ORDER_COLUMNS = {
    order_id: 'STRING(64)', user_id: 'UUID', product_id: 'STRING(64)', version: 'INTEGER', pay_amount: 'INTEGER',
    grant_amount: 'INTEGER', bonus_amount: 'INTEGER', order_name: 'STRING(100)', status: 'STRING(20)',
    payment_key: 'STRING(200)', lease_token: 'STRING(64)', lease_expires_at: 'DATE', approved_at: 'DATE',
    granted_at: 'DATE', failure_code: 'STRING(80)', created_at: 'DATE', updated_at: 'DATE',
};

test('상품 모델의 컬럼·타입·기본키·NOT NULL·기본값이 계약과 같다', () => {
    const attributes = attributesOf(db.EconomyCurrencyProduct);
    assert.deepEqual(Object.keys(attributes).sort(), Object.keys(PRODUCT_COLUMNS).sort());
    for (const [column, type] of Object.entries(PRODUCT_COLUMNS)) {
        assert.equal(typeNameOf(attributes[column]), type, `${column} 타입`);
        // 시각 컬럼의 NULL 허용은 sequelize가 timestamps 옵션으로 정한다 — 타입·존재만 확인한다.
        if (column === 'created_at' || column === 'updated_at') continue;
        assert.equal(attributes[column].allowNull, false, `${column}은 NOT NULL`);
    }
    assert.equal(attributes.product_id.primaryKey, true);
    assert.equal(attributes.bonus_amount.defaultValue, 0);
    assert.equal(attributes.sort_order.defaultValue, 0);
    assert.equal(attributes.version.defaultValue, 1);
});

test('주문 모델: 스냅샷·상태·결제키·임대 컬럼, 기본키 order_id, 결제키만 nullable 유일', () => {
    const attributes = attributesOf(db.EconomyTopupOrder);
    assert.deepEqual(Object.keys(attributes).sort(), Object.keys(ORDER_COLUMNS).sort());
    for (const [column, type] of Object.entries(ORDER_COLUMNS)) {
        assert.equal(typeNameOf(attributes[column]), type, `${column} 타입`);
    }
    assert.equal(attributes.order_id.primaryKey, true);
    const nullable = ['payment_key', 'lease_token', 'lease_expires_at', 'approved_at', 'granted_at', 'failure_code'];
    for (const column of Object.keys(ORDER_COLUMNS)) {
        if (column === 'created_at' || column === 'updated_at') continue;
        assert.equal(attributes[column].allowNull, nullable.includes(column), `${column}의 NULL 허용`);
    }
    assert.equal(attributes.status.defaultValue, 'CREATED');
    assert.equal(attributes.bonus_amount.defaultValue, 0);

    const indexes = db.EconomyTopupOrder.options.indexes;
    assert.deepEqual(
        indexes.map(({ name, unique, fields }) => ({ name, unique, fields })),
        [{ name: 'economy_topup_orders_payment_key_unique', unique: true, fields: ['payment_key'] }],
    );
});

test('주문은 users.uuid에만 연결되고 상품 테이블 FK는 없다(상품 삭제가 스냅샷을 훼손하지 않는다)', () => {
    const attributes = attributesOf(db.EconomyTopupOrder);
    assert.ok(belongsToOf(db.EconomyTopupOrder, 'User'), 'User belongsTo 관계가 있어야 한다');
    assert.deepEqual(referenceOf(attributes.user_id), { table: 'users', key: 'uuid' });
    for (const [column, attribute] of Object.entries(attributes)) {
        if (column === 'user_id') continue;
        assert.equal(referenceOf(attribute), null, `${column}은 FK가 없어야 한다`);
    }
    assert.equal(belongsToOf(db.EconomyTopupOrder, 'EconomyCurrencyProduct'), undefined);
});

test('연관 실행이 기존 users 컬럼을 바꾸지 않는다', () => {
    const userColumns = Object.keys(attributesOf(db.User));
    assert.ok(!userColumns.some((column) => column.startsWith('topup') || column.includes('diamond')));
    assert.equal(typeNameOf(attributesOf(db.User).uuid), 'UUID');
});

// ── 모델과 마이그레이션이 같은 모양이다 ─────────────────────────────────────────────────

for (const [tableName, modelName] of [[PRODUCTS, 'EconomyCurrencyProduct'], [ORDERS, 'EconomyTopupOrder']]) {
    test(`${tableName}: 마이그레이션 up()이 만든 컬럼이 모델과 컬럼·타입·NULL 허용·기본키·기본값에서 일치한다`, async () => {
        const qi = createFakeQueryInterface();
        await applyUp(qi);

        const created = qi.tables.get(tableName).columns;
        const modelAttributes = attributesOf(db[modelName]);
        assert.deepEqual(Object.keys(created).sort(), Object.keys(modelAttributes).sort());
        for (const [column, attribute] of Object.entries(modelAttributes)) {
            assert.equal(typeNameOf(created[column]), typeNameOf(attribute), `${column} 타입`);
            assert.equal(created[column].primaryKey === true, attribute.primaryKey === true, `${column} 기본키`);
            if (column === 'created_at' || column === 'updated_at') continue;
            const modelAllowsNull = attribute.allowNull !== false;
            const migrationAllowsNull = created[column].allowNull !== false && created[column].primaryKey !== true;
            assert.equal(migrationAllowsNull, modelAllowsNull, `${column} NULL 허용`);
            if (typeof attribute.defaultValue === 'number' || typeof attribute.defaultValue === 'string') {
                assert.equal(created[column].defaultValue, attribute.defaultValue, `${column} 기본값`);
            }
        }
    });
}

// ── up: 생성·멱등·부분 실패 복구 ──────────────────────────────────────────────────────

test('up은 두 테이블과 결제키 유일 인덱스를 만들고 verify가 통과한다(운영 상품·행은 넣지 않는다)', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);
    await migration.verify(qi);

    assert.deepEqual(qi.log.createTable.sort(), [ORDERS, PRODUCTS].sort());
    assert.deepEqual(qi.log.addIndex, [{ name: ORDERS, index: 'economy_topup_orders_payment_key_unique' }]);
    const index = (await qi.showIndex(ORDERS)).find((candidate) => candidate.name === 'economy_topup_orders_payment_key_unique');
    assert.equal(index.unique, true);
    assert.deepEqual(index.fields.map((field) => field.attribute), ['payment_key']);
    assert.deepEqual(qi.tables.get(ORDERS).foreignKeys, [{ columnName: 'user_id', referencedTableName: 'users', referencedColumnName: 'uuid' }]);
});

test('up·verify를 반복해도 테이블·인덱스가 중복 생성되지 않는다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);
    await migration.verify(qi);
    await applyUp(qi);
    await migration.verify(qi);

    assert.equal(qi.log.createTable.length, 2);
    assert.equal(qi.log.addIndex.length, 1);
    assert.equal(qi.tables.get(ORDERS).indexes.length, 1);
});

test('테이블 생성 뒤 인덱스 생성이 실패해도 다시 up하면 누락 인덱스만 복구한다', async () => {
    const qi = createFakeQueryInterface();
    qi.failures.addIndexOnce = true;
    await assert.rejects(applyUp(qi), /addIndex 주입 실패/);
    assert.equal(qi.tables.get(ORDERS).indexes.length, 0, '실패 직후에는 인덱스가 없다');
    await assert.rejects(migration.verify(qi), /economy_topup_orders_payment_key_unique/);

    await applyUp(qi);
    await migration.verify(qi);
    assert.equal(qi.log.createTable.length, 2, '테이블은 다시 만들지 않는다');
    assert.equal(qi.tables.get(ORDERS).indexes.length, 1);
});

test('기존 테이블이 이미 있으면 다시 만들지 않는다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);
    qi.log.createTable.length = 0;
    await applyUp(qi);
    assert.deepEqual(qi.log.createTable, []);
});

test('down은 지원하지 않는다(결제 이력을 지우는 파괴적 변경)', async () => {
    await assert.rejects(migration.down(), /지원하지 않습니다/);
});

// ── verify가 잘못된 스키마를 거부한다 ───────────────────────────────────────────────────

const builtSchema = async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);
    return qi;
};

const VERIFY_REJECTIONS = [
    ['컬럼 누락(상품)', (qi) => { delete qi.tables.get(PRODUCTS).columns.bonus_amount; }, /bonus_amount/],
    ['컬럼 누락(주문)', (qi) => { delete qi.tables.get(ORDERS).columns.lease_token; }, /lease_token/],
    ['payment_key가 NOT NULL', (qi) => { qi.tables.get(ORDERS).columns.payment_key.allowNull = false; }, /payment_key.*NULL/],
    ['user_id가 nullable', (qi) => { qi.tables.get(ORDERS).columns.user_id.allowNull = true; }, /user_id.*NULL/],
    ['pay_amount가 nullable', (qi) => { qi.tables.get(PRODUCTS).columns.pay_amount.allowNull = true; }, /pay_amount.*NULL/],
    ['pay_amount 타입이 문자열', (qi) => { qi.tables.get(ORDERS).columns.pay_amount.type = Sequelize.STRING(20); }, /pay_amount.*타입/],
    ['order_id 길이가 다름', (qi) => { qi.tables.get(ORDERS).columns.order_id.type = Sequelize.STRING(32); }, /order_id.*타입/],
    ['bonus_amount 기본값이 다름', (qi) => { qi.tables.get(PRODUCTS).columns.bonus_amount.defaultValue = 5; }, /bonus_amount.*기본값/],
    ['status 기본값이 없음', (qi) => { delete qi.tables.get(ORDERS).columns.status.defaultValue; }, /status.*기본값/],
    ['product_id가 기본키가 아님', (qi) => { qi.tables.get(PRODUCTS).columns.product_id.primaryKey = false; }, /product_id.*기본 키/],
    ['계약에 없는 기본키(결제키가 NOT NULL 기본키로 바뀜)', (qi) => { qi.tables.get(ORDERS).columns.payment_key.primaryKey = true; }, /payment_key/],
    ['유일 인덱스 없음', (qi) => { qi.tables.get(ORDERS).indexes.length = 0; }, /economy_topup_orders_payment_key_unique/],
    ['유일이 아닌 인덱스', (qi) => { qi.tables.get(ORDERS).indexes[0].unique = false; }, /unique/],
    ['다른 컬럼을 덮는 같은 이름 인덱스', (qi) => { qi.tables.get(ORDERS).indexes[0].fields = ['order_id']; }, /기대한 컬럼/],
    ['사용자 FK 없음', (qi) => { qi.tables.get(ORDERS).foreignKeys.length = 0; }, /외래 키/],
    ['FK가 다른 테이블을 가리킴', (qi) => { qi.tables.get(ORDERS).foreignKeys[0].referencedTableName = 'user_sessions'; }, /외래 키/],
];

for (const [label, mutate, pattern] of VERIFY_REJECTIONS) {
    test(`verify 거부: ${label}`, async () => {
        const qi = await builtSchema();
        await migration.verify(qi);
        mutate(qi);
        await assert.rejects(migration.verify(qi), pattern);
    });
}

test('verify는 테이블이 없으면 거부한다', async () => {
    const qi = createFakeQueryInterface();
    qi.describeTable = async () => { throw new Error('No description found'); };
    await assert.rejects(migration.verify(qi));
});
