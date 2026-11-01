#!/usr/bin/env node
'use strict';

// 경제 기본 지급 백필 실행 파일, 명령 줄 옵션 읽고 백필 돌린 뒤 결과·재개 자리 출력
// 운영자가 run --confirm 으로 직접 돌림 (부르는 코드 없음)
const path = require('path');

// 첫 낱말은 명령, 나머지는 옵션 (값은 띄어 쓰거나 = 로)
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

// 백필 돌리기 → 종료 코드 (0 = 전부 성공, 1 = 확인 안 함·실패 있음)
const runBackfill = async (db, options) => {
    // --confirm 없으면 안 돌림 (엉뚱한 DB에 쓰기 막기)
    if (!options.confirm) {
        console.error('--confirm 없이는 백필을 실행할 수 없습니다 — 대상 DB(DATABASE_URL)를 먼저 확인하세요.');
        return 1;
    }

    // 확인 뒤에야 서비스까지 불러옴
    const { backfillDefaultEntitlements } = require('./backfillEconomy');
    let lastCheckpoint = options.startAfterUuid ?? null;

    const result = await backfillDefaultEntitlements({
        db,
        // 숫자가 이상하면 기본값
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
    // 실패가 있으면 계정마다 이유 + 다시 돌릴 자리 알려 주고 1
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

// 명령 확인 → DB 열기 → 백필 → 무슨 일이 있어도 DB 닫기
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

// 직접 실행할 때만 돌림 (시험이 불러도 안 돎)
if (require.main === module) {
    main().catch((error) => {
        console.error(`[backfillEconomy] 처리되지 않은 오류: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { parseArgs };
