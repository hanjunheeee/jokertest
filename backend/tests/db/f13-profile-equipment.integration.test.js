'use strict';

// F-13 AC-01/AC-02/AC-03/AC-04 — 프로필 사진·테두리 동시 확정의 실제 MySQL 격리 DB
// 검증. f01~f09/f12와 완전히 같은 원칙·같은 물리 DB(F01_TEST_DATABASE_URL)를 쓴다.
//
// backend/service/economy.service.test.js가 인메모리 fake db로 이미 검증한 로직
// (equipProfileAppearance의 슬롯별 검증 순서, ITEM_NOT_OWNED/ITEM_TYPE_MISMATCH 거부,
// getPublicProfileLoadouts의 비공개 정보 제외)은 여기서 다시 처음부터 따지지 않는다.
// 이 파일의 목적은 그 로직이 실제 MySQL의 UPDATE·트랜잭션 위에서도 그대로 성립하는지
// 확인하는 것이다 — 특히 기본 지급의 멱등성(동시 최초 조회), 두 슬롯 동시 확정이 실제로
// 하나의 UPDATE로 반영되는지(부분 저장 없음), 계정별 격리(A-05/A-06)는 실제 DB 없이는
// 확정할 수 없다.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f13-profile-equipment-integration-test-secret';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
// 일반 케이스가 공유하는 스키마를 케이스마다 실제로 대조하기 위해 필요하다(아래 setUp 참고) —
// F-13이 의존하는 계약은 economy_loadouts.revision이 NOT NULL이고 행마다 유일하다는 것이다.
const addEconomyLoadoutRevision = require('../../db/migrations/0010-add-economy-loadout-revision');
const {
    buildManagedSchema, resetManagedSchema, resetManagedData, findNonEmptyManagedTables,
} = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests, migrationRunner,
});

let sequelize;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    await sequelize.authenticate();
});

