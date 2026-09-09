'use strict';

// F-01 버전 고정 초기 스키마 마이그레이션.
//
// 이 저장소는 지금까지 sequelize-cli 마이그레이션 없이 `db.sequelize.sync({force:false})`
// (backend/index.js)만으로 스키마를 만들어 왔다. 이 파일은 그 결과로 실제 배포된 14개
// 테이블의 "지금 시점" 정의를 그대로 고정한 기준선이다. game_result_players.nickname_snapshot은
// 아직 30자다 — 50자 확장은 0002 마이그레이션의 책임이라 여기서 앞당기지 않는다.
//
// 두 가지 대상을 모두 지원한다:
//   1) 완전히 빈 DB — 14개 테이블을 순서대로 생성한다 (FK가 있는 game_result_players는
//      부모 테이블 뒤에 만든다).
//   2) 이미 sync()로 이 14개 테이블이 존재하는 기존 DB — 실제 구조를 이 기준선과
//      대조해 일치할 때만 "등록"(DDL 없이 통과)한다. 일부만 존재하거나 구조가 다르면
//      추측으로 넘어가지 않고 에러로 멈춘다.
//
// diffTable의 구조 대조는 컬럼 목록·타입·NOT NULL·기본키 외에도 다음을 확인한다(이전 회차
// 검토에서 "기본값·유니크 인덱스·외래키를 확인하지 않는다"는 지적을 받아 추가함):
//   - defaultValue: users.role='USER' 같은 컬럼 기본값. Sequelize.NOW→'CURRENT_TIMESTAMP'로
//     번역해 비교하고, Sequelize.UUIDV4처럼 애플리케이션 레벨에서만 생성되는 값은 DB에
//     DEFAULT 절이 없으므로 검사에서 제외한다.
//   - unique index: users.nickname/email 같은 컬럼 단위 unique와 friend_requests/friendships의
//     복합 유니크 인덱스를 queryInterface.showIndex()의 정규화된 결과와 대조한다(원시 SHOW
//     INDEX 필드가 아니다 — actualIndexesOf 위 주석 참고).
//   - foreign key: user_id/requester_id/receiver_id 등 실제 belongsTo 연관관계가 sync()로
//     생성하는 외래키(예: user_bans.user_id→users.uuid)를 INFORMATION_SCHEMA 기반
//     getForeignKeyReferencesForTable 결과와 대조한다. 이 검사를 추가하면서 아래
//     buildDefinitions도 실제 연관관계와 같은 references를 선언하도록 맞췄다 — 그렇지
//     않으면 진짜 기존 DB(외래키 있음)가 매번 "구조 불일치"로 거부된다.

const TABLE_ORDER = [
    'users',
    'account_find_requests',
    'password_reset_tokens',
    'user_sessions',
    'user_bans',
    'user_stats',
    'login_history',
    'online_presence',
    'friend_requests',
    'friendships',
    'traffic_logs',
    'game_results',
    'game_result_players',
    'concurrent_snapshots',
];

