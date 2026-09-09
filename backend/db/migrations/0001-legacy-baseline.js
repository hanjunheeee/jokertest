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
            user_id: { type: Sequelize.UUID, allowNull: false },
            token: { type: Sequelize.STRING(255), allowNull: false },
            expired_at: { type: Sequelize.DATE, allowNull: false },
            used: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
            created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
        },
    },
    user_sessions: {
        columns: {
            id: { type: Sequelize.STRING(255), primaryKey: true, allowNull: false },
            user_id: { type: Sequelize.UUID, allowNull: false },
            ip_address: { type: Sequelize.STRING(45), allowNull: true },
            connected_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
            last_ping_at: { type: Sequelize.DATE, allowNull: true },
            is_online: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: true },
        },
    },
    user_bans: {
        columns: {
            id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
            user_id: { type: Sequelize.UUID, allowNull: false },
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
            user_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
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
            user_id: { type: Sequelize.UUID, allowNull: false },
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
            user_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
            status: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'ONLINE' },
            last_active_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
            current_room_id: { type: Sequelize.INTEGER, allowNull: true },
        },
    },
    friend_requests: {
        columns: {
            id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
            requester_id: { type: Sequelize.UUID, allowNull: false },
            receiver_id: { type: Sequelize.UUID, allowNull: false },
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
            requester_id: { type: Sequelize.UUID, allowNull: false },
            receiver_id: { type: Sequelize.UUID, allowNull: false },
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
};
