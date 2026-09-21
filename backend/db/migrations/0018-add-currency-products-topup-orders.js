'use strict';

// F-32a: 재화 상품표(economy_currency_products)와 다이아 충전 주문(economy_topup_orders)을
// 추가한다. 컬럼 정의는 backend/models/economy/currencyProduct.model.js·topupOrder.model.js와
// 항상 같은 모양이어야 한다. 운영 상품은 이 마이그레이션이 삽입하지 않는다(임시 가격은 시험
// 시드로만 존재한다) — 기존 경제 테이블과 users는 건드리지 않는다.
//
// 0006·0016과 같은 패턴을 따른다: 테이블 존재 확인 후 생성, 인덱스는 테이블 존재와 별도로
// 검사해 부분 DDL 실패 뒤에도 빠진 제약만 복구, verify가 컬럼·타입·NULL 허용·기본값·기본키·
// 유일 인덱스·사용자 FK를 확인, 파괴적 down 금지. 주문에는 상품 FK를 두지 않는다 — 상품이
// 삭제되어도 주문 스냅샷은 남아야 한다.

const TABLE_NAMES = {
    CURRENCY_PRODUCTS: 'economy_currency_products',
    TOPUP_ORDERS: 'economy_topup_orders',
};

const PAYMENT_KEY_UNIQUE_INDEX = 'economy_topup_orders_payment_key_unique';

/**
 * 컬럼별 verify 계약(0016 COLUMN_CONTRACTS와 같은 원칙). type은 describeTable의 원시 타입
 * 문자열에 대한 관대한 정규식이고, defaultValue가 있으면 describeTable이 값을 돌려주는
 * 방언에서만 문자열 비교한다.
 */
const PRODUCT_COLUMN_CONTRACTS = Object.freeze({
    product_id: { allowNull: false, primaryKey: true, type: /^varchar\(64\)/i },
    kind: { allowNull: false, type: /^varchar\(20\)/i },
    display_name: { allowNull: false, type: /^varchar\(100\)/i },
    pay_currency: { allowNull: false, type: /^varchar\(10\)/i },
    pay_amount: { allowNull: false, type: /^int/i },
    grant_currency: { allowNull: false, type: /^varchar\(10\)/i },
    grant_amount: { allowNull: false, type: /^int/i },
    bonus_amount: { allowNull: false, type: /^int/i, defaultValue: '0' },
    status: { allowNull: false, type: /^varchar\(10\)/i },
    sort_order: { allowNull: false, type: /^int/i, defaultValue: '0' },
    version: { allowNull: false, type: /^int/i, defaultValue: '1' },
    created_at: { allowNull: false, type: /^datetime/i },
    updated_at: { allowNull: false, type: /^datetime/i },
});

const ORDER_COLUMN_CONTRACTS = Object.freeze({
    order_id: { allowNull: false, primaryKey: true, type: /^varchar\(64\)/i },
    user_id: { allowNull: false, type: /^char\(36\)/i },
    product_id: { allowNull: false, type: /^varchar\(64\)/i },
    version: { allowNull: false, type: /^int/i },
    pay_amount: { allowNull: false, type: /^int/i },
    grant_amount: { allowNull: false, type: /^int/i },
    bonus_amount: { allowNull: false, type: /^int/i, defaultValue: '0' },
    order_name: { allowNull: false, type: /^varchar\(100\)/i },
    status: { allowNull: false, type: /^varchar\(20\)/i, defaultValue: 'CREATED' },
    payment_key: { allowNull: true, type: /^varchar\(200\)/i },
    lease_token: { allowNull: true, type: /^varchar\(64\)/i },
    lease_expires_at: { allowNull: true, type: /^datetime/i },
    approved_at: { allowNull: true, type: /^datetime/i },
    granted_at: { allowNull: true, type: /^datetime/i },
    failure_code: { allowNull: true, type: /^varchar\(80\)/i },
    created_at: { allowNull: false, type: /^datetime/i },
    updated_at: { allowNull: false, type: /^datetime/i },
});

