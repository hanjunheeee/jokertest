'use strict';

// F-14 구매 스킨·카드 장착 — 실제 MySQL 격리 DB 검증. f01~f13과 완전히 같은 원칙·같은
// 물리 DB(F01_TEST_DATABASE_URL, backend/tests/helpers/isolatedTestDb.js의 승인된 이름
// allowlist: pluto_f01_20260909_al / pluto_f01_20260909_al_restore_check)를 쓴다.
//
// R-IMPL(2026-09-12) P2 대응: economy.service.test.js가 인메모리 fake db로 이미 검증한
// 로직(F-14 AC-01/AC-02의 소유권·직업 접두어·무료 예외 검증)은 여기서 다시 처음부터
// 따지지 않는다. 이 파일의 목적은 두 가지다 — (1) 0011-add-economy-loadout-job-skins가
// 실제 MySQL 위에서 재실행해도 안전하고 기존 값을 보존하는지, (2) equipItem/
// getWalletSummary/getGameStartLoadouts가 실제 컬럼 5개(selected_skin_*) 위에서도
// 정확한 소유권 판정·복원·계정 격리를 유지하는지.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f14-skin-card-wear-integration-test-secret';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
// 일반 케이스가 공유하는 스키마를 케이스마다 실제로 대조하기 위해 필요하다(아래 setUp 참고) —
// F-14가 의존하는 계약은 selected_skin_* 5개 컬럼(0011)과 revision NOT NULL(0010)이다.
const addEconomyLoadoutRevision = require('../../db/migrations/0010-add-economy-loadout-revision');
const addEconomyLoadoutJobSkins = require('../../db/migrations/0011-add-economy-loadout-job-skins');
const {
    buildManagedSchema, resetManagedSchema, resetManagedData, findNonEmptyManagedTables,
} = require('../helpers/isolatedTestDb');

// 복제한 테스트 전용 목록 대신 실제 배포 CLI의 등록 순서를 검증한다(0011 포함) —
// f08/f09/f12/f13과 같은 관례.
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
// require되는 이 시점에 격리 DB에 연결된다(f08/f13과 동일한 관례).
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
// 이전 판은 13 케이스 전부가 setUp에서 관리 스키마를 통째로 드롭하고 마이그레이션 13개를
// 처음부터 다시 적용했다. 공식 전체 실행 실측
// (.pluto/monitor/backend-full-2026-09-13T12-18-43.767Z.log): 이 파일 13건이 94891ms를 썼다.
// 그중 스키마 계약 자체가 대상인 케이스는 **0011 재실행 한 건뿐**이고, 나머지 열두 건은
// equipItem/purchaseItem/getWalletSummary/getGameStartLoadouts의 서비스 의미만 본다.
//
// ── 그래서 두 가지 setUp을 둔다 (F-17·F-19 스위트에서 이미 검증된 형태) ───────
//   setUpFreshSchema(t) — 마이그레이션을 실제로 다시 적용하고 그 전후 스키마를 비교하는
//                         케이스. 매번 전체 드롭 + 전체 이관을 예전과 똑같이 한다. 그리고
//                         자기 뒤를 dirty로 표시해, 다음 일반 케이스가 그 케이스가 남긴
//                         스키마를 물려받지 않고 스스로 전체 재구축으로 되돌아가게 한다.
//   setUp(t)            — 일반 서비스 케이스. 이미 완전히 이관된 스키마 위에서 데이터만 비운다.
//
// 일반 케이스는 스키마를 **신뢰하지 않는다**. 매번 (1) 승인된 전용 DB인지 (2) 관리 목록 밖
// 테이블이 없는지 (3) 관리 테이블이 전부 존재하는지를 확인하고(resetManagedData가 셋 다
// 담당한다), 그 위에 (4) 남은 행이 한 건도 없는지 (5) 0010·0011의 컬럼 계약이 그대로인지를
// 직접 단정한다. FOREIGN_KEY_CHECKS는 끄지 않는다 — dropOrder는 "자식 → 부모" 순서이므로
// 같은 순서의 DELETE도 제약을 그대로 지킨다.

/** 'unknown' = 아직 안 세움 · 'migrated' = 완전히 이관됨 · 'dirty' = 스키마를 만진 케이스가 지나갔음 */
let schemaState = 'unknown';

