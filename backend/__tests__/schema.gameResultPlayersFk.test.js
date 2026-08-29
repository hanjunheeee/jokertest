// AC-02 — game_result_players.user_id가 NOT NULL이고 users.uuid를 참조하는지 확인합니다.
//
// 살아 있는 mysql이 없어 INSERT로 제약을 때려볼 수는 없습니다. 대신 sequelize가
// CREATE TABLE ... REFERENCES 구문을 만들 때 읽는 두 곳을 모두 확인합니다.
//   1) 컬럼 정의의 allowNull / references
//   2) belongsTo 관계(foreignKey·targetKey)
// 둘 중 하나만 맞아도 통과하지 않도록 각각 단언하고, 같은 형태가 이미 동작 중인
// user_sessions.user_id와도 대조합니다.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { db, attributesOf, typeNameOf, referenceOf, belongsToOf } = require('./testHelpers/schemaMeta');

const userIdAttribute = () => attributesOf(db.GameResultPlayer).user_id;

test('game_result_players.user_id는 UUID이고 NOT NULL이다', () => {
    const attribute = userIdAttribute();

    assert.ok(attribute, 'user_id 컬럼이 없습니다');
    assert.equal(typeNameOf(attribute), 'UUID');
    assert.equal(attribute.allowNull, false, 'user_id는 NULL을 허용하면 안 됩니다');
});

test('game_result_players.user_id는 users(uuid)를 참조한다', () => {
    const reference = referenceOf(userIdAttribute());

    assert.ok(reference, 'user_id에 외래키 참조가 없습니다');
    assert.equal(reference.table, 'users');
    assert.equal(reference.key, 'uuid');
});

test('참조 대상인 users.uuid는 실제로 users 테이블의 기본키다', () => {
    const uuid = attributesOf(db.User).uuid;

    assert.equal(db.User.tableName, 'users');
    assert.equal(uuid.primaryKey, true);
    assert.equal(typeNameOf(uuid), 'UUID');
});

test('GameResultPlayer는 user_id로 User에 belongsTo 한다', () => {
    const association = belongsToOf(db.GameResultPlayer, 'User');

    assert.ok(association, 'User를 가리키는 belongsTo 관계가 없습니다');
    assert.equal(association.foreignKey, 'user_id');
    assert.equal(association.targetKey, 'uuid');
});

test('user_id 제약은 이미 쓰이는 user_sessions.user_id와 같은 형태다', () => {
    const target  = userIdAttribute();
    const example = attributesOf(db.UserSession).user_id;

    assert.equal(typeNameOf(target), typeNameOf(example));
    assert.equal(target.allowNull, example.allowNull);
    assert.deepEqual(referenceOf(target), referenceOf(example));
});

test('game_result_id는 NOT NULL이고 game_results(id)를 참조한다', () => {
    const attribute = attributesOf(db.GameResultPlayer).game_result_id;
    const reference = referenceOf(attribute);

    assert.equal(attribute.allowNull, false);
    assert.ok(reference, 'game_result_id에 외래키 참조가 없습니다');
    assert.equal(reference.table, 'game_results');
    assert.equal(reference.key, 'id');
});
