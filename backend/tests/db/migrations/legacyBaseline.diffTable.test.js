'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');

const baseline = require('../../../db/migrations/0001-legacy-baseline');

const definitions = baseline.buildDefinitions(Sequelize);

const fakeRawType = (columnDef) => {
    const key = columnDef.type.key || String(columnDef.type);
    switch (key) {
        case 'UUID': return 'CHAR(36)';
        case 'BOOLEAN': return 'TINYINT(1)';
        case 'INTEGER': return 'INT';
        case 'BIGINT': return 'BIGINT';
        case 'DATE': return 'DATETIME';
        case 'JSON': return 'JSON';
        case 'TEXT': return 'TEXT';
        case 'STRING': {
            const length = columnDef.type._length ?? columnDef.type.options?.length;
            return `VARCHAR(${length ?? 255})`;
        }
        default: return key;
    }
};

const fakeRawDefault = (columnDef) => {
    if (!Object.prototype.hasOwnProperty.call(columnDef, 'defaultValue')) return null;
    const value = columnDef.defaultValue;
    if (value === Sequelize.NOW) return 'CURRENT_TIMESTAMP';
    if (value === Sequelize.UUIDV4) return null;
    if (value === null) return null;
    if (typeof value === 'boolean') return value ? '1' : '0';
    return String(value);
};

const fakeDescribeTable = (definition) => {
    const table = {};
    for (const [column, columnDef] of Object.entries(definition.columns)) {
        table[column] = {
            type: fakeRawType(columnDef),
            allowNull: columnDef.allowNull !== false,
            defaultValue: fakeRawDefault(columnDef),
            primaryKey: Boolean(columnDef.primaryKey),
            autoIncrement: Boolean(columnDef.autoIncrement),
        };
    }
    return table;
};

const fakeShowIndexResults = (definition) => {
    const results = [];
    const primaryFields = Object.entries(definition.columns)
        .filter(([, columnDef]) => columnDef.primaryKey)
        .map(([column]) => ({ attribute: column }));
    if (primaryFields.length > 0) {
        results.push({ name: 'PRIMARY', primary: true, unique: true, fields: primaryFields });
    }
    for (const [column, columnDef] of Object.entries(definition.columns)) {
        if (columnDef.unique) {
            results.push({ name: `${column}_unique`, primary: false, unique: true, fields: [{ attribute: column }] });
        }
    }
    for (const index of definition.indexes || []) {
        results.push({
            name: index.name || `idx_${index.fields.join('_')}`,
            primary: false,
            unique: Boolean(index.unique),
            fields: index.fields.map((field) => ({ attribute: field })),
        });
    }
    return results;
};

const fakeForeignKeyRows = (definition) => {
    const rows = [];
    for (const [column, columnDef] of Object.entries(definition.columns)) {
        if (columnDef.references) {
            rows.push({ columnName: column, referencedTableName: columnDef.references.model, referencedColumnName: columnDef.references.key });
        }
    }
    return rows;
};

const buildQueryInterface = (definition, overrides = {}) => ({
    describeTable: async () => overrides.describeTable ?? fakeDescribeTable(definition),
    showIndex: async () => overrides.showIndex ?? fakeShowIndexResults(definition),
    getForeignKeyReferencesForTable: async () => overrides.foreignKeys ?? fakeForeignKeyRows(definition),
});

test('diffTable: 구조가 완전히 일치하면 문제가 없다 (users)', async () => {
    const definition = definitions.users;
    const problems = await baseline.diffTable(buildQueryInterface(definition), Sequelize, 'users', definition);
    assert.deepEqual(problems, []);
});

test('diffTable: 구조가 완전히 일치하면 문제가 없다 (game_result_players, FK 2개)', async () => {
    const definition = definitions.game_result_players;
    const problems = await baseline.diffTable(buildQueryInterface(definition), Sequelize, 'game_result_players', definition);
    assert.deepEqual(problems, []);
});

test('diffTable: 컬럼 기본값이 실제 DB와 다르면 잡아낸다', async () => {
    const definition = definitions.users;
    const describeTable = fakeDescribeTable(definition);
    describeTable.role.defaultValue = 'ADMIN';
    const problems = await baseline.diffTable(
        buildQueryInterface(definition, { describeTable }), Sequelize, 'users', definition,
    );
    assert.ok(problems.some((p) => p.includes('role') && p.includes('기본값 불일치')), problems.join('\n'));
});

