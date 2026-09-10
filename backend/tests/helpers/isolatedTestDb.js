'use strict';

// F-08 CODEX-2 재검토(AC-03) 대응: economy_* 4개 테이블(0006-add-economy)을 이 파일이
// 직접 require해 항상 관리 목록에 포함시킨다. 이전에는 addEconomy를 매 호출부가 직접
// import해서 넘겨야 하는 "선택 인자"였는데, f08-economy.integration.test.js만 그렇게
// 고쳐지고 f01~f03/f05/f07/user.accountPaths는 고쳐지지 않아 — 그 스위트들이 실제
// authService.signup()/socialAuthService.completeSocialSignup()을 호출하면(둘 다 이제
// 같은 계정 생성 트랜잭션 안에서 economy 기본 지급을 하므로) economy_* 테이블이 필요하고,
// 이미 다른 F-08 스위트가 남긴 economy_* 테이블이 있으면 그 사실을 모르는 스위트의
// resetSchema()가 "모르는 테이블"로 오판해 거부했다(VERIFY-10과 같은 근본 원인). 매
// 호출부가 개별적으로 addEconomy를 넘기게 하는 대신, 여기서 한 번만 require해 모든
// 호출부에 기본으로 적용되게 한다 — 새 마이그레이션이 생겨도 이 파일 하나만 고치면 된다.
const addEconomy = require('../../db/migrations/0006-add-economy');
// F-09: economy_purchase_requests(0007) 테이블도 같은 이유로 항상 관리 목록에 포함시킨다 —
// f09 스위트가 이 테이블을 만들면, 그 사실을 모르는 다른 스위트(f01~f08)의 resetSchema()가
// "모르는 테이블"로 오판해 거부하지 않도록 여기서 한 번만 등록한다.
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');

// F-05 R-IMPL(2026-09-10): backend/tests/db/f01~f05-*.integration.test.js와
// backend/__tests__/user.accountPaths.test.js는 모두 같은 물리 MySQL 인스턴스(전용 격리
// 테스트 DB)를 공유한다. 각 스위트가 "우리가 관리하는 테이블 목록·드롭 순서"를 따로
// 정의하면, 한 스위트가 새로 만든 테이블(예: F-05의 external_identities/oauth_states/
// social_signup_intents)을 모르는 다른 스위트의 resetSchema()가 "모르는 테이블이 있다"고
// 오판해 진행을 거부한다 — 실제로 CODEX-2/VERIFY-10에서 21개 백엔드 테스트가 이렇게
// 실패했다. 이 파일이 그 관리 테이블 목록·드롭 순서·안전 대상 확인을 한 곳에 모아, 새
// 마이그레이션이 추가될 때마다 다섯 곳을 따로 고치지 않아도 되게 한다.
//
// 이 파일은 실제 DB 연결 없이도(스텁 sequelize로) 단위 테스트할 수 있도록, 모든 함수가
// 필요한 것(sequelize, url, 테이블 목록)을 인자로만 받고 전역 상태를 갖지 않는다.

// 현재 운영자가 승인한 전용 테스트 DB는 이 두 이름뿐이다(F01_TEST_DATABASE_URL이 가리키는
// pluto_f01_20260909_al과, AC-05 복구 검증이 쓰는 그 _restore_check 별도 격리 DB). 운영
// DATABASE_URL이나 로컬 개발 공유 DB(jokertest-db-1 등)를 실수로 넘겨도 여기서 막힌다.
const ALLOWED_DATABASE_NAMES = new Set([
    'pluto_f01_20260909_al',
    'pluto_f01_20260909_al_restore_check',
]);

