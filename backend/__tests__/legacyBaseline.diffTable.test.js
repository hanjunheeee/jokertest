'use strict';

// F-01 재검토 대응 — diffTable이 컬럼 타입/NOT NULL/기본키뿐 아니라 기본값·유니크 인덱스·
// 외래키까지 실제로 잡아내는지 증명하는 유닛 테스트. 실제 MySQL 없이(이 환경은 격리 MySQL
// 자격 증명을 구할 수 없다 — docs/requirements/2026-09-09-f01-migration-runbook.md §7)
// queryInterface를 흉내낸 순수 객체로 diffTable을 직접 호출한다. describeTable이 반환하는
// 형태는 backend/node_modules/sequelize/lib/dialects/mysql/query.js(DESCRIBE)를, showIndex가
// 반환하는 형태는 같은 파일의 handleShowIndexesQuery가 만드는 정규화된 배열
// ({ primary, fields:[{attribute,length,order}], name, tableName, unique, type }) —
// 원시 SHOW INDEX 필드(Key_name/Non_unique/Seq_in_index/Column_name)가 아니다 — 를 그대로
// 따른다. 이전 회차는 원시 필드 형태로 가짜 응답을 만들어, actualIndexesOf가 원시 필드를
// 읽던 회귀(실제 DB에서는 항상 undefined만 나옴)를 이 테스트가 잡아내지 못했다(재검토 지적).

const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');

const baseline = require('../db/migrations/0001-legacy-baseline');

const definitions = baseline.buildDefinitions(Sequelize);

// buildDefinitions()가 선언한 컬럼 정의로부터 "구조가 정확히 일치하는" 가짜 describeTable
// 결과를 만든다. 개별 테스트는 이 결과에서 딱 한 가지만 일부러 어긋내 diffTable이 그
// 하나만 잡아내는지 확인한다.
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
    if (value === Sequelize.UUIDV4) return null; // 애플리케이션 레벨 생성 — DB DEFAULT 없음
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

// queryInterface.showIndex()가 실제로 돌려주는 정규화된 형태 — actualIndexesOf 위 주석 참고.
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

// diffTable이 호출하는 세 메서드만 구현한 최소 queryInterface. 오버라이드로 특정 응답만
// 바꿔치기해 "실제 DB가 이렇게 어긋나 있다면"을 흉내낸다.
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
    describeTable.role.defaultValue = 'ADMIN'; // 기대값은 'USER'
    const problems = await baseline.diffTable(
        buildQueryInterface(definition, { describeTable }), Sequelize, 'users', definition,
    );
    assert.ok(problems.some((p) => p.includes('role') && p.includes('기본값 불일치')), problems.join('\n'));
});

test('diffTable: NOW() 기본값(CURRENT_TIMESTAMP)이 실제 DB에 없으면 잡아낸다', async () => {
    const definition = definitions.password_reset_tokens;
    const describeTable = fakeDescribeTable(definition);
    describeTable.created_at.defaultValue = null; // 기대값은 CURRENT_TIMESTAMP
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
    // 기대: [requester_id, receiver_id]. 실제는 순서가 뒤집힌 인덱스만 있다고 흉내낸다.
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
    // 실제 mysql2/sequelize가 돌려주는 형태 그대로 — Key_name/Non_unique/Seq_in_index/Column_name
    // 같은 원시 필드는 여기 전혀 없다. 이전 회차는 이 원시 필드를 읽었기 때문에, 아래처럼
    // 정규화된 입력을 주면 모든 필드가 undefined가 되어 실제 정상 기존 DB도 거부했을 것이다.
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

// ── expectedDefaultValue 단위 확인 ────────────────────────────────────────────

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
