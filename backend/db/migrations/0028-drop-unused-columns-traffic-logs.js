'use strict';

// 안 쓰는 칸 3개 + 요청 기록 표(traffic_logs) 지우는 마이그레이션 (사용자 결정 2026-11-09 "안 쓰는 거면 날려")
// users.phone · user_sessions.last_ping_at · online_presence.current_room_id: 넣는 곳·읽는 곳 없음, 값 전부 NULL
// traffic_logs: 쓰는 코드 없음 (요청 기록은 morgan 콘솔 로그로만), 0행
// 값이 하나라도 있으면 짐작 않고 아무것도 안 지움 (사람이 먼저 봐야 함), 다시 돌려도 안전
// down은 칸·표 모양만 다시 만듦 (자리·타입·기본값 같게, 지운 값은 못 되살림)

const DROPPED_COLUMNS = Object.freeze([
    { table: 'users', column: 'phone' },
    { table: 'user_sessions', column: 'last_ping_at' },
    { table: 'online_presence', column: 'current_room_id' },
]);
const DROPPED_TABLE = 'traffic_logs';

// down 때 칸 모양 (지우기 전 DB 그대로, after = 원래 자리)
const columnShapes = (Sequelize) => ({
    phone: { type: Sequelize.STRING(20), allowNull: true, after: 'email' },
    last_ping_at: { type: Sequelize.DATE, allowNull: true, after: 'connected_at' },
    // 0023에서 바꾼 모양 (CHAR(36) BINARY)
    current_room_id: { type: Sequelize.UUID, allowNull: true, after: 'last_active_at' },
});

// down 때 표 모양 (0001 기준과 같음)
const trafficLogsShape = (Sequelize) => ({
    id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
    url: { type: Sequelize.TEXT, allowNull: false },
    method: { type: Sequelize.STRING(10), allowNull: false },
    response_status: { type: Sequelize.INTEGER, allowNull: true },
    ip_address: { type: Sequelize.STRING(45), allowNull: true },
    response_time_ms: { type: Sequelize.INTEGER, allowNull: true },
    accessed_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
});

// 한 줄 숫자 꺼내기 (드라이버마다 행 모양이 달라 둘 다 봄)
const countOf = async (sequelize, sql) => {
    const [rows] = await sequelize.query(sql);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return Number(row?.n ?? 0);
};

module.exports = {
    name: '0028-drop-unused-columns-traffic-logs',

    async up(queryInterface, Sequelize, sequelize) {
        // 먼저 다 살펴보고 하나라도 값이 있으면 아무것도 안 지움 (반쯤 지운 채로 멈추지 않게)
        const columnsToDrop = [];
        for (const { table, column } of DROPPED_COLUMNS) {
            const described = await queryInterface.describeTable(table);
            if (!described[column]) continue;
            const filled = await countOf(sequelize, `SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${column}\` IS NOT NULL`);
            if (filled > 0) {
                throw new Error(`0028: ${table}.${column}에 값이 ${filled}개 있어 안 지움 — 값을 확인한 뒤 손으로 정리하기`);
            }
            columnsToDrop.push({ table, column });
        }
        const tables = await queryInterface.showAllTables();
        const hasTable = tables.includes(DROPPED_TABLE);
        if (hasTable) {
            const rowCount = await countOf(sequelize, `SELECT COUNT(*) AS n FROM \`${DROPPED_TABLE}\``);
            if (rowCount > 0) {
                throw new Error(`0028: ${DROPPED_TABLE}에 줄이 ${rowCount}개 있어 안 지움 — 남길지 확인한 뒤 손으로 정리하기`);
            }
        }

        for (const { table, column } of columnsToDrop) {
            await queryInterface.removeColumn(table, column);
        }
        if (hasTable) await queryInterface.dropTable(DROPPED_TABLE);
    },

    async down(queryInterface, Sequelize) {
        const shapes = columnShapes(Sequelize);
        for (const { table, column } of DROPPED_COLUMNS) {
            const described = await queryInterface.describeTable(table);
            if (!described[column]) await queryInterface.addColumn(table, column, shapes[column]);
        }
        const tables = await queryInterface.showAllTables();
        if (!tables.includes(DROPPED_TABLE)) {
            await queryInterface.createTable(DROPPED_TABLE, trafficLogsShape(Sequelize));
        }
    },

    async verify(queryInterface) {
        for (const { table, column } of DROPPED_COLUMNS) {
            const described = await queryInterface.describeTable(table);
            if (described[column]) throw new Error(`0028: ${table}.${column} 칸이 아직 남음`);
        }
        const tables = await queryInterface.showAllTables();
        if (tables.includes(DROPPED_TABLE)) throw new Error(`0028: ${DROPPED_TABLE} 표가 아직 남음`);
    },

    DROPPED_COLUMNS,
    DROPPED_TABLE,
};
