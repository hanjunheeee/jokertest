'use strict';

// F-09 구매 요청 결과 복구용 테이블. economy_purchase_requests 한 행이 "구매 요청 하나
// 전체"(단일 또는 일괄)의 커밋된 결과를 저장한다 — 실제 지갑 차감·원장 기록·소유권 부여와
// 같은 트랜잭션에서만 INSERT되므로, 이 행이 존재한다는 사실 자체가 "그 요청은 이미
// 커밋된 성공"이라는 뜻이다(backend/service/economy.service.js purchaseItems/
// getPurchaseResult, F-09 AC-04: 커밋 후 응답 유실과 커밋 전 오류를 구분).
//
// 0006-add-economy.js와 같은 패턴(멱등한 up, 존재 확인 후 생성, verify, down)을 그대로
// 따른다. 컬럼 정의는 backend/models/economy/economy.model.js의 EconomyPurchaseRequest와
// 항상 같은 모양이어야 한다 — (user_id, reference_event_id) 복합 유일 인덱스는
// economy_ledger_entries와 같은 이유로 계정 범위로 좁혔다(크로스 계정 정보 노출 방지).

const TABLE_NAMES = {
    PURCHASE_REQUESTS: 'economy_purchase_requests',
};

module.exports = {
    name: '0007-add-economy-purchase-requests',

    async up(queryInterface, Sequelize) {
        const existingTables = new Set(await queryInterface.showAllTables());

        if (!existingTables.has(TABLE_NAMES.PURCHASE_REQUESTS)) {
            await queryInterface.createTable(TABLE_NAMES.PURCHASE_REQUESTS, {
                id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
                user_id: {
                    type: Sequelize.UUID, allowNull: false,
                    references: { model: 'users', key: 'uuid' },
                },
                reference_event_id: { type: Sequelize.STRING(150), allowNull: false },
                kind: { type: Sequelize.STRING(10), allowNull: false },
                payload_json: { type: Sequelize.JSON, allowNull: false },
                result_json: { type: Sequelize.JSON, allowNull: false },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
            await queryInterface.addIndex(TABLE_NAMES.PURCHASE_REQUESTS, ['user_id', 'reference_event_id'], {
                name: 'economy_purchase_requests_user_reference_unique', unique: true,
            });
        }
    },

    async down(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        if (existingTables.has(TABLE_NAMES.PURCHASE_REQUESTS)) {
            await queryInterface.dropTable(TABLE_NAMES.PURCHASE_REQUESTS);
        }
    },

    async verify(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        const missing = Object.values(TABLE_NAMES).filter((t) => !existingTables.has(t));
        if (missing.length > 0) {
            throw new Error(`0007-add-economy-purchase-requests 적용 후에도 누락된 테이블: [${missing.join(', ')}]`);
        }
    },

    TABLE_NAMES,
};
