'use strict';

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
                throw new Error(
                    `${migration.name}이 running 상태로 남아 있습니다. 지금 실행은 락(${LOCK_NAME})을 ` +
                    `이미 획득했으므로 동시 실행이 아니라, 이전 실행이 도중에 중단됐거나(크래시) 이력 ` +
                    `기록 자체가 실패한 흔적입니다. 실제 DB 상태(DDL이 실제로 적용됐는지)를 수동으로 ` +
                    `확인한 뒤 resolveFailure로 이력을 정리하세요.`,
                );
            }

            if (existing) {
                await sequelize.query(`DELETE FROM ${META_TABLE} WHERE name = :name`, { replacements: { name: migration.name } });
            }

            logger(`apply ${migration.name} ...`);
            await insertRunningRow(sequelize, migration.name, checksum);

            let ddlCompleted = false;
            try {
                await migration.up(queryInterface, Sequelize, sequelize);
                ddlCompleted = true;
                if (typeof migration.verify === 'function') {
                    await migration.verify(queryInterface, Sequelize, sequelize);
                }
                await markFinished(sequelize, migration.name, { status: 'applied', checksum });
                applied.push(migration.name);
                logger(`applied ${migration.name}`);
            } catch (error) {
                const baseMessage = String(error?.message ?? error).slice(0, 2000);
                const errorMessage = (ddlCompleted
                    ? `[DDL은 성공, 이후 단계(verify 또는 이력 기록)에서 실패] ${baseMessage}`
                    : baseMessage
                ).slice(0, 2000);
                try {
                    await markFinished(sequelize, migration.name, { status: 'failed', checksum, errorMessage });
                } catch (historyWriteError) {
                    logger(
                        `경고: ${migration.name}의 실패를 ${META_TABLE}에 기록하는 것도 실패했습니다 — ` +
                        `이 행은 status='running'으로 남아 있을 수 있습니다(ddlCompleted=${ddlCompleted}). ` +
                        `원래 오류: ${baseMessage} / 이력 쓰기 오류: ${String(historyWriteError?.message ?? historyWriteError)}. ` +
                        `실제 DB 상태를 확인한 뒤 resolveFailure로 이력을 정리하세요.`,
                    );
                }
                throw error;
            }
        }

        return { applied };
    });
};

const resolveFailure = async ({ sequelize, name, confirmRecovered }) => {
    if (confirmRecovered !== true) {
        throw new Error('confirmRecovered=true 없이는 실패 이력을 정리할 수 없습니다 — 먼저 복구 절차를 완료하세요.');
    }
    const existing = await findRow(sequelize, name);
    if (!existing) throw new Error(`${name}의 실패 이력을 찾을 수 없습니다.`);
    if (existing.status !== 'failed' && existing.status !== 'running') {
        throw new Error(`${name}은 failed/running 상태가 아닙니다 (현재: ${existing.status}) — 정리할 필요가 없습니다.`);
    }

    await sequelize.query(`DELETE FROM ${META_TABLE} WHERE name = :name`, { replacements: { name } });
    return { cleared: name, previousStatus: existing.status };
};

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
