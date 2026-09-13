'use strict';

// F-19 backend/db/migrations/0013-f19-friends-invites.js 단위 시험.
//
// notifications.migration.test.js·economy.migration.test.js와 같은 관례로, 실제 MySQL 없이
// DDL·재실행 안전성·verify의 거부 조건을 결정론적으로 검증한다. 실제 MySQL 위의 유일 제약·
// 트랜잭션·권한은 backend/tests/db/f19-friends-invites.integration.test.js가 검증한다.
//
// ── 이 파일이 노리는 회귀 ────────────────────────────────────────────────────
// 이전 판은 game_invites.creation_seq를 `autoIncrement: true, unique: '<인덱스 이름>'`으로
// 선언하고 "createTable의 unique 옵션이 그 인덱스를 만든다"고 적어 두었다. 실제로는 만들지
// 않았다 — 그래서 실제 MySQL에서 CREATE TABLE 자체가
//
//     Incorrect table definition; there can be only one auto column and it must be defined as a key
//
// 로 실패했고, 0013을 적용하는 모든 격리 DB 스위트(138건)가 함께 죽었다.
//
// 그 실패는 "설치된 sequelize가 무엇을 생성하는가"에 달려 있으므로, 아래 첫 절은 fake가
// 아니라 **실제 설치본의 mysql query generator**로 SQL을 렌더링해 대조한다. 연결은 열지
// 않는다(sequelize.query를 가로채 문자열만 모은다). 두 번째 절은 fake queryInterface로
// 멱등성·부분 스키마·verify 거부 조건을 본다.

process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Sequelize } = require('sequelize');
const migration = require('../db/migrations/0013-f19-friends-invites');

const GAME_INVITES = migration.TABLE_NAMES.GAME_INVITES;
const FRIEND_FAVORITES = migration.TABLE_NAMES.FRIEND_FAVORITES;
const FRIEND_BLOCKS = migration.TABLE_NAMES.FRIEND_BLOCKS;
const FRIEND_REQUESTS = migration.FRIEND_REQUESTS_TABLE;
const SEQ_UNIQUE_INDEX = migration.INVITE_SEQ_UNIQUE_INDEX;
const PAIR_COLUMN = migration.PENDING_PAIR_COLUMN;
const PAIR_INDEX = migration.PENDING_PAIR_INDEX;

// ---------------------------------------------------------------------------
// 1) 실제 sequelize mysql generator가 만드는 CREATE TABLE
// ---------------------------------------------------------------------------

/**
 * 실제 mysql 방언으로 up()을 렌더링하고 실행된 SQL 문자열을 모두 모은다.
 *
 * 연결하지 않는다 — Sequelize 생성자는 URL을 파싱만 하고, 여기서 sequelize.query를 교체해
 * 실제 전송 대신 문자열을 기록한다. createTable은 이 교체된 query를 호출하므로
 * queryInterface → query-generator 경로는 실제 코드 그대로다.
 */
const renderUpSql = async () => {
    const sequelize = new Sequelize('mysql://renderer:renderer@127.0.0.1:3306/renderer', { logging: false });
    const realQueryInterface = sequelize.getQueryInterface();

    const sql = [];
    sequelize.query = async (statement) => {
        sql.push(String(statement));
        return [[], {}];
    };

    // createTable이 선언한 uniqueKeys를 그대로 기억해 showIndex로 되돌려준다 — 그래야
    // "생성 DDL이 이미 만든 키는 addIndex로 다시 만들지 않는다"는 분기가 실제로 돌아간다.
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

    // 핵심 회귀: 이 UNIQUE 절이 **같은 문장 안에** 있어야 InnoDB가 CREATE를 받아준다.
    // 뒤늦은 addIndex로는 이 검사를 통과할 수 없다(테이블이 애초에 만들어지지 않는다).
    assert.ok(
        create.includes(`UNIQUE \`${SEQ_UNIQUE_INDEX}\` (\`creation_seq\`)`),
        `CREATE TABLE에 UNIQUE ${SEQ_UNIQUE_INDEX} (creation_seq)가 없습니다:\n${create}`,
    );

    // UUID 기본 키와 외래 키는 그대로 보존한다.
    assert.ok(create.includes('PRIMARY KEY (`id`)'), 'UUID 기본 키가 유지돼야 한다');
    assert.match(create, /`id` CHAR\(36\) BINARY NOT NULL/);
    assert.ok(create.includes('FOREIGN KEY (`sender_id`) REFERENCES `users` (`uuid`)'));
    assert.ok(create.includes('FOREIGN KEY (`receiver_id`) REFERENCES `users` (`uuid`)'));
});

