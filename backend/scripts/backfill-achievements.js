#!/usr/bin/env node
'use strict';

// 업적 백필 실행 파일, 모든 계정 업적을 다시 평가해 빠진 업적 지급 + 결과 출력
// 운영자가 직접 돌림 (업적 복구 시험이 프로세스로 띄워 봄)
const achievementRecoveryService = require('../services/achievement/recovery');

// 전원 다시 평가 → 무슨 일이 있어도 DB 닫기 → 처리 수·새 지급 수 출력, 오류 계정 있으면 종료 코드 1
const main = async () => {
    const db = require('../models');
    let summary;
    try {
        summary = await achievementRecoveryService.evaluateAllUsers();
    } finally {
        await db.sequelize.close();
    }

    const grantedCount = summary.grants.reduce((acc, g) => acc + g.achievementIds.length, 0);
    console.log(`처리한 계정: ${summary.usersProcessed}`);
    console.log(`신규 지급: ${grantedCount}건 (${summary.grants.length}개 계정)`);
    if (summary.errors.length > 0) {
        console.error(`오류 발생 계정: ${summary.errors.length}`);
        for (const err of summary.errors) console.error(`  ${err.userId}: ${err.message}`);
        process.exitCode = 1;
    }
};

// 직접 실행할 때만 돌림
if (require.main === module) {
    main().catch((error) => {
        console.error('[backfill-achievements] 처리되지 않은 오류:', error);
        process.exitCode = 1;
    });
}

module.exports = { main };
