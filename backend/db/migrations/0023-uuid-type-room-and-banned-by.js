'use strict';

// INT인데 UUID를 담아야 하는 칸 2개를 CHAR(36)으로 (DB 전수조사 D-08)
// online_presence.current_room_id: 방 id는 crypto.randomUUID() 글자 → INT엔 못 넣음
// user_bans.banned_by: 정지한 사람 = 계정 키 users.uuid(CHAR 36) → INT엔 못 넣음
// 둘 다 지금 넣는 코드 없고 값 전부 NULL → 타입만 바꿔도 잃는 값 없음
// 값이 하나라도 있으면 짐작 않고 멈춤 (숫자 값이 뭘 뜻하는지 사람이 봐야 함)
// users.uuid와 같은 모양(CHAR(36) BINARY, NULL 허용), 외래키는 안 검 (정지 관리 기능 만들 때 정함)

const TARGETS = Object.freeze([
    { table: 'online_presence', column: 'current_room_id' },
    { table: 'user_bans', column: 'banned_by' },
]);

module.exports = {
    name: '0023-uuid-type-room-and-banned-by',

    async up(queryInterface, Sequelize, sequelize) {
        // 먼저 다 살펴보고 하나라도 걸리면 아무것도 안 바꿈 (반쯤 바뀐 채로 멈추지 않게)
        const toChange = [];
        for (const { table, column } of TARGETS) {
            const described = await queryInterface.describeTable(table);
            if (!described[column]) throw new Error(`${table}.${column} 칸이 없습니다.`);
            // 이미 바뀌었으면 건너뜀 (다시 돌림)
            if (/^char\(36\)/i.test(String(described[column].type))) continue;

            const [rows] = await sequelize.query(
                `SELECT COUNT(*) AS filled FROM \`${table}\` WHERE \`${column}\` IS NOT NULL`,
            );
            const filled = Number(rows?.[0]?.filled ?? 0);
            if (filled > 0) {
                throw new Error(
                    `${table}.${column}에 값이 ${filled}개 있어 타입을 안 바꿉니다 — 값의 뜻을 확인한 뒤 손으로 정리하기`,
                );
            }
            toChange.push({ table, column });
        }
        for (const { table, column } of toChange) {
            await queryInterface.changeColumn(table, column, { type: Sequelize.UUID, allowNull: true });
        }
    },

    // 되돌리기: INT로 (값이 있으면 실패할 수 있음 → 값 비운 뒤에)
    async down(queryInterface, Sequelize) {
        for (const { table, column } of TARGETS) {
            await queryInterface.changeColumn(table, column, { type: Sequelize.INTEGER, allowNull: true });
        }
    },

    async verify(queryInterface) {
        for (const { table, column } of TARGETS) {
            const described = await queryInterface.describeTable(table);
            const type = String(described[column]?.type ?? '');
            if (!/^char\(36\)/i.test(type)) throw new Error(`${table}.${column} 타입이 CHAR(36)이 아닙니다 (실제 ${type}).`);
            if (described[column].allowNull === false) throw new Error(`${table}.${column}은 NULL 허용이어야 합니다.`);
        }
    },

    TARGETS,
};