/** setUp이 실제로 쓴 시간. 추측이 아니라 측정으로 보고하기 위한 장치다. */
const fixtureCost = { rebuilds: 0, cleans: 0, schemaMs: 0, dataMs: 0 };

/**
 * 케이스가 바꿀 수 있는 **가변 의존성**을 원래대로 돌린다.
 *
 * 롤백 케이스가 EconomyLoadout.prototype.update를 실패하는 함수로 갈아끼운다. 그 케이스는
 * finally로 되돌리지만, 스키마를 공유하게 된 이상 "되돌리기가 반드시 실행된다"를 전제로
 * 두지 않는다 — 되돌리기가 한 번이라도 건너뛰이면 뒤따르는 모든 케이스가 조용히 같은 주입된
 * 실패를 물려받는다.
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
            `[f14-fixture] mode=${mode} setup=${setupMs.toFixed(1)}ms body=${(performance.now() - startedAt).toFixed(1)}ms`,
        );
    });
};

/** 마이그레이션을 실제로 다시 적용하는 케이스 전용. 전체 재구축하고, 뒤를 dirty로 남긴다. */
const setUpFreshSchema = async (t) => {
    const startedAt = performance.now();
    await rebuildSchema();
    // 이 케이스는 applyMigrations를 자기 본문에서 한 번 더 부르고 describeTable 결과를
    // 그 전후로 비교한다 — 스키마를 대상으로 삼는 케이스이므로 뒤를 dirty로 표시한다.
    schemaState = 'dirty';
    resetRuntimeFixtures();
    beginCase(t, 'fresh-schema', performance.now() - startedAt);
};

/** 일반 서비스 케이스. 이미 이관된 스키마 위에서 데이터만 비우고 격리를 실제로 확인한다. */
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
    // "거부된 요청은 컬럼을 전혀 건드리지 않는다" 류 단정은 전부 의미를 잃는다.
    assert.deepEqual(
        await findNonEmptyManagedTables(sequelize, DATA_TABLES), [],
        '앞 케이스의 행이 남아 있으면 이 케이스의 단정은 의미가 없다',
    );

    // 격리 확인 2 — 공유하는 스키마가 0010·0011의 컬럼 계약을 그대로 만족한다. 스킨 컬럼이
    // 없거나 nullable이 아닌 상태에서 "장착이 저장됐다"를 단정하면 안 된다.
    const queryInterface = sequelize.getQueryInterface();
    await addEconomyLoadoutJobSkins.verify(queryInterface);
    await addEconomyLoadoutRevision.verify(queryInterface);

    resetRuntimeFixtures();
    beginCase(t, mode, performance.now() - startedAt);
};

