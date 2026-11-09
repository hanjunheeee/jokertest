'use strict';

// concurrent_snapshots에 server_id 칸 더하는 마이그레이션, 동시 접속 기록을 Node마다 한 줄씩 적기 (Node 여러 개)
// 없을 때만 더하고 있으면 그냥 지나감 (두 번 돌려도 안전), 옛 줄은 비어 있음(단일 모드 줄)

const TABLE = 'concurrent_snapshots';
const COLUMN = 'server_id';

module.exports = {
    name: '0030-add-concurrent-snapshot-server-id',

    async up(queryInterface, Sequelize) {
        const described = await queryInterface.describeTable(TABLE);
        if (described[COLUMN]) return;
        await queryInterface.addColumn(TABLE, COLUMN, { type: Sequelize.STRING(64), allowNull: true, defaultValue: null });
    },

    async down(queryInterface) {
        const described = await queryInterface.describeTable(TABLE);
        if (described[COLUMN]) await queryInterface.removeColumn(TABLE, COLUMN);
    },

    async verify(queryInterface) {
        const described = await queryInterface.describeTable(TABLE);
        if (!described[COLUMN]) throw new Error(`0030: ${TABLE}.${COLUMN} 칸이 없음`);
    },

    TABLE,
    COLUMN,
};