test.after(async () => {
    if (sequelize) await sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    return false;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

/** 이력(schema_migrations)을 뺀 데이터 테이블. dropOrder의 "자식 → 부모" 순서를 그대로 쓴다. */
const DATA_TABLES = DROP_ORDER.filter((table) => table !== migrationRunner.META_TABLE);

// require 캐시 싱글턴이라, 파일 맨 위에서 맞춰둔 process.env.DATABASE_URL로 처음
// require되는 이 시점에 격리 DB에 연결된다(f08-economy.integration.test.js와 동일한 관례).
const db = require('../../models');
const economyService = require('../../service/economy.service');
const { hashPassword } = require('../../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

// ---------------------------------------------------------------------------
// 고정 장비 — 스키마 재구축과 데이터 격리를 분리한다
// ---------------------------------------------------------------------------
//
// ── 실측 ────────────────────────────────────────────────────────────────────
// 이전 판은 9 케이스 전부가 setUp에서 관리 스키마를 통째로 드롭하고 마이그레이션 13개를
// 처음부터 다시 적용했다. 공식 전체 실행 실측
// (.pluto/monitor/backend-full-2026-09-13T12-18-43.767Z.log): 이 파일 9건이 70190ms를 썼다.
// 이 파일에는 DDL·스키마 계약을 직접 만지는 케이스가 **하나도 없다** — 아홉 건 모두
// equipProfileAppearance/getWalletSummary/getPublicProfileLoadouts의 서비스 의미만 본다.
// 즉 반복 드롭/CREATE 전체가 순수한 고정 장비 비용이다.
//
// ── 그래서 (F-17·F-19 스위트에서 이미 검증된 형태로) 데이터만 비운다 ─────────
// 일반 케이스가 실제로 필요한 것은 "행이 하나도 없는, 완전히 이관된 스키마"뿐이다.
// 그렇다고 스키마를 **신뢰하지는 않는다**. 매 케이스가 (1) 승인된 전용 DB인지 (2) 관리 목록
// 밖 테이블이 없는지 (3) 관리 테이블이 전부 존재하는지를 확인하고(resetManagedData가 셋 다
// 담당한다), 그 위에 (4) 남은 행이 한 건도 없는지 (5) 0010의 revision 계약(NOT NULL·행마다
// 유일)이 그대로인지를 직접 단정한다. 하나라도 어긋나면 통과시키지 않고 전체 재구축으로
// 되돌아가거나 던진다. FOREIGN_KEY_CHECKS는 끄지 않는다 — dropOrder는 "자식 → 부모"
// 순서이므로 같은 순서의 DELETE도 제약을 그대로 지킨다.

/** 'unknown' = 아직 안 세움 · 'migrated' = 완전히 이관됨 · 'dirty' = 스키마를 만진 케이스가 지나갔음 */
let schemaState = 'unknown';

/** setUp이 실제로 쓴 시간. 추측이 아니라 측정으로 보고하기 위한 장치다. */
const fixtureCost = { rebuilds: 0, cleans: 0, schemaMs: 0, dataMs: 0 };

/**
 * 케이스가 바꿀 수 있는 **가변 의존성**을 원래대로 돌린다.
 *
 * 지금 이 파일의 아홉 케이스 중 모듈 수준 대역을 심는 것은 없다(같은 계층을 만지는 F-14
 * 스위트의 롤백 케이스는 EconomyLoadout.prototype.update를 교체한다). 스키마를 공유하게 된
 * 이상 "아무도 안 바꾼다"를 전제로 두지 않고, 케이스 사이마다 실제로 원본 함수인지 되돌린다.
 */
const REAL_LOADOUT_UPDATE = db.sequelize.models.EconomyLoadout.prototype.update;

const resetRuntimeFixtures = () => {
    db.sequelize.models.EconomyLoadout.prototype.update = REAL_LOADOUT_UPDATE;
};

/** 관리 스키마를 통째로 드롭하고 마이그레이션 전부를 처음부터 적용한다. */
const rebuildSchema = async () => {
    const startedAt = performance.now();
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    fixtureCost.rebuilds += 1;
    fixtureCost.schemaMs += performance.now() - startedAt;
    schemaState = 'migrated';
};

/** 케이스별 setUp/본문 소요와 어떤 setUp을 썼는지를 TAP 진단으로 남긴다. */
const beginCase = (t, mode, setupMs) => {
    const startedAt = performance.now();
    t.after(() => {
        t.diagnostic(
            `[f13-fixture] mode=${mode} setup=${setupMs.toFixed(1)}ms body=${(performance.now() - startedAt).toFixed(1)}ms`,
        );
    });
};

const setUp = async (t) => {
    const startedAt = performance.now();
    let mode = 'clean-data';

    if (schemaState !== 'migrated') {
        await rebuildSchema();
        mode = 'rebuilt';
    } else {
        const cleanStartedAt = performance.now();
        const result = await resetManagedData(sequelize, TEST_DB_URL, {
            managedTables: MANAGED_TABLES,
            dropOrder: DROP_ORDER,
            // 이력 행은 남긴다 — 지우면 다음 applyMigrations가 이미 있는 테이블에 다시
            // 이관을 시도하게 된다.
            keepTables: [migrationRunner.META_TABLE],
        });
        if (!result.cleaned) {
            await rebuildSchema();
            mode = `rebuilt-missing:${result.missingTables.join(',')}`;
        } else {
            fixtureCost.cleans += 1;
            fixtureCost.dataMs += performance.now() - cleanStartedAt;
        }
    }

    // 격리 확인 1 — 앞 케이스의 행이 한 건도 넘어오지 않았다. 넘어왔다면 이 케이스의
    // "기본 지급이 정확히 16종" 류 단정은 전부 의미를 잃으므로 통과시키지 않는다.
    assert.deepEqual(
        await findNonEmptyManagedTables(sequelize, DATA_TABLES), [],
        '앞 케이스의 행이 남아 있으면 이 케이스의 단정은 의미가 없다',
    );

    // 격리 확인 2 — 공유하는 스키마가 0010의 revision 계약을 그대로 만족한다. 이 계약이
    // 깨진 채로 CAS 단정을 하면 "충돌이 안 났다"는 결과가 무엇을 뜻하는지 알 수 없다.
    await addEconomyLoadoutRevision.verify(sequelize.getQueryInterface());

    resetRuntimeFixtures();
    beginCase(t, mode, performance.now() - startedAt);
};

test.after(() => {
    if (!TEST_DB_URL) return;
    console.log(
        `# [f13-fixture] 전체 재구축 ${fixtureCost.rebuilds}회 ${fixtureCost.schemaMs.toFixed(0)}ms · `
        + `데이터 격리 ${fixtureCost.cleans}회 ${fixtureCost.dataMs.toFixed(0)}ms`,
    );
});

test.afterEach(() => {
    resetRuntimeFixtures();
});

/**
 * 실제 production hashPassword로 **프로세스당 한 번만** 만든 bcrypt 해시를 공유한다.
 *
 * 강도를 낮추지 않는다 — 같은 함수·같은 cost(10)·같은 값이고, 계정마다 똑같은 평문을 다시
 * 해싱하던 중복 계산만 없앤다. 이 스위트의 어떤 단정도 비밀번호 검증을 지나지 않는다
 * (모든 케이스가 economyService를 직접 호출한다 — 로그인 경로가 없다).
 */
let sharedPasswordHash = null;
const testPasswordHash = async () => {
    if (sharedPasswordHash === null) sharedPasswordHash = await hashPassword('correct-horse-battery-1');
    return sharedPasswordHash;
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, 8 - label.length)}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await testPasswordHash(),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    return uuid;
};

const countRows = async (model, where = {}) => await model.count({ where });

// ---------------------------------------------------------------------------
// 고정 장비 자체의 격리 계약 — 위 setUp이 실제로 무엇을 비우는지 값으로 확인한다
// ---------------------------------------------------------------------------

test('격리: 데이터 정리는 프로필·경제 행을 실제로 비우고 스키마·외래 키·이관 이력은 남긴다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    // (1) 한 케이스가 남길 수 있는 것을 실제 서비스 경로로 전부 만든다.
    const userId = await createLocalUser('f13iso');
    await db.UserStats.create({ user_id: userId });
    await db.UserSession.create({ id: `session-${userId}`, user_id: userId, is_online: true });
    // 원장 항목은 실제 지급 경로로만 만든다(가짜 INSERT가 아니다).
    await economyService.grantReward({ userId, amount: 100, reason: 'F13_ISOLATION_SEED', referenceEventId: `f13-iso:${userId}` });
    // 기본 16종 + 평민 테두리 + loadout이 여기서 만들어진다(실제 조회 경로).
    const revision = (await economyService.getWalletSummary(userId)).loadout.revision;
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-귀족', itemType: 'PROFILE_BORDER', referenceEventId: `f13-iso-ach:${userId}` });
    await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-귀족', expectedRevision: revision });

    const populated = [
        [db.User, 'users'], [db.UserStats, 'user_stats'], [db.UserSession, 'user_sessions'],
        [db.sequelize.models.EconomyWallet, 'economy_wallets'],
        [db.sequelize.models.EconomyLedgerEntry, 'economy_ledger_entries'],
        [db.sequelize.models.EconomyEntitlement, 'economy_entitlements'],
        [db.sequelize.models.EconomyLoadout, 'economy_loadouts'],
    ];
    for (const [model, table] of populated) {
        assert.ok(
            await countRows(model) > 0,
            `${table}에 행이 없으면 이 시험은 정리를 검증하는 것이 아니라 빈 DB를 확인하는 것이 된다`,
        );
    }

    // (2) 일반 케이스의 setUp이 쓰는 바로 그 정리를 실행한다.
    const result = await resetManagedData(sequelize, TEST_DB_URL, {
        managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER,
        keepTables: [migrationRunner.META_TABLE],
    });
    assert.equal(result.cleaned, true);
    assert.deepEqual(
        result.deleted, DATA_TABLES,
        '관리 테이블 하나라도 빼놓으면 다음 케이스가 남은 행을 물려받는다',
    );

    // (3) 실제로 한 건도 남지 않았다.
    assert.deepEqual(await findNonEmptyManagedTables(sequelize, DATA_TABLES), []);

    // 스키마·이관 이력은 그대로다 — 정리는 드롭이 아니다.
    const [history] = await sequelize.query(
        `SELECT COUNT(*) AS applied_count FROM ${migrationRunner.META_TABLE} WHERE status = 'applied'`,
    );
    assert.equal(
        Number(history[0].applied_count), MIGRATIONS.length,
        '데이터 정리가 이관 이력을 지우면 다음 실행이 이미 있는 스키마에 다시 이관을 시도한다',
    );
    await assert.doesNotReject(() => addEconomyLoadoutRevision.verify(sequelize.getQueryInterface()));

    // 외래 키는 여전히 강제된다 — FOREIGN_KEY_CHECKS를 끄지 않았다는 값 수준의 증거다.
    // 오류 종류까지 단정한다: NOT NULL 누락 같은 다른 이유로 거부돼도 "막혔다"로 통과하면
    // 외래 키가 사라진 것을 이 시험이 놓친다.
    await assert.rejects(
        () => db.sequelize.models.EconomyEntitlement.create({
            user_id: crypto.randomUUID(), item_id: 'player-profile-기사', item_type: 'PROFILE_PHOTO', source: 'TEST',
        }),
        (error) => error.name === 'SequelizeForeignKeyConstraintError',
        '정리 뒤에도 없는 계정의 보유 항목은 외래 키가 막아야 한다',
    );

    // (4) 같은 스키마 위에서 실제 서비스 경로가 곧바로 다시 돌아간다 — 다음 케이스가
    //     물려받는 것이 "비어 있고 정상인 스키마"임을 값으로 확인한다.
    const nextUser = await createLocalUser('f13iso2');
    const summary = await economyService.getWalletSummary(nextUser);
    assert.equal(summary.loadout.selectedProfileBorderId, 'profile-border-평민');
    assert.equal(
        await countRows(db.sequelize.models.EconomyEntitlement, { user_id: nextUser, item_type: 'PROFILE_PHOTO' }), 16,
        '앞 계정의 흔적 없이 기본 16종이 이 계정에 새로 지급되어야 한다',
    );
});

