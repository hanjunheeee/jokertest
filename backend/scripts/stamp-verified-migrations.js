#!/usr/bin/env node
'use strict';

// sync()로 앞서 간 DB에서 verify() 통과 마이그레이션만 schema_migrations에 applied로 찍는 복구 스크립트
// 운영자가 --dry-run 또는 --confirm으로 직접 실행함
const path = require('path');
const { Sequelize } = require('sequelize');
const { MIGRATIONS } = require('./migrate-db');
const migrationRunner = require('../db/migrationRunner');

const BASELINE_NAME = '0001-legacy-baseline';
const STAMP_LOCK_TIMEOUT_SECONDS = 10;

// 실행 인자에서 --dry-run · --confirm 뽑기
const parseArgs = (argv = process.argv.slice(2)) => ({
    dryRun: argv.includes('--dry-run'),
    confirm: argv.includes('--confirm'),
});

// verify()가 통과한 마이그레이션만 골라 모음
const collectVerifiedMigrations = async (sequelize, migrations, logger) => {
    const qi = sequelize.getQueryInterface();
    const toStamp = [];
    for (const m of migrations) {
        if (typeof m.verify !== 'function') {
            logger.error(`${m.name}: verify 없음 — 건너뜀`);
            continue;
        }
        try {
            await m.verify(qi, Sequelize, sequelize);
            toStamp.push(m);
            logger.log(`${m.name}: stamp 후보`);
        } catch (e) {
            logger.log(`${m.name}: pending (${String(e.message).slice(0, 80)}…)`);
        }
    }
    return toStamp;
};

// MySQL 이름 잠금 잡기 (10초 대기) → 끝나면 finally에서 해제
const withStampLock = async (sequelize, lockName, fn) => {
    const [rows] = await sequelize.query('SELECT GET_LOCK(:name, :timeout) AS acquired', {
        replacements: { name: lockName, timeout: STAMP_LOCK_TIMEOUT_SECONDS },
    });
    const acquired = Array.isArray(rows) ? rows[0]?.acquired : rows?.acquired;
    if (Number(acquired) !== 1) {
        throw new Error(`다른 마이그레이션 실행이 이미 진행 중입니다 (락=${lockName}) — 잠시 후 다시 시도하세요`);
    }
    try {
        return await fn();
    } finally {
        await sequelize.query('SELECT RELEASE_LOCK(:name) AS released', {
            replacements: { name: lockName },
        });
    }
};

// running 행이 남아 있으면 덮어쓰지 않고 중단 안내 출력
const reportRunningBlock = (rows, logger) => {
    const running = rows.filter((r) => r.status === 'running').map((r) => r.name);
    if (running.length === 0) return false;
    logger.error(
        `running 상태로 남아 있는 마이그레이션이 있어 중단합니다 (${running.join(', ')}) — ` +
        '실제 DB 상태를 확인한 뒤 scripts/migrate-db.js resolve-failure로 먼저 정리하세요.',
    );
    return true;
};

// --dry-run: 테이블 생성·쓰기 없이 상태만 읽어 예정 목록 안내
const runDryPreview = async ({ sequelize, runner, toStamp, baselineVerified, logger }) => {
    const tables = await sequelize.getQueryInterface().showAllTables();
    const hasMeta = tables.includes(runner.META_TABLE);
    const [rows] = hasMeta
        ? await sequelize.query(`SELECT name, status FROM ${runner.META_TABLE}`)
        : [[]];
    if (reportRunningBlock(rows, logger)) return 1;
    const baseline = rows.find((r) => r.name === BASELINE_NAME);
    if (baseline?.status === 'failed' && baselineVerified) {
        logger.log('\n0001 failed 이력은 --confirm 시 삭제합니다 (resolve-failure와 동일).');
    } else if (baseline?.status === 'failed') {
        logger.warn('\n0001-legacy-baseline이 verify를 통과하지 못해 failed 이력을 지우지 않습니다.');
    }
    logger.log(`\n[dry-run] 등록 예정: ${toStamp.map((m) => m.name).join(', ')}`);
    return 0;
};

// --confirm: 잠금 안에서 메타 테이블 보장 → running 차단 → 검증된 0001 failed 정리 → applied 기록
const applyVerifiedStamps = async ({ sequelize, runner, toStamp, baselineVerified, logger }) => {
    await runner.ensureMetaTable(sequelize);
    const [rows] = await sequelize.query(`SELECT name, status FROM ${runner.META_TABLE}`);
    if (reportRunningBlock(rows, logger)) return 1;

    const baseline = rows.find((r) => r.name === BASELINE_NAME);
    if (baseline?.status === 'failed' && baselineVerified) {
        await runner.resolveFailure({ sequelize, name: BASELINE_NAME, confirmRecovered: true });
    }

    for (const m of toStamp) {
        const [exRows] = await sequelize.query(
            `SELECT status FROM ${runner.META_TABLE} WHERE name = :name`,
            { replacements: { name: m.name } },
        );
        const existing = exRows[0];
        if (existing?.status === 'applied') {
            logger.log(`skip ${m.name} (이미 applied)`);
            continue;
        }
        if (existing?.status === 'running') {
            reportRunningBlock([{ name: m.name, status: 'running' }], logger);
            return 1;
        }
        if (existing) {
            await sequelize.query(`DELETE FROM ${runner.META_TABLE} WHERE name = :name`, {
                replacements: { name: m.name },
            });
        }
        const checksum = runner.checksumOf(m);
        await sequelize.query(
            `INSERT INTO ${runner.META_TABLE} (name, checksum, status, started_at, finished_at, error_message)
             VALUES (:name, :checksum, 'applied', NOW(), NOW(), NULL)`,
            { replacements: { name: m.name, checksum } },
        );
        logger.log(`stamped ${m.name}`);
    }
    logger.log('\n다음: node -r dotenv/config scripts/migrate-db.js migrate');
    return 0;
};

// 검증부터 잠금·기록·연결 닫기까지 한 번에 수행 (어떤 종료 길이든 sequelize.close 보장)
const runStampVerifiedMigrations = async ({
    dryRun,
    confirm,
    sequelize,
    migrations = MIGRATIONS,
    runner = migrationRunner,
    logger = console,
}) => {
    if (!dryRun && !confirm) {
        logger.error('--dry-run 또는 --confirm 이 필요합니다.');
        return 1;
    }
    try {
        await sequelize.authenticate();
        const toStamp = await collectVerifiedMigrations(sequelize, migrations, logger);
        const baselineVerified = toStamp.some((m) => m.name === BASELINE_NAME);
        if (dryRun) {
            return await runDryPreview({ sequelize, runner, toStamp, baselineVerified, logger });
        }
        return await withStampLock(sequelize, runner.LOCK_NAME, () =>
            applyVerifiedStamps({ sequelize, runner, toStamp, baselineVerified, logger }),
        );
    } finally {
        await sequelize.close();
    }
};

// CLI 진입점: 인자 확인 뒤 모델을 불러 실행
const main = async () => {
    const { dryRun, confirm } = parseArgs();
    if (!dryRun && !confirm) {
        console.error('--dry-run 또는 --confirm 이 필요합니다.');
        process.exitCode = 1;
        return;
    }
    const db = require(path.join(__dirname, '..', 'models'));
    const exitCode = await runStampVerifiedMigrations({ dryRun, confirm, sequelize: db.sequelize });
    if (exitCode !== 0) process.exitCode = exitCode;
};

if (require.main === module) {
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
}

module.exports = {
    BASELINE_NAME,
    STAMP_LOCK_TIMEOUT_SECONDS,
    parseArgs,
    runStampVerifiedMigrations,
};