const EXPECTED_INDEXES = Object.freeze({
    [TABLE_NAMES.TOPUP_ORDERS]: {
        [PAYMENT_KEY_UNIQUE_INDEX]: { unique: true, fields: ['payment_key'] },
    },
});

/** showIndex() 결과의 필드 이름만 뽑는다(MySQL은 [{attribute}], 시험 대역은 문자열 배열). */
const indexFieldNames = (index) => (Array.isArray(index?.fields) ? index.fields : []).map((field) => (
    typeof field === 'string' ? field : (field?.attribute ?? field?.name ?? '')
));

const sameName = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();

const verifyTable = async (queryInterface, tableName, contracts) => {
    const table = await queryInterface.describeTable(tableName);
    const missing = Object.keys(contracts).filter((column) => !table[column]);
    if (missing.length > 0) {
        throw new Error(`${tableName}에 누락된 컬럼: [${missing.join(', ')}]`);
    }

    for (const [column, contract] of Object.entries(contracts)) {
        const actual = table[column];
        if (actual.allowNull !== undefined && actual.allowNull !== contract.allowNull) {
            throw new Error(
                `${tableName}.${column}의 NULL 허용이 계약과 다릅니다: ` +
                `기대 allowNull=${contract.allowNull}, 실제 allowNull=${actual.allowNull}`,
            );
        }
        if (contract.primaryKey === true && actual.primaryKey !== undefined && actual.primaryKey !== true) {
            throw new Error(`${tableName}.${column} 컬럼이 기본 키가 아닙니다.`);
        }
        if (contract.primaryKey !== true && actual.primaryKey === true) {
            throw new Error(`${tableName}.${column} 컬럼이 계약에 없는 기본 키입니다.`);
        }
        if (contract.type && actual.type !== undefined && !contract.type.test(String(actual.type))) {
            throw new Error(
                `${tableName}.${column}의 타입이 계약과 다릅니다: ` +
                `기대 패턴 ${contract.type}, 실제 ${actual.type}`,
            );
        }
        if (contract.defaultValue !== undefined && actual.defaultValue !== undefined
            && String(actual.defaultValue) !== contract.defaultValue) {
            throw new Error(
                `${tableName}.${column}의 기본값이 계약과 다릅니다: ` +
                `기대 ${contract.defaultValue}, 실제 ${actual.defaultValue}`,
            );
        }
    }
};

const verifyIndexes = async (queryInterface, tableName, expectedIndexes) => {
    const indexes = await queryInterface.showIndex(tableName);
    for (const [name, expected] of Object.entries(expectedIndexes)) {
        const index = indexes.find((candidate) => candidate.name === name);
        if (!index) {
            throw new Error(`${tableName} 적용 후에도 ${name} 인덱스가 없습니다.`);
        }
        // 이름이 같아도 덮는 컬럼이 다르면 유일성 계약이 지켜지지 않는다 — 순서까지 대조한다.
        const actualFields = indexFieldNames(index);
        if (actualFields.join(',') !== expected.fields.join(',')) {
            throw new Error(
                `${tableName}의 ${name} 인덱스가 기대한 컬럼을 덮지 않습니다: ` +
                `기대 [${expected.fields.join(', ')}], 실제 [${actualFields.join(', ')}]`,
            );
        }
        if ((index.unique === true) !== expected.unique) {
            throw new Error(
                `${tableName}의 ${name} 인덱스 unique 여부가 계약과 다릅니다: ` +
                `기대 ${expected.unique}, 실제 ${index.unique === true}`,
            );
        }
    }
};

