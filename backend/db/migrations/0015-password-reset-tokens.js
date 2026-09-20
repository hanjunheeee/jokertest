'use strict';

// F-29b: 비밀번호 재설정 토큰을 해시 기반으로 전환하고, users.has_local_password(§2-3a)를
// 추가·backfill한다. 두 변경은 이 슬라이스가 함께 필요로 하므로 한 마이그레이션으로 묶는다.
//
// 토큰 쪽: password_reset_tokens.token(원문, NOT NULL)을 nullable로 바꾸고 token_hash(해시)·
// revoked_at을 추가한다. 신규 발급은 항상 token=NULL·token_hash만 쓴다(passwordReset.service.js
// 참고). 이 마이그레이션 이전에 만들어진 legacy 행(token_hash가 없다 — 원문만 있다)은 그
// 원문으로도 인증에 쓰일 수 없도록 used=true·revoked_at을 채워 무효화한다(원문 자체는 지우지
// 않는다 — 이 컬럼은 nullable로 남아 있을 뿐 삭제되지 않는다. 실제로 원문을 지우는 것은
// 범위 밖이다: 이 컬럼은 이미 존재하던 것이고, 삭제는 별도 결정이 필요하다).
//
// 사용자 쪽: users.has_local_password BOOLEAN NOT NULL DEFAULT true를 추가한다. 근거 1
// (identity + 소비된 social_signup_intents의 provider/subject 일치) 또는 근거 2(identity와
// 사용자 생성 시각 차이 10초 이내) 중 하나라도 있으면 false, 둘 다 없으면 true로 backfill한다.
// 두 근거는 raw SQL만 갱신하고 password_hash·updated_at 등 다른 필드는 건드리지 않는다.

const USERS_TABLE = 'users';
const TOKENS_TABLE = 'password_reset_tokens';
const HAS_LOCAL_PASSWORD_COLUMN = 'has_local_password';
const TOKEN_HASH_COLUMN = 'token_hash';
const REVOKED_AT_COLUMN = 'revoked_at';
const TOKEN_HASH_UNIQUE_INDEX = 'password_reset_tokens_token_hash_unique';

const BACKFILL_SOCIAL_ONLY_SQL = `
    UPDATE ${USERS_TABLE} u
    SET has_local_password = false
    WHERE (
        EXISTS (
            SELECT 1
            FROM external_identities ei
            JOIN social_signup_intents ssi
                ON ssi.provider = ei.provider
               AND ssi.subject = ei.subject
               AND ssi.consumed_at IS NOT NULL
            WHERE ei.user_id = u.uuid
        )
        OR EXISTS (
            SELECT 1
            FROM external_identities ei2
            WHERE ei2.user_id = u.uuid
              AND ABS(TIMESTAMPDIFF(MICROSECOND, ei2.created_at, u.created_at)) <= 10000000
        )
    )
`;

