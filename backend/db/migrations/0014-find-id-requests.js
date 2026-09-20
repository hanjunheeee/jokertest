'use strict';

// F-29a: account_find_requests.email을 nullable로 바꾼다.
//
// 0001 기준선과 backend/models/auth/account_find_request.model.js는 지금까지 email을
// NOT NULL로 정의해 왔다 — 이 테이블이 지금까지 실제로는 한 번도 email 없는 행을 기록한
// 적이 없었기 때문이다(F-29a 이전에는 이 테이블에 쓰는 코드가 없었다). 아이디 찾기는
// 이메일 자체를 아직 모르는 상태로 조회를 시도하므로, email 없이 request_type='FIND_ID'
// 사건을 기록할 수 있어야 한다(AC-06). 이 마이그레이션은 그 컬럼 하나만 nullable로 바꾸고,
// 다른 컬럼·기존 행은 건드리지 않는다.
//
// 재실행 시에는 현재 allowNull 상태를 먼저 확인해 이미 nullable이면 아무 것도 하지 않는다
// (멱등, AC-06: 같은 DB에 두 번 실행해도 오류 없음). down()은 email이 NULL인 행이 하나라도
// 있으면 거부한다 — NOT NULL로 되돌리면서 그 행들을 지우거나 이메일을 꾸며 채우는 것은
// 데이터 손실/조작이라 이 마이그레이션의 책임 밖이다.

const TABLE_NAME = 'account_find_requests';
const COLUMN_NAME = 'email';
const COLUMN_LENGTH = 100;

module.exports = {
    name: '0014-find-id-requests',

    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable(TABLE_NAME);
        const column = table[COLUMN_NAME];
        if (!column) {
            throw new Error(`${TABLE_NAME}.${COLUMN_NAME} 컬럼을 찾을 수 없습니다 — 기준선 마이그레이션이 먼저 적용됐는지 확인하세요.`);
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

        // 핵심 컬럼 보존 확인 — 이 마이그레이션은 email 하나만 바꾼다.
        const requiredColumns = ['id', 'email', 'request_type', 'ip_address', 'created_at'];
        const missing = requiredColumns.filter((c) => !Object.hasOwn(table, c));
        if (missing.length > 0) {
            throw new Error(`0014-find-id-requests 적용 후 ${TABLE_NAME}에 누락된 컬럼: [${missing.join(', ')}]`);
        }
    },

    TABLE_NAME,
    COLUMN_NAME,
};
