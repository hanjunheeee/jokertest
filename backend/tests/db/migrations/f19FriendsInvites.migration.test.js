'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Sequelize } = require('sequelize');
const migration = require('../../../db/migrations/0013-f19-friends-invites');

const GAME_INVITES = migration.TABLE_NAMES.GAME_INVITES;
const FRIEND_FAVORITES = migration.TABLE_NAMES.FRIEND_FAVORITES;
const FRIEND_BLOCKS = migration.TABLE_NAMES.FRIEND_BLOCKS;
const FRIEND_REQUESTS = migration.FRIEND_REQUESTS_TABLE;
const SEQ_UNIQUE_INDEX = migration.INVITE_SEQ_UNIQUE_INDEX;
const PAIR_COLUMN = migration.PENDING_PAIR_COLUMN;
const PAIR_INDEX = migration.PENDING_PAIR_INDEX;

const renderUpSql = async () => {
    const sequelize = new Sequelize('mysql://renderer:renderer@127.0.0.1:3306/renderer', { logging: false });
    const realQueryInterface = sequelize.getQueryInterface();

    const sql = [];
    sequelize.query = async (statement) => {
        sql.push(String(statement));
        return [[], {}];
    };

    const indexesByTable = new Map();
    const addedIndexes = [];

    const queryInterface = {
        sequelize,
        async showAllTables() { return []; },
        async createTable(name, attributes, options) {
            const declared = Object.keys(options?.uniqueKeys ?? {}).map((indexName) => ({
                name: indexName,
                unique: true,
                fields: options.uniqueKeys[indexName].fields.map((field) => ({ attribute: field })),
            }));
            indexesByTable.set(name, declared);
            return await realQueryInterface.createTable(name, attributes, options);
        },
        async showIndex(name) { return indexesByTable.get(name) ?? []; },
        async addIndex(name, fields, options = {}) {
            addedIndexes.push({ table: name, fields, name: options.name, unique: options.unique === true });
            const list = indexesByTable.get(name) ?? [];
            list.push({
                name: options.name,
                unique: options.unique === true,
                fields: fields.map((field) => ({ attribute: field })),
            });
            indexesByTable.set(name, list);
        },
        async removeIndex() {},
        async describeTable(name) {
            if (name !== FRIEND_REQUESTS) throw new Error(`예상 밖 describeTable: ${name}`);
            return { id: {}, requester_id: {}, receiver_id: {}, status: {} };
        },
    };

    await migration.up(queryInterface, Sequelize, sequelize);
    return { sql, addedIndexes };
};

const createTableSqlFor = (sql, table) => {
    const found = sql.find((statement) => statement.includes(`CREATE TABLE IF NOT EXISTS \`${table}\``));
    assert.ok(found, `${table}의 CREATE TABLE이 실행되지 않았습니다`);
    return found;
};

test('실제 mysql generator: game_invites의 CREATE TABLE 한 문장 안에 creation_seq auto_increment와 그 이름 있는 유일 키가 함께 들어간다', async () => {
    const { sql } = await renderUpSql();
    const create = createTableSqlFor(sql, GAME_INVITES);

    assert.match(create, /`creation_seq` BIGINT NOT NULL auto_increment/, 'creation_seq는 AUTO_INCREMENT여야 한다');

    assert.ok(
        create.includes(`UNIQUE \`${SEQ_UNIQUE_INDEX}\` (\`creation_seq\`)`),
        `CREATE TABLE에 UNIQUE ${SEQ_UNIQUE_INDEX} (creation_seq)가 없습니다:\n${create}`,
    );

    assert.ok(create.includes('PRIMARY KEY (`id`)'), 'UUID 기본 키가 유지돼야 한다');
    assert.match(create, /`id` CHAR\(36\) BINARY NOT NULL/);
    assert.ok(create.includes('FOREIGN KEY (`sender_id`) REFERENCES `users` (`uuid`)'));
    assert.ok(create.includes('FOREIGN KEY (`receiver_id`) REFERENCES `users` (`uuid`)'));
});

