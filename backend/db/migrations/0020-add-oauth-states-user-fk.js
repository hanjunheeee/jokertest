'use strict';

// oauth_states.user_id → users.uuid 외래키 추가 (DB 전수조사 D-02)
// 0005가 선언했지만 서버 sync가 표를 먼저 만든 DB엔 외래키가 없음 → 없는 계정을 가리키는 state를 DB가 못 막음
// 0005로 새로 만든 DB엔 이미 있음 → 있으면 건너뜀, 이름도 0005 쪽 자동 이름(oauth_states_ibfk_1)과 같게
// 고아 행(없는 계정을 가리키는 줄)이 있으면 지우지 않고 멈춤 → 사람이 보고 정리
// 삭제·수정 규칙은 0005와 같이 안 적음(NO ACTION)

const TABLE_NAME = 'oauth_states';
const FK_NAME = 'oauth_states_ibfk_1';
const USER_INDEX_NAME = 'oauth_states_user_id';

module.exports = {
    name: '0020-add-oauth-states-user-fk',

    async up(queryInterface, Sequelize, sequelize) {
        const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

        // 이미 있으면 끝 (0005로 만든 DB, 또는 다시 돌림)
        const references = await queryInterface.getForeignKeyReferencesForTable(TABLE_NAME);
        const hasFk = (references || []).some((ref) => same(ref?.columnName, 'user_id')
            && same(ref?.referencedTableName, 'users') && same(ref?.referencedColumnName, 'uuid'));
        if (hasFk) return;

        // 고아 행 먼저 확인 (있으면 외래키 걸기가 실패하니 미리 분명하게 멈춤)
        const [rows] = await sequelize.query(
            'SELECT COUNT(*) AS orphan_count FROM oauth_states s '
            + 'LEFT JOIN users u ON u.uuid = s.user_id '
            + 'WHERE s.user_id IS NOT NULL AND u.uuid IS NULL',
        );
        const orphanCount = Number(rows?.[0]?.orphan_count ?? 0);
        if (orphanCount > 0) {
            throw new Error(
                `oauth_states에 없는 계정을 가리키는 줄이 ${orphanCount}개 있어 외래키를 못 겁니다 — `
                + '지난 state(expires_at 지남)면 지워도 되는지 확인한 뒤 정리하고 다시 migrate 하기',
            );
        }

        // 외래키가 쓸 인덱스 먼저 (이름을 정해 두려고, 없으면 MySQL이 아무 이름으로 만듦)
        const indexes = await queryInterface.showIndex(TABLE_NAME);
        const hasUserIndex = (indexes || []).some((index) => !index.primary
            && same(index.fields?.[0]?.attribute, 'user_id'));
        if (!hasUserIndex) {
            await queryInterface.addIndex(TABLE_NAME, ['user_id'], { name: USER_INDEX_NAME });
        }

        await queryInterface.addConstraint(TABLE_NAME, {
            fields: ['user_id'],
            type: 'foreign key',
            name: FK_NAME,
            references: { table: 'users', field: 'uuid' },
        });
    },

    // 되돌리기: 외래키만 뺌 (인덱스는 남겨도 해 없음)
    async down(queryInterface) {
        const references = await queryInterface.getForeignKeyReferencesForTable(TABLE_NAME);
        const ours = (references || []).some((ref) => String(ref?.constraintName ?? '') === FK_NAME);
        if (ours) await queryInterface.removeConstraint(TABLE_NAME, FK_NAME);
    },

    async verify(queryInterface) {
        const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
        const references = await queryInterface.getForeignKeyReferencesForTable(TABLE_NAME);
        const found = (references || []).some((ref) => same(ref?.columnName, 'user_id')
            && same(ref?.referencedTableName, 'users') && same(ref?.referencedColumnName, 'uuid'));
        if (!found) throw new Error(`${TABLE_NAME}.user_id → users.uuid 외래키가 없습니다.`);
    },

    TABLE_NAME,
    FK_NAME,
    USER_INDEX_NAME,
};