test.after(() => {
    if (!TEST_DB_URL) return;
    console.log(
        `# [f14-fixture] 전체 재구축 ${fixtureCost.rebuilds}회 ${fixtureCost.schemaMs.toFixed(0)}ms · `
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
    // Purchase scenarios require a funded isolated test account. Use the real ledger
    // service so production purchase/ownership checks and all assertions remain intact.
    await economyService.grantReward({ userId: uuid, amount: 10000, reason: 'F14_TEST_SEED', referenceEventId: 'f14-seed:' + uuid });
    return uuid;
};

// 실제 카탈로그(backend/economy/catalog.js SKIN_STANDING_STEMS/PLAYER_CARD_VARIANTS)의
// 구매 가능 항목 id — economy.service.test.js가 이미 쓰는 값과 동일하다(합성 id 아님).
const GUARD_SKIN_ITEM_ID = 'player-skin-경비원1-바이올렛';
const NOBLE_SKIN_ITEM_ID = 'player-skin-귀족1-블러드';
const DOCTOR_SKIN_ITEM_ID = 'player-skin-주치의-미스테리';
const CARD_FRAME_ITEM_ID = 'player-card-왕관';

const purchase = (userId, itemId) => economyService.purchaseItem({ userId, itemId, referenceEventId: `buy:${userId}:${itemId}` });

// ── 0011-add-economy-loadout-job-skins: 재실행 안전성·데이터 보존 ────────────────

test('0011: 재실행해도 오류 없이 동일한 스키마가 유지되고, 이미 저장된 직업별 스킨 값이 그대로 보존된다', async (t) => {
    if (unavailable(t)) return;
    // 이 케이스만 전체 재구축이다 — 본문이 마이그레이션을 실제로 다시 적용하고 그 전후
    // describeTable을 비교하므로, 앞 케이스가 남긴 스키마 위에서 돌면 "재실행이 안전하다"는
    // 단정의 대상이 달라진다.
    await setUpFreshSchema(t);

    const userId = await createLocalUser('f14mig');
    await purchase(userId, GUARD_SKIN_ITEM_ID);
    await economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID });

    const queryInterface = sequelize.getQueryInterface();
    const snapshotBefore = await queryInterface.describeTable('economy_loadouts');
    for (const column of [
        'selected_skin_noble', 'selected_skin_clown', 'selected_skin_guard',
        'selected_skin_doctor', 'selected_skin_witch_hunter',
    ]) {
        assert.ok(snapshotBefore[column], `economy_loadouts.${column} 컬럼이 있어야 한다`);
        assert.equal(snapshotBefore[column].allowNull, true, `economy_loadouts.${column}은 nullable이어야 한다`);
    }

    const { applied: appliedAgain } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(appliedAgain, [], '이미 적용된 0011을 포함한 마이그레이션은 재실행에서 전부 건너뛰어야 한다');

    const snapshotAfter = await queryInterface.describeTable('economy_loadouts');
    assert.deepEqual(snapshotAfter, snapshotBefore, '재실행 후에도 economy_loadouts 스키마가 완전히 같아야 한다');

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_skin_guard, GUARD_SKIN_ITEM_ID, '재실행 후에도 기존에 저장된 직업별 스킨 값이 보존되어야 한다');
    assert.equal(loadout.selected_skin_noble, null, '건드리지 않은 다른 직업 슬롯은 계속 null이어야 한다');
});

// ---------------------------------------------------------------------------
// 고정 장비 자체의 격리 계약 — 위 setUp이 실제로 무엇을 비우는지 값으로 확인한다
// ---------------------------------------------------------------------------

const countRows = async (model, where = {}) => await model.count({ where });

test('격리: 데이터 정리는 스킨·카드 착용 행까지 실제로 비우고 스키마·제약·이관 이력은 남긴다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    // (1) 한 케이스가 남길 수 있는 것을 실제 서비스 경로로 전부 만든다 — 지급도 구매도
    //     실제 원장(grantReward/purchaseItem)을 지나며, 가짜 잔액이나 직접 INSERT가 아니다.
    const userId = await createLocalUser('f14iso');
    await purchase(userId, GUARD_SKIN_ITEM_ID);
    await purchase(userId, CARD_FRAME_ITEM_ID);
    await economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID });
    await economyService.equipItem({ userId, slot: 'PLAYER_CARD_FRAME', itemId: CARD_FRAME_ITEM_ID });

    const wornBefore = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(wornBefore.selected_skin_guard, GUARD_SKIN_ITEM_ID, '착용 행이 실제로 서 있어야 정리를 검증할 수 있다');
    assert.equal(wornBefore.selected_card_frame_id, CARD_FRAME_ITEM_ID);

    const populated = [
        [db.User, 'users'],
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

    // (3) 실제로 한 건도 남지 않았다 — 착용 행도 예외가 아니다.
    assert.deepEqual(await findNonEmptyManagedTables(sequelize, DATA_TABLES), []);

    // 스키마·이관 이력은 그대로다 — 정리는 드롭이 아니다.
    const [history] = await sequelize.query(
        `SELECT COUNT(*) AS applied_count FROM ${migrationRunner.META_TABLE} WHERE status = 'applied'`,
    );
    assert.equal(
        Number(history[0].applied_count), MIGRATIONS.length,
        '데이터 정리가 이관 이력을 지우면 다음 실행이 이미 있는 스키마에 다시 이관을 시도한다',
    );
    const queryInterface = sequelize.getQueryInterface();
    await assert.doesNotReject(() => addEconomyLoadoutJobSkins.verify(queryInterface));
    await assert.doesNotReject(() => addEconomyLoadoutRevision.verify(queryInterface));

    // 외래 키는 여전히 강제된다 — FOREIGN_KEY_CHECKS를 끄지 않았다는 값 수준의 증거다.
    // 오류 종류까지 단정한다: 다른 이유로 거부돼도 "막혔다"로 통과하면 외래 키가 사라진
    // 것을 이 시험이 놓친다.
    await assert.rejects(
        () => db.sequelize.models.EconomyEntitlement.create({
            user_id: crypto.randomUUID(), item_id: GUARD_SKIN_ITEM_ID, item_type: 'JOB_SKIN', source: 'TEST',
        }),
        (error) => error.name === 'SequelizeForeignKeyConstraintError',
        '정리 뒤에도 없는 계정의 보유 항목은 외래 키가 막아야 한다',
    );

    // (4) 같은 스키마 위에서 실제 구매·장착 경로가 곧바로 다시 돌아가고, 유일 제약도 살아
    //     있다 — 다음 케이스가 물려받는 것이 "비어 있고 제약이 온전한 스키마"임을 확인한다.
    const nextUser = await createLocalUser('f14iso2');
    await purchase(nextUser, NOBLE_SKIN_ITEM_ID);
    const worn = await economyService.equipItem({ userId: nextUser, slot: 'JOB_SKIN_NOBLE', itemId: NOBLE_SKIN_ITEM_ID });
    assert.equal(worn.selected_skin_noble, NOBLE_SKIN_ITEM_ID);
    assert.equal(worn.selected_skin_guard, null, '앞 계정의 착용 값이 남아 있으면 안 된다');

    await assert.rejects(
        () => db.sequelize.models.EconomyEntitlement.create({
            user_id: nextUser, item_id: NOBLE_SKIN_ITEM_ID, item_type: 'JOB_SKIN', source: 'TEST',
        }),
        (error) => error.name === 'SequelizeUniqueConstraintError',
        '(user_id, item_id) 유일 제약이 데이터 정리로 사라지면 안 된다',
    );
});

