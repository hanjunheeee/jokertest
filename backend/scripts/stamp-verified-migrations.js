#!/usr/bin/env node
'use strict';
// sync()로 앞서 간 DB에 대해 verify()가 통과한 마이그레이션만 schema_migrations에 applied로 등록.
// 사용: node -r dotenv/config scripts/stamp-verified-migrations.js --dry-run
//       node -r dotenv/config scripts/stamp-verified-migrations.js --confirm
const db = require('../models');
const { MIGRATIONS } = require('./migrate-db');
const migrationRunner = require('../db/migrationRunner');
const { Sequelize } = require('sequelize');

const parseArgs = () => {
    const args = process.argv.slice(2);
    return { dryRun: args.includes('--dry-run'), confirm: args.includes('--confirm') };
};

(async () => {
    const { dryRun, confirm } = parseArgs();
    if (!dryRun && !confirm) {
        console.error('--dry-run 또는 --confirm 이 필요합니다.');
        process.exitCode = 1;
        return;
    }

    await db.sequelize.authenticate();
    const qi = db.sequelize.getQueryInterface();

    const toStamp = [];
    for (const m of MIGRATIONS) {
        if (typeof m.verify !== 'function') {
            console.error(`${m.name}: verify 없음 — 건너뜀`);
            continue;
        }
        try {
            await m.verify(qi, Sequelize, db.sequelize);
            toStamp.push(m);
            console.log(`${m.name}: stamp 후보`);
        } catch (e) {
            console.log(`${m.name}: pending (${String(e.message).slice(0, 80)}…)`);
        }
    }

    const [failedRows] = await db.sequelize.query(
        `SELECT status FROM schema_migrations WHERE name = '0001-legacy-baseline'`,
    );
    const failed = failedRows[0];
    if (failed?.status === 'failed') {
        console.log('\n0001 failed 이력은 --confirm 시 삭제합니다 (resolve-failure와 동일).');
    }

    if (dryRun) {
        console.log(`\n[dry-run] 등록 예정: ${toStamp.map((m) => m.name).join(', ')}`);
        await db.sequelize.close();
        return;
    }

    if (failed?.status === 'failed') {
        await migrationRunner.resolveFailure({
            sequelize: db.sequelize,
            name: '0001-legacy-baseline',
            confirmRecovered: true,
        });
    }

    for (const m of toStamp) {
        const [exRows] = await db.sequelize.query(
            'SELECT status FROM schema_migrations WHERE name = :name',
            { replacements: { name: m.name } },
        );
        const existing = exRows[0];
        if (existing?.status === 'applied') {
            console.log(`skip ${m.name} (이미 applied)`);
            continue;
        }
        if (existing) {
            await db.sequelize.query('DELETE FROM schema_migrations WHERE name = :name', {
                replacements: { name: m.name },
            });
        }
        const checksum = migrationRunner.checksumOf(m);
        await db.sequelize.query(
            `INSERT INTO schema_migrations (name, checksum, status, started_at, finished_at, error_message)
             VALUES (:name, :checksum, 'applied', NOW(), NOW(), NULL)`,
            { replacements: { name: m.name, checksum } },
        );
        console.log(`stamped ${m.name}`);
    }

    console.log('\n다음: node -r dotenv/config scripts/migrate-db.js migrate');
    await db.sequelize.close();
})().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
