'use strict';

// F-11 투표 참여 영속 집계. vote_participations 한 행이 "한 계정이 한 경기의 한 일반 낮
// 라운드(day_index)에서 유효한 비기권 투표를 제출했다"는 사건 하나를 나타낸다(A-01/A-02).
// (game_id, day_index, user_id) 복합 유일 제약이 중복 제출·네트워크 재시도를 한 사건으로
// 묶는 근거다(AC-02) — 재투표 차수는 이 키에 없으므로 같은 day_index의 재투표는 새 사건을
// 만들지 않는다.
//
// game_id는 game_results.id를 참조하지 않는다 — 사건은 경기가 진행 중일 때(그 라운드가
// 끝나는 즉시) 저장되므로, 그 시점에는 아직 game_results 행이 없다. 집계 시점에만
// game_results와 JOIN해 완료·출처를 판정한다(voteParticipation.repositories.js의
// countEligibleDayVoteParticipations, A-04). user_id만 users.uuid를 참조한다.
//
// 0007-add-economy-purchase-requests.js와 같은 패턴(멱등한 up, 존재 확인 후 생성, verify,
// down)을 따른다. 컬럼 정의는 backend/models/game/vote_participation.model.js의
// VoteParticipation과 항상 같은 모양이어야 한다.

const TABLE_NAMES = {
    VOTE_PARTICIPATIONS: 'vote_participations',
};

module.exports = {
    name: '0008-add-vote-participations',

    async up(queryInterface, Sequelize) {
        const existingTables = new Set(await queryInterface.showAllTables());

        if (!existingTables.has(TABLE_NAMES.VOTE_PARTICIPATIONS)) {
            await queryInterface.createTable(TABLE_NAMES.VOTE_PARTICIPATIONS, {
                id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
                game_id: { type: Sequelize.UUID, allowNull: false },
                day_index: { type: Sequelize.INTEGER, allowNull: false },
                user_id: {
                    type: Sequelize.UUID, allowNull: false,
                    references: { model: 'users', key: 'uuid' },
                },
                accepted_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
            await queryInterface.addIndex(TABLE_NAMES.VOTE_PARTICIPATIONS, ['game_id', 'day_index', 'user_id'], {
                name: 'vote_participations_game_day_user_unique', unique: true,
            });
        }
    },

    async down(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        if (existingTables.has(TABLE_NAMES.VOTE_PARTICIPATIONS)) {
            await queryInterface.dropTable(TABLE_NAMES.VOTE_PARTICIPATIONS);
        }
    },

    async verify(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        const missing = Object.values(TABLE_NAMES).filter((t) => !existingTables.has(t));
        if (missing.length > 0) {
            throw new Error(`0008-add-vote-participations 적용 후에도 누락된 테이블: [${missing.join(', ')}]`);
        }
    },

    TABLE_NAMES,
};