// ── 실제 구매 스킨·카드 장착·복원 ─────────────────────────────────────────────

test('F-14 AC-01: 실제 구매한 직업 스킨을 장착하면 실제 DB 컬럼(selected_skin_guard)에 저장되고 getWalletSummary로 그대로 복원된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f14own');
    await purchase(userId, GUARD_SKIN_ITEM_ID);
    const loadout = await economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID });
    assert.equal(loadout.selected_skin_guard, GUARD_SKIN_ITEM_ID);

    const summary = await economyService.getWalletSummary(userId);
    assert.equal(summary.loadout.selectedSkinsByJob.guard, GUARD_SKIN_ITEM_ID, '재로그인 경로와 동일한 조회(getWalletSummary)로 그대로 복원되어야 한다');
    assert.equal(summary.loadout.selectedSkinsByJob.noble, null);
});

test('F-14 AC-01: 실제 구매한 카드 프레임을 장착하면 실제 DB 컬럼(selected_card_frame_id)에 저장되고 그대로 복원된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f14card');
    await purchase(userId, CARD_FRAME_ITEM_ID);
    const loadout = await economyService.equipItem({ userId, slot: 'PLAYER_CARD_FRAME', itemId: CARD_FRAME_ITEM_ID });
    assert.equal(loadout.selected_card_frame_id, CARD_FRAME_ITEM_ID);

    const summary = await economyService.getWalletSummary(userId);
    assert.equal(summary.loadout.selectedCardFrameId, CARD_FRAME_ITEM_ID);
});

// ── R-IMPL2(CODEX-2, 2026-09-12) AC-01: 실제 MySQL 위에서의 revision CAS·롤백 검증 ──────
// economy.service.test.js는 인메모리 fake db로 이미 CAS 비교 순서(잠금 → 재확인 → 갱신)와
// equipItem↔equipProfileAppearance의 교차 충돌을 검증했다 — 이 세 시험은 그 논리가 실제
// InnoDB 행 잠금·트랜잭션 위에서도 그대로 성립하는지(가짜 mutex가 아니라 진짜
// SELECT ... FOR UPDATE 경합과 진짜 ROLLBACK)를 추가로 고정한다.