module.exports = {
    name: '0015-password-reset-tokens',

    async up(queryInterface, Sequelize, sequelize) {
        // ── 토큰 스키마 전환 ────────────────────────────────────────────────────
        const tokensTable = await queryInterface.describeTable(TOKENS_TABLE);

        if (!tokensTable[TOKEN_HASH_COLUMN]) {
            await queryInterface.addColumn(TOKENS_TABLE, TOKEN_HASH_COLUMN, {
                type: Sequelize.STRING(64), allowNull: true,
            });
        }
        if (!tokensTable[REVOKED_AT_COLUMN]) {
            await queryInterface.addColumn(TOKENS_TABLE, REVOKED_AT_COLUMN, {
                type: Sequelize.DATE, allowNull: true,
            });
        }
        if (tokensTable.token && tokensTable.token.allowNull === false) {
            await queryInterface.changeColumn(TOKENS_TABLE, 'token', {
                type: Sequelize.STRING(255), allowNull: true,
            });
        }

        const tokenIndexes = await queryInterface.showIndex(TOKENS_TABLE);
        const hasHashIndex = tokenIndexes.some((index) => index.name === TOKEN_HASH_UNIQUE_INDEX);
        if (!hasHashIndex) {
            await queryInterface.addIndex(TOKENS_TABLE, [TOKEN_HASH_COLUMN], {
                name: TOKEN_HASH_UNIQUE_INDEX, unique: true,
            });
        }

        // legacy 행(해시 없이 원문만 있던 행) 무효화 — 재실행해도 이미 처리된 행은 다시
        // 건드리지 않는다(멱등: revoked_at이 이미 있으면 WHERE에 걸리지 않는다).
        await sequelize.query(
            `UPDATE ${TOKENS_TABLE}
             SET used = true, revoked_at = COALESCE(revoked_at, NOW()), token = NULL
             WHERE ${TOKEN_HASH_COLUMN} IS NULL AND token IS NOT NULL`,
        );

        // ── users.has_local_password 추가·backfill ─────────────────────────────
        const usersTable = await queryInterface.describeTable(USERS_TABLE);
        if (!usersTable[HAS_LOCAL_PASSWORD_COLUMN]) {
            await queryInterface.addColumn(USERS_TABLE, HAS_LOCAL_PASSWORD_COLUMN, {
                type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true,
            });
        }

        // 컬럼이 이미 있어도(부분 실패 재실행) backfill은 항상 다시 계산한다 — 같은 데이터라면
        // 같은 값으로 수렴한다(멱등). 먼저 전체를 true로 되돌리지 않는다 — 근거 없는 행은
        // defaultValue로 이미 true이므로, false여야 할 근거가 있는 행만 갱신하면 충분하고
        // 그 반대 방향(잘못 false가 된 행을 true로 되돌리는 것)은 이 마이그레이션의 최초
        // 실행에서는 일어나지 않는다. 다만 완전한 멱등성을 위해, 근거가 사라진 행은 true로
        // 되돌린다.
        await sequelize.query(BACKFILL_SOCIAL_ONLY_SQL);
        await sequelize.query(`
            UPDATE ${USERS_TABLE} u
            SET has_local_password = true
            WHERE has_local_password = false
              AND NOT EXISTS (
                  SELECT 1
                  FROM external_identities ei
                  JOIN social_signup_intents ssi
                      ON ssi.provider = ei.provider
                     AND ssi.subject = ei.subject
                     AND ssi.consumed_at IS NOT NULL
                  WHERE ei.user_id = u.uuid
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM external_identities ei2
                  WHERE ei2.user_id = u.uuid
                    AND ABS(TIMESTAMPDIFF(MICROSECOND, ei2.created_at, u.created_at)) <= 10000000
              )
        `);
    },

    async down() {
        throw new Error(
            '0015-password-reset-tokens의 down()은 지원하지 않습니다 — 토큰 원문 복원과 ' +
            'has_local_password 표식 제거는 모두 데이터 손실/조작이라 거부합니다.',
        );
    },

    async verify(queryInterface, Sequelize, sequelize) {
        const tokensTable = await queryInterface.describeTable(TOKENS_TABLE);
        if (!tokensTable[TOKEN_HASH_COLUMN] || tokensTable[TOKEN_HASH_COLUMN].allowNull !== true) {
            throw new Error(`${TOKENS_TABLE}.${TOKEN_HASH_COLUMN}이 nullable로 존재하지 않습니다.`);
        }
        if (!/varchar\s*\(\s*64\s*\)/i.test(tokensTable[TOKEN_HASH_COLUMN].type ?? '')) {
            throw new Error(`${TOKENS_TABLE}.${TOKEN_HASH_COLUMN}의 타입이 STRING(64)가 아닙니다: ${tokensTable[TOKEN_HASH_COLUMN].type}`);
        }
        if (!tokensTable[REVOKED_AT_COLUMN] || tokensTable[REVOKED_AT_COLUMN].allowNull !== true) {
            throw new Error(`${TOKENS_TABLE}.${REVOKED_AT_COLUMN}이 nullable로 존재하지 않습니다.`);
        }
        if (!/date\s*(time)?/i.test(tokensTable[REVOKED_AT_COLUMN].type ?? '')) {
            throw new Error(`${TOKENS_TABLE}.${REVOKED_AT_COLUMN}의 타입이 DATE가 아닙니다: ${tokensTable[REVOKED_AT_COLUMN].type}`);
        }
        if (!tokensTable.token || tokensTable.token.allowNull !== true) {
            throw new Error(`${TOKENS_TABLE}.token이 nullable로 바뀌지 않았습니다.`);
        }

        const tokenIndexes = await queryInterface.showIndex(TOKENS_TABLE);
        const hashIndex = tokenIndexes.find((index) => index.name === TOKEN_HASH_UNIQUE_INDEX);
        if (!hashIndex || hashIndex.unique !== true) {
            throw new Error(`${TOKEN_HASH_UNIQUE_INDEX} 유일 인덱스가 없습니다.`);
        }
        const hashIndexColumns = (hashIndex.fields ?? []).map((field) => field.attribute);
        if (hashIndexColumns.length !== 1 || hashIndexColumns[0] !== TOKEN_HASH_COLUMN) {
            throw new Error(
                `${TOKEN_HASH_UNIQUE_INDEX}의 대상 열이 [${TOKEN_HASH_COLUMN}]이 아닙니다: [${hashIndexColumns.join(', ')}]`,
            );
        }

        const [[legacyLeak]] = await sequelize.query(
            `SELECT COUNT(*) AS c FROM ${TOKENS_TABLE} WHERE ${TOKEN_HASH_COLUMN} IS NULL AND token IS NOT NULL`,
        );
        if (Number(legacyLeak.c) > 0) {
            throw new Error('해시 없는 legacy 토큰 원문이 여전히 남아 있습니다.');
        }
        const [[legacyNotInvalidated]] = await sequelize.query(
            `SELECT COUNT(*) AS c FROM ${TOKENS_TABLE} WHERE ${TOKEN_HASH_COLUMN} IS NULL AND used = false`,
        );
        if (Number(legacyNotInvalidated.c) > 0) {
            throw new Error('해시 없는 legacy 토큰이 여전히 미사용(used=false) 상태입니다.');
        }

        const usersTable = await queryInterface.describeTable(USERS_TABLE);
        const column = usersTable[HAS_LOCAL_PASSWORD_COLUMN];
        if (!column || column.allowNull !== false) {
            throw new Error(`${USERS_TABLE}.${HAS_LOCAL_PASSWORD_COLUMN}이 NOT NULL로 존재하지 않습니다.`);
        }
        if (!/tinyint|bool/i.test(column.type ?? '')) {
            throw new Error(`${USERS_TABLE}.${HAS_LOCAL_PASSWORD_COLUMN}의 타입이 BOOLEAN이 아닙니다: ${column.type}`);
        }
        // MySQL의 describeTable은 BOOLEAN(TINYINT(1)) 기본값을 문자열/숫자 어느 쪽으로도 돌려줄
        // 수 있다 — dialect 표현 차이를 넓게 허용하되 "true를 뜻하는 값"인지만 확인한다.
        const isTruthyDefault = (value) => (
            value === true || value === 1 || value === '1'
            || (typeof value === 'string' && value.trim().toLowerCase() === 'true')
        );
        if (!isTruthyDefault(column.defaultValue)) {
            throw new Error(`${USERS_TABLE}.${HAS_LOCAL_PASSWORD_COLUMN}의 기본값이 true가 아닙니다: ${column.defaultValue}`);
        }

        const [[nullCount]] = await sequelize.query(
            `SELECT COUNT(*) AS c FROM ${USERS_TABLE} WHERE ${HAS_LOCAL_PASSWORD_COLUMN} IS NULL`,
        );
        if (Number(nullCount.c) > 0) {
            throw new Error(`${USERS_TABLE}.${HAS_LOCAL_PASSWORD_COLUMN}에 NULL 행이 있습니다.`);
        }

        const [[mismatch]] = await sequelize.query(`
            SELECT COUNT(*) AS c
            FROM ${USERS_TABLE} u
            WHERE u.has_local_password = true
              AND EXISTS (
                  SELECT 1
                  FROM external_identities ei
                  JOIN social_signup_intents ssi
                      ON ssi.provider = ei.provider
                     AND ssi.subject = ei.subject
                     AND ssi.consumed_at IS NOT NULL
                  WHERE ei.user_id = u.uuid
              )
        `);
        if (Number(mismatch.c) > 0) {
            throw new Error('근거 1(소비된 가입 intent와 provider/subject가 일치하는 identity)이 있는데도 has_local_password=true인 행이 있습니다.');
        }
    },

    USERS_TABLE,
    TOKENS_TABLE,
    HAS_LOCAL_PASSWORD_COLUMN,
    TOKEN_HASH_COLUMN,
    REVOKED_AT_COLUMN,
    TOKEN_HASH_UNIQUE_INDEX,
};
