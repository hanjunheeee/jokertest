'use strict';

const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const addVoteParticipations = require('../../db/migrations/0008-add-vote-participations');
const addAchievementGrants = require('../../db/migrations/0009-add-achievement-grants');
const addNotifications = require('../../db/migrations/0012-add-notifications');
const addF19FriendsInvites = require('../../db/migrations/0013-f19-friends-invites');
const addSignupEmailVerification = require('../../db/migrations/0016-signup-email-verification');
const addCurrencyProductsTopupOrders = require('../../db/migrations/0018-add-currency-products-topup-orders');
const addEmojiPalettes = require('../../db/migrations/0019-add-emoji-palettes');
// 전체 마이그레이션(scripts/migrate-db MIGRATIONS)을 쓰는 시험이 만드는 표도 관리 목록에 넣음 (2026-11-09 운영·약관 표)
const addOperationsTables = require('../../db/migrations/0024-add-operations-tables');
const addTermsAgreements = require('../../db/migrations/0026-add-terms-agreements');
const dropUnusedTrafficLogs = require('../../db/migrations/0028-drop-unused-columns-traffic-logs');
const addAdminPageTables = require('../../db/migrations/0031-add-admin-page-tables');
const addInquiries = require('../../db/migrations/0032-add-inquiries');

// 기준선(0001)이 만들고 뒤 마이그레이션이 지우는 표 (0028 traffic_logs, 2026-11-09)
// 관리 목록엔 남김(일부만 적용한 시험 DB엔 있음), 행 비우기·있어야 하는 표 검사에선 뺌, 표 지우기 때 있으면 마지막에 지움
const TABLES_DROPPED_LATER = [dropUnusedTrafficLogs.DROPPED_TABLE];

// 지울 때 자식 표 먼저 (신고 증거→신고, 감사 기록→관리자, 쿠폰 사용→쿠폰, 동의→약관 판)
const OPERATIONS_DROP_ORDER = [
    // 관리자 페이지 표 (0031·0032): 문의 답→문의, 세션·로그인 시도→관리자
    addInquiries.TABLES.INQUIRY_REPLIES,
    addInquiries.TABLES.INQUIRIES,
    addAdminPageTables.TABLES.ADMIN_SESSIONS,
    addAdminPageTables.TABLES.ADMIN_LOGIN_ATTEMPTS,
    addOperationsTables.TABLES.REPORT_CHAT_EVIDENCE,
    addOperationsTables.TABLES.REPORTS,
    addOperationsTables.TABLES.ADMIN_AUDIT_LOGS,
    addOperationsTables.TABLES.ADMIN_USERS,
    addOperationsTables.TABLES.COUPON_REDEMPTIONS,
    addOperationsTables.TABLES.COUPONS,
    addOperationsTables.TABLES.BANNED_WORDS,
    addTermsAgreements.TABLES.USER_TERMS_AGREEMENTS,
];

// 마이그레이션이 처음 값을 넣어 두는 표 (점검 상태 한 줄·약관 판), 행 비우기에선 빼고 표 지우기 때만 지움
const SEEDED_TABLES = [
    addOperationsTables.TABLES.MAINTENANCE_STATE,
    addTermsAgreements.TABLES.TERMS_VERSIONS,
];

const ALLOWED_DATABASE_NAMES = new Set([
    'pluto_f01_20260909_al',
    'pluto_f01_20260909_al_restore_check',
]);