test('실제 mysql generator: AUTO_INCREMENT 컬럼이 같은 문장에서 어떤 키에도 덮이지 않는 CREATE TABLE은 하나도 없다', async () => {
    const { sql } = await renderUpSql();

    // MySQL 규칙을 그대로 옮긴 검사다: auto_increment 컬럼은 그 문장에서 선언된 키
    // (PRIMARY KEY / UNIQUE / KEY) 중 하나의 선두여야 한다.
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
    // 이 시험은 "왜 uniqueKeys 옵션이 필요한가"를 가정이 아니라 실제 설치본으로 증명한다.
    // 설치된 sequelize가 언젠가 문자열 unique를 CREATE TABLE에 반영하게 바뀌면 여기가 깨지고,
    // 그때 마이그레이션의 주석과 구현을 다시 판단하게 된다.
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

    // 같은 컬럼을 uniqueKeys로 넘기면 키가 생긴다 — 0013이 쓰는 경로다.
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
    // 나머지 인덱스는 여전히 addIndex 경로로 붙는다.
    for (const name of [
        'game_invites_sender_key_unique', 'game_invites_receiver_seq_idx',
        'game_invites_receiver_status_idx', 'game_invites_room_idx',
    ]) {
        assert.ok(addedIndexes.some((index) => index.name === name), `${name}이 만들어져야 한다`);
    }
});

// ---------------------------------------------------------------------------
// 2) fake queryInterface — 멱등성 · 부분 스키마 · verify 거부 조건
// ---------------------------------------------------------------------------

const FakeSequelize = {
    UUID: 'UUID',
    BIGINT: 'BIGINT',
    INTEGER: 'INTEGER',
    STRING: (n) => `STRING(${n})`,
    DATE: 'DATE',
    NOW: 'NOW',
};

/**
 * 0013이 실제로 쓰는 것만 인메모리로 흉내 낸다. describeTable·showIndex·FK 조회는 up()이
 * 선언한 것에서 파생시켜, "up이 만든 모양을 verify가 통과시킨다"가 대역의 가정이 아니라
 * 실제 대조가 되게 한다.
 *
 * removeIndex는 **InnoDB 규칙을 그대로 옮겨** 거부한다: 어떤 외래 키 컬럼을 선두로 덮는
 * 인덱스가 그것 하나뿐이면 떼지 못한다. 그래야 "받침을 먼저 세운다"는 순서 계약이 이 대역에서
 * 실제로 강제된다 — 실측 실패(.pluto/monitor/BD-focused-2026-09-13T08-11-19.923Z.log)를
 * MySQL 없이 재현하는 근거다.
 */