test('실제 mysql generator: AUTO_INCREMENT 컬럼이 같은 문장에서 어떤 키에도 덮이지 않는 CREATE TABLE은 하나도 없다', async () => {
    const { sql } = await renderUpSql();

    for (const statement of sql.filter((item) => item.includes('CREATE TABLE'))) {
        const autoColumns = [...statement.matchAll(/`([a-z_]+)` [A-Z()0-9 ]*?NOT NULL auto_increment/g)]
            .map((match) => match[1]);
        for (const column of autoColumns) {
            const covered = statement.includes(`PRIMARY KEY (\`${column}\``)
                || new RegExp(`(UNIQUE|KEY) \`[a-z_]+\` \\(\`${column}\``).test(statement);
            assert.ok(covered, `auto_increment 컬럼 ${column}이 같은 DDL의 키에 덮이지 않았습니다:\n${statement}`);
        }
    }
});

test('실제 mysql generator: 컬럼 정의의 unique 문자열만으로는 키가 생기지 않는다(이 회귀의 근본 원인 고정)', async () => {
    const sequelize = new Sequelize('mysql://renderer:renderer@127.0.0.1:3306/renderer', { logging: false });
    const queryInterface = sequelize.getQueryInterface();
    const sql = [];
    sequelize.query = async (statement) => { sql.push(String(statement)); return [[], {}]; };

    await queryInterface.createTable('probe_table', {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        seq: { type: Sequelize.BIGINT, allowNull: false, autoIncrement: true, unique: 'probe_seq_unique' },
    });

    assert.equal(sql.length, 1);
    assert.ok(sql[0].includes('auto_increment'));
    assert.ok(
        !sql[0].includes('probe_seq_unique'),
        '설치된 sequelize가 문자열 unique를 DDL에 반영한다면 마이그레이션 주석을 갱신해야 한다',
    );

    sql.length = 0;
    await queryInterface.createTable('probe_table', {
        id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
        seq: { type: Sequelize.BIGINT, allowNull: false, autoIncrement: true },
    }, { uniqueKeys: { probe_seq_unique: { fields: ['seq'] } } });

    assert.ok(sql[0].includes('UNIQUE `probe_seq_unique` (`seq`)'));
});

test('실제 mysql generator: 새로 만든 테이블에는 creation_seq 유일 키를 addIndex로 다시 만들지 않는다', async () => {
    const { addedIndexes } = await renderUpSql();
    assert.equal(
        addedIndexes.filter((index) => index.name === SEQ_UNIQUE_INDEX).length,
        0,
        '생성 DDL이 이미 만든 키를 다시 만들려 하면 실제 MySQL에서 중복 인덱스 오류가 난다',
    );
    for (const name of [
        'game_invites_sender_key_unique', 'game_invites_receiver_seq_idx',
        'game_invites_receiver_status_idx', 'game_invites_room_idx',
    ]) {
        assert.ok(addedIndexes.some((index) => index.name === name), `${name}이 만들어져야 한다`);
    }
});

const FakeSequelize = {
    UUID: 'UUID',
    BIGINT: 'BIGINT',
    INTEGER: 'INTEGER',
    STRING: (n) => `STRING(${n})`,
    DATE: 'DATE',
    NOW: 'NOW',
};