const databaseNameOf = (url) => new URL(url).pathname.replace(/^\//, '');

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

const buildManagedSchema = ({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy: addEconomyOverride,
    addEconomyPurchaseRequests: addEconomyPurchaseRequestsOverride,
    addVoteParticipations: addVoteParticipationsOverride,
    addAchievementGrants: addAchievementGrantsOverride,
    addNotifications: addNotificationsOverride,
    addF19FriendsInvites: addF19FriendsInvitesOverride,
    addCurrencyProductsTopupOrders: addCurrencyProductsTopupOrdersOverride, migrationRunner,
}) => {
    const resolvedAddEconomy = addEconomyOverride ?? addEconomy;
    const resolvedAddEconomyPurchaseRequests = addEconomyPurchaseRequestsOverride ?? addEconomyPurchaseRequests;
    const resolvedAddVoteParticipations = addVoteParticipationsOverride ?? addVoteParticipations;
    const resolvedAddAchievementGrants = addAchievementGrantsOverride ?? addAchievementGrants;
    const resolvedAddNotifications = addNotificationsOverride ?? addNotifications;
    const resolvedAddF19FriendsInvites = addF19FriendsInvitesOverride ?? addF19FriendsInvites;
    const resolvedAddCurrencyProductsTopupOrders = addCurrencyProductsTopupOrdersOverride ?? addCurrencyProductsTopupOrders;
    const socialTables = Object.values(addSocialAuth.TABLE_NAMES);
    const economyTables = [...Object.values(resolvedAddEconomy.TABLE_NAMES), addEmojiPalettes.TABLE_NAME];
    const purchaseRequestTables = Object.values(resolvedAddEconomyPurchaseRequests.TABLE_NAMES);
    const voteParticipationTables = Object.values(resolvedAddVoteParticipations.TABLE_NAMES);
    const achievementGrantTables = Object.values(resolvedAddAchievementGrants.TABLE_NAMES);
    const notificationTables = Object.values(resolvedAddNotifications.TABLE_NAMES);
    const f19FriendTables = Object.values(resolvedAddF19FriendsInvites.TABLE_NAMES);
    const currencyProductTopupTables = Object.values(resolvedAddCurrencyProductsTopupOrders.TABLE_NAMES);

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
        ...currencyProductTopupTables,
        ...OPERATIONS_DROP_ORDER,
        ...SEEDED_TABLES,
        migrationRunner.META_TABLE,
    ];

    const dropOrder = [
        ...OPERATIONS_DROP_ORDER,
        ...currencyProductTopupTables,
        addSignupEmailVerification.TABLE_NAME,
        ...f19FriendTables,
        ...notificationTables,
        ...achievementGrantTables,
        ...voteParticipationTables,
        ...purchaseRequestTables,
        ...economyTables,
        ...socialTables,
        addRefreshTokenHistory.TABLE_NAME,
        ...[...baseline.TABLE_ORDER].reverse().filter((table) => !TABLES_DROPPED_LATER.includes(table)),
        migrationRunner.META_TABLE,
    ];

    return { managedTables, dropOrder };
};

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

const resetManagedSchema = async (sequelize, url, { managedTables, dropOrder }) => {
    await assertDedicatedTestDatabase(sequelize, url);
    const existing = await assertNoUnknownTables(sequelize, managedTables);

    const queryInterface = sequelize.getQueryInterface();
    for (const table of dropOrder) {
        if (existing.has(table)) await queryInterface.dropTable(table);
    }
    // 관리 목록엔 있고 지우는 순서엔 없는 표 = 처음 값 넣어 두는 표·뒤 마이그레이션이 지우는 표, 자식 표 다 지운 뒤 마지막에
    for (const table of managedTables) {
        if (!dropOrder.includes(table) && existing.has(table)) await queryInterface.dropTable(table);
    }
};

const SAFE_TABLE_NAME = /^[A-Za-z0-9_]+$/;

const assertSafeTableNames = (tables) => {
    const unsafe = tables.filter((table) => typeof table !== 'string' || !SAFE_TABLE_NAME.test(table));
    if (unsafe.length > 0) {
        throw new Error(`식별자로 쓸 수 없는 테이블 이름입니다: [${unsafe.join(', ')}]`);
    }
};

const resetManagedData = async (sequelize, url, { managedTables, dropOrder, keepTables = [] }) => {
    assertSafeTableNames(dropOrder);
    await assertDedicatedTestDatabase(sequelize, url);
    const existing = await assertNoUnknownTables(sequelize, managedTables);

    const missingTables = managedTables.filter((table) => !existing.has(table) && !TABLES_DROPPED_LATER.includes(table));
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

const findNonEmptyManagedTables = async (sequelize, tables) => {
    if (tables.length === 0) return [];
    assertSafeTableNames(tables);

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
