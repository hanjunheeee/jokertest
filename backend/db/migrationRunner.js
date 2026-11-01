'use strict';

// 마이그레이션 실행기 파일, 적용 이력 표(schema_migrations) · 동시 실행 잠금 · 체크섬 · 적용/상태/실패 정리
// scripts/migrate-db.js가 부름 (DB 시험들도 이걸로 표를 만듦)
const crypto = require('crypto');

// 이력 표 이름 · DB 이름 잠금 · 잠금 기다리는 초
const META_TABLE = 'schema_migrations';
const LOCK_NAME = 'al_f01_schema_migrations';
const LOCK_TIMEOUT_SECONDS = 30;

// 이름 + up·down 원문으로 체크섬 (적용한 파일이 바뀌면 알아채기, 함수 안 주석도 들어감)
const checksumOf = (migration) => {
    const source = JSON.stringify({
        name: migration.name,
        up: migration.up.toString(),
        down: migration.down ? migration.down.toString() : null,
    });
    return crypto.createHash('sha256').update(source).digest('hex');
};

// 이력 표가 없을 때만 만듦 (이름 유일, 상태 running·applied·failed)
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

// MySQL GET_LOCK으로 한 번에 한 실행만, 못 잡으면 던짐 · 끝나면 무슨 일이 있어도 풂
const withLock = async (sequelize, fn) => {
    const [rows] = await sequelize.query('SELECT GET_LOCK(:name, :timeout) AS acquired', {
        replacements: { name: LOCK_NAME, timeout: LOCK_TIMEOUT_SECONDS },
    });
    // 드라이버마다 행 모양이 달라 둘 다 봄
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

// 이름으로 이력 한 줄 (없으면 null)
const findRow = async (sequelize, name) => {
    const [rows] = await sequelize.query(
        `SELECT id, name, checksum, status, started_at, finished_at, error_message
         FROM ${META_TABLE} WHERE name = :name`,
        { replacements: { name } },
    );
    return rows[0] || null;
};

// 시작 표시 running 한 줄 (도중에 죽으면 running으로 남아 알 수 있게)
const insertRunningRow = async (sequelize, name, checksum) => {
    await sequelize.query(
        `INSERT INTO ${META_TABLE} (name, checksum, status, started_at, finished_at, error_message)
         VALUES (:name, :checksum, 'running', NOW(), NULL, NULL)`,
        { replacements: { name, checksum } },
    );
};

// 끝 표시 (applied 또는 failed + 오류 문구)
const markFinished = async (sequelize, name, { status, checksum, errorMessage = null }) => {
    await sequelize.query(
        `UPDATE ${META_TABLE}
         SET status = :status, checksum = :checksum, finished_at = NOW(), error_message = :errorMessage
         WHERE name = :name`,
        { replacements: { name, status, checksum, errorMessage } },
    );
};

// 마이그레이션마다 상태 + 체크섬 맞는지 (이력 표 없으면 전부 pending), 잠금 없이 읽기만
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

// 잠금 잡고 순서대로: 적용됨은 건너뜀 · failed·running은 멈춤 · 나머지는 적용
const applyMigrations = async ({ sequelize, migrations, logger = () => {} }) => {
    return withLock(sequelize, async () => {
        const queryInterface = sequelize.getQueryInterface();
        const Sequelize = sequelize.constructor;
        await ensureMetaTable(queryInterface, Sequelize);

        const applied = [];
        for (const migration of migrations) {
            const checksum = checksumOf(migration);
            const existing = await findRow(sequelize, migration.name);

            // 이미 적용됨: 파일이 그사이 바뀌었으면 멈춤, 아니면 건너뜀
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

            // 실패 이력은 복구·정리 전엔 다시 안 돌림 (DDL이 반쯤 남았을 수 있음)
            if (existing && existing.status === 'failed') {
                throw new Error(
                    `${migration.name}은 실패 이력이 있어 무조건 재적용할 수 없습니다. ` +
                    `문서화된 복구 절차(백업 복원)를 먼저 수행한 뒤 resolveFailure로 이력을 정리하세요.`,
                );
            }

            // 잠금은 잡았는데 running이 남음 = 지난 실행이 도중에 죽음, 사람이 확인해야 함
            if (existing && existing.status === 'running') {
                throw new Error(
                    `${migration.name}이 running 상태로 남아 있습니다. 지금 실행은 락(${LOCK_NAME})을 ` +
                    `이미 획득했으므로 동시 실행이 아니라, 이전 실행이 도중에 중단됐거나(크래시) 이력 ` +
                    `기록 자체가 실패한 흔적입니다. 실제 DB 상태(DDL이 실제로 적용됐는지)를 수동으로 ` +
                    `확인한 뒤 resolveFailure로 이력을 정리하세요.`,
                );
            }

            // 그 밖의 상태 줄은 지우고 새로 시작
            if (existing) {
                await sequelize.query(`DELETE FROM ${META_TABLE} WHERE name = :name`, { replacements: { name: migration.name } });
            }

            logger(`apply ${migration.name} ...`);
            await insertRunningRow(sequelize, migration.name, checksum);

            // 여기부터 진짜 바뀜: running 남기고 up → verify → applied (DDL 끝났는지 따로 기억)
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
                // failed로 남기고 원래 오류 다시 던짐, DDL 뒤 실패면 문구에 표시 (이력 쓰기마저 실패하면 경고만)
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

// 복구 끝났다고 확인받은 failed·running 이력 지우기 (다음 migrate에서 다시 시도)
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

// 실패 뒤 화면용: 상태 + failed 줄엔 지금 실제로 있는 표 목록 붙임
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
