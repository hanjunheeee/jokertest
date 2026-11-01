#!/usr/bin/env node
'use strict';

const achievementRecoveryService = require('../services/achievement/recovery');

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
