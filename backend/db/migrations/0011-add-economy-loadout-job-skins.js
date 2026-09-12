'use strict';

// F-14(AC-01): 직업별 장착 스킨 5개 컬럼을 economy_loadouts에 추가한다. selected_card_frame_id
// (0006-add-economy)와 같은 이유로 전부 nullable이다 — 미장착은 영구히 유효한 상태이고
// (프론트가 기본 스킨으로 대체해 표시한다, skinCardWear.store.js 참고), 0010의 revision과
// 달리 "모든 행을 채워야 하는" 백필 대상이 아니다. 다섯 컬럼(selected_skin_noble/clown/guard/
// doctor/witch_hunter)은 frontend skinCardWearCatalog.js의 5개 직업 탭(noble/clown/guard/
// doctor/witchHunter)과 1:1 대응한다 — economy.service.js의 SLOT_TO_LOADOUT_COLUMN이 이
// 이름을 그대로 참조한다.

const TABLE_NAME = 'economy_loadouts';
const COLUMN_NAMES = [
    'selected_skin_noble',
    'selected_skin_clown',
    'selected_skin_guard',
    'selected_skin_doctor',
    'selected_skin_witch_hunter',
];

module.exports = {
    name: '0011-add-economy-loadout-job-skins',

    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable(TABLE_NAME);
        for (const columnName of COLUMN_NAMES) {
            if (!table[columnName]) {
                // eslint-disable-next-line no-await-in-loop -- 컬럼마다 순서대로 추가한다(배치 DDL 불가).
                await queryInterface.addColumn(TABLE_NAME, columnName, {
                    type: Sequelize.STRING(191),
                    allowNull: true,
                });
            }
        }
    },

    async down(queryInterface) {
        const table = await queryInterface.describeTable(TABLE_NAME);
        for (const columnName of COLUMN_NAMES) {
            if (table[columnName]) {
                // eslint-disable-next-line no-await-in-loop -- 컬럼마다 순서대로 제거한다.
                await queryInterface.removeColumn(TABLE_NAME, columnName);
            }
        }
    },

    async verify(queryInterface) {
        const table = await queryInterface.describeTable(TABLE_NAME);
        for (const columnName of COLUMN_NAMES) {
            if (!table[columnName]) {
                throw new Error(`0011-add-economy-loadout-job-skins 적용 후에도 ${TABLE_NAME}.${columnName} 컬럼이 없습니다`);
            }
            if (table[columnName].allowNull !== true) {
                throw new Error(`0011-add-economy-loadout-job-skins 적용 후 ${TABLE_NAME}.${columnName}이 nullable이 아닙니다`);
            }
        }
    },

    TABLE_NAME,
    COLUMN_NAMES,
};
