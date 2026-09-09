'use strict';

// F-01 마이그레이션 실행기. sequelize-cli 대신 이 저장소가 이미 쓰는 순수 Sequelize
// queryInterface 위에서 동작한다. 버전(name)·체크섬·상태·시각을 schema_migrations
// 테이블에 기록하고, MySQL 네임드 락(GET_LOCK)으로 동시 실행을 막는다. 각 마이그레이션은
// { name, up(queryInterface, Sequelize, sequelize), down?(...), verify?(...) } 형태다.
//
// MySQL DDL은 트랜잭션 안에서도 암묵적 커밋을 일으키므로, 트랜잭션 롤백만으로 실패한
// DDL을 되돌릴 수 없다(A-05). 그래서 실패는 schema_migrations에 상태로만 남기고,
// 실제 복구는 backend/scripts/migrate-db.js의 상태 조회 + 문서화된 백업 복원 절차로
// 처리한다. 이 파일은 "부분 실패를 숨기지 않고 기록한다"까지만 책임진다.

const crypto = require('crypto');

const META_TABLE = 'schema_migrations';
const LOCK_NAME = 'al_f01_schema_migrations';
const LOCK_TIMEOUT_SECONDS = 30;

const checksumOf = (migration) => {
    const source = JSON.stringify({
        name: migration.name,
        up: migration.up.toString(),
        down: migration.down ? migration.down.toString() : null,
    });
    return crypto.createHash('sha256').update(source).digest('hex');
};

const ensureMetaTable = async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (tables.includes(META_TABLE)) return;

    await queryInterface.createTable(META_TABLE, {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING(255), allowNull: false, unique: true },
        checksum: { type: Sequelize.STRING(64), allowNull: false },
        status: { type: Sequelize.STRING(20), allowNull: false },
        started_at: { type: Sequelize.DATE, allowNull: false },
        finished_at: { type: Sequelize.DATE, allowNull: true },
        error_message: { type: Sequelize.TEXT, allowNull: true },
    });
};

// MySQL 네임드 락. 트랜잭션과 무관하게 세션 단위로 걸리므로 DDL의 암묵적 커밋에도
// 안전하게 유지된다. 같은 프로세스든 다른 프로세스든 동시에 두 번째 실행이 들어오면
// acquired가 0으로 돌아와 즉시 실패한다(대기 없이 타임아웃까지만 기다림).
const withLock = async (sequelize, fn) => {
    const [rows] = await sequelize.query('SELECT GET_LOCK(:name, :timeout) AS acquired', {
        replacements: { name: LOCK_NAME, timeout: LOCK_TIMEOUT_SECONDS },
    });
    const acquired = Array.isArray(rows) ? rows[0]?.acquired : rows?.acquired;
    if (Number(acquired) !== 1) {
        throw new Error(`다른 마이그레이션 실행이 이미 진행 중입니다 (락=${LOCK_NAME}) — 잠시 후 다시 시도하세요`);
    }

    try {
        return await fn();
    } finally {
        await sequelize.query('SELECT RELEASE_LOCK(:name) AS released', {
            replacements: { name: LOCK_NAME },
        });
    }
};

const findRow = async (sequelize, name) => {
    const [rows] = await sequelize.query(
        `SELECT id, name, checksum, status, started_at, finished_at, error_message
         FROM ${META_TABLE} WHERE name = :name`,
        { replacements: { name } },
    );
    return rows[0] || null;
};

const insertRunningRow = async (sequelize, name, checksum) => {
    await sequelize.query(
        `INSERT INTO ${META_TABLE} (name, checksum, status, started_at, finished_at, error_message)
         VALUES (:name, :checksum, 'running', NOW(), NULL, NULL)`,
        { replacements: { name, checksum } },
    );
};

const markFinished = async (sequelize, name, { status, checksum, errorMessage = null }) => {
    await sequelize.query(
        `UPDATE ${META_TABLE}
         SET status = :status, checksum = :checksum, finished_at = NOW(), error_message = :errorMessage
         WHERE name = :name`,
        { replacements: { name, status, checksum, errorMessage } },
    );
};

/** schema_migrations과 migrations 목록을 대조해 각 마이그레이션의 현재 상태를 돌려준다. */
const getStatus = async ({ sequelize, migrations }) => {
    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    const hasMetaTable = tables.includes(META_TABLE);

    const rowsByName = new Map();
    if (hasMetaTable) {
        const [rows] = await sequelize.query(`SELECT * FROM ${META_TABLE}`);
        for (const row of rows) rowsByName.set(row.name, row);
    }

    return migrations.map((migration) => {
        const checksum = checksumOf(migration);
        const row = rowsByName.get(migration.name);
        if (!row) {
            return { name: migration.name, status: 'pending', checksum, checksumMatches: null, appliedAt: null, error: null };
        }
        return {
            name: migration.name,
            status: row.status,
            checksum: row.checksum,
            checksumMatches: row.checksum === checksum,
            startedAt: row.started_at,
            appliedAt: row.status === 'applied' ? row.finished_at : null,
            error: row.error_message,
        };
    });
};