const createFakeQueryInterface = () => {
    const tables = new Map();

    // friend_requests는 0013 이전부터 있던 테이블이다. 예전 UNIQUE(3컬럼)와 기존 행을
    // 세워 두고, 교체가 이력을 지우지 않는지 본다.
    //
    // 두 UUID 컬럼의 외래 키를 0001과 똑같이 선언해 둔다. requester_id의 받침은 예전 3컬럼
    // UNIQUE **하나뿐**이고(그 선두가 requester_id다), receiver_id는 그 UNIQUE의 두 번째
    // 컬럼이라 받침이 되지 못해 MySQL이 자동 인덱스를 만든다 — 그 상태를 그대로 세운다.
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
            // MySQL이 receiver_id 외래 키를 위해 자동으로 만든 인덱스. 이름이 컬럼 이름과
            // 같은 것도 실제 MySQL의 관례다 — 그래서 이 이름에 계약을 걸 수 없다.
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
            // 0013이 원시 SQL로 하는 일은 둘뿐이다: generated 컬럼 추가와 중복 PENDING 정리.
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

    // addIndex/removeIndex가 일어난 순서. "받침을 먼저 세우고 그 다음에 뗀다"를 assert한다.
    const operations = [];

    /** 이 컬럼을 선두로 덮는 인덱스 이름들 — InnoDB의 외래 키 받침 판정 그대로다. */
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

            // 실제 MySQL과 같은 이유로 거부한다: 외래 키 컬럼의 받침이 이 인덱스 하나뿐이면
            // DROP INDEX 자체가 실패한다. 대역이 이것을 조용히 허용하면 순서 결함이 DB에
            // 닿기 전까지 드러나지 않는다.
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
                // 실제 mysql describeTable과 같은 자리에 같은 이름으로 돌려준다.
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

    // fake는 중복 createTable/addIndex를 에러로 막는다 — 통과하면 멱등하다는 뜻이다.
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

    // 부분 스키마 재현: 키만 사라진 상태(예전 판이 만든 테이블·손으로 만든 테이블).
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

// ---------------------------------------------------------------------------
// 3) 외래 키 받침 인덱스 — 실측 두 번째 blocker의 회귀
// ---------------------------------------------------------------------------
//
// 실측 실패: Cannot drop index 'friend_requests_requester_receiver_status': needed in a
// foreign key constraint (.pluto/monitor/BD-focused-2026-09-13T08-11-19.923Z.log).
// 예전 3컬럼 UNIQUE가 requester_id 외래 키의 유일한 받침이었는데 받침을 세우지 않고 떼려
// 했기 때문이다. 아래 시험들은 그 순서와 fail-closed verify를 고정한다.

const SUPPORT_INDEXES = migration.REQUEST_FK_SUPPORT_INDEXES;
const REQUESTER_SUPPORT = migration.REQUEST_REQUESTER_SUPPORT_INDEX;

test('up(): 예전 UNIQUE를 떼기 전에 두 외래 키의 비유일 받침 인덱스를 먼저 만든다', async () => {
    const qi = createFakeQueryInterface();
    await applyUp(qi);

    const requests = qi._tables.get(FRIEND_REQUESTS);

    // 두 받침이 실제로 있고, 비유일이며, 해당 컬럼이 선두다.
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

    // 핵심: 순서다. 두 받침 addIndex가 모두 legacy removeIndex보다 **앞**에 있어야 한다.
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

    // 외래 키는 그대로 남는다 — 인덱스를 떼기 위해 제약을 희생하지 않았다.
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
    // 이 시험은 위 순서 계약이 "있으면 좋은 것"이 아니라 **없으면 반드시 깨진다**는 것을
    // 증명한다. 대역의 거부가 실제 MySQL 메시지와 같은 조건에서 나오는지도 함께 고정한다.
    const qi = createFakeQueryInterface();
    const requests = qi._tables.get(FRIEND_REQUESTS);
    const legacyName = requests.indexes[0].name;

    // 받침을 세우지 않은 상태 = up이 고치기 전의 상태.
    await assert.rejects(
        () => qi.removeIndex(FRIEND_REQUESTS, legacyName),
        /Cannot drop index '.*': needed in a foreign key constraint/,
        'requester_id의 받침이 이것뿐이면 떼지 못해야 한다',
    );

    // 받침을 세우면 같은 제거가 성공한다 — 외래 키를 끄거나 떼지 않았다.
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

    // 대역의 addIndex는 같은 이름을 다시 만들면 던진다 — 빈 배열이면 호출조차 없었다는 뜻이다.
    const secondRun = await migration.ensureRequestForeignKeySupportIndexes(qi);
    assert.deepEqual(secondRun, [], '멱등해야 한다');
});

test('verify(): 외래 키 받침 인덱스가 없거나 유일이거나 선두가 아니면 각각 거부한다', async () => {
    // (1) 받침이 아예 없는 스키마 — 예전 UNIQUE는 떼였는데 받침을 세우지 않은 부분 적용.
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

    // (2) 이름은 맞지만 유일 제약이 된 경우 — 계정별 요청 이력이 한 건으로 제한된다.
    {
        const qi = createFakeQueryInterface();
        await applyUp(qi);
        indexNamed(qi, FRIEND_REQUESTS, REQUESTER_SUPPORT).unique = true;
        await assert.rejects(() => migration.verify(qi), /비유일 받침 인덱스여야 합니다/);
    }

    // (3) 컬럼은 들어 있지만 선두가 아닌 경우 — InnoDB는 이것을 받침으로 쓰지 않는다.
    {
        const qi = createFakeQueryInterface();
        await applyUp(qi);
        indexNamed(qi, FRIEND_REQUESTS, REQUESTER_SUPPORT).fields = [
            { attribute: 'status' }, { attribute: 'requester_id' },
        ];
        await assert.rejects(() => migration.verify(qi), /선두 컬럼으로 덮지 않습니다/);
    }

    // (4) 받침은 멀쩡한데 외래 키가 사라진 경우 — 인덱스를 떼려고 제약을 희생한 상태다.
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

    // 대역이 중복 addIndex를 에러로 막으므로 통과 자체가 멱등성의 증거다.
    await assert.doesNotReject(() => applyUp(qi));
    assert.equal(qi._tables.get(FRIEND_REQUESTS).indexes.length, indexCountBefore);
    assert.equal(qi._tables.get(FRIEND_REQUESTS).rows.length, 1, '재실행이 이력을 지우면 안 된다');

    await assert.doesNotReject(() => migration.verify(qi));
});