const createFakeQueryInterface = () => {
    const tables = new Map();

    tables.set(FRIEND_REQUESTS, {
        columns: {
            id: { type: 'INTEGER', primaryKey: true, allowNull: false },
            requester_id: { type: 'UUID', allowNull: false, references: { model: 'users', key: 'uuid' } },
            receiver_id: { type: 'UUID', allowNull: false, references: { model: 'users', key: 'uuid' } },
            status: { type: 'STRING(20)', allowNull: false },
            message: { type: 'STRING(255)', allowNull: true },
            responded_at: { type: 'DATE', allowNull: true },
        },
        indexes: [
            {
                name: 'friend_requests_requester_id_receiver_id_status',
                unique: true,
                fields: ['requester_id', 'receiver_id', 'status'].map((attribute) => ({ attribute })),
            },
            { name: 'receiver_id', unique: false, fields: [{ attribute: 'receiver_id' }] },
        ],
        rows: [],
    });

    const registerUniqueKeys = (table, options) => {
        for (const [name, key] of Object.entries(options?.uniqueKeys ?? {})) {
            table.indexes.push({
                name, unique: true, fields: key.fields.map((attribute) => ({ attribute })),
            });
        }
    };

    const db = {
        getDialect: () => 'mysql',
        async query(sql) {
            const statement = String(sql);
            if (statement.includes(`ADD COLUMN ${PAIR_COLUMN}`)) {
                tables.get(FRIEND_REQUESTS).columns[PAIR_COLUMN] = { type: 'STRING(73)', allowNull: true };
                return [[], {}];
            }
            if (statement.includes('SELECT id, requester_id, receiver_id')) {
                return [tables.get(FRIEND_REQUESTS).rows.filter((row) => row.status === 'PENDING'), {}];
            }
            if (statement.includes('UPDATE') && statement.includes('CANCELLED')) {
                return [[], {}];
            }
            if (statement.includes('DROP COLUMN')) {
                delete tables.get(FRIEND_REQUESTS).columns[PAIR_COLUMN];
                return [[], {}];
            }
            throw new Error(`예상 밖 원시 SQL: ${statement}`);
        },
    };

    const operations = [];

    const supportingIndexNames = (table, column) => table.indexes
        .filter((index) => (index.fields ?? [])
            .map((field) => (typeof field === 'string' ? field : field.attribute))[0] === column)
        .map((index) => index.name);

    return {
        sequelize: db,
        async showAllTables() { return [...tables.keys()]; },
        async createTable(name, columns, options) {
            if (tables.has(name)) throw new Error(`이미 존재하는 테이블을 다시 만들려 했습니다: ${name}`);
            const table = { columns, indexes: [], rows: [] };
            registerUniqueKeys(table, options);
            tables.set(name, table);
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
                fields: fields.map((attribute) => ({ attribute, order: 'ASC' })),
            });
            operations.push({ op: 'addIndex', table: name, name: options.name, fields: [...fields] });
        },
        async removeIndex(name, indexName) {
            const table = tables.get(name);
            if (!table) return;
            const target = table.indexes.find((index) => index.name === indexName);
            if (!target) return;

            for (const [column, definition] of Object.entries(table.columns)) {
                if (!definition.references) continue;
                const supporters = supportingIndexNames(table, column);
                if (supporters.length === 1 && supporters[0] === indexName) {
                    throw new Error(
                        `Cannot drop index '${indexName}': needed in a foreign key constraint`,
                    );
                }
            }

            table.indexes = table.indexes.filter((index) => index.name !== indexName);
            operations.push({ op: 'removeIndex', table: name, name: indexName });
        },
        async dropTable(name) { tables.delete(name); },
        async describeTable(name) {
            const table = tables.get(name);
            if (!table) throw new Error(`존재하지 않는 테이블을 describe했습니다: ${name}`);
            return Object.fromEntries(Object.entries(table.columns).map(([column, definition]) => [column, {
                type: String(definition.type),
                allowNull: definition.allowNull !== false,
                primaryKey: definition.primaryKey === true,
                autoIncrement: definition.autoIncrement === true,
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
        _db: db,
        _operations: operations,
    };
};

const applyUp = async (qi) => await migration.up(qi, FakeSequelize, qi._db);

const indexNamed = (qi, table, name) => qi._tables.get(table).indexes.find((index) => index.name === name);

test('up(): game_invites의 creation_seq 유일 키는 createTable이 만들고 verify가 그것을 요구한다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    const seqIndex = indexNamed(qi, GAME_INVITES, SEQ_UNIQUE_INDEX);
    assert.ok(seqIndex, 'creation_seq 유일 키가 있어야 한다');
    assert.equal(seqIndex.unique, true);
    assert.deepEqual(seqIndex.fields.map((field) => field.attribute), ['creation_seq']);

    const creationSeq = qi._tables.get(GAME_INVITES).columns.creation_seq;
    assert.equal(creationSeq.autoIncrement, true);
    assert.equal(creationSeq.type, 'BIGINT', '커서는 BIGINT로 저장하고 전송 시 문자열로 직렬화한다');
    assert.equal(qi._tables.get(GAME_INVITES).columns.id.primaryKey, true, 'PK는 노출용 UUID다');

    await assert.doesNotReject(() => migration.verify(qi), 'up이 만든 모양은 verify를 통과해야 한다');
});

test('verify(): creation_seq 유일 키가 없는 스키마를 성공으로 넘기지 않는다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    const table = qi._tables.get(GAME_INVITES);
    table.indexes = table.indexes.filter((index) => index.name !== SEQ_UNIQUE_INDEX);

    await assert.rejects(() => migration.verify(qi), /game_invites_creation_seq_unique 인덱스가 없습니다/);
});

test('verify(): creation_seq가 AUTO_INCREMENT가 아니면 거부한다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    qi._tables.get(GAME_INVITES).columns.creation_seq.autoIncrement = false;

    await assert.rejects(() => migration.verify(qi), /AUTO_INCREMENT가 아닙니다/);
});

