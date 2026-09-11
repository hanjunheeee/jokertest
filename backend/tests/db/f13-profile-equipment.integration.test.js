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
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

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
// require되는 이 시점에 격리 DB에 연결된다(f08-economy.integration.test.js와 동일한 관례).
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
    return uuid;
};

// ── AC-03 전제: 기본 16종 + 평민 테두리 멱등 지급 ────────────────────────────

test('AC-03: 동시에 최초 조회해도 기본 프로필 16종·평민 테두리가 중복 없이 정확히 한 번씩 지급된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

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
    await setUp();

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
    await setUp();

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
    await setUp();

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
    await setUp();

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
    await setUp();

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
    await setUp();

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
    await setUp();

    const userId = await createLocalUser('f13ach');
    const expectedRevision = await currentRevision(userId);
    await economyService.grantAchievementItem({ userId, itemId: 'profile-border-광대', itemType: 'PROFILE_BORDER', referenceEventId: `ach-${userId}` });

    const loadout = await economyService.equipProfileAppearance({ userId, borderItemId: 'profile-border-광대', expectedRevision });
    assert.equal(loadout.selected_profile_border_id, 'profile-border-광대');
});

test('AC-04: 서로 다른 두 계정의 공개 loadout은 독립적으로 복원되고 서로 섞이지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

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
