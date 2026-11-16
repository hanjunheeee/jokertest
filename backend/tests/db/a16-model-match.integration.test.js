'use strict';

// 코드 속 표 정의(모델)와 마이그레이션으로 만든 진짜 표가 같은 모양인지 봄 (표 이름·칸 이름·빈 값 허용·이름 붙은 목차)
// 목록 docs/게임_의도_2026-11-15/시험목록/A16-DB-마이그레이션.md A16-B-261~264 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
const h = require('./a16-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, noDb } = h;

test.before(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
});

test.after(async () => {
    if (h.TEST_DB_URL) await h.restoreFull();
    await db.sequelize.close();
});

// 모델 없는 표 2개 (ERD 양식)
const TABLES_WITHOUT_MODEL = ['refresh_token_history', 'schema_migrations'];
// DB에만 있는 계산 칸 (0013이 만듦)
const DB_ONLY_COLUMNS = { friend_requests: ['pending_pair_key'] };

const models = () => Object.values(db.sequelize.models);
const tableOf = (Model) => {
    const name = Model.getTableName();
    return typeof name === 'string' ? name : name.tableName;
};
// 모델 칸 (진짜 칸 이름 기준, 가상 칸 뺌)
const modelColumns = (Model) => Object.values(Model.getAttributes())
    .filter((attribute) => attribute.type?.key !== 'VIRTUAL');

// 모델에 이름 적은 목차: indexes 칸 + 칸마다 unique: '이름' (칸은 진짜 칸 이름으로)
function namedIndexesOf(Model) {
    const attributes = Model.getAttributes();
    const fieldOf = (field) => {
        const name = typeof field === 'string' ? field : (field.name ?? field.attribute);
        return attributes[name]?.field ?? name;
    };
    const fromIndexes = (Model.options.indexes ?? []).filter((index) => index.name)
        .map((index) => ({ name: index.name, fields: index.fields.map(fieldOf), unique: Boolean(index.unique) }));
    const fromColumns = Object.values(attributes).filter((attribute) => typeof attribute.unique === 'string')
        .map((attribute) => ({ name: attribute.unique, fields: [attribute.field], unique: true }));
    return [...fromIndexes, ...fromColumns];
}

test('A16-B-261 모델 표 47개 + 모델 없는 표 2개 = DB 표 49개', async (t) => {
    if (noDb(t)) return;
    const modelTables = models().map(tableOf);
    assert.equal(modelTables.length, 47);
    assert.deepEqual([...modelTables, ...TABLES_WITHOUT_MODEL].sort(), await h.listTables());
});

test('A16-B-262 모델마다 칸 이름이 표와 같음 (friend_requests.pending_pair_key만 DB에만)', async (t) => {
    if (noDb(t)) return;
    const mismatches = [];
    for (const Model of models()) {
        const table = tableOf(Model);
        const fromModel = modelColumns(Model).map((attribute) => attribute.field).sort();
        const fromDb = Object.keys(await h.qi().describeTable(table))
            .filter((column) => !(DB_ONLY_COLUMNS[table] ?? []).includes(column)).sort();
        if (JSON.stringify(fromModel) !== JSON.stringify(fromDb)) {
            mismatches.push(`${table}: 모델만 [${fromModel.filter((c) => !fromDb.includes(c))}] / DB만 [${fromDb.filter((c) => !fromModel.includes(c))}]`);
        }
    }
    assert.deepEqual(mismatches, []);
});

test('A16-B-263 모델마다 빈 값 허용이 표와 같음 (안 적으면 허용, 기본 키는 아님)', async (t) => {
    if (noDb(t)) return;
    const mismatches = [];
    for (const Model of models()) {
        const table = tableOf(Model);
        const described = await h.qi().describeTable(table);
        for (const attribute of modelColumns(Model)) {
            const column = described[attribute.field];
            if (!column) continue; // 칸 이름 다른 것은 262가 잡음
            const modelNullable = attribute.primaryKey ? false : attribute.allowNull !== false;
            if (modelNullable !== column.allowNull) {
                mismatches.push(`${table}.${attribute.field}: 모델 ${modelNullable ? '빈 값 됨' : '빈 값 안 됨'} / DB ${column.allowNull ? '빈 값 됨' : '빈 값 안 됨'}`);
            }
        }
    }
    assert.deepEqual(mismatches, []);
});

test('A16-B-264 모델에 이름 적은 목차가 표에 같은 이름·칸 차례·유일 여부로 있음', async (t) => {
    if (noDb(t)) return;
    const mismatches = [];
    const allNamed = [];
    for (const Model of models()) {
        const table = tableOf(Model);
        const named = namedIndexesOf(Model);
        if (named.length === 0) continue;
        const present = await h.qi().showIndex(table);
        for (const index of named) {
            allNamed.push(index.name);
            const found = present.find((candidate) => candidate.name === index.name);
            if (!found) { mismatches.push(`${table}: ${index.name} 없음`); continue; }
            const dbFields = found.fields.map((field) => field.attribute);
            if (index.fields.join(',') !== dbFields.join(',')) mismatches.push(`${table}: ${index.name} 칸 모델 [${index.fields}] / DB [${dbFields}]`);
            if (index.unique !== (found.unique === true)) mismatches.push(`${table}: ${index.name} 유일 여부 다름`);
        }
    }
    // 예로 든 것은 꼭 들어 있어야 함 (game_desertions 3개, user_sessions 해시 2개, oauth_states state 해시)
    for (const name of [
        'game_desertions_user_game_unique', 'game_desertions_user_deserted_idx', 'game_desertions_blocked_until_idx',
        'user_sessions_refresh_token_hash', 'user_sessions_refresh_previous_hash', 'oauth_states_state_hash_unique',
    ]) {
        assert.ok(allNamed.includes(name), `모델에 ${name} 목차 없음`);
    }
    assert.deepEqual(mismatches, []);
});
