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
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

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

// require 캐시 싱글턴이라, 파일 맨 위에서 맞춰둔 process.env.DATABASE_URL로 처음
// require되는 이 시점에 격리 DB에 연결된다(f08/f13과 동일한 관례).
const db = require('../../models');
const economyService = require('../../service/economy.service');
const { hashPassword } = require('../../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const setUp = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, 8 - label.length)}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await hashPassword('correct-horse-battery-1'),
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
    await setUp();

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

// ── 실제 구매 스킨·카드 장착·복원 ─────────────────────────────────────────────

test('F-14 AC-01: 실제 구매한 직업 스킨을 장착하면 실제 DB 컬럼(selected_skin_guard)에 저장되고 getWalletSummary로 그대로 복원된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

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
    await setUp();

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
    await setUp();

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
    await setUp();

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
    await setUp();

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
    db.sequelize.models.EconomyLoadout.prototype.update = function patchedUpdate() {
        updateCalls += 1;
        return Promise.reject(new Error('injected update failure (rollback test)'));
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
    await setUp();

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
    await setUp();

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
    await setUp();

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
    await setUp();

    const userId = await createLocalUser('f14free');
    const loadout = await economyService.equipItem({ userId, slot: 'JOB_SKIN_NOBLE', itemId: 'basic-skin-귀족2' });
    assert.equal(loadout.selected_skin_noble, 'basic-skin-귀족2');
});

// ── AC-03: 계정 격리 ───────────────────────────────────────────────────────────

test('F-14 AC-03: 서로 다른 두 계정의 직업별 스킨·카드 장착은 실제 DB에서 독립적으로 저장되고 서로 섞이지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

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
    await setUp();

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
    await setUp();

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
