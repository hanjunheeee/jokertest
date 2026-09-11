'use strict';

// F-13 AC-02 설계 감사(운영자, 2026-09-11) 반영 — 서버가 발급하는 영속 revision을
// economy_loadouts에 추가한다. 이전 clientIntentAt(클라이언트 벽시계 시각) +
// lastProfileEquipIntentAtByUser(인메모리 Map) 방식은 같은 밀리초 충돌·시계 역행·프로세스
// 재시작에 취약해 제거됐다(economy.service.js 참고) — 그 대체로, 서버가 매 성공적 장착
// 확정마다 새 UUID revision을 발급해 EconomyLoadout 행에 영속시키고, 클라이언트는 자신이
// 마지막으로 읽은 revision을 expectedRevision으로 함께 보내 SELECT ... FOR UPDATE 행 잠금
// 안에서 CAS(compare-and-swap)로 저장한다 — 일치하지 않으면 409로 거부해 클라이언트가
// authoritative GET으로 재조정하게 한다. 이 값은 프로세스 메모리가 아니라 DB 컬럼이므로
// 서버 재시작·다중 인스턴스에서도 그대로 유지된다.
//
// 이 컬럼은 최종적으로 NULL을 허용하지 않는다 — 하지만 기존 economy_loadouts 행은 이
// 마이그레이션 이전에 이미 만들어졌으므로, 컬럼을 nullable로 추가한 뒤 각 행에 서버 생성
// UUID를 채우고 나서야 NOT NULL로 좁힌다. 단일 DEFAULT 값을 쓰지 않는 이유: 모든 기존 행이
// 같은 UUID를 공유하면 그 값 하나로는 서로 다른 계정의 CAS 비교를 구분할 수 없다(행마다
// 서로 다른 값이어야 "이 행이 마지막으로 어떤 상태였는지"를 유일하게 가리킨다). WHERE
// revision IS NULL로만 채우므로 재실행해도 이미 채운 행은 다시 건드리지 않는다(멱등,
// 중단 후 재개 안전 — 배포 도중 프로세스가 죽어도 다음 실행이 남은 NULL 행만 마저 채운다).

const crypto = require('crypto');

const TABLE_NAME = 'economy_loadouts';
const COLUMN_NAME = 'revision';

module.exports = {
    name: '0010-add-economy-loadout-revision',

    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable(TABLE_NAME);

        if (!table[COLUMN_NAME]) {
            await queryInterface.addColumn(TABLE_NAME, COLUMN_NAME, {
                type: Sequelize.STRING(36),
                allowNull: true,
            });
        }

        // 행마다 서로 다른 UUID를 순서대로 채운다(배치 UPDATE로 같은 값을 공유시키지 않는다).
        // WHERE revision IS NULL만 골라 채우므로 재실행·중단 후 재개 모두 안전하다.
        const [rows] = await queryInterface.sequelize.query(
            `SELECT user_id FROM ${TABLE_NAME} WHERE ${COLUMN_NAME} IS NULL`,
        );
        for (const row of rows) {
            // eslint-disable-next-line no-await-in-loop -- 행마다 서로 다른 UUID를 순서대로
            // 채워야 한다(단일 배치 UPDATE로는 모든 행이 같은 값을 공유하게 된다).
            await queryInterface.sequelize.query(
                `UPDATE ${TABLE_NAME} SET ${COLUMN_NAME} = :revision WHERE user_id = :userId AND ${COLUMN_NAME} IS NULL`,
                { replacements: { revision: crypto.randomUUID(), userId: row.user_id } },
            );
        }

        // 모든 행이 채워진 뒤에만 NOT NULL로 좁힌다 — 같은 정의를 다시 적용해도 안전하다
        // (재실행 시 이미 NOT NULL이면 아무 것도 바뀌지 않는 동등한 DDL).
        await queryInterface.changeColumn(TABLE_NAME, COLUMN_NAME, {
            type: Sequelize.STRING(36),
            allowNull: false,
        });
    },

    async down(queryInterface) {
        const table = await queryInterface.describeTable(TABLE_NAME);
        if (table[COLUMN_NAME]) {
            await queryInterface.removeColumn(TABLE_NAME, COLUMN_NAME);
        }
    },

    async verify(queryInterface) {
        const table = await queryInterface.describeTable(TABLE_NAME);
        if (!table[COLUMN_NAME]) {
            throw new Error(`0010-add-economy-loadout-revision 적용 후에도 ${TABLE_NAME}.${COLUMN_NAME} 컬럼이 없습니다`);
        }
        if (table[COLUMN_NAME].allowNull !== false) {
            throw new Error(`0010-add-economy-loadout-revision 적용 후에도 ${TABLE_NAME}.${COLUMN_NAME}이 NOT NULL이 아닙니다`);
        }
        const [rows] = await queryInterface.sequelize.query(
            `SELECT COUNT(*) AS cnt FROM ${TABLE_NAME} WHERE ${COLUMN_NAME} IS NULL`,
        );
        const nullCount = Number(rows[0]?.cnt ?? 0);
        if (nullCount > 0) {
            throw new Error(`0010-add-economy-loadout-revision 적용 후에도 revision이 NULL인 행이 ${nullCount}개 남아 있습니다`);
        }

        // 같은 값을 공유하는 행이 있으면(단일 DEFAULT로 잘못 채워진 경우 등) CAS 비교가
        // 계정 간에 우연히 통과할 수 있다 — 행마다 유일해야 한다는 계약을 여기서 못박는다.
        const [dupRows] = await queryInterface.sequelize.query(
            `SELECT ${COLUMN_NAME} FROM ${TABLE_NAME} GROUP BY ${COLUMN_NAME} HAVING COUNT(*) > 1`,
        );
        if (dupRows.length > 0) {
            throw new Error(`0010-add-economy-loadout-revision 적용 후 서로 다른 행이 같은 revision 값을 공유합니다(${dupRows.length}개 그룹)`);
        }
    },

    TABLE_NAME,
    COLUMN_NAME,
};
