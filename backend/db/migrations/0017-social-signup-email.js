'use strict';

// F-31 AC-02/AC-06: social_signup_intents.email을 nullable로 바꾼다.
//
// 0005-add-social-auth와 backend/models/user/socialSignupIntent.model.js는 지금까지 이
// 컬럼을 NOT NULL로 정의해 왔다 — 제공자가 검증한 이메일이 없으면 애초에 가입 자체를
// EMAIL_MISSING으로 거부했기 때문이다(F-05 AC-02). F-31부터는 그 경우에도 가입을 막지
// 않고 자체 메일 인증(F-31a)으로 보완하므로, "제공자 이메일 없음" 상태의 intent를
// 저장할 수 있어야 한다. 이 마이그레이션은 그 컬럼 하나만 nullable로 바꾸고, 다른
// 컬럼·기존 행·users.email_verified는 전혀 건드리지 않는다(A-02).
//
// 0014-find-id-requests와 같은 패턴이다: 재실행 시 현재 allowNull 상태를 먼저 확인해
// 이미 nullable이면 아무 것도 하지 않는다(멱등). down()은 email이 NULL인 행이 하나라도
// 있으면 거부한다 — NOT NULL로 되돌리면서 그 행들을 지우거나 이메일을 꾸며 채우는 것은
// 데이터 손실/조작이라 이 마이그레이션의 책임 밖이다.

const TABLE_NAME = 'social_signup_intents';
const COLUMN_NAME = 'email';
const COLUMN_LENGTH = 100;

// 이 마이그레이션이 바꾸지 않아야 하는(= 적용 후에도 그대로 남아야 하는) 컬럼들이다.
const PRESERVED_COLUMNS = ['id', 'intent_token_hash', 'provider', 'subject', 'expires_at', 'consumed_at', 'created_at'];

module.exports = {
    name: '0017-social-signup-email',

    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable(TABLE_NAME);
        const column = table[COLUMN_NAME];
        if (!column) {
            throw new Error(`${TABLE_NAME}.${COLUMN_NAME} 컬럼을 찾을 수 없습니다 — 0005-add-social-auth가 먼저 적용됐는지 확인하세요.`);
        }

        if (column.allowNull === true) return; // 이미 적용됨 — 재실행 시 아무 것도 하지 않는다.

        await queryInterface.changeColumn(TABLE_NAME, COLUMN_NAME, {
            type: Sequelize.STRING(COLUMN_LENGTH),
            allowNull: true,
        });
    },

    async down(queryInterface, Sequelize) {
        const [rows] = await queryInterface.sequelize.query(
            `SELECT COUNT(*) AS null_count FROM ${TABLE_NAME} WHERE ${COLUMN_NAME} IS NULL`,
        );
        const nullCount = Number(rows[0]?.null_count ?? 0);
        if (nullCount > 0) {
            throw new Error(
                `${TABLE_NAME}에 ${COLUMN_NAME}이 NULL인 행이 ${nullCount}건 있습니다. ` +
                `NOT NULL로 되돌리면 그 행을 지우거나 이메일을 꾸며 채워야 하므로 이 되돌리기를 거부합니다.`,
            );
        }

        await queryInterface.changeColumn(TABLE_NAME, COLUMN_NAME, {
            type: Sequelize.STRING(COLUMN_LENGTH),
            allowNull: false,
        });
    },

    async verify(queryInterface) {
        const table = await queryInterface.describeTable(TABLE_NAME);
        const column = table[COLUMN_NAME];
        if (!column || column.allowNull !== true) {
            throw new Error(`${TABLE_NAME}.${COLUMN_NAME}이 nullable로 바뀌지 않았습니다 (현재 allowNull=${column?.allowNull}).`);
        }
        // 타입까지 함께 확인한다 — nullable로 바꾸면서 길이·타입이 달라지면 기존 주소가
        // 잘려 들어갈 수 있다(describeTable이 type을 주지 않는 방언에서는 판정하지 않는다).
        if (column.type !== undefined && !/^varchar\(100\)$/i.test(String(column.type))) {
            throw new Error(`${TABLE_NAME}.${COLUMN_NAME}의 타입이 varchar(100)이 아닙니다: ${column.type}`);
        }

        // 나머지 컬럼 보존 확인 — 이 마이그레이션은 email 하나만 바꾼다.
        const missing = PRESERVED_COLUMNS.filter((c) => !Object.hasOwn(table, c));
        if (missing.length > 0) {
            throw new Error(`0017-social-signup-email 적용 후 ${TABLE_NAME}에 누락된 컬럼: [${missing.join(', ')}]`);
        }
        // 토큰 해시·만료는 여전히 필수여야 한다(자격 자체의 의미가 흔들리면 안 된다).
        for (const required of ['intent_token_hash', 'provider', 'subject', 'expires_at']) {
            const actual = table[required];
            if (actual.allowNull !== undefined && actual.allowNull !== false) {
                throw new Error(`${TABLE_NAME}.${required}의 NULL 허용이 바뀌었습니다: allowNull=${actual.allowNull}`);
            }
        }
    },

    TABLE_NAME,
    COLUMN_NAME,
    PRESERVED_COLUMNS,
};
