'use strict';

// online_presence에 server_id 칸 더하는 마이그레이션, 접속 줄마다 어느 서버 접속인지 적기 (서버 여러 대 대비)
// 서버 켤 때 OFFLINE 되돌리기가 자기 서버 줄(+ 이름 없는 옛 줄)만 건드리게, 없을 때만 더함 (다시 돌려도 안전)

const TABLE = 'online_presence';
const COLUMN = 'server_id';

module.exports = {
    name: '0029-add-online-presence-server-id',

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
        if (!described[COLUMN]) throw new Error(`0029: ${TABLE}.${COLUMN} 칸이 없음`);
    },

    TABLE,
    COLUMN,
};
