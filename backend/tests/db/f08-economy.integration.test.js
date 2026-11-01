'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f08-economy-integration-test-secret';

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

const db = require('../../models');
const economyService = require('../../services/economy');
const { CURRENCIES } = economyService;
const { hashPassword } = require('../../utils/auth/credentials');
const authService = require('../../services/auth/account');
const socialAuthService = require('../../services/auth/social');
const { backfillDefaultEntitlements } = require('../../db/backfillEconomy');
const { prepareSignupProof } = require('../helpers/signupProof');

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

const ledgerSumFor = async (userId) => {
    const [[{ ledgerSum }]] = await db.sequelize.query(
        'SELECT COALESCE(SUM(amount), 0) AS ledgerSum FROM economy_ledger_entries WHERE user_id = :userId AND currency = :currency',
        { replacements: { userId, currency: CURRENCIES.GOLD } },
    );
    return Number(ledgerSum);
};

test('AC-01: 실제 MySQL 행 잠금 아래 동일 계정·동일 상품 동시 구매는 한 번만 차감된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac01');
    await economyService.grantReward({ userId, amount: 1000, reason: 'TEST_SEED', referenceEventId: `seed-${userId}` });

    const results = await Promise.allSettled([
        economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: `a-${userId}` }),
        economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: `b-${userId}` }),
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);

    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(wallet.balance_gold, 800);
    assert.equal(await ledgerSumFor(userId), wallet.balance_gold);
});

test('AC-01: 서로 다른 참조 사건 ID(다른 브라우저)로 동시에 들어온 서로 다른 지급은 둘 다 성공하고 원장 합계가 잔액과 일치한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac01b');
    const results = await Promise.allSettled([
        economyService.grantReward({ userId, amount: 100, referenceEventId: `x-${userId}` }),
        economyService.grantReward({ userId, amount: 250, referenceEventId: `y-${userId}` }),
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(wallet.balance_gold, 350);
    assert.equal(await ledgerSumFor(userId), 350);
});

test('AC-02: 같은 참조 사건 ID로 재전송해도 (user_id, reference_event_id) 유일 제약이 중복 지급을 막는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac02');
    const referenceEventId = `retry-${userId}`;
    const first = await economyService.grantReward({ userId, amount: 100, referenceEventId });
    const second = await economyService.grantReward({ userId, amount: 100, referenceEventId });

    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.equal(second.ledgerEntry.id, first.ledgerEntry.id);

    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(wallet.balance_gold, 100);
});

test('AC-02(R-IMPL): 같은 계정이 같은 참조 사건 ID를 다른 금액으로 재전송하면 실제 유일 인덱스 위에서도 이전 결과를 노출하지 않고 거부된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac02c');
    const referenceEventId = `mismatch-${userId}`;
    const first = await economyService.grantReward({ userId, amount: 100, referenceEventId });
    assert.equal(first.idempotent, false);

    await assert.rejects(
        () => economyService.grantReward({ userId, amount: 999, referenceEventId }),
        (error) => error.status === 409 && error.code === 'REFERENCE_EVENT_CONFLICT' && !JSON.stringify(error).includes('999'),
    );

    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(wallet.balance_gold, 100, '거부된 재사용 시도가 실제로 추가 지급을 일으키면 안 된다');
});

test('AC-02(R-IMPL): 동시에 들어온 같은 참조 사건 ID 재시도는 실제 행 잠금 아래에서도 하나만 처리되고 나머지는 같은 커밋 결과를 돌려받는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac02d');
    const referenceEventId = `concurrent-${userId}`;
    const results = await Promise.all([
        economyService.grantReward({ userId, amount: 500, referenceEventId }),
        economyService.grantReward({ userId, amount: 500, referenceEventId }),
        economyService.grantReward({ userId, amount: 500, referenceEventId }),
    ]);

    assert.equal(results.filter((r) => r.idempotent === false).length, 1);
    assert.equal(results.filter((r) => r.idempotent === true).length, 2);
    const ids = new Set(results.map((r) => r.ledgerEntry.id));
    assert.equal(ids.size, 1, '모든 응답이 같은 원장 행을 가리켜야 한다');

    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(wallet.balance_gold, 500, '동시 재시도가 중복 지급을 일으키면 안 된다');
});