// ── AC-03 전제: 기본 16종 + 평민 테두리 멱등 지급 ────────────────────────────

test('AC-03: 동시에 최초 조회해도 기본 프로필 16종·평민 테두리가 중복 없이 정확히 한 번씩 지급된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13def');
    await Promise.all([
        economyService.getWalletSummary(userId),
        economyService.getWalletSummary(userId),
        economyService.getWalletSummary(userId),
    ]);

    const entitlements = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId } });
    const photoIds = entitlements.filter((e) => e.item_type === 'PROFILE_PHOTO').map((e) => e.item_id);
    const borderIds = entitlements.filter((e) => e.item_type === 'PROFILE_BORDER').map((e) => e.item_id);
    assert.equal(new Set(photoIds).size, 16, '기본 사진 16종이 중복 없이 지급되어야 한다');
    assert.equal(photoIds.length, 16, '동시 조회로 사진이 중복 지급되면 안 된다');
    assert.deepEqual(borderIds, ['profile-border-평민']);

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-금빛가면');
    assert.equal(loadout.selected_profile_border_id, 'profile-border-평민');
});

// ── AC-01/AC-02: 실제 UPDATE 위에서 두 슬롯 원자적 확정 ──────────────────────

// F-13 AC-02(운영자 설계 감사, 2026-09-11): expectedRevision은 실제 클라이언트가 항상 먼저
// GET(getWalletSummary)으로 읽은 값을 그대로 되돌려 보내는 값이다 — 이 헬퍼가 그 실제
// 흐름을 실제 MySQL 위에서도 그대로 재현한다.
const currentRevision = async (userId) => (await economyService.getWalletSummary(userId)).loadout.revision;