const buildDefinitions = (Sequelize) => ({
    users: {
        columns: {
            uuid: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
            password_hash: { type: Sequelize.STRING(255), allowNull: false },
            nickname: { type: Sequelize.STRING(50), allowNull: false, unique: true },
            email: { type: Sequelize.STRING(100), allowNull: false, unique: true },
            phone: { type: Sequelize.STRING(20), allowNull: true },
            role: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'USER' },
            status: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'ACTIVE' },
            profile_image_url: { type: Sequelize.TEXT, allowNull: true },
            email_verified: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
            failed_login_count: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
            locked_until: { type: Sequelize.DATE, allowNull: true },
            last_login_at: { type: Sequelize.DATE, allowNull: true },
            birth_date: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
            deleted_at: { type: Sequelize.DATE, allowNull: true },
        },
    },
    account_find_requests: {
        columns: {
            id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
            email: { type: Sequelize.STRING(100), allowNull: false },
            request_type: { type: Sequelize.STRING(30), allowNull: true },
            ip_address: { type: Sequelize.STRING(45), allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
        },
    },
    password_reset_tokens: {
        columns: {
            id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
            user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
            token: { type: Sequelize.STRING(255), allowNull: false },
            expired_at: { type: Sequelize.DATE, allowNull: false },
            used: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
            created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
        },
    },
    user_sessions: {
        columns: {
            id: { type: Sequelize.STRING(255), primaryKey: true, allowNull: false },
            user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
            ip_address: { type: Sequelize.STRING(45), allowNull: true },
            connected_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
            last_ping_at: { type: Sequelize.DATE, allowNull: true },
            is_online: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: true },
        },
    },
    user_bans: {
        columns: {
            id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
            user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
            reason: { type: Sequelize.TEXT, allowNull: true },
            banned_by: { type: Sequelize.INTEGER, allowNull: true },
            is_permanent: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
            start_at: { type: Sequelize.DATE, allowNull: true },
            end_at: { type: Sequelize.DATE, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
        },
    },
    user_stats: {
        columns: {
            user_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, references: { model: 'users', key: 'uuid' } },
            reputation: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
            title: { type: Sequelize.STRING(50), allowNull: true, defaultValue: '신참' },
            total_games: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
            survival_count: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
            execution_count: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
            most_played_role: { type: Sequelize.STRING(50), allowNull: true },
        },
    },
    login_history: {
        columns: {
            id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
            user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
            ip_address: { type: Sequelize.STRING(45), allowNull: true },
            user_agent: { type: Sequelize.TEXT, allowNull: true },
            device_type: { type: Sequelize.STRING(20), allowNull: true },
            login_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
            logout_at: { type: Sequelize.DATE, allowNull: true },
            success: { type: Sequelize.BOOLEAN, allowNull: false },
        },
    },
    online_presence: {
        columns: {
            user_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, references: { model: 'users', key: 'uuid' } },
            status: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'ONLINE' },
            last_active_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
            current_room_id: { type: Sequelize.INTEGER, allowNull: true },
        },
    },
    friend_requests: {
        columns: {
            id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
            requester_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
            receiver_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
            status: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'PENDING' },
            message: { type: Sequelize.TEXT, allowNull: true },
            created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
            responded_at: { type: Sequelize.DATE, allowNull: true },
        },
        indexes: [
            { name: 'friend_requests_requester_receiver_status', unique: true, fields: ['requester_id', 'receiver_id', 'status'] },
        ],
    },
    friendships: {
        columns: {
            id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
            requester_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
            receiver_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
            status: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'ACCEPTED' },
            created_at: { type: Sequelize.DATE, allowNull: false },
            updated_at: { type: Sequelize.DATE, allowNull: false },
        },
        indexes: [
            { name: 'friendships_requester_receiver', unique: true, fields: ['requester_id', 'receiver_id'] },
        ],
    },
    traffic_logs: {
        columns: {
            id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
            url: { type: Sequelize.TEXT, allowNull: false },
            method: { type: Sequelize.STRING(10), allowNull: false },
            response_status: { type: Sequelize.INTEGER, allowNull: true },
            ip_address: { type: Sequelize.STRING(45), allowNull: true },
            response_time_ms: { type: Sequelize.INTEGER, allowNull: true },
            accessed_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
        },
    },
    game_results: {
        columns: {
            id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
            room_id: { type: Sequelize.UUID, allowNull: true },
            started_at: { type: Sequelize.DATE, allowNull: false },
            ended_at: { type: Sequelize.DATE, allowNull: false },
            winner: { type: Sequelize.STRING(20), allowNull: false },
            win_reason: { type: Sequelize.STRING(40), allowNull: true },
            day_index: { type: Sequelize.INTEGER, allowNull: false },
            player_count: { type: Sequelize.INTEGER, allowNull: false },
            settings: { type: Sequelize.JSON, allowNull: true },
            completed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        },
    },
    game_result_players: {
        columns: {
            game_id: {
                type: Sequelize.UUID, primaryKey: true, allowNull: false,
                references: { model: 'game_results', key: 'id' },
            },
            user_id: {
                type: Sequelize.UUID, primaryKey: true, allowNull: false,
                references: { model: 'users', key: 'uuid' },
            },
            // 기준선 시점 길이. 50자 확장은 0002-expand-nickname-snapshot.js가 담당한다.
            nickname_snapshot: { type: Sequelize.STRING(30), allowNull: false },
            role: { type: Sequelize.STRING(20), allowNull: false },
            team: { type: Sequelize.STRING(20), allowNull: false },
            won: { type: Sequelize.BOOLEAN, allowNull: true },
            is_alive: { type: Sequelize.BOOLEAN, allowNull: false },
            death_reason: { type: Sequelize.STRING(20), allowNull: true },
        },
    },
    concurrent_snapshots: {
        columns: {
            id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
            captured_at: { type: Sequelize.DATE, allowNull: false },
            total: { type: Sequelize.INTEGER, allowNull: false },
            lobby: { type: Sequelize.INTEGER, allowNull: false },
            in_game: { type: Sequelize.INTEGER, allowNull: false },
            room_count: { type: Sequelize.INTEGER, allowNull: false },
        },
        indexes: [
            { name: 'concurrent_snapshots_captured_at', unique: false, fields: ['captured_at'] },
        ],
    },
});