test('AC-02(R-IMPL): 지갑 갱신 뒤 원장 기록에서 실제 쓰기 실패가 나면 실제 트랜잭션이 잔액을 롤백한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac02e');
    await economyService.grantReward({ userId, amount: 1000, referenceEventId: `seed-${userId}` });
    const walletBefore = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(walletBefore.balance_gold, 1000);

    const original = db.EconomyLedgerEntry.create;
    let calls = 0;
    db.EconomyLedgerEntry.create = function patched(...args) {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error('시뮬레이션된 DB 쓰기 실패'));
        return original.apply(this, args);
    };
    t.after(() => { db.EconomyLedgerEntry.create = original; });

    await assert.rejects(
        () => economyService.purchaseItem({ userId, itemId: 'profile-border-남작', referenceEventId: `rollback-${userId}` }),
        /시뮬레이션된 DB 쓰기 실패/,
    );

    const walletAfter = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(walletAfter.balance_gold, 1000, '실제 DB 트랜잭션이 롤백되어 지갑 잔액이 원래대로 남아야 한다');
    const owned = await db.sequelize.models.EconomyEntitlement.findOne({ where: { user_id: userId, item_id: 'profile-border-남작' } });
    assert.equal(owned, null, '롤백된 트랜잭션은 소유권도 남기면 안 된다');
});

test('AC-02/AC-06(R-IMPL): 서로 다른 계정이 같은 참조 사건 ID 문자열을 제출해도 실제 DB에서 서로 독립적으로 처리된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userA = await createLocalUser('ac06a');
    const userB = await createLocalUser('ac06b');
    const sharedReferenceEventId = 'shared-across-real-accounts';

    const resultA = await economyService.grantReward({ userId: userA, amount: 100, referenceEventId: sharedReferenceEventId });
    const resultB = await economyService.grantReward({ userId: userB, amount: 300, referenceEventId: sharedReferenceEventId });

    assert.equal(resultA.idempotent, false);
    assert.equal(resultB.idempotent, false);
    assert.notEqual(resultA.ledgerEntry.id, resultB.ledgerEntry.id);

    const walletA = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userA } });
    const walletB = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userB } });
    assert.equal(walletA.balance_gold, 100);
    assert.equal(walletB.balance_gold, 300);

    const rows = await db.EconomyLedgerEntry.findAll({ where: { reference_event_id: sharedReferenceEventId } });
    assert.equal(rows.length, 2, '같은 참조 사건 ID 문자열이 계정별로 각각 한 행씩, 총 두 행 존재해야 한다');
});

const BASIC_EMOTICON_IDS = [
    'emoji-basic-reject', 'emoji-basic-tears', 'emoji-basic-anger', 'emoji-basic-love',
    'emoji-basic-grin', 'emoji-basic-hello', 'emoji-basic-surrender', 'emoji-basic-dizzy',
];

test('AC-03: 실제 DB에서도 기본 프로필 16종 + 평민 테두리 1종이 중복 없이 지급되고 GOLD·DIAMOND 잔액은 0/0으로 시작한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac03');
    const summary = await economyService.getWalletSummary(userId);

    assert.equal(summary.entitlements.length, 25);
    assert.equal(new Set(summary.entitlements.map((e) => e.itemId)).size, 25);
    assert.deepEqual(
        summary.entitlements.filter((e) => e.itemType === 'EMOTICON').map((e) => e.itemId).sort(),
        BASIC_EMOTICON_IDS.slice().sort(),
        '신규 계정은 기본 이모티콘 8종만 받아야 한다',
    );
    assert.equal(summary.balanceGold, 0);
    assert.equal(summary.balanceDiamond, 0);
});

test('AC-03(R-IMPL): 실제 DB에서도 지갑 조회 없이 곧바로 기본 프로필을 장착하면 자동으로 기본 지급된 뒤 성공한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac03eq');
    const { DEFAULT_PROFILE_PHOTO_ID } = require('../../services/economy/catalog');

    const loadout = await economyService.equipItem({ userId, slot: 'PROFILE_PHOTO', itemId: DEFAULT_PROFILE_PHOTO_ID });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID);

    const owned = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId } });
    assert.equal(owned.length, 25, '장착이 트리거한 자동 기본 지급으로 25종을 모두 보유해야 한다');
});

