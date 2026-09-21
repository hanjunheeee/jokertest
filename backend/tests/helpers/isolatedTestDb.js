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
// F-11: vote_participations(0008)도 같은 이유로 항상 관리 목록에 포함시킨다 — voteParticipation
// 스위트가 이 테이블을 만들면, 그 사실을 모르는 다른 스위트의 resetSchema()가 "모르는
// 테이블"로 오판해 거부하지 않도록 여기서 한 번만 등록한다.
const addVoteParticipations = require('../../db/migrations/0008-add-vote-participations');
// F-12: achievement_grants(0009)도 같은 이유로 항상 관리 목록에 포함시킨다 — achievement
// 스위트가 이 테이블을 만들면, 그 사실을 모르는 다른 스위트의 resetSchema()가 "모르는
// 테이블"로 오판해 거부하지 않도록 여기서 한 번만 등록한다.
const addAchievementGrants = require('../../db/migrations/0009-add-achievement-grants');
// F-17: notifications(0012)도 같은 이유로 항상 관리 목록에 포함시킨다 — f17 스위트가 이
// 테이블을 만들면, 그 사실을 모르는 다른 스위트의 resetSchema()가 "모르는 테이블"로 오판해
// 거부하지 않도록 여기서 한 번만 등록한다.
const addNotifications = require('../../db/migrations/0012-add-notifications');
// F-19: friend_favorites/friend_blocks/game_invites(0013)도 같은 이유로 항상 관리 목록에
// 포함시킨다 — f19 스위트가 이 세 테이블을 만들면, 그 사실을 모르는 다른 스위트의
// resetSchema()가 "모르는 테이블"로 오판해 거부하지 않도록 여기서 한 번만 등록한다.
const addF19FriendsInvites = require('../../db/migrations/0013-f19-friends-invites');
// F-31a: signup_email_verifications(0016)도 같은 이유로 항상 관리 목록에 포함시킨다 —
// f31a 스위트가 이 테이블을 만들면, 그 사실을 모르는 다른 스위트(authService.signup을
// 실제로 호출하는 f02·f08·f29b 포함)의 resetSchema()가 "모르는 테이블"로 오판해 거부하지
// 않도록 여기서 한 번만 등록한다. users를 참조하는 FK가 없어 드롭 순서는 자유롭다.
const addSignupEmailVerification = require('../../db/migrations/0016-signup-email-verification');

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
    addEconomyPurchaseRequests: addEconomyPurchaseRequestsOverride,
    addVoteParticipations: addVoteParticipationsOverride,
    addAchievementGrants: addAchievementGrantsOverride,
    addNotifications: addNotificationsOverride,
    addF19FriendsInvites: addF19FriendsInvitesOverride, migrationRunner,
}) => {
    const resolvedAddEconomy = addEconomyOverride ?? addEconomy;
    const resolvedAddEconomyPurchaseRequests = addEconomyPurchaseRequestsOverride ?? addEconomyPurchaseRequests;
    const resolvedAddVoteParticipations = addVoteParticipationsOverride ?? addVoteParticipations;
    const resolvedAddAchievementGrants = addAchievementGrantsOverride ?? addAchievementGrants;
    const resolvedAddNotifications = addNotificationsOverride ?? addNotifications;
    const resolvedAddF19FriendsInvites = addF19FriendsInvitesOverride ?? addF19FriendsInvites;
    const socialTables = Object.values(addSocialAuth.TABLE_NAMES);
    const economyTables = Object.values(resolvedAddEconomy.TABLE_NAMES);
    const purchaseRequestTables = Object.values(resolvedAddEconomyPurchaseRequests.TABLE_NAMES);
    const voteParticipationTables = Object.values(resolvedAddVoteParticipations.TABLE_NAMES);
    const achievementGrantTables = Object.values(resolvedAddAchievementGrants.TABLE_NAMES);
    const notificationTables = Object.values(resolvedAddNotifications.TABLE_NAMES);
    const f19FriendTables = Object.values(resolvedAddF19FriendsInvites.TABLE_NAMES);

    const managedTables = [
        ...baseline.TABLE_ORDER,
        addRefreshTokenHistory.TABLE_NAME,
        ...socialTables,
        ...economyTables,
        ...purchaseRequestTables,
        ...voteParticipationTables,
        ...achievementGrantTables,
        ...notificationTables,
        ...f19FriendTables,
        addSignupEmailVerification.TABLE_NAME,
        migrationRunner.META_TABLE,
    ];

    const dropOrder = [
        // signup_email_verifications는 users를 참조하지 않는 독립 테이블이라 어디서
        // 드롭해도 FK 제약에 걸리지 않는다.
        addSignupEmailVerification.TABLE_NAME,
        // F-19의 세 테이블도 users를 참조하는 자식이라 baseline 역순보다 먼저 드롭한다.
        ...f19FriendTables,
        // notifications는 users를 참조하는 자식이라 baseline 역순(users가 마지막)보다 먼저
        // 드롭해야 FK 제약에 걸리지 않는다 — achievement_grants와 같은 이유·같은 자리다.
        ...notificationTables,
        ...achievementGrantTables,
        ...voteParticipationTables,
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

// 테이블 이름을 SQL에 직접 넣는 두 함수(resetManagedData/findNonEmptyManagedTables)가 쓰는
// 최소 방어. 이름은 전부 이 저장소의 마이그레이션 상수에서 오지만, 호출부가 실수로 다른 값을
// 넘겼을 때 조용히 SQL을 만들어 실행하지 않도록 여기서 막는다.
const SAFE_TABLE_NAME = /^[A-Za-z0-9_]+$/;

const assertSafeTableNames = (tables) => {
    const unsafe = tables.filter((table) => typeof table !== 'string' || !SAFE_TABLE_NAME.test(table));
    if (unsafe.length > 0) {
        throw new Error(`식별자로 쓸 수 없는 테이블 이름입니다: [${unsafe.join(', ')}]`);
    }
};

/**
 * 스키마는 그대로 두고 관리 테이블의 **행만** 비운다(F-19 검증 시간 보수).
 *
 * ── 왜 필요한가 (실측) ──────────────────────────────────────────────────────
 * 서비스 단정만 하는 통합 케이스가 실제로 필요한 것은 "행이 하나도 없는, 완전히 이관된
 * 스키마"뿐이다. 그런데 지금까지는 케이스마다 관리 스키마를 통째로 드롭하고 마이그레이션
 * 전부를 다시 적용했다. F-19 스위트 26 케이스의 실측 총시간은 106615ms였고, 케이스가
 * 진행될수록 **같은** setUp이 2.4초에서 6.9초까지 느려졌다
 * (.pluto/monitor/BD-db-suite-2026-09-13T08-49-32.388Z.log).
 *
 * ── 안전 계약 ───────────────────────────────────────────────────────────────
 * resetManagedSchema와 **똑같다**: 승인된 전용 테스트 DB 이름인지, 실제 연결된 DATABASE()가
 * 그 이름인지, 관리 목록 밖의 테이블이 없는지를 먼저 확인한다. 하나라도 어긋나면 DELETE를
 * 단 한 번도 실행하지 않고 던진다.
 *
 * FOREIGN_KEY_CHECKS는 끄지 않는다. dropOrder는 이미 "자식 → 부모" 순서다(그래야 DROP
 * TABLE이 FK에 걸리지 않는다) — 같은 순서의 DELETE도 제약을 그대로 지킨다.
 *
 * 스키마 자체는 보증하지 않는다. 관리 테이블 중 하나라도 없으면 DELETE를 실행하지 않고
 * { cleaned: false }를 돌려준다 — 호출부는 그때 전체 재구축으로 되돌아가야 한다.
 *
 * @param {string[]} [options.keepTables] 비우지 않을 테이블(예: schema_migrations 이력).
 */
const resetManagedData = async (sequelize, url, { managedTables, dropOrder, keepTables = [] }) => {
    assertSafeTableNames(dropOrder);
    await assertDedicatedTestDatabase(sequelize, url);
    const existing = await assertNoUnknownTables(sequelize, managedTables);

    const missingTables = managedTables.filter((table) => !existing.has(table));
    if (missingTables.length > 0) return { cleaned: false, missingTables, deleted: [] };

    const keep = new Set(keepTables);
    const deleted = [];
    for (const table of dropOrder) {
        if (keep.has(table)) continue;
        await sequelize.query(`DELETE FROM \`${table}\``);
        deleted.push(table);
    }
    return { cleaned: true, missingTables: [], deleted };
};

/**
 * 관리 테이블 중 행이 남아 있는 것들을 한 번의 질의로 찾는다.
 *
 * 케이스 간 데이터 누수 검사용이다 — 스키마를 재사용하는 setUp은 "비웠다"는 주장만으로는
 * 격리를 증명하지 못하므로, 케이스 시작 직전에 실제 COUNT를 읽어 대조한다.
 */
const findNonEmptyManagedTables = async (sequelize, tables) => {
    if (tables.length === 0) return [];
    assertSafeTableNames(tables);

    // CAST를 두는 이유: UNION 결과 컬럼의 폭이 첫 분기의 리터럴 길이로 좁아지면 누수된
    // 테이블 이름이 잘린 채 보고될 수 있다. 이름이 잘리면 "어느 케이스가 무엇을 남겼는가"를
    // 답할 수 없으므로 폭을 명시한다.
    const branches = tables.map((table) => (
        `SELECT CAST('${table}' AS CHAR(128)) AS table_name, COUNT(*) AS row_count FROM \`${table}\``
    ));
    const [rows] = await sequelize.query(branches.join(' UNION ALL '));
    return (rows ?? [])
        .map((row) => ({ table: String(row.table_name), count: Number(row.row_count) }))
        .filter((row) => row.count > 0);
};

module.exports = {
    ALLOWED_DATABASE_NAMES,
    databaseNameOf,
    assertDedicatedTestDatabase,
    buildManagedSchema,
    assertNoUnknownTables,
    resetManagedSchema,
    resetManagedData,
    findNonEmptyManagedTables,
};