const databaseNameOf = (url) => new URL(url).pathname.replace(/^\//, '');

// destructive reset 직전에 반드시 호출한다. 두 가지를 확인한다:
//   1) 연결에 쓴 URL 자체가 승인된 전용 테스트 DB 이름을 가리키는가.
//   2) 실제로 연결된 서버의 DATABASE()가 그 URL이 말하는 이름과 정말 같은가 — URL 파싱과
//      실제 연결 대상이 어긋날 수 있는 경우(별칭 DSN, 커넥션 풀 재사용 등)를 잡는다.
// 어느 한쪽이라도 어긋나면 테이블을 조회·드롭하지 않고 즉시 던진다.
const assertDedicatedTestDatabase = async (sequelize, url) => {
    const urlDatabaseName = databaseNameOf(url);
    if (!ALLOWED_DATABASE_NAMES.has(urlDatabaseName)) {
        throw new Error(
            `전용 테스트 DB 대상이 아닙니다: [${urlDatabaseName}]. ` +
            `승인된 이름(${[...ALLOWED_DATABASE_NAMES].join(', ')})과 일치해야 destructive reset을 진행합니다.`,
        );
    }

    const [rows] = await sequelize.query('SELECT DATABASE() AS name');
    const connectedDatabaseName = rows?.[0]?.name;
    if (connectedDatabaseName !== urlDatabaseName) {
        throw new Error(
            `실제 연결된 DB(${connectedDatabaseName})가 URL이 가리키는 DB(${urlDatabaseName})와 다릅니다 — ` +
            `안전을 위해 진행을 거부합니다.`,
        );
    }
};

// baseline(F-01) + refresh_token_history(F-03) + social auth 3개 테이블(F-05) +
// economy 4개 테이블(F-08, 선택) + schema_migrations을 한 번에 조립한다. social/economy
// 테이블·refresh_token_history 모두 users(또는 user_sessions)를 참조하는 자식이므로,
// baseline 역순(부모인 users를 맨 마지막에 드롭)보다 먼저 드롭해야 FK 제약에 걸리지 않는다.
//
// addEconomy 인자는 더 이상 필요하지 않다 — 이 파일이 위에서 직접 require한 모듈을 기본값
//으로 쓴다(호출부가 명시적으로 다른 값을 넘기면 그 값을 우선한다 — isolatedTestDb.guard.test.js
// 처럼 완전히 가짜인 baseline/addSocialAuth를 넘기는 단위 시험이 실제 파일을 몰라도 되게
// 하위 호환을 유지한다).
const buildManagedSchema = ({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy: addEconomyOverride,
    addEconomyPurchaseRequests: addEconomyPurchaseRequestsOverride, migrationRunner,
}) => {
    const resolvedAddEconomy = addEconomyOverride ?? addEconomy;
    const resolvedAddEconomyPurchaseRequests = addEconomyPurchaseRequestsOverride ?? addEconomyPurchaseRequests;
    const socialTables = Object.values(addSocialAuth.TABLE_NAMES);
    const economyTables = Object.values(resolvedAddEconomy.TABLE_NAMES);
    const purchaseRequestTables = Object.values(resolvedAddEconomyPurchaseRequests.TABLE_NAMES);

    const managedTables = [
        ...baseline.TABLE_ORDER,
        addRefreshTokenHistory.TABLE_NAME,
        ...socialTables,
        ...economyTables,
        ...purchaseRequestTables,
        migrationRunner.META_TABLE,
    ];

    const dropOrder = [
        ...purchaseRequestTables,
        ...economyTables,
        ...socialTables,
        addRefreshTokenHistory.TABLE_NAME,
        ...[...baseline.TABLE_ORDER].reverse(),
        migrationRunner.META_TABLE,
    ];

    return { managedTables, dropOrder };
};

// 관리 목록 밖의 테이블이 있으면(전용 테스트 DB가 아닐 위험) 드롭 없이 즉시 거부한다.
// 통과하면 실제로 존재하는 테이블 Set을 돌려준다(호출부가 dropOrder와 대조해 존재하는
// 것만 드롭하도록).
const assertNoUnknownTables = async (sequelize, managedTables) => {
    const queryInterface = sequelize.getQueryInterface();
    const existing = new Set(await queryInterface.showAllTables());
    const unknown = [...existing].filter((t) => !managedTables.includes(t));
    if (unknown.length > 0) {
        throw new Error(
            `격리 DB에 관리 목록이 모르는 테이블이 있습니다: [${unknown.join(', ')}]. ` +
            `전용 테스트 DB가 맞는지 확인하세요 — 안전을 위해 진행을 거부합니다.`,
        );
    }
    return existing;
};

// 각 DB 통합 테스트 스위트의 resetSchema()가 호출하는 단일 진입점. 대상 DB 확인 →
// 미지 테이블 거부 → dropOrder대로 실제 드롭, 순서로 실행한다. 앞의 두 확인 중 하나라도
// 실패하면 dropTable은 한 번도 호출되지 않는다.
const resetManagedSchema = async (sequelize, url, { managedTables, dropOrder }) => {
    await assertDedicatedTestDatabase(sequelize, url);
    const existing = await assertNoUnknownTables(sequelize, managedTables);

    const queryInterface = sequelize.getQueryInterface();
    for (const table of dropOrder) {
        if (existing.has(table)) await queryInterface.dropTable(table);
    }
};

module.exports = {
    ALLOWED_DATABASE_NAMES,
    databaseNameOf,
    assertDedicatedTestDatabase,
    buildManagedSchema,
    assertNoUnknownTables,
    resetManagedSchema,
};