test('verify(): 이름만 같고 다른 컬럼을 덮는 creation_seq 키는 통과하지 못한다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    const seqIndex = indexNamed(qi, GAME_INVITES, SEQ_UNIQUE_INDEX);
    seqIndex.fields = [{ attribute: 'id' }];

    await assert.rejects(() => migration.verify(qi), /기대한 컬럼을 덮지 않습니다/);
});

test('up(): 재실행해도 테이블·인덱스를 중복 생성하지 않고 기존 행을 보존한다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    qi._tables.get(GAME_INVITES).rows.push({ id: 'invite-1', creation_seq: 1, status: 'PENDING' });
    qi._tables.get(FRIEND_FAVORITES).rows.push({ id: 1 });
    qi._tables.get(FRIEND_BLOCKS).rows.push({ id: 1 });
    const indexCountBefore = qi._tables.get(GAME_INVITES).indexes.length;

    await assert.doesNotReject(() => applyUp(qi));
    await assert.doesNotReject(() => migration.verify(qi));

    assert.equal(qi._tables.get(GAME_INVITES).indexes.length, indexCountBefore);
    assert.equal(qi._tables.get(GAME_INVITES).rows.length, 1, '재실행이 기존 초대를 지우면 안 된다');
    assert.equal(qi._tables.get(FRIEND_FAVORITES).rows.length, 1);
    assert.equal(qi._tables.get(FRIEND_BLOCKS).rows.length, 1);
});

test('up(): creation_seq 키가 빠진 채 이미 존재하는 game_invites에는 키만 보태고 행을 지우지 않는다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    const table = qi._tables.get(GAME_INVITES);
    table.indexes = table.indexes.filter((index) => index.name !== SEQ_UNIQUE_INDEX);
    table.rows.push({ id: 'invite-1', creation_seq: 7, status: 'ACCEPTED' });

    await assert.doesNotReject(() => applyUp(qi), '부분 스키마 위에서도 up은 완주해야 한다');

    const restored = indexNamed(qi, GAME_INVITES, SEQ_UNIQUE_INDEX);
    assert.ok(restored, '빠진 키는 addIndex로 메운다');
    assert.equal(restored.unique, true);
    assert.deepEqual(restored.fields.map((field) => field.attribute), ['creation_seq']);
    assert.equal(table.rows.length, 1, '복구가 기존 행을 지우면 안 된다');
    assert.equal(table.rows[0].creation_seq, 7);

    await assert.doesNotReject(() => migration.verify(qi));
});

test('up(): friend_requests의 예전 3컬럼 UNIQUE를 PENDING 전용 계정쌍 유일 키로 교체한다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    const requests = qi._tables.get(FRIEND_REQUESTS);
    assert.ok(Object.hasOwn(requests.columns, PAIR_COLUMN), 'generated 계정쌍 컬럼이 있어야 한다');

    const pair = indexNamed(qi, FRIEND_REQUESTS, PAIR_INDEX);
    assert.ok(pair && pair.unique === true);

    assert.equal(
        migration.findLegacyRequestUniqueIndexes(requests.indexes).length,
        0,
        '예전 UNIQUE(requester_id, receiver_id, status)가 남으면 거절 후 재신청이 계속 막힌다',
    );

    await assert.doesNotReject(() => migration.verify(qi));
});

const SUPPORT_INDEXES = migration.REQUEST_FK_SUPPORT_INDEXES;
const REQUESTER_SUPPORT = migration.REQUEST_REQUESTER_SUPPORT_INDEX;