// MySQL describeTable()이 돌려주는 원시 타입 문자열(예: 'int(11) unsigned', 'varchar(50)',
// 'tinyint(1)')을 우리 정의(Sequelize DataTypes)와 비교 가능한 대략적인 범주로 좁힌다.
// 표시 폭(011) 차이 같은 MySQL 버전별 포맷 차이는 구조적 불일치로 보지 않는다.
const normalizeRawType = (rawType) => {
    const type = String(rawType).toLowerCase().trim();
    if (type === 'tinyint(1)') return 'boolean';
    const intMatch = type.match(/^(tinyint|smallint|mediumint|int|bigint)(\(\d+\))?( unsigned)?$/);
    if (intMatch) return intMatch[1];
    return type.replace(/\s+unsigned$/, '');
};

const expectedTypeCategory = (Sequelize, columnDef) => {
    const key = columnDef.type.key || String(columnDef.type);
    switch (key) {
        case 'UUID': return 'char(36)';
        case 'BOOLEAN': return 'boolean';
        case 'INTEGER': return 'int';
        case 'BIGINT': return 'bigint';
        case 'DATE': return 'datetime';
        case 'JSON': return 'json';
        case 'TEXT': return 'text';
        case 'STRING': {
            const length = columnDef.type._length ?? columnDef.type.options?.length;
            return length != null ? `varchar(${length})` : 'varchar(255)';
        }
        default: return key.toLowerCase();
    }
};

// MySQL의 SHOW FULL COLUMNS(=describeTable)가 돌려주는 Default 값은 항상 리터럴 문자열이거나
// null이다. Sequelize.NOW로 선언한 컬럼은 DDL에서 `DEFAULT CURRENT_TIMESTAMP`로 번역되고,
// Sequelize.UUIDV4는 애플리케이션 레벨(INSERT 시점 client-side)에서만 생성되고 DB DEFAULT
// 절 자체가 없으므로 여기서는 검사 대상에서 제외한다(undefined 반환 = 이 컬럼은 기본값을
// 비교하지 않는다). columnDef에 defaultValue 키 자체가 없는 컬럼도 같은 이유로 제외한다 —
// "기본값을 선언하지 않았다"는 사실만으로 실제 DB에 기본값이 없다고 단정할 근거가 없다.
const expectedDefaultValue = (Sequelize, columnDef) => {
    if (!Object.prototype.hasOwnProperty.call(columnDef, 'defaultValue')) return undefined;
    const value = columnDef.defaultValue;
    if (value === Sequelize.NOW) return 'CURRENT_TIMESTAMP';
    if (value === Sequelize.UUIDV4) return undefined;
    if (value === null) return null;
    if (typeof value === 'boolean') return value ? '1' : '0';
    return String(value);
};

// 컬럼 단위 unique:true와 definition.indexes에 선언된 인덱스를 하나의 목록으로 합친다.
// 필드 순서는 정의된 순서를 그대로 유지한다 — 복합 유니크 인덱스는 MySQL에서 컬럼 순서가
// 의미를 가지므로(왼쪽 접두사 규칙) 순서까지 같아야 "같은 인덱스"로 본다.
const expectedIndexesOf = (definition) => {
    const indexes = [];
    for (const [column, columnDef] of Object.entries(definition.columns)) {
        if (columnDef.unique) indexes.push({ fields: [column], unique: true });
    }
    for (const index of definition.indexes || []) {
        indexes.push({ fields: index.fields, unique: Boolean(index.unique) });
    }
    return indexes;
};

