// AC-01 — 신규 테이블 3개(game_results, game_result_players, concurrent_snapshots)가
// 정확한 스키마로 만들어지는지 확인합니다.
//
// config/config.json이 모든 환경에서 mysql을 쓰기 때문에 테스트에서 살아 있는 DB에
// 붙을 수 없습니다. 그래서 sequelize.sync()가 CREATE TABLE을 만들 때 그대로 쓰는
// 모델 정의(테이블명·컬럼·타입·NOT NULL·기본값)를 검사합니다.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { db, attributesOf, typeNameOf } = require('./testHelpers/schemaMeta');

// 컬럼 이름 → [타입, NOT NULL 여부, 기본값 유무]
const EXPECTED_TABLES = {
    GameResult: {
        tableName: 'game_results',
        primaryKey: { name: 'id', autoIncrement: true },
        columns: {
            id:           { type: 'INTEGER',    notNull: false, hasDefault: false },
            room_code:    { type: 'STRING(10)', notNull: true,  hasDefault: false },
            winner_team:  { type: 'STRING(20)', notNull: true,  hasDefault: false },
            player_count: { type: 'INTEGER',    notNull: true,  hasDefault: false },
            total_days:   { type: 'INTEGER',    notNull: true,  hasDefault: true  },
            started_at:   { type: 'DATE',       notNull: true,  hasDefault: false },
            ended_at:     { type: 'DATE',       notNull: true,  hasDefault: false },
            created_at:   { type: 'DATE',       notNull: true,  hasDefault: true  },
        },
    },
    GameResultPlayer: {
        tableName: 'game_result_players',
        primaryKey: { name: 'id', autoIncrement: true },
        columns: {
            id:             { type: 'INTEGER',    notNull: false, hasDefault: false },
            game_result_id: { type: 'INTEGER',    notNull: true,  hasDefault: false },
            user_id:        { type: 'UUID',       notNull: true,  hasDefault: false },
            role:           { type: 'STRING(20)', notNull: true,  hasDefault: false },
            is_winner:      { type: 'BOOLEAN',    notNull: true,  hasDefault: true  },
            survived:       { type: 'BOOLEAN',    notNull: true,  hasDefault: true  },
            created_at:     { type: 'DATE',       notNull: true,  hasDefault: true  },
        },
    },
    ConcurrentSnapshot: {
        tableName: 'concurrent_snapshots',
        primaryKey: { name: 'id', autoIncrement: true },
        columns: {
            id:            { type: 'INTEGER', notNull: false, hasDefault: false },
            captured_at:   { type: 'DATE',    notNull: true,  hasDefault: true  },
            online_users:  { type: 'INTEGER', notNull: true,  hasDefault: true  },
            playing_users: { type: 'INTEGER', notNull: true,  hasDefault: true  },
            active_rooms:  { type: 'INTEGER', notNull: true,  hasDefault: true  },
        },
    },
};

for (const [modelName, expected] of Object.entries(EXPECTED_TABLES)) {
    test(`${expected.tableName}: 모델이 등록되고 테이블명이 일치한다`, () => {
        const Model = db[modelName];
        assert.ok(Model, `${modelName} 모델이 models/index.js 로더에 등록되지 않았습니다`);
        assert.equal(Model.tableName, expected.tableName);
    });

    test(`${expected.tableName}: 컬럼 목록이 정확히 일치한다`, () => {
        const actual = Object.keys(attributesOf(db[modelName])).sort();
        assert.deepEqual(actual, Object.keys(expected.columns).sort());
    });

    test(`${expected.tableName}: 컬럼 타입·NOT NULL·기본값이 정의와 일치한다`, () => {
        const attributes = attributesOf(db[modelName]);

        for (const [column, spec] of Object.entries(expected.columns)) {
            const attribute = attributes[column];
            assert.ok(attribute, `${expected.tableName}.${column} 컬럼이 없습니다`);
            assert.equal(typeNameOf(attribute), spec.type, `${expected.tableName}.${column} 타입`);
            // 기본키는 dialect가 자동으로 NOT NULL을 붙이므로 allowNull을 단언하지 않습니다.
            if (!attribute.primaryKey) {
                assert.equal(
                    attribute.allowNull === false,
                    spec.notNull,
                    `${expected.tableName}.${column} NOT NULL 여부`
                );
            }
            assert.equal(
                attribute.defaultValue !== undefined,
                spec.hasDefault,
                `${expected.tableName}.${column} 기본값 유무`
            );
        }
    });

    test(`${expected.tableName}: 기본키가 auto increment ${expected.primaryKey.name} 하나다`, () => {
        const attributes = attributesOf(db[modelName]);
        const primaryKeys = Object.entries(attributes)
            .filter(([, attribute]) => attribute.primaryKey === true)
            .map(([name]) => name);

        assert.deepEqual(primaryKeys, [expected.primaryKey.name]);
        assert.equal(attributes[expected.primaryKey.name].autoIncrement, expected.primaryKey.autoIncrement);
    });
}

test('세 테이블 모두 자동 타임스탬프 컬럼 없이 명시 컬럼만 가진다', () => {
    for (const [modelName, expected] of Object.entries(EXPECTED_TABLES)) {
        const columns = Object.keys(attributesOf(db[modelName]));
        assert.ok(!columns.includes('updatedAt'), `${expected.tableName}에 updatedAt이 생겼습니다`);
        assert.ok(!columns.includes('updated_at'), `${expected.tableName}에 updated_at이 생겼습니다`);
        assert.ok(!columns.includes('createdAt'), `${expected.tableName}에 createdAt이 생겼습니다`);
    }
});
