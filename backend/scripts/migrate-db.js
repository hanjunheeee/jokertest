#!/usr/bin/env node
'use strict';

// 마이그레이션 명령 파일, 적용할 마이그레이션 목록 + status·migrate·resolve-failure 명령
// 운영자가 직접 돌림, DB 시험들이 MIGRATIONS 목록을 가져다 씀
const path = require('path');

const migrationRunner = require('../db/migrationRunner');
const baseline = require('../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../db/migrations/0005-add-social-auth');
const addEconomy = require('../db/migrations/0006-add-economy');

const addEconomyPurchaseRequests = require('../db/migrations/0007-add-economy-purchase-requests');
const addVoteParticipations = require('../db/migrations/0008-add-vote-participations');
const addAchievementGrants = require('../db/migrations/0009-add-achievement-grants');
const addEconomyLoadoutRevision = require('../db/migrations/0010-add-economy-loadout-revision');
const addEconomyLoadoutJobSkins = require('../db/migrations/0011-add-economy-loadout-job-skins');
const addNotifications = require('../db/migrations/0012-add-notifications');
const addF19FriendsInvites = require('../db/migrations/0013-f19-friends-invites');
const addFindIdRequests = require('../db/migrations/0014-find-id-requests');
const addPasswordResetTokens = require('../db/migrations/0015-password-reset-tokens');
const addSignupEmailVerification = require('../db/migrations/0016-signup-email-verification');
const addSocialSignupEmail = require('../db/migrations/0017-social-signup-email');
const addCurrencyProductsTopupOrders = require('../db/migrations/0018-add-currency-products-topup-orders');
const addEmojiPalettes = require('../db/migrations/0019-add-emoji-palettes');
// 적용 순서 그대로 (새 마이그레이션은 끝에 붙임)
const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests, addVoteParticipations, addAchievementGrants, addEconomyLoadoutRevision, addEconomyLoadoutJobSkins, addNotifications, addF19FriendsInvites, addFindIdRequests, addPasswordResetTokens, addSignupEmailVerification, addSocialSignupEmail, addCurrencyProductsTopupOrders, addEmojiPalettes];

// 첫 낱말은 명령, 나머지는 --confirm · --name (값은 띄어 쓰거나 = 로)
const parseArgs = (argv) => {
    const [command, ...rest] = argv;
    const options = {};
    for (let i = 0; i < rest.length; i += 1) {
        const token = rest[i];
        if (token === '--confirm') { options.confirm = true; continue; }
        if (token.startsWith('--name=')) { options.name = token.slice('--name='.length); continue; }
        if (token === '--name') { options.name = rest[i + 1]; i += 1; continue; }
    }
    return { command, options };
};

// 이름·상태·적용 시각 한 줄씩, 체크섬 다르면 표시·오류 있으면 아래에
const printStatusTable = (rows) => {
    for (const row of rows) {
        const checksumFlag = row.checksumMatches === false ? ' [체크섬 불일치]' : '';
        console.log(`  ${row.name.padEnd(32)} ${row.status.padEnd(10)} ${row.appliedAt ?? '-'}${checksumFlag}`);
        if (row.error) console.log(`    error: ${row.error}`);
    }
};

// status: 상태만 보여 줌, failed·running이 있으면 종료 코드 1
const runStatus = async (db) => {
    const rows = await migrationRunner.getStatus({ sequelize: db.sequelize, migrations: MIGRATIONS });
    console.log('마이그레이션 상태:');
    printStatusTable(rows);
    const hasFailed = rows.some((r) => r.status === 'failed');
    const hasStuckRunning = rows.some((r) => r.status === 'running');
    if (hasFailed) {
        console.log('\n실패 이력이 있습니다. docs/requirements/2026-09-09-f01-migration-runbook.md의 복구 절차를 먼저 수행하세요.');
    }
    if (hasStuckRunning) {
        console.log('\nrunning 상태로 멈춘 이력이 있습니다 — 이전 실행이 중단됐거나 이력 기록 자체가 실패한 흔적입니다. 실제 DB 상태를 확인한 뒤 복구 절차를 수행하세요.');
    }
    return (hasFailed || hasStuckRunning) ? 1 : 0;
};

// migrate: failed·running 이력이 있으면 아예 시작 안 함, 실패하면 원인 + 지금 상태 보여 주고 1
const runMigrate = async (db) => {
    const preStatus = await migrationRunner.getStatus({ sequelize: db.sequelize, migrations: MIGRATIONS });
    const blockedBefore = preStatus.filter((r) => r.status === 'failed' || r.status === 'running');
    if (blockedBefore.length > 0) {
        console.error('다음 마이그레이션에 실패/미완료(running) 이력이 있어 무조건 재적용을 차단합니다:');
        printStatusTable(blockedBefore);
        console.error('\ndocs/requirements/2026-09-09-f01-migration-runbook.md의 복구 절차를 수행한 뒤 resolve-failure로 이력을 정리하세요.');
        return 1;
    }

    try {
        const { applied } = await migrationRunner.applyMigrations({
            sequelize: db.sequelize,
            migrations: MIGRATIONS,
            logger: (msg) => console.log(`  ${msg}`),
        });
        console.log(applied.length > 0 ? `적용 완료: ${applied.join(', ')}` : '적용할 마이그레이션이 없습니다 (이미 최신).');
        return 0;
    } catch (error) {
        console.error(`마이그레이션 실패: ${error.message}`);
        const diagnosis = await migrationRunner.diagnoseFailure({ sequelize: db.sequelize, migrations: MIGRATIONS });
        console.error('현재 상태:');
        printStatusTable(diagnosis);
        return 1;
    }
};

// resolve-failure: 이름과 --confirm 둘 다 있어야 실패 이력 지움 (복구 끝난 뒤에만)
const runResolveFailure = async (db, options) => {
    if (!options.name) {
        console.error('--name <migration-name>이 필요합니다.');
        return 1;
    }
    if (!options.confirm) {
        console.error('--confirm 없이는 실패 이력을 정리할 수 없습니다 — 백업 복원 등 복구를 먼저 완료했는지 확인하세요.');
        return 1;
    }
    try {
        const { cleared } = await migrationRunner.resolveFailure({
            sequelize: db.sequelize,
            name: options.name,
            confirmRecovered: true,
        });
        console.log(`실패 이력 정리됨: ${cleared} (다음 migrate 실행에서 다시 시도됩니다)`);
        return 0;
    } catch (error) {
        console.error(`실패 이력 정리 실패: ${error.message}`);
        return 1;
    }
};

// 명령 확인 → DB 열기 → 명령 실행 → 무슨 일이 있어도 DB 닫기
const main = async () => {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (!['status', 'migrate', 'resolve-failure'].includes(command)) {
        console.error('사용법: node backend/scripts/migrate-db.js <status|migrate|resolve-failure> [--name <name>] [--confirm]');
        process.exitCode = 1;
        return;
    }

    const db = require(path.join(__dirname, '..', 'models'));

    let exitCode;
    try {
        if (command === 'status') exitCode = await runStatus(db);
        else if (command === 'migrate') exitCode = await runMigrate(db);
        else exitCode = await runResolveFailure(db, options);
    } finally {
        await db.sequelize.close();
    }
    process.exitCode = exitCode;
};

// 직접 실행할 때만 돌림 (시험이 MIGRATIONS만 가져가도 안 돎)
if (require.main === module) {
    main().catch((error) => {
        console.error(`[migrate-db] 처리되지 않은 오류: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { MIGRATIONS, parseArgs };
