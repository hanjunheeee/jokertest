'use strict';

// 인덱스 이름을 마이그레이션 쪽 이름으로 맞춤 (DB 전수조사 D-01 뒷정리, cmp_indexes.tsv)
// 서버 sync가 먼저 만든 표는 인덱스 이름이 모델식(state_hash · user_id 등)이라, 새로 만든 DB와 이름이 갈림
// → 나중 마이그레이션이 이름으로 인덱스를 지우거나 바꾸면 한쪽 DB에서만 실패함
// 이름만 바꿈(RENAME INDEX, 데이터·칸 그대로), 같은 칸·같은 유일 여부인 인덱스가 딱 하나일 때만
// 원하는 이름이 이미 있으면 건너뜀, 대상이 없거나 둘 이상이면 짐작 않고 멈춤
// 0020 뒤에 돌아야 함 (oauth_states.user_id 인덱스)

const TARGETS = Object.freeze([
    { table: 'oauth_states', fields: ['state_hash'], unique: true, name: 'oauth_states_state_hash_unique' },
    { table: 'oauth_states', fields: ['user_id'], unique: false, name: 'oauth_states_user_id' },
    { table: 'social_signup_intents', fields: ['intent_token_hash'], unique: true, name: 'social_signup_intents_token_hash_unique' },
    { table: 'friendships', fields: ['requester_id', 'receiver_id'], unique: true, name: 'friendships_requester_receiver' },
    { table: 'external_identities', fields: ['user_id'], unique: false, name: 'external_identities_user_id' },
]);

module.exports = {
    name: '0022-align-index-names',

    async up(queryInterface, Sequelize, sequelize) {
        const sameFields = (index, fields) => {
            const actual = (index.fields || []).map((field) => field.attribute);
            return actual.length === fields.length && actual.every((field, i) => field === fields[i]);
        };
        for (const target of TARGETS) {
            const indexes = (await queryInterface.showIndex(target.table)) || [];
            if (indexes.some((index) => index.name === target.name)) continue;

            const candidates = indexes.filter((index) => !index.primary
                && Boolean(index.unique) === target.unique && sameFields(index, target.fields));
            if (candidates.length !== 1) {
                throw new Error(
                    `${target.table}(${target.fields.join(',')}) 인덱스가 ${candidates.length}개라 이름을 못 맞춥니다 — `
                    + `SHOW INDEX FROM ${target.table} 로 보고 손으로 정리한 뒤 다시 migrate 하기`,
                );
            }
            await sequelize.query(
                `ALTER TABLE \`${target.table}\` RENAME INDEX \`${candidates[0].name}\` TO \`${target.name}\``,
            );
        }
    },

    // 되돌리기 없음: 옛 이름은 DB마다 달라 모름, 이름만 다른 거라 되돌릴 필요도 없음
    async down() {},

    async verify(queryInterface) {
        const missing = [];
        for (const target of TARGETS) {
            const indexes = (await queryInterface.showIndex(target.table)) || [];
            if (!indexes.some((index) => index.name === target.name)) missing.push(`${target.table}.${target.name}`);
        }
        if (missing.length > 0) throw new Error(`이름 맞춘 뒤에도 없는 인덱스: [${missing.join(', ')}]`);
    },

    TARGETS,
};