const REQ_INFO = { ip: '127.0.0.1', userAgent: 'f08-integration' };

test('AC-03(CODEX-2): authService.signup 직후 — 지갑/장착 조회를 한 번도 거치지 않아도 기본 지급이 이미 끝나 있다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const uuid = crypto.randomUUID();
    const nickname = `sgn${uuid.slice(0, 5)}`.slice(0, 8);
    const email = `signup-${uuid}@example.com`;
    const { signupProof } = await prepareSignupProof(email);
    const user = await authService.signup({
        email,
        password: 'correct-horse-battery-1',
        passwordConfirm: 'correct-horse-battery-1',
        nickname,
        birthDate: '2000-01-01',
        signupProof,
    });

    const { DEFAULT_PROFILE_PHOTO_ID, DEFAULT_PROFILE_BORDER_ID } = require('../../services/economy/catalog');
    const owned = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: user.uuid } });
    assert.equal(owned.length, 25, '가입 트랜잭션이 커밋된 시점에 이미 25종(프로필 16 + 테두리 1 + 기본 이모티콘 8)을 보유해야 한다');
    assert.equal(new Set(owned.map((row) => row.item_id)).size, 25, '중복 지급이 없어야 한다');

    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: user.uuid } });
    assert.ok(wallet, '가입과 동시에 지갑 행도 만들어져 있어야 한다');
    assert.equal(wallet.balance_gold, 0);
    assert.equal(wallet.balance_diamond, 0);

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: user.uuid } });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID);
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID);
});

test('AC-03(CODEX-2): socialAuthService.completeSocialSignup 직후 — 지갑/장착 조회 없이도 기본 지급이 이미 끝나 있다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const browserFingerprint = `fp-${crypto.randomUUID()}`;
    const { state } = await socialAuthService.issueOAuthState({ purpose: 'login', browserFingerprint });
    const email = `social-${crypto.randomUUID()}@example.com`;
    const callback = await socialAuthService.handleOAuthCallback({
        provider: 'google', subject: `google-sub-${crypto.randomUUID()}`, email,
        rawState: state, browserFingerprint, reqInfo: REQ_INFO,
    });
    assert.equal(callback.status, 'SIGNUP_REQUIRED');

    const signup = await socialAuthService.completeSocialSignup({
        intentToken: callback.intentToken, nickname: '소셜기본닉', birthDate: '1995-05-05', reqInfo: REQ_INFO,
    });

    const owned = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: signup.user.uuid } });
    assert.equal(owned.length, 25, '소셜 가입 완료 트랜잭션이 커밋된 시점에 이미 기본 지급이 끝나 있어야 한다');

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: signup.user.uuid } });
    const { DEFAULT_PROFILE_PHOTO_ID, DEFAULT_PROFILE_BORDER_ID } = require('../../services/economy/catalog');
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID);
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID);
});

test('AC-03(CODEX-2)/AC-04(F-31a): 가입 트랜잭션 실패는 기본 지급·증명 소비까지 함께 롤백하고, 같은 증명으로 재시도하면 성공한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const uuid = crypto.randomUUID();
    const nickname = `rb${uuid.slice(0, 6)}`.slice(0, 8);
    const email = `rollback-${uuid}@example.com`;
    const { signupProof } = await prepareSignupProof(email);

    const models = db.sequelize.models;
    const originalCreate = models.EconomyEntitlement.create;
    let createCount = 0;
    models.EconomyEntitlement.create = function patched(...args) {
        createCount += 1;
        if (createCount === 16) return Promise.reject(new Error('시뮬레이션된 지급 실패'));
        return originalCreate.apply(this, args);
    };
    t.after(() => { models.EconomyEntitlement.create = originalCreate; });

    await assert.rejects(
        authService.signup({
            email,
            password: 'correct-horse-battery-1',
            passwordConfirm: 'correct-horse-battery-1',
            nickname,
            birthDate: '2000-01-01',
            signupProof,
        }),
        /시뮬레이션된 지급 실패/,
    );

    const userRow = await db.User.findOne({ where: { nickname } });
    assert.equal(userRow, null, '기본 지급이 실패하면 계정 생성 자체도 롤백되어 반쪽 계정이 남으면 안 된다(통계는 users의 자식이라 함께 사라진다)');

    const [[verificationRow]] = await db.sequelize.query(
        'SELECT proof_consumed_at FROM signup_email_verifications WHERE email = :email AND purpose = :purpose',
        { replacements: { email, purpose: 'SIGNUP' } },
    );
    assert.ok(verificationRow, '인증 행 자체는 남아 있어야 한다(발송·확인은 별도 트랜잭션으로 이미 커밋됨)');
    assert.equal(verificationRow.proof_consumed_at, null, '실패한 가입 트랜잭션이 증명 소비를 커밋하면 안 된다');

    models.EconomyEntitlement.create = originalCreate;
    const retried = await authService.signup({
        email,
        password: 'correct-horse-battery-1',
        passwordConfirm: 'correct-horse-battery-1',
        nickname,
        birthDate: '2000-01-01',
        signupProof,
    });
    const owned = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: retried.uuid } });
    assert.equal(owned.length, 25, '재시도가 성공하면 기본 지급 25종(프로필 16 + 테두리 1 + 기본 이모티콘 8)이 모두 있어야 한다');
});

