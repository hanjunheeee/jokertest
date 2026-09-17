'use strict';

// F-19 친구 즐겨찾기·차단·게임 초대 영속 스키마.
//
// 세 개의 새 테이블을 만들고, 기존 friend_requests의 유일 제약을 **이력을 보존하면서**
// 교체한다. 0008/0009/0012와 같은 관례를 따른다: 멱등한 up(없을 때만 생성), 인덱스는
// 테이블 존재 여부와 별개로 확인, verify가 컬럼·인덱스 계약까지 대조, 불일치는 던지기만
// 하고 절대 기존 행을 지우지 않는다.
//
// ── 기존 유일 제약을 왜 바꾸는가 ─────────────────────────────────────────────
// FriendRequests.js의 UNIQUE(requester_id, receiver_id, status)는 두 가지를 동시에 잘못한다:
//
//   (1) 같은 방향의 DECLINED 이력을 **하나만** 남긴다. 거절 → 재신청 → 재거절이 정상
//       흐름인데 두 번째 거절이 유일 제약에 걸려 실패한다.
//   (2) 교차 방향(A→B와 B→A)이 동시에 PENDING인 것을 막지 못한다. 그러면 양쪽이 서로를
//       친구로 신청한 채로 각자 수락해 Friendship이 두 행 생길 수 있다.
//
// 그래서 이 마이그레이션은 그 인덱스를 제거하고, **PENDING일 때만 값이 있는** 정규화
// 무방향 계정쌍(작은 uuid:큰 uuid) generated 컬럼에 nullable unique key를 건다. MySQL의
// unique 인덱스는 NULL을 중복으로 보지 않으므로 terminal(ACCEPTED/DECLINED/CANCELLED) 행은
// 몇 개든 남을 수 있고, 유효 대기는 계정쌍당 정확히 하나다.
//
// 기존에 이미 교차 PENDING 중복이 있으면 인덱스 생성이 실패한다. 행을 지우지 않고 가장
// 작은 id만 유효 대기로 남긴 뒤 나머지를 CANCELLED + 이관 사유로 확정한다(AC-05: 이력 보존).
//
// ── 롤백 계약 ────────────────────────────────────────────────────────────────
// MySQL DDL은 암묵적 커밋이라 이 파일의 up은 원자적이지 않다. 부분 적용이 남으면
// migrationRunner가 failed/running을 보존하고, 복구는 runbook의 백업 복원 + restore_check가
// 담당한다. 여기서 자동으로 되돌리거나 테이블을 지우지 않는다.

const TABLE_NAMES = {
    FRIEND_FAVORITES: 'friend_favorites',
    FRIEND_BLOCKS: 'friend_blocks',
    GAME_INVITES: 'game_invites',
};

const FRIEND_REQUESTS_TABLE = 'friend_requests';

/** PENDING일 때만 값이 있는 정규화 무방향 계정쌍 컬럼. */
const PENDING_PAIR_COLUMN = 'pending_pair_key';
const PENDING_PAIR_INDEX = 'friend_requests_pending_pair_unique';

/**
 * 남겨 두는 두 외래 키를 받쳐 주는 독립 이름의 **비유일** 인덱스.
 *
 * ── 왜 필요한가 (실측 실패) ─────────────────────────────────────────────────
 * 0001의 friend_requests는 requester_id·receiver_id 각각에 users.uuid 외래 키를 갖고,
 * 그 위에 UNIQUE(requester_id, receiver_id, status)가 있다. InnoDB는 외래 키마다 그 컬럼을
 * **선두로** 덮는 인덱스를 요구하고, 이미 쓸 수 있는 인덱스가 있으면 별도로 만들지 않는다:
 *
 *   requester_id → 예전 3컬럼 UNIQUE의 선두라서 그것이 **유일한 받침**이다(자동 생성 없음).
 *   receiver_id  → 그 UNIQUE에서는 두 번째 컬럼이라 쓸 수 없어 MySQL이 자동 인덱스를 만든다.
 *
 * 그래서 받침을 먼저 만들지 않고 예전 UNIQUE를 떼면 MySQL이 아래처럼 거부하고 이 마이그레이션이
 * failed로 멈춘다(실측: .pluto/monitor/BD-focused-2026-09-13T08-11-19.923Z.log):
 *
 *   Cannot drop index 'friend_requests_requester_receiver_status': needed in a foreign key constraint
 *
 * 이 자리를 새로 만든 PENDING 계정쌍 유일 키로 대신할 수는 없다 — 그 인덱스의 선두 컬럼은
 * pending_pair_key여서 두 UUID 외래 키 어느 쪽도 받치지 못한다.
 *
 * 해결은 **제약을 끄거나 떼는 것이 아니라** 두 컬럼에 독립 이름의 비유일 인덱스를 먼저
 * 세우는 것이다. FOREIGN_KEY_CHECKS를 건드리지 않고 외래 키도 그대로 남는다.
 *
 * receiver_id에는 MySQL이 자동으로 만든 인덱스가 이미 있을 수 있어 받침이 하나 늘어난다.
 * 그래도 이름으로 확인할 수 있는 우리 인덱스를 항상 두는 편을 택했다 — 자동 생성 이름은
 * 방언·생성 시점에 따라 달라지므로 그것에 verify를 걸면 계약이 환경마다 흔들린다.
 * friend_requests는 요청 이력 테이블이라 인덱스 하나의 비용이 문제가 되는 규모가 아니다.
 */
