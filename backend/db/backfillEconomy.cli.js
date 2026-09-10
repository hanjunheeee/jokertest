#!/usr/bin/env node
'use strict';

// F-08 기존 계정 기본 지급 백필 CLI(CODEX-2 AC-03 대응). backfillEconomy.js의
// backfillDefaultEntitlements를 사람이 명시적으로 실행하는 진입점이다 — 이 파일을
// require만 해서는 아무 것도 실행되지 않는다(require.main === module일 때만 동작),
// backend/index.js를 비롯한 어떤 기동 경로도 이 CLI를 자동으로 실행하지 않는다
// ("Do not automatically run production backfill or arbitrary startup sync").
//
// 사용법:
//   node backend/db/backfillEconomy.cli.js run --confirm
//   node backend/db/backfillEconomy.cli.js run --confirm --start-after-uuid <uuid> --batch-size 200
//
// --confirm 없이는 실행되지 않는다(운영 DB에 실수로 쏘는 것을 막기 위함,
// backend/scripts/migrate-db.js의 resolve-failure --confirm과 같은 원칙). 중간에
// 중단되면 마지막으로 출력된 체크포인트 uuid를 --start-after-uuid로 넘겨 재개한다 —
// backfillDefaultEntitlements 자체가 멱등이므로 겹쳐 재실행해도 중복 지급되지 않는다.

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

    // models/index.js는 require 시점에 DATABASE_URL로 연결을 만든다 — 대상 DB를 바꾸려면
    // 이 스크립트를 실행하기 전에 DATABASE_URL(및 필요하면 NODE_ENV)을 설정하면 된다
    // (backend/scripts/migrate-db.js와 같은 원칙).
    const db = require(path.join(__dirname, '..', 'models'));

    let exitCode = 1;
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
