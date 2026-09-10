'use strict';

// F-12 0009-add-achievement-grants.js 멱등성 단위 시험. 실제 MySQL 없이도 CODEX-1 재검토
// (AC-04)가 지적한 시나리오 — createTable은 성공했지만 이어지는 addIndex 전에 배포가
// 중단되어 테이블만 있고 achievement_grants_user_achievement_unique 유일 인덱스가 없는
// 상태 — 에서 up()을 다시 실행하면 인덱스가 복구되고, verify()는 인덱스가 없으면 실패로
// 잡아내는지 확인한다. 가짜 queryInterface는 showAllTables/createTable/addIndex/showIndex/
// dropTable만 흉내 낸다 — 실제 DDL·타입 강제는 backend/tests/db/f12-achievements.*.test.js의
// 격리 MySQL 시험(F01_TEST_DATABASE_URL)이 담당한다.

const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');

const migration = require('./0009-add-achievement-grants');

const createFakeQueryInterface = () => {
    const tables = new Set();
    const indexes = []; // [{ name, tableName }]
    return {
        async showAllTables() { return [...tables]; },
        async createTable(name) { tables.add(name); },
        async addIndex(tableName, fields, options) { indexes.push({ name: options.name, tableName }); },
        async showIndex(tableName) { return indexes.filter((index) => index.tableName === tableName); },
        async dropTable(name) { tables.delete(name); },
        // 시험 전용 관찰 지점 — 실제 queryInterface 계약이 아니다.
        __tables: tables,
        __indexes: indexes,
    };
};

test('up(): 처음 실행하면 테이블과 유일 인덱스가 함께 만들어지고 verify()가 통과한다', async () => {
    const qi = createFakeQueryInterface();
    await migration.up(qi, Sequelize);

    assert.ok(qi.__tables.has('achievement_grants'));
    assert.ok(qi.__indexes.some((i) => i.name === 'achievement_grants_user_achievement_unique'));
    await assert.doesNotReject(() => migration.verify(qi));
});

test('AC-04 CODEX-1 재검토: 테이블만 있고 인덱스가 없는(addIndex 직전 중단) 상태에서 up()을 다시 실행하면 인덱스가 복구된다', async () => {
    const qi = createFakeQueryInterface();
    // createTable은 성공했지만 addIndex 전에 죽은 이전 실행을 흉내낸다.
    qi.__tables.add('achievement_grants');
    assert.equal(qi.__indexes.length, 0, '전제: 아직 인덱스가 없다');

    await migration.up(qi, Sequelize);

    assert.ok(qi.__indexes.some((i) => i.name === 'achievement_grants_user_achievement_unique'), '재실행이 누락된 유일 인덱스를 복구해야 한다');
});

test('AC-04 CODEX-1 재검토: verify()는 테이블은 있지만 유일 인덱스가 없으면 실패로 잡아낸다', async () => {
    const qi = createFakeQueryInterface();
    qi.__tables.add('achievement_grants'); // 인덱스는 만들지 않는다 — 중간 실패 상태.

    await assert.rejects(() => migration.verify(qi), /유일 인덱스가 없습니다/);
});

test('up()을 두 번 연달아 실행해도 인덱스가 중복으로 추가되지 않는다', async () => {
    const qi = createFakeQueryInterface();
    await migration.up(qi, Sequelize);
    await migration.up(qi, Sequelize);

    const matching = qi.__indexes.filter((i) => i.name === 'achievement_grants_user_achievement_unique');
    assert.equal(matching.length, 1, 'addIndex가 이미 있는 인덱스 위에 다시 호출되면 안 된다');
});

test('down(): 테이블이 있으면 지운다', async () => {
    const qi = createFakeQueryInterface();
    await migration.up(qi, Sequelize);
    await migration.down(qi);
    assert.equal(qi.__tables.has('achievement_grants'), false);
});
