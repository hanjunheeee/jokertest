const test   = require('node:test');
const assert = require('node:assert/strict');

const { db, modelNames, attributesOf, typeNameOf } = require('./testHelpers/schemaMeta');

const EXISTING_TABLES = [
    {
        model: 'User',
        tableName: 'users',
        pk: ['uuid'],
        timestampManaged: ['created_at', 'updated_at', 'deleted_at'],
        notNull: ['password_hash', 'nickname', 'email', 'has_local_password'],
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
            has_local_password: 'BOOLEAN',
            created_at:         'DATE',
            updated_at:         'DATE',
            deleted_at:         'DATE',
        },
    },
    {
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
        notNull: ['user_id', 'expired_at'],
        columns: {
            id:         'INTEGER',
            user_id:    'UUID',
            token:      'STRING(255)',
            token_hash: 'STRING(64)',
            expired_at: 'DATE',
            used:       'BOOLEAN',
            revoked_at: 'DATE',
            created_at: 'DATE',
        },
    },
    {
        model: 'AccountFindRequest',
        tableName: 'account_find_requests',
        pk: ['id'],
        notNull: [],
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
    'ExternalIdentity', 'OAuthState', 'SocialSignupIntent',
    'EconomyLedgerEntry',
    'VoteParticipation',
    'AchievementGrant',
    'Notification',
    'FriendFavorite', 'FriendBlock', 'GameInvite',
    'SignupEmailVerification',
    'EconomyCurrencyProduct', 'EconomyTopupOrder',
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

test('social_signup_intents: email만 nullable이고 나머지 제약·타입은 그대로다', () => {
    const attributes = attributesOf(db.SocialSignupIntent);
    assert.equal(db.SocialSignupIntent.tableName, 'social_signup_intents');
    assert.equal(typeNameOf(attributes.email), 'STRING(100)');
    assert.equal(attributes.email.allowNull, true);
    for (const column of ['intent_token_hash', 'provider', 'subject', 'expires_at']) {
        assert.equal(attributes[column].allowNull, false, `${column}는 NOT NULL이어야 한다`);
    }
    assert.equal(attributes.intent_token_hash.unique, true);
    assert.equal(attributes.consumed_at.allowNull, true);
});

test('신규 관계는 users에 컬럼을 만들지 않는다', () => {
    const columns = Object.keys(attributesOf(db.User));
    const leaked  = columns.filter((column) => /game_result|concurrent/i.test(column));
    assert.deepEqual(leaked, []);
});