module.exports = {
    name: '0018-add-currency-products-topup-orders',

    async up(queryInterface, Sequelize) {
        const existingTables = new Set(await queryInterface.showAllTables());

        if (!existingTables.has(TABLE_NAMES.CURRENCY_PRODUCTS)) {
            await queryInterface.createTable(TABLE_NAMES.CURRENCY_PRODUCTS, {
                product_id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
                kind: { type: Sequelize.STRING(20), allowNull: false },
                display_name: { type: Sequelize.STRING(100), allowNull: false },
                pay_currency: { type: Sequelize.STRING(10), allowNull: false },
                pay_amount: { type: Sequelize.INTEGER, allowNull: false },
                grant_currency: { type: Sequelize.STRING(10), allowNull: false },
                grant_amount: { type: Sequelize.INTEGER, allowNull: false },
                bonus_amount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                status: { type: Sequelize.STRING(10), allowNull: false },
                sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
        }

        if (!existingTables.has(TABLE_NAMES.TOPUP_ORDERS)) {
            await queryInterface.createTable(TABLE_NAMES.TOPUP_ORDERS, {
                order_id: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
                user_id: {
                    type: Sequelize.UUID, allowNull: false,
                    references: { model: 'users', key: 'uuid' },
                },
                product_id: { type: Sequelize.STRING(64), allowNull: false },
                version: { type: Sequelize.INTEGER, allowNull: false },
                pay_amount: { type: Sequelize.INTEGER, allowNull: false },
                grant_amount: { type: Sequelize.INTEGER, allowNull: false },
                bonus_amount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                order_name: { type: Sequelize.STRING(100), allowNull: false },
                status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'CREATED' },
                payment_key: { type: Sequelize.STRING(200), allowNull: true },
                lease_token: { type: Sequelize.STRING(64), allowNull: true },
                lease_expires_at: { type: Sequelize.DATE, allowNull: true },
                approved_at: { type: Sequelize.DATE, allowNull: true },
                granted_at: { type: Sequelize.DATE, allowNull: true },
                failure_code: { type: Sequelize.STRING(80), allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
        }

        // 부분 실행(테이블은 만들어졌지만 인덱스 추가에서 중단)에도 빠진 인덱스만 보완한다 —
        // 기존 행은 건드리지 않는다.
        const orderIndexes = await queryInterface.showIndex(TABLE_NAMES.TOPUP_ORDERS);
        if (!orderIndexes.some((index) => index.name === PAYMENT_KEY_UNIQUE_INDEX)) {
            await queryInterface.addIndex(TABLE_NAMES.TOPUP_ORDERS, ['payment_key'], {
                name: PAYMENT_KEY_UNIQUE_INDEX, unique: true,
            });
        }
    },

    async down() {
        throw new Error('0018-add-currency-products-topup-orders의 down()은 지원하지 않습니다 — 결제 이력을 지우는 파괴적 변경입니다.');
    },

    async verify(queryInterface) {
        await verifyTable(queryInterface, TABLE_NAMES.CURRENCY_PRODUCTS, PRODUCT_COLUMN_CONTRACTS);
        await verifyTable(queryInterface, TABLE_NAMES.TOPUP_ORDERS, ORDER_COLUMN_CONTRACTS);
        await verifyIndexes(queryInterface, TABLE_NAMES.TOPUP_ORDERS, EXPECTED_INDEXES[TABLE_NAMES.TOPUP_ORDERS]);

        // 소유자 없는 주문을 막는 users.uuid FK — 방언이 조회를 지원할 때만 판정한다.
        if (typeof queryInterface.getForeignKeyReferencesForTable === 'function') {
            const references = await queryInterface.getForeignKeyReferencesForTable(TABLE_NAMES.TOPUP_ORDERS);
            const found = Array.isArray(references) && references.some((reference) => (
                sameName(reference?.columnName, 'user_id')
                && sameName(reference?.referencedTableName, 'users')
                && sameName(reference?.referencedColumnName, 'uuid')
            ));
            if (!found) {
                throw new Error(`${TABLE_NAMES.TOPUP_ORDERS}.user_id → users.uuid 외래 키가 없습니다.`);
            }
        }
    },

    TABLE_NAMES,
    PAYMENT_KEY_UNIQUE_INDEX,
    PRODUCT_COLUMN_CONTRACTS,
    ORDER_COLUMN_CONTRACTS,
    EXPECTED_INDEXES,
};
