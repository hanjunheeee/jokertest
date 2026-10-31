const test = require('node:test');
const assert = require('node:assert/strict');

const { db, attributesOf, typeNameOf, referenceOf, belongsToOf } = require('../helpers/schemaMeta');

test('game_result_players has the required composite primary key', () => {
  const attributes = attributesOf(db.GameResultPlayer);
  const primaryKeys = Object.entries(attributes)
    .filter(([, attribute]) => attribute.primaryKey === true)
    .map(([name]) => name)
    .sort();
  assert.deepEqual(primaryKeys, ['game_id', 'user_id']);
});

test('game_id is a non-null UUID reference to game_results.id', () => {
  const attribute = attributesOf(db.GameResultPlayer).game_id;
  assert.equal(typeNameOf(attribute), 'UUID');
  assert.equal(attribute.allowNull, false);
  assert.deepEqual(referenceOf(attribute), { table: 'game_results', key: 'id' });

  const association = belongsToOf(db.GameResultPlayer, 'GameResult');
  assert.equal(association.foreignKey, 'game_id');
  assert.equal(association.targetKey, 'id');
});

test('user_id is a non-null UUID reference to users.uuid', () => {
  const attribute = attributesOf(db.GameResultPlayer).user_id;
  assert.equal(typeNameOf(attribute), 'UUID');
  assert.equal(attribute.allowNull, false);
  assert.deepEqual(referenceOf(attribute), { table: 'users', key: 'uuid' });
  assert.equal(attributesOf(db.User).uuid.primaryKey, true);

  const association = belongsToOf(db.GameResultPlayer, 'User');
  assert.equal(association.foreignKey, 'user_id');
  assert.equal(association.targetKey, 'uuid');
});