test('up(): 예전 UNIQUE를 떼기 전에 두 외래 키의 비유일 받침 인덱스를 먼저 만든다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    const requests = qi._tables.get(FRIEND_REQUESTS);

    for (const [column, indexName] of Object.entries(SUPPORT_INDEXES)) {
        const support = requests.indexes.find((index) => index.name === indexName);
        assert.ok(support, `${indexName} 받침 인덱스가 있어야 한다`);
        assert.equal(support.unique, false, '받침은 비유일이어야 요청 이력이 제한되지 않는다');
        assert.deepEqual(support.fields.map((field) => field.attribute), [column]);
        assert.ok(
            migration.indexSupportsForeignKeyColumn(support, column),
            `${indexName}은 ${column}을 선두로 덮어야 한다`,
        );
    }

    const requestOps = qi._operations.filter((entry) => entry.table === FRIEND_REQUESTS);
    const legacyRemoval = requestOps.findIndex((entry) => entry.op === 'removeIndex');
    assert.ok(legacyRemoval >= 0, '예전 UNIQUE 제거가 실제로 일어나야 한다');
    for (const indexName of Object.values(SUPPORT_INDEXES)) {
        const added = requestOps.findIndex((entry) => entry.op === 'addIndex' && entry.name === indexName);
        assert.ok(added >= 0, `${indexName}이 addIndex로 만들어져야 한다`);
        assert.ok(
            added < legacyRemoval,
            `${indexName}은 예전 UNIQUE 제거보다 먼저 만들어져야 한다 — 순서가 뒤바뀌면 ` +
            'MySQL이 "needed in a foreign key constraint"로 거부한다',
        );
    }

    const references = await qi.getForeignKeyReferencesForTable(FRIEND_REQUESTS);
    for (const column of Object.keys(SUPPORT_INDEXES)) {
        assert.ok(
            references.some((reference) => reference.columnName === column
                && reference.referencedTableName === 'users'
                && reference.referencedColumnName === 'uuid'),
            `${column} → users.uuid 외래 키가 보존돼야 한다`,
        );
    }
});

test('받침을 세우지 않고 예전 UNIQUE를 떼려 하면 대역이 실제 MySQL과 같은 이유로 거부한다', async () => {
    const qi = createFakeQueryInterface();
    const requests = qi._tables.get(FRIEND_REQUESTS);
    const legacyName = requests.indexes[0].name;

    await assert.rejects(
        () => qi.removeIndex(FRIEND_REQUESTS, legacyName),
        /Cannot drop index '.*': needed in a foreign key constraint/,
        'requester_id의 받침이 이것뿐이면 떼지 못해야 한다',
    );

    await migration.ensureRequestForeignKeySupportIndexes(qi);
    await assert.doesNotReject(() => qi.removeIndex(FRIEND_REQUESTS, legacyName));
    assert.equal(
        migration.findLegacyRequestUniqueIndexes(requests.indexes).length, 0,
    );
    assert.equal(
        (await qi.getForeignKeyReferencesForTable(FRIEND_REQUESTS)).length, 2,
        '두 외래 키가 모두 남아야 한다',
    );
});

test('ensureRequestForeignKeySupportIndexes(): 재실행하면 아무것도 새로 만들지 않는다', async () => {
    const qi = createFakeQueryInterface();

    const firstRun = await migration.ensureRequestForeignKeySupportIndexes(qi);
    assert.deepEqual(firstRun.sort(), Object.values(SUPPORT_INDEXES).sort());

    const secondRun = await migration.ensureRequestForeignKeySupportIndexes(qi);
    assert.deepEqual(secondRun, [], '멱등해야 한다');
});

test('verify(): 외래 키 받침 인덱스가 없거나 유일이거나 선두가 아니면 각각 거부한다', async () => {
    {
        const qi = createFakeQueryInterface();
        await applyUp(qi);
        const requests = qi._tables.get(FRIEND_REQUESTS);
        requests.indexes = requests.indexes.filter((index) => index.name !== REQUESTER_SUPPORT);
        await assert.rejects(
            () => migration.verify(qi),
            /friend_requests_requester_idx 인덱스가 없습니다/,
        );
    }

    {
        const qi = createFakeQueryInterface();
        await applyUp(qi);
        indexNamed(qi, FRIEND_REQUESTS, REQUESTER_SUPPORT).unique = true;
        await assert.rejects(() => migration.verify(qi), /비유일 받침 인덱스여야 합니다/);
    }

    {
        const qi = createFakeQueryInterface();
        await applyUp(qi);
        indexNamed(qi, FRIEND_REQUESTS, REQUESTER_SUPPORT).fields = [
            { attribute: 'status' }, { attribute: 'requester_id' },
        ];
        await assert.rejects(() => migration.verify(qi), /선두 컬럼으로 덮지 않습니다/);
    }

    {
        const qi = createFakeQueryInterface();
        await applyUp(qi);
        delete qi._tables.get(FRIEND_REQUESTS).columns.requester_id.references;
        await assert.rejects(() => migration.verify(qi), /외래 키가 사라졌습니다/);
    }
});