const REQUEST_REQUESTER_SUPPORT_INDEX = 'friend_requests_requester_idx';
const REQUEST_RECEIVER_SUPPORT_INDEX = 'friend_requests_receiver_idx';

/** 외래 키 컬럼 → 그 컬럼을 선두로 덮어야 하는 받침 인덱스 이름. */
const REQUEST_FK_SUPPORT_INDEXES = Object.freeze({
    requester_id: REQUEST_REQUESTER_SUPPORT_INDEX,
    receiver_id: REQUEST_RECEIVER_SUPPORT_INDEX,
});

/** 교차 PENDING 중복을 정리할 때 남기는 사유 — 어떤 행도 삭제하지 않는다는 증거다. */
const MIGRATION_CANCEL_REASON = 'MIGRATION_0013_DUPLICATE_PENDING';

const FAVORITE_UNIQUE_INDEX = 'friend_favorites_owner_friend_unique';
const BLOCK_UNIQUE_INDEX = 'friend_blocks_owner_blocked_unique';
const BLOCK_BLOCKED_INDEX = 'friend_blocks_blocked_idx';
const INVITE_SENDER_KEY_INDEX = 'game_invites_sender_key_unique';
const INVITE_RECEIVER_SEQ_INDEX = 'game_invites_receiver_seq_idx';
const INVITE_RECEIVER_STATUS_INDEX = 'game_invites_receiver_status_idx';
const INVITE_ROOM_INDEX = 'game_invites_room_idx';
const INVITE_SEQ_UNIQUE_INDEX = 'game_invites_creation_seq_unique';

/**
 * creation_seq의 유일 키를 **CREATE TABLE과 같은 DDL 안에서** 만들기 위한 옵션.
 *
 * InnoDB는 AUTO_INCREMENT 컬럼이 어떤 키의 선두여야 하고, 그 판정은 CREATE TABLE 한 문장이
 * 끝나는 시점에 이루어진다 — 나중에 addIndex로 붙이는 것은 too late라 테이블 생성 자체가
 * "Incorrect table definition; there can be only one auto column and it must be defined as a
 * key"로 실패한다.
 *
 * 컬럼 정의에 `unique: '<이름>'`을 적는 것으로는 이 키가 생기지 않는다. 실제 설치된
 * sequelize 6.37.8의 mysql attributeToSQL은 `attribute.unique === true`일 때만 인라인
 * UNIQUE를 붙이고(문자열은 무시한다), 이름 있는 유일 키는 오직 createTableQuery가
 * `options.uniqueKeys`를 읽어 `, UNIQUE \`이름\` (컬럼…)` 절로 덧붙인다
 * (lib/dialects/mysql/query-generator.js의 attributeToSQL / createTableQuery).
 * model.sync()가 같은 정의로 잘 도는 것은 Model.init이 그 문자열을 model.uniqueKeys로
 * 옮겨 주기 때문이고, queryInterface.createTable에는 그 변환이 없다.
 */
const GAME_INVITES_CREATE_OPTIONS = Object.freeze({
    uniqueKeys: {
        [INVITE_SEQ_UNIQUE_INDEX]: { fields: ['creation_seq'], customIndex: true },
    },
});

const REQUIRED_COLUMNS = Object.freeze({
    [TABLE_NAMES.FRIEND_FAVORITES]: ['id', 'owner_id', 'friend_id', 'created_at'],
    [TABLE_NAMES.FRIEND_BLOCKS]: ['id', 'owner_id', 'blocked_id', 'created_at'],
    [TABLE_NAMES.GAME_INVITES]: [
        'id', 'creation_seq', 'sender_id', 'receiver_id', 'room_id', 'room_instance_id',
        'boot_epoch', 'creation_key', 'revision', 'status', 'end_reason',
        'created_at', 'expires_at', 'decided_at', 'attempt_id', 'entry_outcome',
    ],
});