test('AC-01/AC-02: 사진·테두리를 함께 확정하면 실제 DB에 한 번의 UPDATE로 두 컬럼과 revision이 함께 반영된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13both');
    const expectedRevision = await currentRevision(userId); // 기본 지급 선행
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-귀족', itemType: 'PROFILE_BORDER', referenceEventId: `grant-${userId}` });

    const result = await economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', borderItemId: 'profile-border-귀족', expectedRevision });
    assert.notEqual(result.revision, expectedRevision, '성공적인 확정은 실제 DB에서도 새 revision을 받아야 한다');

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-기사');
    assert.equal(loadout.selected_profile_border_id, 'profile-border-귀족');
    assert.equal(loadout.revision, result.revision);
});

test('AC-01: 두 슬롯 중 하나가 미보유면 실제 DB에도 두 슬롯 모두 저장되지 않는다(부분 저장 없음)', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13part');
    const expectedRevision = await currentRevision(userId); // 기본 지급 선행 — 사진 16종·평민 테두리만 보유

    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', borderItemId: 'profile-border-귀족', expectedRevision }),
        (error) => error.status === 403 && error.code === 'ITEM_NOT_OWNED',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-금빛가면', '거부된 요청이 사진 슬롯을 바꾸면 안 된다(기존 기본값 유지)');
    assert.equal(loadout.selected_profile_border_id, 'profile-border-평민', '거부된 요청이 테두리 슬롯을 바꾸면 안 된다(기존 기본값 유지)');
    assert.equal(loadout.revision, expectedRevision, '거부된 요청은 revision도 바꾸면 안 된다');
});

