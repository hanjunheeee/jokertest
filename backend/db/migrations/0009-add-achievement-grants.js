'use strict';

// F-12 업적 지급 이력. achievement_grants 한 행이 "한 계정이 한 업적 ID를 한 번 달성해
// 보상을 지급받았다"는 사건 하나를 나타낸다(A-03/AC-04). (user_id, achievement_id) 복합
// 유일 제약이 동시 달성·중복 요청·재시도·소급 재평가를 한 번의 지급으로 묶는 근거다 —
// achievementService.js는 이 행의 findOrCreate 결과(created)를 게이트로 삼아, 새로
// 만들어진 경우에만 economy.service.applyLedgerTransaction으로 재화·아이템을 지급한다
// (0006-add-economy.js의 economy_ledger_entries가 (user_id, reference_event_id)로 같은
// 역할을 하는 것과 동일한 설계 — "멱등성의 근거를 프로세스 안의 플래그가 아니라 DB 제약에
// 둔다"는 gameResult.repositories.js의 관례를 그대로 따른다).
//
// achievement_id는 프론트 정의(spreadMeta.js의 record-* / jobChallenges.js의 *-win-*)의
// 기존 id 문자열을 그대로 쓴다 — 별도의 정수 카탈로그 테이블을 두지 않는다(achievementDefinitions.js
// 가 유일한 정의 소스).
//
// 0008-add-vote-participations.js와 같은 패턴(멱등한 up, 존재 확인 후 생성, verify, down)을
// 따른다.

const TABLE_NAMES = {
    ACHIEVEMENT_GRANTS: 'achievement_grants',
};

module.exports = {
    name: '0009-add-achievement-grants',

    async up(queryInterface, Sequelize) {
        const existingTables = new Set(await queryInterface.showAllTables());

        if (!existingTables.has(TABLE_NAMES.ACHIEVEMENT_GRANTS)) {
            await queryInterface.createTable(TABLE_NAMES.ACHIEVEMENT_GRANTS, {
                id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, autoIncrement: true },
                user_id: {
                    type: Sequelize.UUID, allowNull: false,
                    references: { model: 'users', key: 'uuid' },
                },
                achievement_id: { type: Sequelize.STRING(60), allowNull: false },
                granted_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
        }

        // CODEX-1 재검토(AC-04): createTable은 성공했지만 이어지는 addIndex 전에 프로세스가
        // 죽으면(배포 중단 등), 테이블만 있고 유일 인덱스는 없는 상태로 남는다. 예전 코드는
        // existingTables.has(...)만으로 up() 재실행 여부를 판단해 이 경우 addIndex를 영영
        // 건너뛰었다 — 그러면 동시 달성·재시도가 achievement_grants 유일 제약 없이 통과해
        // AC-04(중복 지급 방지)가 깨진다. 테이블 존재 여부와 별개로 인덱스 존재 여부를 항상
        // 확인하고 없으면 다시 만든다(멱등, addIndex를 두 번 불러도 안전하지 않으므로 존재
        // 확인 후에만 호출한다).
        const indexes = await queryInterface.showIndex(TABLE_NAMES.ACHIEVEMENT_GRANTS);
        const hasUniqueIndex = indexes.some((index) => index.name === 'achievement_grants_user_achievement_unique');
        if (!hasUniqueIndex) {
            await queryInterface.addIndex(TABLE_NAMES.ACHIEVEMENT_GRANTS, ['user_id', 'achievement_id'], {
                name: 'achievement_grants_user_achievement_unique', unique: true,
            });
        }
    },

    async down(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        if (existingTables.has(TABLE_NAMES.ACHIEVEMENT_GRANTS)) {
            await queryInterface.dropTable(TABLE_NAMES.ACHIEVEMENT_GRANTS);
        }
    },

    async verify(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        const missing = Object.values(TABLE_NAMES).filter((t) => !existingTables.has(t));
        if (missing.length > 0) {
            throw new Error(`0009-add-achievement-grants 적용 후에도 누락된 테이블: [${missing.join(', ')}]`);
        }

        // CODEX-1 재검토(AC-04): 테이블만 있고 유일 인덱스가 없는 중간 실패 상태를 verify가
        // 놓치지 않게, 인덱스 존재 여부도 함께 확인한다.
        const indexes = await queryInterface.showIndex(TABLE_NAMES.ACHIEVEMENT_GRANTS);
        const hasUniqueIndex = indexes.some((index) => index.name === 'achievement_grants_user_achievement_unique');
        if (!hasUniqueIndex) {
            throw new Error('0009-add-achievement-grants 적용 후에도 achievement_grants_user_achievement_unique 유일 인덱스가 없습니다');
        }
    },

    TABLE_NAMES,
};