test('F-14 AC-01(R-IMPL2): 같은 revision을 노리는 두 동시 스킨 장착 요청 중 실제 DB에서 하나만 커밋되고 다른 하나는 SKIN_REVISION_CONFLICT로 거부된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f14cas1');
    await purchase(userId, GUARD_SKIN_ITEM_ID);
    await purchase(userId, NOBLE_SKIN_ITEM_ID);

    const before = await economyService.getWalletSummary(userId);
    const initialRevision = before.loadout.revision;
    assert.ok(initialRevision, '초기 revision이 실제로 발급되어 있어야 한다');

    const results = await Promise.allSettled([
        economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID, expectedRevision: initialRevision }),
        economyService.equipItem({ userId, slot: 'JOB_SKIN_NOBLE', itemId: NOBLE_SKIN_ITEM_ID, expectedRevision: initialRevision }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, '같은 revision을 노린 두 동시 쓰기 중 정확히 하나만 실제로 커밋되어야 한다');
    assert.equal(rejected.length, 1, '나머지 하나는 실제 DB CAS 비교로 거부되어야 한다');
    assert.equal(rejected[0].reason.status, 409);
    assert.equal(rejected[0].reason.code, 'SKIN_REVISION_CONFLICT');

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    if (fulfilled[0].value.selected_skin_guard === GUARD_SKIN_ITEM_ID) {
        assert.equal(loadout.selected_skin_guard, GUARD_SKIN_ITEM_ID, '실제로 커밋에 성공한 쪽의 값만 DB에 반영되어야 한다');
        assert.equal(loadout.selected_skin_noble, null, '거부된 쪽의 값은 DB에 반영되면 안 된다');
    } else {
        assert.equal(loadout.selected_skin_noble, NOBLE_SKIN_ITEM_ID, '실제로 커밋에 성공한 쪽의 값만 DB에 반영되어야 한다');
        assert.equal(loadout.selected_skin_guard, null, '거부된 쪽의 값은 DB에 반영되면 안 된다');
    }
    assert.notEqual(loadout.revision, initialRevision, '실제로 커밋된 쪽이 새 revision을 발급받아야 한다');
});

test('F-14 AC-01(R-IMPL2): 다른 확정이 먼저 실제로 커밋된 뒤, 지연되어 도착한 오래된 revision의 스킨 장착 요청은 거부되고 최신 행(값·revision)이 그대로 보존된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f14stale1');
    await purchase(userId, GUARD_SKIN_ITEM_ID);
    await purchase(userId, CARD_FRAME_ITEM_ID);

    const before = await economyService.getWalletSummary(userId);
    const staleRevision = before.loadout.revision;

    // 다른 확정(카드 프레임)이 먼저 실제로 커밋되어 revision이 전진한다 — 지연된 스킨 요청은
    // 이 사실을 아직 모른 채 예전 revision을 그대로 들고 있다.
    const afterCardEquip = await economyService.equipItem({
        userId, slot: 'PLAYER_CARD_FRAME', itemId: CARD_FRAME_ITEM_ID, expectedRevision: staleRevision,
    });
    assert.notEqual(afterCardEquip.revision, staleRevision, '먼저 커밋된 확정이 실제로 새 revision을 발급받아야 한다(시험 전제)');

    await assert.rejects(
        () => economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID, expectedRevision: staleRevision }),
        (error) => error.status === 409 && error.code === 'SKIN_REVISION_CONFLICT',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout.selected_card_frame_id, CARD_FRAME_ITEM_ID, '먼저 커밋된 카드 프레임 값이 그대로 보존되어야 한다');
    assert.equal(loadout.selected_skin_guard, null, '거부된 오래된 스킨 쓰기는 DB에 전혀 반영되면 안 된다');
    assert.equal(loadout.revision, afterCardEquip.revision, '거부된 쓰기가 최신 revision을 되돌리거나 바꾸면 안 된다');
});

