#!/usr/bin/env node
'use strict';

// F-01 명시적 마이그레이션 명령. `db.sequelize.sync({force:false})`가 컬럼 변경을
// 못 하는 문제(0002가 다루는 nickname_snapshot 확장 같은 것)를 sequelize-cli 없이
// 해결하기 위해, 이 저장소의 모델 로더(backend/models/index.js)가 만든 연결을 그대로
// 재사용해 마이그레이션을 적용한다. 대상 DB는 기존과 동일하게 DATABASE_URL(.env 또는
// 환경변수)로 고른다 — 격리 테스트 DB를 상대할 때도 같은 방식으로 DATABASE_URL만
// 바꾸면 된다.
//
// 사용법:
//   node backend/scripts/migrate-db.js status
//   node backend/scripts/migrate-db.js migrate
//   node backend/scripts/migrate-db.js resolve-failure --name <migration-name> --confirm

const path = require('path');

const migrationRunner = require('../db/migrationRunner');
const baseline = require('../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../db/migrations/0005-add-social-auth');
// 소셜 가입과 기본 지급에 필요한 스키마를 실제 배포 명령에서도 순서대로 적용한다.
const addEconomy = require('../db/migrations/0006-add-economy');

const addEconomyPurchaseRequests = require('../db/migrations/0007-add-economy-purchase-requests');
// F-11: 투표 참여 영속 집계 테이블도 실제 배포 명령에서 순서대로 적용한다.
const addVoteParticipations = require('../db/migrations/0008-add-vote-participations');
// F-12: 업적 지급 이력 테이블도 실제 배포 명령에서 순서대로 적용한다.
const addAchievementGrants = require('../db/migrations/0009-add-achievement-grants');
// F-13: 프로필 장착 CAS(compare-and-swap)에 쓰는 영속 revision 컬럼도 실제 배포 명령에서
// 순서대로 적용한다(economy.service.js의 equipProfileAppearance 참고).
const addEconomyLoadoutRevision = require('../db/migrations/0010-add-economy-loadout-revision');
const MIGRATIONS = [baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests, addVoteParticipations, addAchievementGrants, addEconomyLoadoutRevision];

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

const printStatusTable = (rows) => {
    for (const row of rows) {
        const checksumFlag = row.checksumMatches === false ? ' [체크섬 불일치]' : '';
        console.log(`  ${row.name.padEnd(32)} ${row.status.padEnd(10)} ${row.appliedAt ?? '-'}${checksumFlag}`);
        if (row.error) console.log(`    error: ${row.error}`);
    }
};

const runStatus = async (db) => {
    const rows = await migrationRunner.getStatus({ sequelize: db.sequelize, migrations: MIGRATIONS });
    console.log('마이그레이션 상태:');
    printStatusTable(rows);
    const hasFailed = rows.some((r) => r.status === 'failed');
    // running은 지금 이 프로세스가 만든 상태가 아니므로(각 명령은 매번 새로 락을 걸고
    // 끝나면 반드시 applied/failed로 정리한다) 여기 보인다는 것은 이전 실행이 크래시했거나
    // 이력 쓰기 자체가 실패해 멈춘 흔적이다 — failed와 같은 수준으로 취급한다.
    const hasStuckRunning = rows.some((r) => r.status === 'running');
    if (hasFailed) {
        console.log('\n실패 이력이 있습니다. docs/requirements/2026-09-09-f01-migration-runbook.md의 복구 절차를 먼저 수행하세요.');
    }
    if (hasStuckRunning) {
        console.log('\nrunning 상태로 멈춘 이력이 있습니다 — 이전 실행이 중단됐거나 이력 기록 자체가 실패한 흔적입니다. 실제 DB 상태를 확인한 뒤 복구 절차를 수행하세요.');
    }
    return (hasFailed || hasStuckRunning) ? 1 : 0;
};

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

const main = async () => {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (!['status', 'migrate', 'resolve-failure'].includes(command)) {
        console.error('사용법: node backend/scripts/migrate-db.js <status|migrate|resolve-failure> [--name <name>] [--confirm]');
        process.exitCode = 1;
        return;
    }

    // models/index.js는 require 시점에 DATABASE_URL로 연결을 만든다 — 대상 DB를 바꾸려면
    // 이 스크립트를 실행하기 전에 DATABASE_URL(및 필요하면 NODE_ENV)을 설정하면 된다.
    const db = require(path.join(__dirname, '..', 'models'));

    let exitCode = 1;
    try {
        if (command === 'status') exitCode = await runStatus(db);
        else if (command === 'migrate') exitCode = await runMigrate(db);
        else exitCode = await runResolveFailure(db, options);
    } finally {
        await db.sequelize.close();
    }
    process.exitCode = exitCode;
};

if (require.main === module) {
    main().catch((error) => {
        console.error(`[migrate-db] 처리되지 않은 오류: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { MIGRATIONS, parseArgs };
