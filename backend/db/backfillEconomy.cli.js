#!/usr/bin/env node
'use strict';

const path = require('path');

const parseArgs = (argv) => {
    const [command, ...rest] = argv;
    const options = {};
    for (let i = 0; i < rest.length; i += 1) {
        const token = rest[i];
        if (token === '--confirm') { options.confirm = true; continue; }
        if (token === '--start-after-uuid') { options.startAfterUuid = rest[i + 1]; i += 1; continue; }
        if (token.startsWith('--start-after-uuid=')) { options.startAfterUuid = token.slice('--start-after-uuid='.length); continue; }
        if (token === '--batch-size') { options.batchSize = Number(rest[i + 1]); i += 1; continue; }
        if (token.startsWith('--batch-size=')) { options.batchSize = Number(token.slice('--batch-size='.length)); continue; }
        if (token === '--max-retries') { options.maxRetries = Number(rest[i + 1]); i += 1; continue; }
        if (token.startsWith('--max-retries=')) { options.maxRetries = Number(token.slice('--max-retries='.length)); continue; }
    }
    return { command, options };
};

const runBackfill = async (db, options) => {
    if (!options.confirm) {
        console.error('--confirm 없이는 백필을 실행할 수 없습니다 — 대상 DB(DATABASE_URL)를 먼저 확인하세요.');
        return 1;
    }

    const { backfillDefaultEntitlements } = require('./backfillEconomy');
    let lastCheckpoint = options.startAfterUuid ?? null;

    const result = await backfillDefaultEntitlements({
        db,
        batchSize: Number.isInteger(options.batchSize) && options.batchSize > 0 ? options.batchSize : undefined,
        startAfterUuid: options.startAfterUuid ?? null,
        maxRetries: Number.isInteger(options.maxRetries) && options.maxRetries >= 0 ? options.maxRetries : undefined,
        onCheckpoint: (uuid) => { lastCheckpoint = uuid; },
        onProgress: ({ processed, granted, failedCount, lastUuid, resumeAfterUuid }) => {
            console.log(`  처리 ${processed}건, 지급 성공 ${granted}건, 실패 ${failedCount}건 (마지막 조회 uuid: ${lastUuid})`);
            console.log(`  재개 체크포인트: ${resumeAfterUuid ?? '(없음: --start-after-uuid 없이 재실행)'}`);
        },
    });

    console.log(`백필 완료: 총 ${result.processed}건 처리, ${result.granted}건 성공, ${result.failures.length}건 실패.`);
    if (result.failures.length > 0) {
        console.log('실패한 계정(재실행 시 마지막 조회 uuid가 아닌 재개 체크포인트를 사용하세요):');
        for (const failure of result.failures) {
            console.log(`  ${failure.userId}: ${failure.message}`);
        }
        console.log(`재개 체크포인트: ${lastCheckpoint ?? '(없음: --start-after-uuid 없이 재실행)'}`);
        return 1;
    }
    return 0;
};

const main = async () => {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (command !== 'run') {
        console.error('사용법: node backend/db/backfillEconomy.cli.js run --confirm [--start-after-uuid <uuid>] [--batch-size <n>] [--max-retries <n>]');
        process.exitCode = 1;
        return;
    }

    const db = require(path.join(__dirname, '..', 'models'));

    let exitCode;
    try {
        exitCode = await runBackfill(db, options);
    } finally {
        await db.sequelize.close();
    }
    process.exitCode = exitCode;
};

if (require.main === module) {
    main().catch((error) => {
        console.error(`[backfillEconomy] 처리되지 않은 오류: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { parseArgs };