test('F-14 AC-01(R-IMPL2): 갱신 시도 중 트랜잭션이 실패하면 실제 DB에서 롤백되어 기존 선택 컬럼과 revision이 모두 그대로 보존된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f14rollback1');
    await purchase(userId, GUARD_SKIN_ITEM_ID);
    await purchase(userId, DOCTOR_SKIN_ITEM_ID);
    await economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID });

    const before = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    const beforeSnapshot = before.get({ plain: true });

    // EconomyLoadout.prototype.update(인스턴스 메서드)만 일시적으로 실패하게 만든다 — 트랜잭션
    // 안에서 실제로 그 갱신 시도가 일어난 뒤에 실패해야 롤백 계약을 검증한다. ensureDefaultLoadout이
    // 쓰는 것은 클래스 정적 메서드(models.EconomyLoadout.update)라 이 패치의 영향을 받지 않는다.
    const originalUpdate = db.sequelize.models.EconomyLoadout.prototype.update;
    let updateCalls = 0;
    db.sequelize.models.EconomyLoadout.prototype.update = async function patchedUpdate(...args) {
        updateCalls += 1;
        assert.ok(args[1]?.transaction, 'the real update must run inside the transaction being rolled back');
        await originalUpdate.apply(this, args);
        throw new Error('injected update failure (rollback test)');
    };

    try {
        await assert.rejects(
            () => economyService.equipItem({
                userId, slot: 'JOB_SKIN_DOCTOR', itemId: DOCTOR_SKIN_ITEM_ID, expectedRevision: beforeSnapshot.revision,
            }),
            /injected update failure/,
        );
    } finally {
        db.sequelize.models.EconomyLoadout.prototype.update = originalUpdate;
    }

    assert.equal(updateCalls, 1, '주입한 실패가 실제로 update 호출 지점에서 발생했어야 한다(전제 확인)');

    const after = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    const afterSnapshot = after.get({ plain: true });
    assert.equal(afterSnapshot.selected_skin_guard, beforeSnapshot.selected_skin_guard, '롤백 후 기존에 저장돼 있던 선택 컬럼이 그대로 보존되어야 한다');
    assert.equal(afterSnapshot.selected_skin_doctor, beforeSnapshot.selected_skin_doctor, '실패한 갱신 시도의 값이 커밋되면 안 된다');
    assert.equal(afterSnapshot.revision, beforeSnapshot.revision, '실패한 트랜잭션은 revision도 그대로 두어야 한다(새 UUID가 커밋되면 안 된다)');
});

// ── 거부 경로: 실제 DB 위에서도 소유권·직업 접두어 검증이 성립하는지 ────────────────

test('F-14 AC-02: 미보유 직업 스킨을 장착 요청하면 실제 DB에서도 거부되고 컬럼이 바뀌지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f14unown');

    await assert.rejects(
        () => economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID }),
        (error) => error.status === 403 && error.code === 'ITEM_NOT_OWNED',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout?.selected_skin_guard ?? null, null, '거부된 요청은 실제 DB 컬럼을 전혀 건드리면 안 된다');
});

test('F-14 AC-02: 다른 직업에서 구매한 스킨을 이 슬롯에 장착하면(직업 불일치) 실제 DB에서도 거부되고 컬럼이 바뀌지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f14mismatch');
    await purchase(userId, NOBLE_SKIN_ITEM_ID); // 귀족(noble) 스킨을 구매

    await assert.rejects(
        () => economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: NOBLE_SKIN_ITEM_ID }), // 경비원(guard) 슬롯에 장착 시도
        (error) => error.status === 400 && error.code === 'ITEM_TYPE_MISMATCH',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout?.selected_skin_guard ?? null, null);
    assert.equal(loadout?.selected_skin_noble ?? null, null, '거부된 요청은 구매한 다른 슬롯의 값도 건드리면 안 된다');
});

test('F-14 AC-02: 존재하지 않는 basic-skin-* 접두어 위조 id는 실제 DB에서도 무료 예외로 통과하지 못하고 거부된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f14forged');

    await assert.rejects(
        () => economyService.equipItem({ userId, slot: 'JOB_SKIN_NOBLE', itemId: 'basic-skin-귀족garbage' }),
        (error) => error.status === 400 && error.code === 'ITEM_TYPE_MISMATCH',
    );

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    assert.equal(loadout?.selected_skin_noble ?? null, null);
});

test('F-14 AC-01: 무료 기본 스킨(basic-skin-*)은 구매 없이도 실제 DB 컬럼에 장착된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f14free');
    const loadout = await economyService.equipItem({ userId, slot: 'JOB_SKIN_NOBLE', itemId: 'basic-skin-귀족2' });
    assert.equal(loadout.selected_skin_noble, 'basic-skin-귀족2');
});

// ── AC-03: 계정 격리 ───────────────────────────────────────────────────────────