/**
 * 컬럼별 NULL 허용 계약. 이름만 맞는 컬럼은 계약이 아니다(0012와 같은 이유).
 *   - owner_id/receiver_id가 nullable이면 소유자 없는 즐겨찾기·차단·초대가 생긴다.
 *   - decided_at/attempt_id/entry_outcome이 NOT NULL이면 "아직 결정 전"과 "아직 확정
 *     안 된 입장"을 표현할 수 없어 AC-06의 상태표가 통째로 깨진다.
 */
const COLUMN_CONTRACTS = Object.freeze({
    [TABLE_NAMES.FRIEND_FAVORITES]: {
        id: { allowNull: false, primaryKey: true },
        owner_id: { allowNull: false },
        friend_id: { allowNull: false },
        created_at: { allowNull: false },
    },
    [TABLE_NAMES.FRIEND_BLOCKS]: {
        id: { allowNull: false, primaryKey: true },
        owner_id: { allowNull: false },
        blocked_id: { allowNull: false },
        created_at: { allowNull: false },
    },
    [TABLE_NAMES.GAME_INVITES]: {
        id: { allowNull: false, primaryKey: true },
        // AUTO_INCREMENT 여부는 계약이다 — 이 값이 서버가 정하는 단조 증가 순번이 아니면
        // snapshot 커서(A-09)가 "이보다 큰 것만 신규"를 판정할 근거를 잃는다.
        creation_seq: { allowNull: false, autoIncrement: true },
        sender_id: { allowNull: false },
        receiver_id: { allowNull: false },
        room_id: { allowNull: false },
        room_instance_id: { allowNull: false },
        boot_epoch: { allowNull: false },
        creation_key: { allowNull: false },
        revision: { allowNull: false },
        status: { allowNull: false },
        created_at: { allowNull: false },
        expires_at: { allowNull: false },
        decided_at: { allowNull: true },
        attempt_id: { allowNull: true },
        entry_outcome: { allowNull: true },
        end_reason: { allowNull: true },
    },
});

const EXPECTED_INDEXES = Object.freeze({
    [TABLE_NAMES.FRIEND_FAVORITES]: {
        [FAVORITE_UNIQUE_INDEX]: { unique: true, fields: ['owner_id', 'friend_id'] },
    },
    [TABLE_NAMES.FRIEND_BLOCKS]: {
        [BLOCK_UNIQUE_INDEX]: { unique: true, fields: ['owner_id', 'blocked_id'] },
        [BLOCK_BLOCKED_INDEX]: { unique: false, fields: ['blocked_id'] },
    },
    [TABLE_NAMES.GAME_INVITES]: {
        // AUTO_INCREMENT인 creation_seq를 덮는 키. 이 인덱스가 없으면 애초에 테이블이
        // 만들어지지 않으므로, verify가 이것을 확인하지 않으면 "왜 CREATE가 실패했는지"를
        // 스키마 대조 단계에서 알려 줄 수 없다.
        [INVITE_SEQ_UNIQUE_INDEX]: { unique: true, fields: ['creation_seq'] },
        [INVITE_SENDER_KEY_INDEX]: { unique: true, fields: ['sender_id', 'creation_key'] },
        [INVITE_RECEIVER_SEQ_INDEX]: { unique: false, fields: ['receiver_id', 'creation_seq'] },
        [INVITE_RECEIVER_STATUS_INDEX]: { unique: false, fields: ['receiver_id', 'status'] },
        [INVITE_ROOM_INDEX]: { unique: false, fields: ['room_id'] },
    },
});

const EXPECTED_FOREIGN_KEYS = Object.freeze({
    [TABLE_NAMES.FRIEND_FAVORITES]: ['owner_id', 'friend_id'],
    [TABLE_NAMES.FRIEND_BLOCKS]: ['owner_id', 'blocked_id'],
    [TABLE_NAMES.GAME_INVITES]: ['sender_id', 'receiver_id'],
});

const indexFieldNames = (index) => (Array.isArray(index?.fields) ? index.fields : []).map((field) => (
    typeof field === 'string' ? field : (field?.attribute ?? field?.name ?? '')
));

/** MySQL 계열인가 — generated 컬럼 SQL을 쓸 수 있는지 판단한다. */
const isMysql = (sequelize) => {
    const dialect = typeof sequelize?.getDialect === 'function' ? sequelize.getDialect() : null;
    return dialect === 'mysql' || dialect === 'mariadb';
};

/**
 * 기존 UNIQUE(requester_id, receiver_id, status)를 실제 인덱스 목록에서 찾는다.
 * 이름을 가정하지 않는다 — 방언·생성 시점에 따라 자동 생성 이름이 다를 수 있어, 덮는
 * 컬럼 집합과 unique 여부로만 판정한다.
 */