// queryInterface.showIndex()는 원시 SHOW INDEX 행이 아니라, sequelize의 MySQL 방언이 이미
// 인덱스 이름별로 정규화한 배열을 돌려준다(backend/node_modules/sequelize/lib/dialects/mysql/
// query.js의 handleShowIndexesQuery — Key_name/Non_unique/Seq_in_index/Column_name 같은
// 원시 필드는 여기서 primary/fields([{attribute,length,order}])/name/tableName/unique/type
// 으로 이미 변환되어 있고, 원시 필드 이름은 결과 객체에 존재하지 않는다). 이전 회차는 이
// 정규화를 거치지 않은 원시 필드명을 읽어 실제 MySQL에서는 항상 undefined만 나왔고, 그
// 결과 모든 기존 인덱스가 "필드 없음"으로 계산돼 정상 기존 DB도 인덱스 불일치로 잘못
// 거부했다(이번 회차 재검토 지적 — 아래 테스트의 가짜 응답도 실제 정규화된 형태로 맞췄다).
// PRIMARY는 기본키이지 F-01이 관리하는 "유니크 제약"이 아니므로 제외한다.
const actualIndexesOf = (showIndexResults) => {
    return showIndexResults
        .filter((index) => !index.primary)
        .map((index) => ({
            unique: Boolean(index.unique),
            fields: index.fields.map((field) => field.attribute),
        }));
};

const sameFieldOrder = (a, b) => a.length === b.length && a.every((field, i) => field === b[i]);

const expectedForeignKeysOf = (definition) => {
    const foreignKeys = [];
    for (const [column, columnDef] of Object.entries(definition.columns)) {
        if (columnDef.references) {
            foreignKeys.push({ column, referencedTable: columnDef.references.model, referencedColumn: columnDef.references.key });
        }
    }
    return foreignKeys;
};

/** 실제 DB의 한 테이블이 기준선 정의와 구조적으로 일치하는지 확인한다. 다르면 이유를 모은다. */
const diffTable = async (queryInterface, Sequelize, tableName, definition) => {
    const actual = await queryInterface.describeTable(tableName);
    const problems = [];

    const expectedColumns = Object.keys(definition.columns).sort();
    const actualColumns = Object.keys(actual).sort();
    if (JSON.stringify(expectedColumns) !== JSON.stringify(actualColumns)) {
        problems.push(`컬럼 목록 불일치 — 기대: [${expectedColumns.join(',')}] 실제: [${actualColumns.join(',')}]`);
        return problems; // 컬럼 집합부터 다르면 개별 비교는 의미가 없다
    }

    for (const [column, columnDef] of Object.entries(definition.columns)) {
        const actualColumn = actual[column];
        const expectedType = expectedTypeCategory(Sequelize, columnDef);
        const actualType = normalizeRawType(actualColumn.type);
        if (expectedType !== actualType) {
            problems.push(`${column}: 타입 불일치 (기대 ${expectedType} / 실제 ${actualType})`);
        }
        if (!columnDef.primaryKey) {
            const expectedAllowNull = columnDef.allowNull !== false;
            if (Boolean(actualColumn.allowNull) !== expectedAllowNull) {
                problems.push(`${column}: NOT NULL 불일치 (기대 allowNull=${expectedAllowNull} / 실제 ${actualColumn.allowNull})`);
            }
        }
        if (columnDef.primaryKey && !actualColumn.primaryKey) {
            problems.push(`${column}: 기본키여야 하는데 실제로는 아닙니다`);
        }

        const expectedDefault = expectedDefaultValue(Sequelize, columnDef);
        if (expectedDefault !== undefined) {
            const actualDefault = actualColumn.defaultValue === null ? null : String(actualColumn.defaultValue);
            if (expectedDefault !== actualDefault) {
                problems.push(`${column}: 기본값 불일치 (기대 ${JSON.stringify(expectedDefault)} / 실제 ${JSON.stringify(actualDefault)})`);
            }
        }
    }

    const showIndexRows = await queryInterface.showIndex(tableName);
    const actualIndexes = actualIndexesOf(showIndexRows);
    for (const expected of expectedIndexesOf(definition)) {
        const match = actualIndexes.find((idx) => idx.unique === expected.unique && sameFieldOrder(idx.fields, expected.fields));
        if (!match) {
            problems.push(
                `인덱스 누락 또는 불일치: fields=[${expected.fields.join(',')}] unique=${expected.unique} — ` +
                `실제 인덱스: ${JSON.stringify(actualIndexes)}`,
            );
        }
    }

    const actualForeignKeys = await queryInterface.getForeignKeyReferencesForTable(tableName);
    for (const expected of expectedForeignKeysOf(definition)) {
        const match = actualForeignKeys.some((fk) =>
            fk.columnName === expected.column &&
            fk.referencedTableName === expected.referencedTable &&
            fk.referencedColumnName === expected.referencedColumn);
        if (!match) {
            problems.push(
                `외래키 누락 또는 불일치: ${tableName}.${expected.column} → ${expected.referencedTable}.${expected.referencedColumn} — ` +
                `실제 외래키: ${JSON.stringify(actualForeignKeys.map((fk) => `${fk.columnName}→${fk.referencedTableName}.${fk.referencedColumnName}`))}`,
            );
        }
    }

    return problems;
};