test('diffTable: NOW() 기본값(CURRENT_TIMESTAMP)이 실제 DB에 없으면 잡아낸다', async () => {
    const definition = definitions.password_reset_tokens;
    const describeTable = fakeDescribeTable(definition);
    describeTable.created_at.defaultValue = null;
    const problems = await baseline.diffTable(
        buildQueryInterface(definition, { describeTable }), Sequelize, 'password_reset_tokens', definition,
    );
    assert.ok(problems.some((p) => p.includes('created_at') && p.includes('기본값 불일치')), problems.join('\n'));
});

test('diffTable: unique 컬럼(email)에 실제 유니크 인덱스가 없으면 잡아낸다', async () => {
    const definition = definitions.users;
    const showIndex = fakeShowIndexResults(definition).filter((index) => index.name !== 'email_unique');
    const problems = await baseline.diffTable(
        buildQueryInterface(definition, { showIndex }), Sequelize, 'users', definition,
    );
    assert.ok(problems.some((p) => p.includes('인덱스') && p.includes('email')), problems.join('\n'));
});

test('diffTable: 복합 유니크 인덱스(friendships)의 컬럼 순서가 다르면 잡아낸다', async () => {
    const definition = definitions.friendships;
    const showIndex = [
        { name: 'PRIMARY', primary: true, unique: true, fields: [{ attribute: 'id' }] },
        { name: 'friendships_reversed', primary: false, unique: true, fields: [{ attribute: 'receiver_id' }, { attribute: 'requester_id' }] },
    ];
    const problems = await baseline.diffTable(
        buildQueryInterface(definition, { showIndex }), Sequelize, 'friendships', definition,
    );
    assert.ok(problems.some((p) => p.includes('인덱스')), problems.join('\n'));
});

test('actualIndexesOf: 정규화된 showIndex() 결과에서 PRIMARY를 제외하고 unique/fields를 그대로 뽑아낸다 (원시 SHOW INDEX 필드가 아님을 증명)', () => {
    const showIndexResults = [
        { primary: true, unique: true, name: 'PRIMARY', tableName: 'users', type: 'BTREE', fields: [{ attribute: 'uuid' }] },
        { primary: false, unique: true, name: 'users_nickname_unique', tableName: 'users', type: 'BTREE', fields: [{ attribute: 'nickname' }] },
        { primary: false, unique: false, name: 'idx_status', tableName: 'users', type: 'BTREE', fields: [{ attribute: 'status' }] },
    ];
    const result = baseline.actualIndexesOf(showIndexResults);
    assert.deepEqual(result, [
        { unique: true, fields: ['nickname'] },
        { unique: false, fields: ['status'] },
    ]);
});

test('diffTable: 외래키가 실제 DB에 없으면 잡아낸다 (user_bans.user_id → users.uuid)', async () => {
    const definition = definitions.user_bans;
    const problems = await baseline.diffTable(
        buildQueryInterface(definition, { foreignKeys: [] }), Sequelize, 'user_bans', definition,
    );
    assert.ok(problems.some((p) => p.includes('외래키') && p.includes('user_id')), problems.join('\n'));
});

test('diffTable: 외래키가 다른 테이블을 가리키면 잡아낸다', async () => {
    const definition = definitions.game_result_players;
    const foreignKeys = [
        { columnName: 'game_id', referencedTableName: 'game_results', referencedColumnName: 'id' },
        { columnName: 'user_id', referencedTableName: 'wrong_table', referencedColumnName: 'uuid' },
    ];
    const problems = await baseline.diffTable(
        buildQueryInterface(definition, { foreignKeys }), Sequelize, 'game_result_players', definition,
    );
    assert.ok(problems.some((p) => p.includes('외래키') && p.includes('user_id')), problems.join('\n'));
});

test('expectedDefaultValue: NOW는 CURRENT_TIMESTAMP로 번역된다', () => {
    assert.equal(baseline.expectedDefaultValue(Sequelize, { defaultValue: Sequelize.NOW }), 'CURRENT_TIMESTAMP');
});

test('expectedDefaultValue: UUIDV4는 검사 대상에서 제외된다(undefined)', () => {
    assert.equal(baseline.expectedDefaultValue(Sequelize, { defaultValue: Sequelize.UUIDV4 }), undefined);
});

test('expectedDefaultValue: boolean은 0/1 문자열로 번역된다', () => {
    assert.equal(baseline.expectedDefaultValue(Sequelize, { defaultValue: true }), '1');
    assert.equal(baseline.expectedDefaultValue(Sequelize, { defaultValue: false }), '0');
});

test('expectedDefaultValue: defaultValue를 선언하지 않은 컬럼은 검사하지 않는다(undefined)', () => {
    assert.equal(baseline.expectedDefaultValue(Sequelize, {}), undefined);
});
