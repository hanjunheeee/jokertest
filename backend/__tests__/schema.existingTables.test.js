// AC-06 — 기존 테이블들의 스키마가 이번 변경(신규 모델 3개 추가)으로 바뀌지 않았는지
// 회귀 검사합니다. 기존 각 모델의 컬럼 목록·타입·기본키·NOT NULL을 스냅샷으로 고정해
// 두고, 신규 모델이 기존 정의를 덮어쓰거나(모델 이름 충돌) 관계 추가가 기존 테이블에
// 컬럼을 만드는 경우를 잡습니다.
//
// 관계 컬럼은 항상 자식 테이블에 생기므로, User.hasMany(GameResultPlayer)를 추가해도
// users에는 컬럼이 생기지 않아야 합니다. 그 점을 이 스냅샷으로 증명합니다.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { db, modelNames, attributesOf, typeNameOf } = require('./testHelpers/schemaMeta');

// 이번 슬라이스 이전부터 있던 모델들. tableName과 컬럼 시그니처를 그대로 고정합니다.
// notNull에 없는 컬럼은 NULL 허용이어야 합니다. 단 pk와 timestampManaged
// (sequelize가 timestamps 옵션으로 직접 채우는 컬럼)는 dialect·옵션이 nullability를
// 결정하므로 타입과 존재만 확인합니다.
const EXISTING_TABLES = [
    {
        model: 'User',
        tableName: 'users',
        pk: ['uuid'],
        timestampManaged: ['created_at', 'updated_at', 'deleted_at'],
        notNull: ['password_hash', 'nickname', 'email'],
        columns: {
            uuid:               'UUID',
            password_hash:      'STRING(255)',
            nickname:           'STRING(50)',
            email:              'STRING(100)',
            phone:              'STRING(20)',
            role:               'STRING(20)',
            status:             'STRING(20)',
            profile_image_url:  'TEXT',
            email_verified:     'BOOLEAN',
            failed_login_count: 'INTEGER',
            locked_until:       'DATE',
            last_login_at:      'DATE',
            birth_date:         'DATE',
            created_at:         'DATE',
            updated_at:         'DATE',
            deleted_at:         'DATE',
        },
    },
    {
        // F-03: 회전형 갱신 자격 컬럼 5개(refresh_token_hash 등)가 추가됐다
        // (backend/db/migrations/0003-add-refresh-token-rotation.js). 모두 nullable이라
        // 기존 세션 행에는 영향이 없다.
        model: 'UserSession',
        tableName: 'user_sessions',
        pk: ['id'],
        notNull: ['user_id'],
        columns: {
            id:                          'STRING(255)',
            user_id:                     'UUID',
            ip_address:                  'STRING(45)',
            connected_at:                'DATE',
            last_ping_at:                'DATE',
            is_online:                   'BOOLEAN',
            refresh_token_hash:          'STRING(64)',
            refresh_previous_hash:       'STRING(64)',
            refresh_previous_expires_at: 'DATE',
            refresh_token_expires_at:    'DATE',
            revoked_at:                  'DATE',
        },
    },
    {
        model: 'UserBan',
        tableName: 'user_bans',
        pk: ['id'],
        notNull: ['user_id'],
        columns: {
            id:           'INTEGER',
            user_id:      'UUID',
            reason:       'TEXT',
            banned_by:    'INTEGER',
            is_permanent: 'BOOLEAN',
            start_at:     'DATE',
            end_at:       'DATE',
            created_at:   'DATE',
        },
    },
    {
        model: 'UserStats',
        tableName: 'user_stats',
        pk: ['user_id'],
        notNull: [],
        columns: {
            user_id:          'UUID',
            reputation:       'INTEGER',
            title:            'STRING(50)',
            total_games:      'INTEGER',
            survival_count:   'INTEGER',
            execution_count:  'INTEGER',
            most_played_role: 'STRING(50)',
        },
    },
    {
        model: 'LoginHistory',
        tableName: 'login_history',
        pk: ['id'],
        notNull: ['user_id', 'success'],
        columns: {
            id:          'INTEGER',
            user_id:     'UUID',
            ip_address:  'STRING(45)',
            user_agent:  'TEXT',
            device_type: 'STRING(20)',
            login_at:    'DATE',
            logout_at:   'DATE',
            success:     'BOOLEAN',
        },
    },
    {
        model: 'OnlinePresence',
        tableName: 'online_presence',
        pk: ['user_id'],
        notNull: [],
        columns: {
            user_id:         'UUID',
            status:          'STRING(20)',
            last_active_at:  'DATE',
            current_room_id: 'INTEGER',
        },
    },
    {
        model: 'PasswordResetToken',
        tableName: 'password_reset_tokens',
        pk: ['id'],
        notNull: ['user_id', 'token', 'expired_at'],
        columns: {
            id:         'INTEGER',
            user_id:    'UUID',
            token:      'STRING(255)',
            expired_at: 'DATE',
            used:       'BOOLEAN',
            created_at: 'DATE',
        },
    },
    {
        model: 'AccountFindRequest',
        tableName: 'account_find_requests',
        pk: ['id'],
        notNull: ['email'],
        columns: {
            id:           'INTEGER',
            email:        'STRING(100)',
            request_type: 'STRING(30)',
            ip_address:   'STRING(45)',
            created_at:   'DATE',
        },
    },
    {
        model: 'TrafficLog',
        tableName: 'traffic_logs',
        pk: ['id'],
        notNull: ['url', 'method'],
        columns: {
            id:               'INTEGER',
            url:              'TEXT',
            method:           'STRING(10)',
            response_status:  'INTEGER',
            ip_address:       'STRING(45)',
            response_time_ms: 'INTEGER',
            accessed_at:      'DATE',
        },
    },
    {
        model: 'FriendRequest',
        tableName: 'friend_requests',
        pk: ['id'],
        notNull: ['requester_id', 'receiver_id'],
        columns: {
            id:           'INTEGER',
            requester_id: 'UUID',
            receiver_id:  'UUID',
            status:       'STRING(20)',
            message:      'TEXT',
            created_at:   'DATE',
            responded_at: 'DATE',
        },
    },
    {
        model: 'Friendship',
        tableName: 'friendships',
        pk: ['id'],
        timestampManaged: ['created_at', 'updated_at'],
        notNull: ['requester_id', 'receiver_id'],
        columns: {
            id:           'INTEGER',
            requester_id: 'UUID',
            receiver_id:  'UUID',
            status:       'STRING(20)',
            created_at:   'DATE',
            updated_at:   'DATE',
        },
    },
];