test('AC-03(CODEX-2): 기존 계정 백필(backfillDefaultEntitlements) — 가입 훅 없이 만들어진 계정도 지갑/장착 조회 없이 지급된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('backfill');
    const preOwned = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId } });
    assert.equal(preOwned.length, 0, '백필 전에는 기본 지급을 전혀 받지 않은 상태여야 한다');

    const result = await backfillDefaultEntitlements({ db, batchSize: 50 });
    assert.ok(result.processed >= 1);
    assert.deepEqual(result.failures, []);

    const owned = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId } });
    assert.equal(owned.length, 25, '백필 이후에는 지갑/장착 조회 없이도 25종(프로필 16 + 테두리 1 + 기본 이모티콘 8)을 보유해야 한다');
    const ownedIds = new Set(owned.map((row) => row.item_id));
    for (const emoticonId of BASIC_EMOTICON_IDS) {
        assert.ok(ownedIds.has(emoticonId), `백필된 기존 계정은 기본 이모티콘 ${emoticonId}를 보유해야 한다`);
    }
    const ledgerAfterBackfill = await db.EconomyLedgerEntry.count({ where: { user_id: userId } });

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    const { DEFAULT_PROFILE_PHOTO_ID, DEFAULT_PROFILE_BORDER_ID } = require('../../services/economy/catalog');
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID);
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID);

    const result2 = await backfillDefaultEntitlements({ db, batchSize: 50 });
    assert.deepEqual(result2.failures, []);
    const ownedAfterRerun = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId } });
    assert.equal(ownedAfterRerun.length, 25, '재실행이 중복 지급을 만들면 안 된다');
    assert.equal(await db.EconomyLedgerEntry.count({ where: { user_id: userId } }), ledgerAfterBackfill, '재실행이 새 원장을 만들면 안 된다');
});

test('F-08 요구사항: DIAMOND 지급은 실제 DB에서도 balance_diamond만 바꾸고 GOLD와 독립적으로 원장에 남는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('diamond');
    await economyService.grantReward({ userId, amount: 500, reason: 'TEST_SEED', referenceEventId: `gold-${userId}` });
    await economyService.grantReward({ userId, amount: 20, currency: CURRENCIES.DIAMOND, referenceEventId: `diamond-${userId}` });

    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(wallet.balance_gold, 500);
    assert.equal(wallet.balance_diamond, 20);

    const diamondRows = await db.EconomyLedgerEntry.findAll({ where: { user_id: userId, currency: CURRENCIES.DIAMOND } });
    assert.equal(diamondRows.length, 1);
    assert.equal(diamondRows[0].balance_after, 20);
});

test('0006-add-economy는 재실행해도 기존 데이터를 보존한다(rerun-safe)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('rerun');
    await economyService.grantReward({ userId, amount: 777, referenceEventId: `preserve-${userId}` });

    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(applied, [], '이미 적용된 마이그레이션은 재적용되면 안 된다');

    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(wallet.balance_gold, 777, '재실행 후에도 기존 지갑 데이터가 보존되어야 한다');
});