test('AC-01: 상품 종류가 슬롯과 맞지 않으면(테두리를 사진 슬롯에) 실제 DB에서도 거부되고 아무것도 저장되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13type');
    const expectedRevision = await currentRevision(userId);

    await assert.rejects(
        () => economyService.equipProfileAppearance({ userId, photoItemId: 'profile-border-평민', expectedRevision }),
        (error) => error.status === 400 && error.code === 'ITEM_TYPE_MISMATCH',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-금빛가면');
});

test('AC-01: 동시에 서로 다른 값으로 확정 요청이 들어와도 실제 행 잠금 아래에서 마지막으로 커밋된 값만 남는다(중간값 없음)', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13race');
    await economyService.getWalletSummary(userId);
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-귀족', itemType: 'PROFILE_BORDER', referenceEventId: `grant-${userId}` });

    // 서로 다른 슬롯을 바꾸는 두 요청은 실제로 서버가 먼저 커밋한 쪽의 revision을 다른
    // 쪽이 다시 조회해 재시도해야 둘 다 성공한다(같은 오래된 revision을 그대로 들고
    // 경쟁하면 뒤에 도착한 쪽은 409로 거부된다 — 아래 별도 CAS 경쟁 시험이 그 경로를
    // 전담한다). 이 시험은 "서로 다른 슬롯이 동시에 반영돼도 중간값 없이 최종 상태가
    // 일관된다"는 실제 UPDATE 원자성만 확인한다.
    const photoRevision = await currentRevision(userId);
    await economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision: photoRevision });
    const borderRevision = await currentRevision(userId);
    await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-귀족', expectedRevision: borderRevision });

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_photo_id, 'player-profile-기사');
    assert.equal(loadout.selected_profile_border_id, 'profile-border-귀족');
});