const findLegacyRequestUniqueIndexes = (indexes) => indexes.filter((index) => {
    if (index?.unique !== true) return false;
    const fields = indexFieldNames(index);
    if (fields.length !== 3) return false;
    return ['requester_id', 'receiver_id', 'status'].every((column) => fields.includes(column));
});

/**
 * 이 인덱스가 해당 외래 키 컬럼을 받칠 수 있는가 — InnoDB 규칙 그대로 **선두 컬럼**만 본다.
 * 뒤쪽에 같은 컬럼이 들어 있어도 받침이 되지 않는다(receiver_id가 예전 UNIQUE의 두 번째
 * 컬럼이라서 MySQL이 별도 인덱스를 만들었던 것이 바로 이 이유다).
 */
const indexSupportsForeignKeyColumn = (index, column) => indexFieldNames(index)[0] === column;

/**
 * 남는 외래 키 받침 인덱스를 세운다. 예전 3컬럼 UNIQUE를 떼기 **전에** 반드시 호출한다.
 *
 * 이름으로만 멱등성을 판단하므로 재실행에서 중복 생성되지 않는다.
 * @returns {Promise<string[]>} 이번 호출에서 새로 만든 인덱스 이름
 */
const ensureRequestForeignKeySupportIndexes = async (queryInterface) => {
    const indexes = await queryInterface.showIndex(FRIEND_REQUESTS_TABLE);
    const created = [];
    for (const [column, indexName] of Object.entries(REQUEST_FK_SUPPORT_INDEXES)) {
        if (indexes.some((index) => index.name === indexName)) continue;
        await queryInterface.addIndex(FRIEND_REQUESTS_TABLE, [column], { name: indexName });
        created.push(indexName);
    }
    return created;
};

/**
 * 교차 방향 PENDING 중복을 이력 보존 방식으로 정리한다.
 *
 * 같은 무방향 계정쌍에 PENDING이 둘 이상이면 **가장 작은 id만** 유효 대기로 남기고 나머지는
 * CANCELLED로 확정한다. 행은 지우지 않고, message에 이관 사유와 기존 상태 근거를 덧붙인다 —
 * 나중에 "왜 이 요청이 취소됐는가"를 DB만 보고 답할 수 있어야 한다.
 *
 * @returns {Promise<number>} 취소로 확정한 행 수
 */
const cancelDuplicatePendingRequests = async (sequelize) => {
    const [rows] = await sequelize.query(
        `SELECT id, requester_id, receiver_id
           FROM ${FRIEND_REQUESTS_TABLE}
          WHERE status = 'PENDING'
          ORDER BY id ASC`,
    );

    const keptByPair = new Map();
    const duplicateIds = [];
    for (const row of rows ?? []) {
        const a = String(row.requester_id);
        const b = String(row.receiver_id);
        const pair = a <= b ? `${a}:${b}` : `${b}:${a}`;
        if (keptByPair.has(pair)) {
            duplicateIds.push(row.id);
            continue;
        }
        keptByPair.set(pair, row.id);
    }

    if (duplicateIds.length === 0) return 0;

    await sequelize.query(
        `UPDATE ${FRIEND_REQUESTS_TABLE}
            SET status = 'CANCELLED',
                responded_at = COALESCE(responded_at, NOW()),
                message = CONCAT(COALESCE(message, ''), :note)
          WHERE id IN (:ids)`,
        {
            replacements: {
                ids: duplicateIds,
                note: ` [${MIGRATION_CANCEL_REASON}: 기존 상태 PENDING, 같은 계정쌍의 더 이른 요청을 유효 대기로 유지]`,
            },
        },
    );

    return duplicateIds.length;
};

