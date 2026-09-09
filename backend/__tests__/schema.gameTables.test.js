const test = require('node:test');
const assert = require('node:assert/strict');

const { db, attributesOf, typeNameOf } = require('./testHelpers/schemaMeta');

const EXPECTED_TABLES = {
  GameResult: {
    tableName: 'game_results',
    primaryKeys: ['id'],
    autoIncrement: [],
    columns: {
      id: { type: 'UUID', allowNull: undefined },
      room_id: { type: 'UUID', allowNull: true },
      started_at: { type: 'DATE', allowNull: false },
      ended_at: { type: 'DATE', allowNull: false },
      winner: { type: 'STRING(20)', allowNull: false },
      win_reason: { type: 'STRING(40)', allowNull: true },
      day_index: { type: 'INTEGER', allowNull: false },
      player_count: { type: 'INTEGER', allowNull: false },
      settings: { type: 'JSON', allowNull: true },
      completed: { type: 'BOOLEAN', allowNull: false, defaultValue: true },
    },
  },
  GameResultPlayer: {
    tableName: 'game_result_players',
    primaryKeys: ['game_id', 'user_id'],
    autoIncrement: [],
    columns: {
      game_id: { type: 'UUID', allowNull: false },
      user_id: { type: 'UUID', allowNull: false },
      // F-01: 0002-expand-nickname-snapshot.js가 기존 DB의 컬럼을 30→50으로 확장한다.
      // users.nickname(50자)과 잘림 없이 왕복 저장되도록 모델 정의도 함께 50으로 맞춘다.
      nickname_snapshot: { type: 'STRING(50)', allowNull: false },
      role: { type: 'STRING(20)', allowNull: false },
      team: { type: 'STRING(20)', allowNull: false },
      won: { type: 'BOOLEAN', allowNull: true },
      is_alive: { type: 'BOOLEAN', allowNull: false },
      death_reason: { type: 'STRING(20)', allowNull: true },
    },
  },
  ConcurrentSnapshot: {
    tableName: 'concurrent_snapshots',
    primaryKeys: ['id'],
    autoIncrement: ['id'],
    columns: {
      id: { type: 'BIGINT', allowNull: undefined },
      captured_at: { type: 'DATE', allowNull: false },
      total: { type: 'INTEGER', allowNull: false },
      lobby: { type: 'INTEGER', allowNull: false },
      in_game: { type: 'INTEGER', allowNull: false },
      room_count: { type: 'INTEGER', allowNull: false },
    },
  },
};

for (const [modelName, expected] of Object.entries(EXPECTED_TABLES)) {
  test(`${expected.tableName}: exact table and column definition`, () => {
    const Model = db[modelName];
    assert.ok(Model);
    assert.equal(Model.tableName, expected.tableName);
    assert.equal(Model.options.timestamps, false);

    const attributes = attributesOf(Model);
    assert.deepEqual(Object.keys(attributes).sort(), Object.keys(expected.columns).sort());

    for (const [column, specification] of Object.entries(expected.columns)) {
      const attribute = attributes[column];
      assert.equal(typeNameOf(attribute), specification.type, `${expected.tableName}.${column} type`);
      assert.equal(attribute.allowNull, specification.allowNull, `${expected.tableName}.${column} allowNull`);
      assert.equal(attribute.defaultValue, specification.defaultValue, `${expected.tableName}.${column} default`);
    }

    const primaryKeys = Object.entries(attributes)
      .filter(([, attribute]) => attribute.primaryKey === true)
      .map(([name]) => name)
      .sort();
    const autoIncrement = Object.entries(attributes)
      .filter(([, attribute]) => attribute.autoIncrement === true)
      .map(([name]) => name)
      .sort();
    assert.deepEqual(primaryKeys, [...expected.primaryKeys].sort());
    assert.deepEqual(autoIncrement, [...expected.autoIncrement].sort());
  });
}

test('concurrent_snapshots indexes captured_at and adds no other index', () => {
  const indexedFields = db.ConcurrentSnapshot.options.indexes.map((index) => index.fields);
  assert.deepEqual(indexedFields, [['captured_at']]);
});

test('Sequelize sync can generate CREATE TABLE DDL for all three models', () => {
  const queryGenerator = db.sequelize.getQueryInterface().queryGenerator;

  for (const [modelName, expected] of Object.entries(EXPECTED_TABLES)) {
    const Model = db[modelName];
    const attributesSql = queryGenerator.attributesToSQL(Model.rawAttributes, { context: 'createTable' });
    const ddl = queryGenerator.createTableQuery(Model.tableName, attributesSql, Model.options);

    assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS `' + expected.tableName + '`'));
    for (const column of Object.keys(expected.columns)) {
      assert.ok(ddl.includes('`' + column + '`'), `${expected.tableName}.${column} missing from DDL`);
    }
  }
});
