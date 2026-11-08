'use strict';

// 기간 조회 인덱스 3개 마이그레이션, 관리자 서버가 "이 기간 가입·판·충전"을 셀 때 표 전체 훑기 막기
// users.created_at · game_results.ended_at · economy_topup_orders.created_at (칸은 이미 있음, 인덱스만 더함)
// 없는 것만 만듦 (다시 돌려도 안전), 이름이 같아도 덮는 칸이 다르면 verify가 멈춤

const INDEXES = Object.freeze([
    { table: 'users', name: 'users_created_at_idx', fields: ['created_at'] },
    { table: 'game_results', name: 'game_results_ended_at_idx', fields: ['ended_at'] },
    { table: 'economy_topup_orders', name: 'economy_topup_orders_created_at_idx', fields: ['created_at'] },
]);

// showIndex 결과 칸 이름만 (MySQL은 객체, 가짜는 글자)
const indexFieldNames = (index) => (Array.isArray(index?.fields) ? index.fields : []).map((field) => (
    typeof field === 'string' ? field : (field?.attribute ?? field?.name ?? '')
));

module.exports = {
    name: '0025-add-period-indexes',

    async up(queryInterface) {
        for (const { table, name, fields } of INDEXES) {
            const present = await queryInterface.showIndex(table);
            if (present.some((index) => index.name === name)) continue;
            await queryInterface.addIndex(table, fields, { name });
        }
    },

    async down(queryInterface) {
        for (const { table, name } of INDEXES) {
            const present = await queryInterface.showIndex(table);
            if (present.some((index) => index.name === name)) await queryInterface.removeIndex(table, name);
        }
    },

    async verify(queryInterface) {
        for (const { table, name, fields } of INDEXES) {
            const present = await queryInterface.showIndex(table);
            const found = present.find((index) => index.name === name);
            if (!found) throw new Error(`0025: ${table}에 ${name} 인덱스가 없습니다.`);
            if (indexFieldNames(found).join(',') !== fields.join(',')) {
                throw new Error(`0025: ${name} 칸이 다릅니다 (기대 [${fields.join(', ')}])`);
            }
        }
    },

    INDEXES,
};