module.exports = {
    name: '0013-f19-friends-invites',

    async up(queryInterface, Sequelize, sequelize) {
        const db = sequelize ?? queryInterface.sequelize;
        const existingTables = new Set(await queryInterface.showAllTables());

        // ── 1) 즐겨찾기 ──────────────────────────────────────────────────────
        if (!existingTables.has(TABLE_NAMES.FRIEND_FAVORITES)) {
            await queryInterface.createTable(TABLE_NAMES.FRIEND_FAVORITES, {
                id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
                owner_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
                friend_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
        }
        {
            const indexes = await queryInterface.showIndex(TABLE_NAMES.FRIEND_FAVORITES);
            if (!indexes.some((index) => index.name === FAVORITE_UNIQUE_INDEX)) {
                await queryInterface.addIndex(TABLE_NAMES.FRIEND_FAVORITES, ['owner_id', 'friend_id'], {
                    name: FAVORITE_UNIQUE_INDEX, unique: true,
                });
            }
        }

        // ── 2) 차단 ──────────────────────────────────────────────────────────
        if (!existingTables.has(TABLE_NAMES.FRIEND_BLOCKS)) {
            await queryInterface.createTable(TABLE_NAMES.FRIEND_BLOCKS, {
                id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
                owner_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
                blocked_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
            });
        }
        {
            const indexes = await queryInterface.showIndex(TABLE_NAMES.FRIEND_BLOCKS);
            const hasIndex = (name) => indexes.some((index) => index.name === name);
            if (!hasIndex(BLOCK_UNIQUE_INDEX)) {
                await queryInterface.addIndex(TABLE_NAMES.FRIEND_BLOCKS, ['owner_id', 'blocked_id'], {
                    name: BLOCK_UNIQUE_INDEX, unique: true,
                });
            }
            if (!hasIndex(BLOCK_BLOCKED_INDEX)) {
                await queryInterface.addIndex(TABLE_NAMES.FRIEND_BLOCKS, ['blocked_id'], {
                    name: BLOCK_BLOCKED_INDEX,
                });
            }
        }

        // ── 3) 게임 초대 ─────────────────────────────────────────────────────
        // creation_seq는 AUTO_INCREMENT지만 PK가 아니다(PK는 노출용 UUID). InnoDB는
        // AUTO_INCREMENT 컬럼이 어떤 키의 선두여야 하고 그 검사는 CREATE TABLE 한 문장 안에서
        // 끝난다 — 그래서 유일 키를 컬럼 정의가 아니라 세 번째 인자(GAME_INVITES_CREATE_OPTIONS)
        // 로 넘겨 **같은 DDL**에 넣는다. 아래 addIndex 블록은 이미 존재하는 부분 스키마를
        // 메우는 용도이지, 여기서 빠진 키를 나중에 붙이는 우회가 아니다.
        if (!existingTables.has(TABLE_NAMES.GAME_INVITES)) {
            await queryInterface.createTable(TABLE_NAMES.GAME_INVITES, {
                id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
                creation_seq: { type: Sequelize.BIGINT, allowNull: false, autoIncrement: true },
                sender_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
                receiver_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'uuid' } },
                room_id: { type: Sequelize.STRING(64), allowNull: false },
                room_instance_id: { type: Sequelize.STRING(64), allowNull: false },
                boot_epoch: { type: Sequelize.STRING(64), allowNull: false },
                creation_key: { type: Sequelize.STRING(120), allowNull: false },
                revision: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
                status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'PENDING' },
                end_reason: { type: Sequelize.STRING(60), allowNull: true },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
                expires_at: { type: Sequelize.DATE, allowNull: false },
                decided_at: { type: Sequelize.DATE, allowNull: true },
                attempt_id: { type: Sequelize.STRING(64), allowNull: true },
                entry_outcome: { type: Sequelize.STRING(20), allowNull: true },
            }, GAME_INVITES_CREATE_OPTIONS);
        }
        {
            const indexes = await queryInterface.showIndex(TABLE_NAMES.GAME_INVITES);
            const hasIndex = (name) => indexes.some((index) => index.name === name);
            // 부분 적용된 스키마(예: 이 마이그레이션 이전 판이 만든 테이블이나 손으로 만든
            // 테이블)에 이 이름의 키가 없을 수 있다. 이미 있으면 건너뛰므로 재실행은 안전하고,
            // 어느 경우에도 행을 지우지 않는다.
            if (!hasIndex(INVITE_SEQ_UNIQUE_INDEX)) {
                await queryInterface.addIndex(TABLE_NAMES.GAME_INVITES, ['creation_seq'], {
                    name: INVITE_SEQ_UNIQUE_INDEX, unique: true,
                });
            }
            if (!hasIndex(INVITE_SENDER_KEY_INDEX)) {
                await queryInterface.addIndex(TABLE_NAMES.GAME_INVITES, ['sender_id', 'creation_key'], {
                    name: INVITE_SENDER_KEY_INDEX, unique: true,
                });
            }
            if (!hasIndex(INVITE_RECEIVER_SEQ_INDEX)) {
                await queryInterface.addIndex(TABLE_NAMES.GAME_INVITES, ['receiver_id', 'creation_seq'], {
                    name: INVITE_RECEIVER_SEQ_INDEX,
                });
            }
            if (!hasIndex(INVITE_RECEIVER_STATUS_INDEX)) {
                await queryInterface.addIndex(TABLE_NAMES.GAME_INVITES, ['receiver_id', 'status'], {
                    name: INVITE_RECEIVER_STATUS_INDEX,
                });
            }
            if (!hasIndex(INVITE_ROOM_INDEX)) {
                await queryInterface.addIndex(TABLE_NAMES.GAME_INVITES, ['room_id'], {
                    name: INVITE_ROOM_INDEX,
                });
            }
        }

        // ── 4) friend_requests 유일 제약 교체(기존 행 전부 보존) ─────────────
        if (!isMysql(db)) {
            throw new Error(
                '0013-f19-friends-invites: friend_requests의 PENDING 유일 제약 교체는 MySQL/MariaDB의 ' +
                'generated 컬럼을 사용합니다. 다른 방언에서는 수동 절차가 필요합니다 — 자동 우회하지 않습니다.',
            );
        }

        const describeRequests = await queryInterface.describeTable(FRIEND_REQUESTS_TABLE);
        if (!Object.hasOwn(describeRequests, PENDING_PAIR_COLUMN)) {
            // generated STORED 컬럼은 queryInterface.addColumn이 표현하지 못해 원시 SQL을 쓴다.
            // LEAST/GREATEST로 방향을 지워 A→B와 B→A를 같은 키로 만든다. status가 PENDING이
            // 아니면 NULL이라 유일 제약의 대상이 아니다(terminal 이력은 몇 개든 남는다).
            await db.query(
                `ALTER TABLE ${FRIEND_REQUESTS_TABLE}
                   ADD COLUMN ${PENDING_PAIR_COLUMN} VARCHAR(73)
                   GENERATED ALWAYS AS (
                     CASE WHEN status = 'PENDING'
                          THEN CONCAT(LEAST(requester_id, receiver_id), ':', GREATEST(requester_id, receiver_id))
                          ELSE NULL END
                   ) STORED`,
            );
        }

        // 예전 UNIQUE는 requester_id의 외래 키를 받치는 **유일한** 인덱스다. 떼기 전에 독립
        // 이름의 비유일 받침을 세운다 — 이 순서가 뒤바뀌면 MySQL이 "needed in a foreign key
        // constraint"로 거부하고 마이그레이션이 failed로 멈춘다(REQUEST_FK_SUPPORT_INDEXES 주석).
        // 새 PENDING 계정쌍 유일 키는 선두 컬럼이 달라 이 역할을 대신하지 못한다.
        await ensureRequestForeignKeySupportIndexes(queryInterface);

        // Drop the historical status uniqueness before converting cross requests to CANCELLED.
        // Otherwise an existing CANCELLED history row collides with normalization.
        // Foreign keys stay supported; reruns finish normalization and pending-pair uniqueness.
        for (const legacy of findLegacyRequestUniqueIndexes(
            await queryInterface.showIndex(FRIEND_REQUESTS_TABLE),
        )) {
            await queryInterface.removeIndex(FRIEND_REQUESTS_TABLE, legacy.name);
        }

        const requestIndexes = await queryInterface.showIndex(FRIEND_REQUESTS_TABLE);
        if (!requestIndexes.some((index) => index.name === PENDING_PAIR_INDEX)) {
            // 인덱스를 걸기 전에 반드시 기존 교차 PENDING 중복을 정리한다 — 남아 있으면
            // addIndex 자체가 실패하고 이 마이그레이션이 failed로 멈춘다.
            await cancelDuplicatePendingRequests(db);
            await queryInterface.addIndex(FRIEND_REQUESTS_TABLE, [PENDING_PAIR_COLUMN], {
                name: PENDING_PAIR_INDEX, unique: true,
            });
        }


    },

    async down(queryInterface, Sequelize, sequelize) {
        const db = sequelize ?? queryInterface.sequelize;
        const existingTables = new Set(await queryInterface.showAllTables());

        // 자식 → 부모 순서로 지운다(users를 참조하는 세 테이블뿐이라 서로 간 순서는 무관).
        for (const table of [TABLE_NAMES.GAME_INVITES, TABLE_NAMES.FRIEND_BLOCKS, TABLE_NAMES.FRIEND_FAVORITES]) {
            if (existingTables.has(table)) await queryInterface.dropTable(table);
        }

        if (!existingTables.has(FRIEND_REQUESTS_TABLE)) return;

        const requestIndexes = await queryInterface.showIndex(FRIEND_REQUESTS_TABLE);
        if (requestIndexes.some((index) => index.name === PENDING_PAIR_INDEX)) {
            await queryInterface.removeIndex(FRIEND_REQUESTS_TABLE, PENDING_PAIR_INDEX);
        }
        const describeRequests = await queryInterface.describeTable(FRIEND_REQUESTS_TABLE);
        if (Object.hasOwn(describeRequests, PENDING_PAIR_COLUMN)) {
            await db.query(`ALTER TABLE ${FRIEND_REQUESTS_TABLE} DROP COLUMN ${PENDING_PAIR_COLUMN}`);
        }
        // 예전 UNIQUE(requester_id, receiver_id, status)는 되살리지 않는다 — 그 제약이
        // 정상 이력(거절 후 재신청)을 막았기 때문이다. down은 F-19가 추가한 것만 되돌린다.
        //
        // 외래 키 받침 인덱스(REQUEST_FK_SUPPORT_INDEXES)도 떼지 않는다. up이 예전 UNIQUE를
        // 이미 제거했으므로 requester_id 외래 키를 받치는 것은 이제 이 인덱스뿐이고, 떼려고
        // 하면 MySQL이 같은 "needed in a foreign key constraint"로 거부한다. 남겨 두는 편이
        // 외래 키를 보존하는 유일한 선택이다 — 인덱스 하나가 남는 것은 무해하다.
    },

    async verify(queryInterface) {
        const existingTables = new Set(await queryInterface.showAllTables());
        const missing = Object.values(TABLE_NAMES).filter((table) => !existingTables.has(table));
        if (missing.length > 0) {
            throw new Error(`0013-f19-friends-invites 적용 후에도 누락된 테이블: [${missing.join(', ')}]`);
        }

        for (const table of Object.values(TABLE_NAMES)) {
            const describe = await queryInterface.describeTable(table);
            const missingColumns = REQUIRED_COLUMNS[table].filter((column) => !Object.hasOwn(describe, column));
            if (missingColumns.length > 0) {
                throw new Error(`0013-f19-friends-invites의 ${table}에 누락된 컬럼: [${missingColumns.join(', ')}]`);
            }

            for (const [column, contract] of Object.entries(COLUMN_CONTRACTS[table])) {
                const actual = describe[column];
                if (actual.allowNull !== undefined && actual.allowNull !== contract.allowNull) {
                    throw new Error(
                        `0013-f19-friends-invites의 ${table}.${column} NULL 허용이 계약과 다릅니다: ` +
                        `기대 allowNull=${contract.allowNull}, 실제 allowNull=${actual.allowNull}`,
                    );
                }
                if (contract.primaryKey === true && actual.primaryKey !== undefined && actual.primaryKey !== true) {
                    throw new Error(`0013-f19-friends-invites의 ${table}.${column}이 기본 키가 아닙니다`);
                }
                // MySQL의 describeTable은 Extra='auto_increment'를 autoIncrement 불리언으로
                // 돌려준다. 이름·타입만 맞고 순번이 자동 증가하지 않는 컬럼은 계약이 아니다.
                if (contract.autoIncrement === true && actual.autoIncrement !== undefined && actual.autoIncrement !== true) {
                    throw new Error(
                        `0013-f19-friends-invites의 ${table}.${column}이 AUTO_INCREMENT가 아닙니다 — ` +
                        '서버가 정하는 단조 증가 순번이 없으면 수신자 snapshot 커서를 신뢰할 수 없습니다',
                    );
                }
            }

            const indexes = await queryInterface.showIndex(table);
            for (const [name, expected] of Object.entries(EXPECTED_INDEXES[table])) {
                const index = indexes.find((candidate) => candidate.name === name);
                if (!index) {
                    throw new Error(`0013-f19-friends-invites 적용 후에도 ${table}.${name} 인덱스가 없습니다`);
                }
                const actualFields = indexFieldNames(index);
                if (actualFields.join(',') !== expected.fields.join(',')) {
                    throw new Error(
                        `0013-f19-friends-invites의 ${table}.${name} 인덱스가 기대한 컬럼을 덮지 않습니다: ` +
                        `기대 [${expected.fields.join(', ')}], 실제 [${actualFields.join(', ')}]`,
                    );
                }
                if ((index.unique === true) !== expected.unique) {
                    throw new Error(
                        `0013-f19-friends-invites의 ${table}.${name} unique 여부가 계약과 다릅니다: ` +
                        `기대 ${expected.unique}, 실제 ${index.unique === true}`,
                    );
                }
            }

            if (typeof queryInterface.getForeignKeyReferencesForTable === 'function') {
                const references = await queryInterface.getForeignKeyReferencesForTable(table);
                const same = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();
                for (const column of EXPECTED_FOREIGN_KEYS[table]) {
                    const found = Array.isArray(references) && references.some((reference) => (
                        same(reference?.columnName, column)
                        && same(reference?.referencedTableName, 'users')
                        && same(reference?.referencedColumnName, 'uuid')
                    ));
                    if (!found) {
                        throw new Error(
                            `0013-f19-friends-invites 적용 후에도 ${table}.${column} → users.uuid 외래 키가 없습니다 — ` +
                            '소유자 없는 행을 막지 못합니다',
                        );
                    }
                }
            }
        }

        // friend_requests의 교체된 제약도 함께 확인한다 — 새 인덱스만 있고 예전 인덱스가
        // 남아 있으면 거절 후 재신청이 여전히 막힌다.
        const describeRequests = await queryInterface.describeTable(FRIEND_REQUESTS_TABLE);
        if (!Object.hasOwn(describeRequests, PENDING_PAIR_COLUMN)) {
            throw new Error(`0013-f19-friends-invites 적용 후에도 ${FRIEND_REQUESTS_TABLE}.${PENDING_PAIR_COLUMN}이 없습니다`);
        }
        const requestIndexes = await queryInterface.showIndex(FRIEND_REQUESTS_TABLE);
        const pairIndex = requestIndexes.find((index) => index.name === PENDING_PAIR_INDEX);
        if (!pairIndex || pairIndex.unique !== true) {
            throw new Error(
                `0013-f19-friends-invites 적용 후에도 ${PENDING_PAIR_INDEX} 유일 인덱스가 없습니다 — ` +
                '교차 방향 동시 친구 신청을 막지 못합니다',
            );
        }
        const legacy = findLegacyRequestUniqueIndexes(requestIndexes);
        if (legacy.length > 0) {
            throw new Error(
                `0013-f19-friends-invites 적용 후에도 예전 UNIQUE(requester_id, receiver_id, status)가 남아 있습니다: ` +
                `[${legacy.map((index) => index.name).join(', ')}] — 거절 후 재신청이 계속 막힙니다`,
            );
        }

        // 예전 UNIQUE를 뗀 뒤 두 외래 키가 여전히 받쳐지는지 확인한다. 이름 있는 받침 인덱스가
        // 있어야 하고(비유일·해당 컬럼이 선두), 그것과 별개로 외래 키 자체도 남아 있어야 한다.
        // 둘 중 하나라도 빠지면 "제약을 떼서 통과시킨" 상태이므로 fail-closed로 거부한다.
        for (const [column, indexName] of Object.entries(REQUEST_FK_SUPPORT_INDEXES)) {
            const support = requestIndexes.find((index) => index.name === indexName);
            if (!support) {
                throw new Error(
                    `0013-f19-friends-invites 적용 후에도 ${FRIEND_REQUESTS_TABLE}.${indexName} 인덱스가 없습니다 — ` +
                    `${column} 외래 키를 받칠 인덱스가 없으면 예전 UNIQUE를 뗄 수 없습니다`,
                );
            }
            if (support.unique === true) {
                throw new Error(
                    `0013-f19-friends-invites의 ${indexName}은 비유일 받침 인덱스여야 합니다 — ` +
                    `유일 제약이 되면 같은 계정의 요청 이력이 한 건으로 제한됩니다`,
                );
            }
            if (!indexSupportsForeignKeyColumn(support, column)) {
                throw new Error(
                    `0013-f19-friends-invites의 ${indexName}이 ${column}을 선두 컬럼으로 덮지 않습니다: ` +
                    `실제 [${indexFieldNames(support).join(', ')}] — 선두가 아니면 외래 키를 받치지 못합니다`,
                );
            }
        }

        if (typeof queryInterface.getForeignKeyReferencesForTable === 'function') {
            const references = await queryInterface.getForeignKeyReferencesForTable(FRIEND_REQUESTS_TABLE);
            const same = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();
            for (const column of Object.keys(REQUEST_FK_SUPPORT_INDEXES)) {
                const found = Array.isArray(references) && references.some((reference) => (
                    same(reference?.columnName, column)
                    && same(reference?.referencedTableName, 'users')
                    && same(reference?.referencedColumnName, 'uuid')
                ));
                if (!found) {
                    throw new Error(
                        `0013-f19-friends-invites 적용 후에 ${FRIEND_REQUESTS_TABLE}.${column} → users.uuid 외래 키가 ` +
                        '사라졌습니다 — 인덱스를 떼려고 제약을 희생하면 안 됩니다',
                    );
                }
            }
        }
    },

    TABLE_NAMES,
    INVITE_SEQ_UNIQUE_INDEX,
    GAME_INVITES_CREATE_OPTIONS,
    FRIEND_REQUESTS_TABLE,
    PENDING_PAIR_COLUMN,
    PENDING_PAIR_INDEX,
    REQUEST_FK_SUPPORT_INDEXES,
    REQUEST_REQUESTER_SUPPORT_INDEX,
    REQUEST_RECEIVER_SUPPORT_INDEX,
    indexSupportsForeignKeyColumn,
    ensureRequestForeignKeySupportIndexes,
    MIGRATION_CANCEL_REASON,
    REQUIRED_COLUMNS,
    COLUMN_CONTRACTS,
    EXPECTED_INDEXES,
    EXPECTED_FOREIGN_KEYS,
    findLegacyRequestUniqueIndexes,
    cancelDuplicatePendingRequests,
};