/**
 * 대기 중인 마이그레이션을 이름 순서대로 적용한다. 이미 applied면 건너뛰고(재실행 안전),
 * failed 이력이 있으면 즉시 멈춰 무조건 재적용을 막는다(복구 절차를 먼저 밟게 함).
 * 각 마이그레이션 뒤에는 verify가 있으면 실행해 결과 스키마를 확인하고, verify가
 * 실패해도 같은 실패 경로(status=failed)로 기록한다.
 */
const applyMigrations = async ({ sequelize, migrations, logger = () => {} }) => {
    return withLock(sequelize, async () => {
        const queryInterface = sequelize.getQueryInterface();
        const Sequelize = sequelize.constructor;
        await ensureMetaTable(queryInterface, Sequelize);

        const applied = [];
        for (const migration of migrations) {
            const checksum = checksumOf(migration);
            const existing = await findRow(sequelize, migration.name);

            if (existing && existing.status === 'applied') {
                if (existing.checksum !== checksum) {
                    throw new Error(
                        `${migration.name}의 체크섬이 기록과 다릅니다 (기록=${existing.checksum} 실제=${checksum}). ` +
                        `이미 적용된 마이그레이션 파일이 수정되었습니다 — 원인을 확인하세요.`,
                    );
                }
                logger(`skip ${migration.name} (이미 적용됨)`);
                continue;
            }

            if (existing && existing.status === 'failed') {
                throw new Error(
                    `${migration.name}은 실패 이력이 있어 무조건 재적용할 수 없습니다. ` +
                    `문서화된 복구 절차(백업 복원)를 먼저 수행한 뒤 resolveFailure로 이력을 정리하세요.`,
                );
            }

            if (existing && existing.status === 'running') {
                throw new Error(`${migration.name}이 이미 running 상태입니다 — 동시 실행 여부를 확인하세요.`);
            }

            if (existing) {
                await sequelize.query(`DELETE FROM ${META_TABLE} WHERE name = :name`, { replacements: { name: migration.name } });
            }

            logger(`apply ${migration.name} ...`);
            await insertRunningRow(sequelize, migration.name, checksum);

            try {
                await migration.up(queryInterface, Sequelize, sequelize);
                if (typeof migration.verify === 'function') {
                    await migration.verify(queryInterface, Sequelize, sequelize);
                }
                await markFinished(sequelize, migration.name, { status: 'applied', checksum });
                applied.push(migration.name);
                logger(`applied ${migration.name}`);
            } catch (error) {
                await markFinished(sequelize, migration.name, {
                    status: 'failed',
                    checksum,
                    errorMessage: String(error?.message ?? error).slice(0, 2000),
                });
                throw error;
            }
        }

        return { applied };
    });
};

/**
 * 실패 이력을 사람이 확인한 뒤 정리한다. confirmRecovered가 true가 아니면 거부한다 —
 * 백업 복원 등 실제 복구 없이 이력만 지워 재적용을 유도하는 사고를 막기 위함이다.
 * 정리 후에는 행을 지워 다음 migrate 실행이 이 마이그레이션을 다시 pending으로 본다.
 */
const resolveFailure = async ({ sequelize, name, confirmRecovered }) => {
    if (confirmRecovered !== true) {
        throw new Error('confirmRecovered=true 없이는 실패 이력을 정리할 수 없습니다 — 먼저 복구 절차를 완료하세요.');
    }
    const existing = await findRow(sequelize, name);
    if (!existing) throw new Error(`${name}의 실패 이력을 찾을 수 없습니다.`);
    if (existing.status !== 'failed') throw new Error(`${name}은 failed 상태가 아닙니다 (현재: ${existing.status}).`);

    await sequelize.query(`DELETE FROM ${META_TABLE} WHERE name = :name`, { replacements: { name } });
    return { cleared: name };
};

/** 실패 후 상태 대조: 기록된 schema_migrations 상태와 실제 테이블 존재 여부를 나란히 보여준다. */
const diagnoseFailure = async ({ sequelize, migrations }) => {
    const status = await getStatus({ sequelize, migrations });
    const queryInterface = sequelize.getQueryInterface();
    const existingTables = await queryInterface.showAllTables();

    return status.map((entry) => ({
        ...entry,
        note: entry.status === 'failed'
            ? `${META_TABLE}에는 failed로 기록됨. 실제 테이블 존재: ${existingTables.join(', ') || '(없음)'}`
            : undefined,
    }));
};

module.exports = {
    META_TABLE,
    LOCK_NAME,
    checksumOf,
    getStatus,
    applyMigrations,
    resolveFailure,
    diagnoseFailure,
};