const createAllTables = async (queryInterface, Sequelize, definitions, logger) => {
    for (const tableName of TABLE_ORDER) {
        const definition = definitions[tableName];
        logger(`create table ${tableName}`);
        await queryInterface.createTable(tableName, definition.columns);
        for (const index of definition.indexes || []) {
            await queryInterface.addIndex(tableName, index.fields, { name: index.name, unique: Boolean(index.unique) });
        }
    }
};

module.exports = {
    name: '0001-legacy-baseline',

    async up(queryInterface, Sequelize, sequelize) {
        const logger = (msg) => { if (process.env.MIGRATION_VERBOSE) console.log(`[0001-legacy-baseline] ${msg}`); };
        const definitions = buildDefinitions(Sequelize);

        const existingTables = new Set(await queryInterface.showAllTables());
        const present = TABLE_ORDER.filter((t) => existingTables.has(t));

        if (present.length === 0) {
            await createAllTables(queryInterface, Sequelize, definitions, logger);
            return;
        }

        if (present.length !== TABLE_ORDER.length) {
            const missing = TABLE_ORDER.filter((t) => !existingTables.has(t));
            throw new Error(
                `기존 DB에 14개 테이블 중 일부(${present.length}개)만 존재합니다 — 애매한 상태라 자동 처리하지 않습니다. ` +
                `누락: [${missing.join(', ')}]. 수동으로 상태를 확인한 뒤 진행하세요.`,
            );
        }

        // 14개 테이블이 모두 존재하는 기존 DB — 구조를 대조해 일치할 때만 기준선으로 등록한다.
        const problemsByTable = {};
        for (const tableName of TABLE_ORDER) {
            const problems = await diffTable(queryInterface, Sequelize, tableName, definitions[tableName]);
            if (problems.length > 0) problemsByTable[tableName] = problems;
        }

        if (Object.keys(problemsByTable).length > 0) {
            const detail = Object.entries(problemsByTable)
                .map(([table, problems]) => `${table}: ${problems.join('; ')}`)
                .join(' | ');
            throw new Error(`기존 DB 구조가 F-01 기준선과 다릅니다 — 자동 등록을 거부합니다. ${detail}`);
        }

        logger('기존 14개 테이블이 기준선과 일치 — DDL 없이 기준선으로 등록');
    },

    async down(queryInterface) {
        for (const tableName of [...TABLE_ORDER].reverse()) {
            await queryInterface.dropTable(tableName);
        }
    },

    async verify(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        const missing = TABLE_ORDER.filter((t) => !existingTables.has(t));
        if (missing.length > 0) {
            throw new Error(`기준선 적용 후에도 누락된 테이블: [${missing.join(', ')}]`);
        }
    },

    // 테스트·CLI가 재사용할 수 있도록 노출한다.
    TABLE_ORDER,
    buildDefinitions,
    diffTable,
    expectedDefaultValue,
    expectedIndexesOf,
    actualIndexesOf,
    expectedForeignKeysOf,
};