test('up(): 받침 인덱스가 이미 있는 DB에 재실행해도 중복 생성하지 않고 계약을 유지한다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    const indexCountBefore = qi._tables.get(FRIEND_REQUESTS).indexes.length;
    qi._tables.get(FRIEND_REQUESTS).rows.push({ id: 1, status: 'DECLINED' });

    await assert.doesNotReject(() => applyUp(qi));
    assert.equal(qi._tables.get(FRIEND_REQUESTS).indexes.length, indexCountBefore);
    assert.equal(qi._tables.get(FRIEND_REQUESTS).rows.length, 1, '재실행이 이력을 지우면 안 된다');

    await assert.doesNotReject(() => migration.verify(qi));
});

const modelsDb = require('../../../models');

const syncMissingIndexes = (modelIndexes, existingIndexes) => modelIndexes
    .filter((declared) => !existingIndexes.some((existing) => existing.name === declared.name));

const fieldNamesOf = (index) => (index.fields ?? [])
    .map((field) => (typeof field === 'string' ? field : (field.attribute ?? field.name)));

const isLegacyRequestUnique = (index) => index.unique === true
    && fieldNamesOf(index).length === 3
    && ['requester_id', 'receiver_id', 'status'].every((column) => fieldNamesOf(index).includes(column));

test('FriendRequest 모델은 0013이 뗀 예전 3컬럼 UNIQUE를 더 이상 선언하지 않는다', () => {
    const declared = modelsDb.FriendRequest._indexes ?? [];
    const legacy = declared.filter(isLegacyRequestUnique);

    assert.deepEqual(
        legacy.map((index) => index.name),
        [],
        '모델이 선언하고 있으면 sync()가 부팅마다 다시 만들어 0013의 교체가 무효가 된다',
    );

    assert.deepEqual(
        declared.filter((index) => index.unique === true).map((index) => index.name),
        [],
        'friend_requests의 유일 제약은 0013만 정의한다',
    );
});

test('0013 적용 후 기동 sync()는 friend_requests에 예전 유일 제약을 되살리지 않는다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    const existing = await qi.showIndex(FRIEND_REQUESTS);
    const wouldAdd = syncMissingIndexes(modelsDb.FriendRequest._indexes ?? [], existing);

    assert.deepEqual(
        wouldAdd.filter(isLegacyRequestUnique).map((index) => index.name),
        [],
        'sync()가 다시 만들면 거절 후 재신청이 운영에서 계속 막힌다',
    );

    const requests = qi._tables.get(FRIEND_REQUESTS);
    for (const index of wouldAdd) {
        requests.indexes.push({
            name: index.name,
            unique: index.unique === true,
            fields: fieldNamesOf(index).map((attribute) => ({ attribute })),
        });
    }
    assert.equal(
        migration.findLegacyRequestUniqueIndexes(requests.indexes).length,
        0,
        '부팅 sync 이후에도 예전 UNIQUE가 없어야 한다',
    );
    await assert.doesNotReject(() => migration.verify(qi), '부팅 sync 이후에도 verify는 통과해야 한다');
});

test('0013이 만든 스키마에는 세 신규 모델이 선언한 인덱스가 이름까지 모두 존재한다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    for (const [model, table] of [
        [modelsDb.FriendFavorite, FRIEND_FAVORITES],
        [modelsDb.FriendBlock, FRIEND_BLOCKS],
        [modelsDb.GameInvite, GAME_INVITES],
    ]) {
        const existing = await qi.showIndex(table);
        assert.deepEqual(
            syncMissingIndexes(model._indexes ?? [], existing).map((index) => index.name),
            [],
            `${table}: 모델 선언과 0013의 인덱스 이름이 어긋나면 sync가 중복 인덱스를 만든다`,
        );
    }
});

test('up(): 예전 UNIQUE의 이름이 0001의 것이든 sync가 만든 것이든 똑같이 제거한다', async () => {
    const qi = createFakeQueryInterface();
    const requests = qi._tables.get(FRIEND_REQUESTS);
    requests.indexes = requests.indexes.map((index) => (
        index.name === 'friend_requests_requester_id_receiver_id_status'
            ? { ...index, name: 'friend_requests_requester_receiver_status' }
            : index
    ));

    await applyUp(qi);

    assert.equal(
        migration.findLegacyRequestUniqueIndexes(qi._tables.get(FRIEND_REQUESTS).indexes).length,
        0,
        '0001이 만든 이름의 예전 UNIQUE도 제거해야 한다',
    );
    await assert.doesNotReject(() => migration.verify(qi));
});