test('F-14 AC-03: 서로 다른 두 계정의 직업별 스킨·카드 장착은 실제 DB에서 독립적으로 저장되고 서로 섞이지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userA = await createLocalUser('f14usra');
    const userB = await createLocalUser('f14usrb');

    await purchase(userA, GUARD_SKIN_ITEM_ID);
    await economyService.equipItem({ userId: userA, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID });
    await purchase(userA, CARD_FRAME_ITEM_ID);
    await economyService.equipItem({ userId: userA, slot: 'PLAYER_CARD_FRAME', itemId: CARD_FRAME_ITEM_ID });

    await purchase(userB, NOBLE_SKIN_ITEM_ID);
    await economyService.equipItem({ userId: userB, slot: 'JOB_SKIN_NOBLE', itemId: NOBLE_SKIN_ITEM_ID });

    const summaryA = await economyService.getWalletSummary(userA);
    const summaryB = await economyService.getWalletSummary(userB);

    assert.equal(summaryA.loadout.selectedSkinsByJob.guard, GUARD_SKIN_ITEM_ID);
    assert.equal(summaryA.loadout.selectedSkinsByJob.noble, null, 'A는 noble을 장착한 적이 없어야 한다');
    assert.equal(summaryA.loadout.selectedCardFrameId, CARD_FRAME_ITEM_ID);

    assert.equal(summaryB.loadout.selectedSkinsByJob.noble, NOBLE_SKIN_ITEM_ID);
    assert.equal(summaryB.loadout.selectedSkinsByJob.guard, null, 'B는 guard를 장착한 적이 없어야 한다');
    assert.equal(summaryB.loadout.selectedCardFrameId, null, 'B는 카드 프레임을 장착한 적이 없어야 한다');
});

// ── AC-04: 게임 시작 비공개 loadout 조회 ──────────────────────────────────────

test('F-14 AC-04: getGameStartLoadouts는 실제 DB에 저장된 직업별 스킨 전체 맵과 카드 프레임을 함께 돌려주고, 미장착 직업은 null이다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('f14start');
    await purchase(userId, GUARD_SKIN_ITEM_ID);
    await economyService.equipItem({ userId, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID });
    await purchase(userId, DOCTOR_SKIN_ITEM_ID);
    await economyService.equipItem({ userId, slot: 'JOB_SKIN_DOCTOR', itemId: DOCTOR_SKIN_ITEM_ID });
    await purchase(userId, CARD_FRAME_ITEM_ID);
    await economyService.equipItem({ userId, slot: 'PLAYER_CARD_FRAME', itemId: CARD_FRAME_ITEM_ID });

    const result = await economyService.getGameStartLoadouts([userId]);
    const own = result[userId];

    assert.equal(own.skinsByJob.guard, GUARD_SKIN_ITEM_ID);
    assert.equal(own.skinsByJob.doctor, DOCTOR_SKIN_ITEM_ID);
    assert.equal(own.skinsByJob.noble, null, '장착한 적 없는 직업은 null이어야 한다(프론트 기본값 대체는 이 함수의 책임이 아니다)');
    assert.equal(own.skinsByJob.clown, null);
    assert.equal(own.skinsByJob.witchHunter, null);
    assert.equal(own.cardFrameId, CARD_FRAME_ITEM_ID, '카드 프레임은 공개 정보이므로 게임 시작 조회에도 그대로 실려야 한다');
});

test('F-14 AC-04: getGameStartLoadouts는 실제 DB에서도 계정별로 독립적인 skinsByJob을 돌려주고 서로 섞이지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userA = await createLocalUser('f14gsa');
    const userB = await createLocalUser('f14gsb');
    await purchase(userA, GUARD_SKIN_ITEM_ID);
    await economyService.equipItem({ userId: userA, slot: 'JOB_SKIN_GUARD', itemId: GUARD_SKIN_ITEM_ID });
    await purchase(userB, NOBLE_SKIN_ITEM_ID);
    await economyService.equipItem({ userId: userB, slot: 'JOB_SKIN_NOBLE', itemId: NOBLE_SKIN_ITEM_ID });

    const result = await economyService.getGameStartLoadouts([userA, userB]);

    assert.equal(result[userA].skinsByJob.guard, GUARD_SKIN_ITEM_ID);
    assert.equal(result[userA].skinsByJob.noble, null);
    assert.equal(result[userB].skinsByJob.noble, NOBLE_SKIN_ITEM_ID);
    assert.equal(result[userB].skinsByJob.guard, null);
});
