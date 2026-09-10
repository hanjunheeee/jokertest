'use strict';

// F-08 지갑·거래 원장·소유권(entitlement)·장착(loadout) 4개 테이블을 추가한다.
//
// R-IMPL(2026-09-10, 반송): 이전 회차는 이 4개 테이블을 마이그레이션 파일 없이
// backend/index.js 기동 시 sequelize.sync({force:false})로만 만들었다 — 0001~0005가
// 세운 "새 테이블은 마이그레이션으로 추적한다"는 관례(체크섬·재실행 안전성·복구 절차)를
// 벗어났고, f01~f07 DB 통합 시험이 공유하는 관리 테이블 목록(backend/tests/helpers/
// isolatedTestDb.js)도 이 4개 테이블을 몰라 별도 스위트가 자기만의 안전하지 않은 리셋
// 로직을 새로 만들게 했다. 이 파일이 0001-legacy-baseline.js/0005-add-social-auth.js와
// 같은 패턴(멱등한 up, 존재 확인 후 생성, verify, down)으로 그 자리를 채운다.
//
// 컬럼 정의는 backend/models/economy/economy.model.js와 항상 같은 모양이어야 한다:
//   - economy_wallets: GOLD·DIAMOND 두 재화 모두 정수 잔액, 초기값 0/0(F-08 요구사항).
//   - economy_ledger_entries: currency 컬럼(재화 종류를 명시적으로 기록) + (user_id,
//     reference_event_id) 복합 유일 인덱스. 전역 유일 제약이 아니라 계정 범위로 좁힌
//     이유는 economy.service.js의 주석 참고(AC-02/AC-06 재검토 지적) — 서로 다른 계정이
//     같은 참조 사건 ID 문자열을 제출해도 서로의 원장에 영향을 주면 안 된다.
//   - economy_entitlements: (user_id, item_id) 복합 유일 인덱스 — 같은 상품을 중복 보유하지
//     않는다.
//   - economy_loadouts: 선택된 프로필 사진/테두리/카드 프레임(nullable, 없으면 서비스가
//     기본값을 채운다).

const TABLE_NAMES = {
    WALLETS: 'economy_wallets',
    LEDGER_ENTRIES: 'economy_ledger_entries',
    ENTITLEMENTS: 'economy_entitlements',
    LOADOUTS: 'economy_loadouts',
};

module.exports = {
    name: '0006-add-economy',

    async up(queryInterface, Sequelize) {
        const existingTables = new Set(await queryInterface.showAllTables());

        if (!existingTables.has(TABLE_NAMES.WALLETS)) {
            await queryInterface.createTable(TABLE_NAMES.WALLETS, {
                user_id: {
                    type: Sequelize.UUID, primaryKey: true, allowNull: false,
                    references: { model: 'users', key: 'uuid' },
                },
                balance_gold: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                balance_diamond: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
        }

        if (!existingTables.has(TABLE_NAMES.LEDGER_ENTRIES)) {
            await queryInterface.createTable(TABLE_NAMES.LEDGER_ENTRIES, {
                id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
                user_id: {
                    type: Sequelize.UUID, allowNull: false,
                    references: { model: 'users', key: 'uuid' },
                },
                reason: { type: Sequelize.STRING(40), allowNull: false },
                item_id: { type: Sequelize.STRING(120), allowNull: true },
                currency: { type: Sequelize.STRING(10), allowNull: false },
                amount: { type: Sequelize.INTEGER, allowNull: false },
                balance_after: { type: Sequelize.INTEGER, allowNull: false },
                reference_event_id: { type: Sequelize.STRING(150), allowNull: false },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
            await queryInterface.addIndex(TABLE_NAMES.LEDGER_ENTRIES, ['user_id', 'reference_event_id'], {
                name: 'economy_ledger_entries_user_reference_unique', unique: true,
            });
        }

        if (!existingTables.has(TABLE_NAMES.ENTITLEMENTS)) {
            await queryInterface.createTable(TABLE_NAMES.ENTITLEMENTS, {
                id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
                user_id: {
                    type: Sequelize.UUID, allowNull: false,
                    references: { model: 'users', key: 'uuid' },
                },
                item_id: { type: Sequelize.STRING(120), allowNull: false },
                item_type: { type: Sequelize.STRING(40), allowNull: false },
                source: { type: Sequelize.STRING(30), allowNull: false },
                acquired_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
            await queryInterface.addIndex(TABLE_NAMES.ENTITLEMENTS, ['user_id', 'item_id'], {
                name: 'economy_entitlements_user_item_unique', unique: true,
            });
        }

        if (!existingTables.has(TABLE_NAMES.LOADOUTS)) {
            await queryInterface.createTable(TABLE_NAMES.LOADOUTS, {
                user_id: {
                    type: Sequelize.UUID, primaryKey: true, allowNull: false,
                    references: { model: 'users', key: 'uuid' },
                },
                selected_profile_photo_id: { type: Sequelize.STRING(120), allowNull: true },
                selected_profile_border_id: { type: Sequelize.STRING(120), allowNull: true },
                selected_card_frame_id: { type: Sequelize.STRING(120), allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
        }
    },

    async down(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        // 모두 users의 자식이고 서로 참조하지 않는다 — 생성 역순으로 정리한다(0005와 같은 관례).
        for (const table of [TABLE_NAMES.LOADOUTS, TABLE_NAMES.ENTITLEMENTS, TABLE_NAMES.LEDGER_ENTRIES, TABLE_NAMES.WALLETS]) {
            if (existingTables.has(table)) await queryInterface.dropTable(table);
        }
    },

    async verify(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        const missing = Object.values(TABLE_NAMES).filter((t) => !existingTables.has(t));
        if (missing.length > 0) {
            throw new Error(`0006-add-economy 적용 후에도 누락된 테이블: [${missing.join(', ')}]`);
        }
    },

    TABLE_NAMES,
};
