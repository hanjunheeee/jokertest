'use strict';

// user_stats의 칭호(title)·평판(reputation) 칸 지우는 마이그레이션 (사용자 결정 2026-11-09, 둘 다 쓰는 곳 없음)
// 있는 칸만 지움 (다시 돌려도 안전), down은 칸만 다시 만듦 (지운 값은 못 되살림)

const TABLE = 'user_stats';
const DROPPED_COLUMNS = Object.freeze(['title', 'reputation']);

module.exports = {
    name: '0027-drop-user-stats-title-reputation',

    async up(queryInterface) {
        const described = await queryInterface.describeTable(TABLE);
        for (const column of DROPPED_COLUMNS) {
            if (described[column]) await queryInterface.removeColumn(TABLE, column);
        }
    },

    async down(queryInterface, Sequelize) {
        const described = await queryInterface.describeTable(TABLE);
        if (!described.reputation) {
            await queryInterface.addColumn(TABLE, 'reputation', { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 });
        }
        if (!described.title) {
            await queryInterface.addColumn(TABLE, 'title', { type: Sequelize.STRING(50), allowNull: true, defaultValue: '신참' });
        }
    },

    async verify(queryInterface) {
        const described = await queryInterface.describeTable(TABLE);
        const left = DROPPED_COLUMNS.filter((column) => described[column]);
        if (left.length > 0) throw new Error(`0027: ${TABLE}에 아직 칸이 남음 [${left.join(', ')}]`);
    },

    TABLE,
    DROPPED_COLUMNS,
};
