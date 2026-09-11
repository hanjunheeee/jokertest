#!/usr/bin/env node
'use strict';

// F-12(A-07) 명시적 백필·복구 CLI. 배포 전부터 이미 조건을 만족해 있던 계정과,
// evaluateAndGrantForUser 호출 도중(소켓 fire-and-forget 실패 등) 지급을 놓친 계정을 새
// 게임/투표/페이지 방문 없이 재처리한다. migrate-db.js와 같은 이유로 models/index.js가
// DATABASE_URL로 만든 연결을 재사용하고, 끝나면 반드시 닫는다.
//
// 사용법: node backend/scripts/backfill-achievements.js

const achievementRecoveryService = require('../services/achievementRecoveryService');

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

if (require.main === module) {
    main().catch((error) => {
        console.error('[backfill-achievements] 처리되지 않은 오류:', error);
        process.exitCode = 1;
    });
}

module.exports = { main };
