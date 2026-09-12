'use strict';

// F-17 알림 영속 테이블. notifications 한 행이 "한 계정에게 한 원본 사건이 알려졌다"는
// 사실 하나를 나타낸다(A-01). 중복 판정의 근거는 프로세스 안의 플래그가 아니라
// (user_id, source_key) 유일 제약이다 — 0009-add-achievement-grants.js의
// achievement_grants_user_achievement_unique와 같은 설계이며, 같은 관례
// ("멱등성의 근거를 DB 제약에 둔다")를 따른다(AC-03).
//
// source_key는 **서버가** 원본 행 id로 만든다(notification.service.js의 buildSourceKey):
//   - 친구 요청: friend-request:<friend_requests.id>:received
//   - 업적 지급: achievement:<achievementDefinitions의 id>:granted
//   - 시스템 안내: system:notifications-available:v1
// 클라이언트가 제출한 값은 어느 쪽에도 들어가지 않는다 — 계정은 인증 미들웨어/소켓 세션이
// 확정한 uuid만 쓴다(A-01).
//
// user_id가 유일 키에 함께 들어가므로 서로 다른 계정이 같은 시스템 source_key를 가져도
// 충돌하지 않는다(A-01의 두 번째 반증 조건).
//
// 0008/0009와 같은 패턴(멱등한 up, 존재 확인 후 생성, 인덱스 별도 확인, verify, down)을
// 따른다. up을 다시 실행해도 기존 행을 지우지 않는다 — createTable/addIndex 모두 "없을
// 때만" 호출하고, 이미 있는 테이블의 데이터에는 손대지 않는다.

const TABLE_NAMES = {
    NOTIFICATIONS: 'notifications',
};

const UNIQUE_INDEX_NAME = 'notifications_user_source_unique';
const LIST_INDEX_NAME = 'notifications_user_created_idx';

/** 이 마이그레이션이 보장하는 컬럼 — verify가 스키마 불일치를 성공으로 넘기지 않도록 쓴다. */
const REQUIRED_COLUMNS = [
    'id', 'user_id', 'type', 'source_key', 'title', 'body', 'target', 'created_at', 'read_at',
];

module.exports = {
    name: '0012-add-notifications',

    async up(queryInterface, Sequelize) {
        const existingTables = new Set(await queryInterface.showAllTables());

        if (!existingTables.has(TABLE_NAMES.NOTIFICATIONS)) {
            await queryInterface.createTable(TABLE_NAMES.NOTIFICATIONS, {
                // 서버가 만드는 UUID다. BIGINT autoIncrement 대신 UUID를 쓰는 이유는 이 id가
                // PATCH /notifications/:id/read의 경로 인자로 그대로 노출되기 때문이다 —
                // 순번이면 다른 계정의 알림 개수·발생 속도가 추정된다(권한은 user_id 조건이
                // 막지만, 추정 자체를 만들지 않는 편이 낫다).
                id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
                user_id: {
                    type: Sequelize.UUID, allowNull: false,
                    references: { model: 'users', key: 'uuid' },
                },
                // 'friend-request' | 'achievement' | 'system' — 표시 설정 매핑에 쓴다(A-03).
                type: { type: Sequelize.STRING(40), allowNull: false },
                source_key: { type: Sequelize.STRING(120), allowNull: false },
                // 제목·본문은 서버가 쓴다. 클라이언트 입력을 그대로 저장하지 않는다.
                title: { type: Sequelize.STRING(120), allowNull: false },
                body: { type: Sequelize.STRING(500), allowNull: false },
                // 허용된 구조만 담는다({kind:'friend-request'|'achievement'|'settings', ...}).
                // 임의 URL을 담지 않으므로 수신 측이 외부 이동으로 해석할 여지가 없다.
                target: { type: Sequelize.JSON, allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
                // null이면 아직 읽지 않은 알림이다. 최초 읽음 시각을 유지한다(멱등 갱신).
                read_at: { type: Sequelize.DATE, allowNull: true },
            });
        }

        // createTable은 성공했지만 addIndex 전에 프로세스가 죽는 중간 실패가 있을 수 있다
        // (0009가 CODEX-1 재검토로 고친 것과 같은 문제). 테이블 존재 여부와 **별개로**
        // 인덱스 존재 여부를 항상 확인한다 — 유일 인덱스가 없으면 AC-03이 통째로 깨진다.
        const indexes = await queryInterface.showIndex(TABLE_NAMES.NOTIFICATIONS);
        const hasIndex = (name) => indexes.some((index) => index.name === name);

        if (!hasIndex(UNIQUE_INDEX_NAME)) {
            await queryInterface.addIndex(TABLE_NAMES.NOTIFICATIONS, ['user_id', 'source_key'], {
                name: UNIQUE_INDEX_NAME, unique: true,
            });
        }

        // 목록 조회는 항상 "이 계정의 알림을 최신순으로 전부"다(GET /notifications).
        if (!hasIndex(LIST_INDEX_NAME)) {
            await queryInterface.addIndex(TABLE_NAMES.NOTIFICATIONS, ['user_id', 'created_at'], {
                name: LIST_INDEX_NAME,
            });
        }
    },

    async down(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        if (existingTables.has(TABLE_NAMES.NOTIFICATIONS)) {
            await queryInterface.dropTable(TABLE_NAMES.NOTIFICATIONS);
        }
    },

    async verify(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        const missing = Object.values(TABLE_NAMES).filter((t) => !existingTables.has(t));
        if (missing.length > 0) {
            throw new Error(`0012-add-notifications 적용 후에도 누락된 테이블: [${missing.join(', ')}]`);
        }

        // 테이블만 있고 컬럼·인덱스가 어긋난 상태를 성공으로 넘기지 않는다 — 이 확인이
        // 없으면 예전 스키마 위에서 "적용됨"으로 기록되어 유일 제약 없이 운영된다.
        const describe = await queryInterface.describeTable(TABLE_NAMES.NOTIFICATIONS);
        const missingColumns = REQUIRED_COLUMNS.filter((column) => !Object.hasOwn(describe, column));
        if (missingColumns.length > 0) {
            throw new Error(`0012-add-notifications 적용 후에도 누락된 컬럼: [${missingColumns.join(', ')}]`);
        }

        const indexes = await queryInterface.showIndex(TABLE_NAMES.NOTIFICATIONS);
        for (const name of [UNIQUE_INDEX_NAME, LIST_INDEX_NAME]) {
            if (!indexes.some((index) => index.name === name)) {
                throw new Error(`0012-add-notifications 적용 후에도 ${name} 인덱스가 없습니다`);
            }
        }

        const unique = indexes.find((index) => index.name === UNIQUE_INDEX_NAME);
        if (unique && unique.unique !== true) {
            throw new Error(`0012-add-notifications의 ${UNIQUE_INDEX_NAME}가 유일 인덱스가 아닙니다 — 중복 알림을 막지 못합니다`);
        }
    },

    TABLE_NAMES,
    UNIQUE_INDEX_NAME,
    LIST_INDEX_NAME,
};