const NEW_MODELS = [
    'GameResult', 'GameResultPlayer', 'ConcurrentSnapshot',
    // F-05: 소셜 계정 공통 기반(0005-add-social-auth 마이그레이션).
    'ExternalIdentity', 'OAuthState', 'SocialSignupIntent',
    // F-08: 지갑·거래·소유권·장착. backend/models/economy/economy.model.js는 파일 하나에
    // 모델 4개(EconomyWallet/EconomyLedgerEntry/EconomyEntitlement/EconomyLoadout)를
    // 정의하지만, models/index.js 로더는 파일이 반환한 모델 하나만 db[name]에 등록한다
    // (economy.model.js 상단 주석 참고) — 그래서 여기 보이는 건 EconomyLedgerEntry뿐이다.
    'EconomyLedgerEntry',
];

test('기존 모델 목록에 추가·삭제·이름 충돌이 없다', () => {
    const expected = [...EXISTING_TABLES.map((table) => table.model), ...NEW_MODELS].sort();
    assert.deepEqual(modelNames(), expected);
});

test('기존 테이블 이름이 그대로다', () => {
    for (const table of EXISTING_TABLES) {
        assert.equal(db[table.model].tableName, table.tableName, `${table.model}의 tableName`);
    }
});

for (const table of EXISTING_TABLES) {
    test(`${table.tableName}: 컬럼 목록이 그대로다`, () => {
        const actual = Object.keys(attributesOf(db[table.model])).sort();
        assert.deepEqual(actual, Object.keys(table.columns).sort());
    });

    test(`${table.tableName}: 컬럼 타입·기본키·NOT NULL이 그대로다`, () => {
        const attributes       = attributesOf(db[table.model]);
        const timestampManaged = table.timestampManaged || [];

        for (const [column, type] of Object.entries(table.columns)) {
            const attribute = attributes[column];
            assert.ok(attribute, `${table.tableName}.${column} 컬럼이 사라졌습니다`);
            assert.equal(typeNameOf(attribute), type, `${table.tableName}.${column} 타입`);

            if (table.pk.includes(column) || timestampManaged.includes(column)) continue;

            const shouldBeNotNull = table.notNull.includes(column);
            assert.equal(
                attribute.allowNull === false,
                shouldBeNotNull,
                `${table.tableName}.${column} NOT NULL 여부`
            );
        }

        const actualPk = Object.entries(attributes)
            .filter(([, attribute]) => attribute.primaryKey === true)
            .map(([name]) => name)
            .sort();
        assert.deepEqual(actualPk, [...table.pk].sort(), `${table.tableName} 기본키`);
    });
}

test('신규 관계는 users에 컬럼을 만들지 않는다', () => {
    // hasMany는 자식 테이블에만 외래키를 만듭니다. users에 game_result 관련 컬럼이
    // 생겼다면 관계가 반대로 정의된 것입니다.
    const columns = Object.keys(attributesOf(db.User));
    const leaked  = columns.filter((column) => /game_result|concurrent/i.test(column));
    assert.deepEqual(leaked, []);
});