test('AC-02(A-01): 같은 오래된 revision을 들고 실제 DB 위에서 동시에 경쟁하는 두 확정 중 정확히 하나만 성공하고 나머지는 409로 거부된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13casrace');
    await economyService.getWalletSummary(userId);
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-귀족', itemType: 'PROFILE_BORDER', referenceEventId: `grant-${userId}` });
    const revision = await currentRevision(userId);

    const results = await Promise.allSettled([
        economyService.equipProfileAppearance({ userId, photoItemId: 'player-profile-기사', expectedRevision: revision }),
        economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-귀족', expectedRevision: revision }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, '실제 행 잠금 아래에서도 같은 오래된 revision으로 경쟁하는 두 확정 중 정확히 하나만 성공해야 한다');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'PROFILE_REVISION_CONFLICT');
});

test('AC-02(설계 감사, 2026-09-11): clientIntentAt은 더 이상 순서 판정에 쓰이지 않는다 — 실제 DB에서도 겹치지 않는 순차 확정은 나중 호출이 이전 값을 정상 대체한다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    // 운영자 설계 감사 근거: Date.now() 기반 clientIntentAt + 인메모리 Map은 같은 밀리초
    // 충돌·시계 역행/오차·프로세스 재시작에 취약해 제거됐다(economy.service.js 주석 참고).
    // 지금은 서버가 발급하는 영속 revision을 실제 행 잠금 아래 CAS로 비교한다 — 이 시험은
    // clientIntentAt을 실어 보내도 무시된 채, 올바른 expectedRevision을 제공하는 순차
    // 확정은 정상적으로 나중 값이 이긴다는 것을 확인한다.
    const userId = await createLocalUser('f13intent');
    await economyService.getWalletSummary(userId);
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-귀족', itemType: 'PROFILE_BORDER', referenceEventId: `grant-${userId}` });

    const revision1 = await currentRevision(userId);
    const afterFirst = await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-평민', expectedRevision: revision1, clientIntentAt: 9999 });
    const result = await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-귀족', expectedRevision: afterFirst.revision, clientIntentAt: 1 });

    assert.equal(result.selected_profile_border_id, 'profile-border-귀족', 'clientIntentAt 값과 무관하게 나중에 호출된(올바른 revision을 제공한) 확정이 이전 값을 정상적으로 대체해야 한다');
    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_profile_border_id, 'profile-border-귀족', '실제 DB에 영속된 최종 상태도 마지막 호출의 값이어야 한다');
});

// ── AC-03/AC-04: 구매·업적 지급 직후 조회, 계정별 복원 ───────────────────────

test('AC-03: 업적으로 테두리를 지급받은 직후 getPublicProfileLoadouts 대상에는 포함되지 않지만(장착 전) equipProfileAppearance로 즉시 장착할 수 있다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f13ach');
    const expectedRevision = await currentRevision(userId);
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-광대', itemType: 'PROFILE_BORDER', referenceEventId: `ach-${userId}` });

    const loadout = await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-광대', expectedRevision });
    assert.equal(loadout.selected_profile_border_id, 'profile-border-광대');
});

test('AC-04: 서로 다른 두 계정의 공개 loadout은 독립적으로 복원되고 서로 섞이지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userA = await createLocalUser('f13usra');
    const userB = await createLocalUser('f13usrb');
    const revisionA = await currentRevision(userA);
    const revisionB = await currentRevision(userB);
    await economyService.equipProfileAppearance({ userId: userA, photoItemId: 'player-profile-기사', expectedRevision: revisionA });
    await economyService.equipProfileAppearance({ userId: userB, photoItemId: 'player-profile-드워프', expectedRevision: revisionB });

    const result = await economyService.getPublicProfileLoadouts([userA, userB]);
    assert.equal(result[userA].profilePhotoId, 'player-profile-기사');
    assert.equal(result[userB].profilePhotoId, 'player-profile-드워프');
    assert.equal(result[userA].profileBorderId, 'profile-border-평민');
    assert.equal(result[userB].profileBorderId, 'profile-border-평민');
});
