'use strict';

// F-08 지갑·거래·카탈로그·소유권 — 실제 MySQL 격리 DB 검증. f01~f07과 완전히 같은
// 원칙·같은 물리 DB(F01_TEST_DATABASE_URL)를 쓴다.
//
// R-IMPL(2026-09-10, 반송) 대응: 이전 버전은 이 파일 안에서 스스로 "전용 DB 확인"을
// 만들었는데, URL 이름에 f08/economy 문자열이 들어있는지만 정규식으로 보고 실제 연결된
// DATABASE()와 대조하지 않았다 — f01의 승인된 이름·실제 연결 대조를 우회하는 별도
// 안전장치였다. 또한 연결 실패가 아닌 다른 설정 오류까지 조용히 skip으로 삼켰고,
// f01~f07이 쓰지 않는 별도 환경변수(F08_TEST_DATABASE_URL)를 요구해 실제로는 한 번도
// 채워질 수 없었다. 지금은 f05/f07과 완전히 같은 방식으로 F01_TEST_DATABASE_URL +
// backend/tests/helpers/isolatedTestDb.js(승인된 이름 allowlist + 실제 SELECT DATABASE()
// 대조 + 미지 테이블 거부)를 그대로 재사용하고, economy_* 4개 테이블은
// backend/db/migrations/0006-add-economy.js로 관리 목록에 편입한다(더 이상 sync()로
// 임의 생성하지 않는다) — 그래서 f01~f07과 이 파일이 같은 물리 DB를 공유해도 서로의
// 테이블을 "모르는 테이블"로 오판하지 않는다.
//
// backend/service/economy.service.test.js가 인메모리 fake db로 이미 검증한 로직(AC-01
// 잠금 순서, AC-02 재처리 방지·계정 격리, AC-03 기본 지급, AC-04 서버 가격 신뢰, AC-05
// 소유권 검증)은 여기서 다시 처음부터 따지지 않는다. 이 파일의 목적은 그 로직이 실제
// MySQL의 SELECT ... FOR UPDATE 행 잠금·UNIQUE 제약·트랜잭션 롤백 위에서도 그대로
// 성립하는지 확인하는 것이다 — 특히 AC-02/AC-06 재검토 지적(크로스 계정 참조 사건 ID
// 재사용, 같은 계정의 내용 불일치 재사용, 동시 재시도, 쓰기 실패 후 롤백)은 실제 DB의
// 유일 인덱스·행 잠금이 있어야만 "정말 안전한지" 확정할 수 있어 fake db 시험만으로는
// 부족하다.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f08-economy-integration-test-secret';

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
// F-09: economyService.purchaseItem이 이제 economy_purchase_requests에도 쓰므로(공통
// purchaseItems 경로로 리팩터링됨, AC-04) 이 스위트도 그 테이블이 실제로 존재해야 한다.
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const MIGRATIONS = [
    baseline, expandNicknameSnapshot, addRefreshTokenRotation, addRefreshTokenHistory,
    addSocialAuth, addEconomy, addEconomyPurchaseRequests,
];
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests, migrationRunner,
});

let sequelize;
let connectionError = null;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    try {
        await sequelize.authenticate();
    } catch (error) {
        connectionError = error;
    }
});

test.after(async () => {
    if (sequelize) await sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    if (connectionError) {
        t.skip(`격리 DB(${TEST_DB_URL.replace(/:[^:@]*@/, ':***@')})에 연결할 수 없습니다 — 미검증: ${connectionError.message}`);
        return true;
    }
    return false;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

// require 캐시 싱글턴이라, 파일 맨 위에서 맞춰둔 process.env.DATABASE_URL
// (F01_TEST_DATABASE_URL)로 처음 require되는 이 시점에 격리 DB에 연결된다 — 실제
// 프로덕션 경로(economyService → backend/models)를 그대로 태운다(A-04).
const db = require('../../models');
const economyService = require('../../service/economy.service');
const { CURRENCIES } = economyService;
const { hashPassword } = require('../../utils/hash');
// CODEX-2(AC-03) 대응: 신규 로컬 가입(authService.signup)·소셜 가입 완료
// (socialAuthService.completeSocialSignup)·기존 계정 백필(backfillEconomy)이 지갑/장착
// GET·POST를 한 번도 거치지 않고도 실제로 기본 지급을 끝내는지 검증한다("lazy grant on
// wallet/equip is NOT signup/backfill" — 지연 지급은 가입·이관을 대신하지 못한다).
const authService = require('../../service/auth.service');
const socialAuthService = require('../../service/socialAuth.service');
const { backfillDefaultEntitlements } = require('../../db/backfillEconomy');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const setUp = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
};

// NICKNAME_MAX_LENGTH(signupValidation.js)는 8자다 — 이 파일은 db.User.create로 직접
// 계정을 만들어 그 검증을 거치지 않지만, 실제로 가입 가능한 값을 쓰는 편이 픽스처를
// 신뢰할 수 있게 한다(R-IMPL: "valid signup fixture nickname <=8").
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

// ── AC-01: 실제 행 잠금 아래 동시 구매 무결성 ────────────────────────────────

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

// ── AC-02: 재처리 방지 키(같은 계정) ─────────────────────────────────────────

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

    // 실제 Sequelize 모델의 create를 한 번만 실패하도록 몽키패치해, "지갑 UPDATE는
    // 커밋 전 상태지만 원장 INSERT가 실패하는" 시나리오를 실제 DB 트랜잭션 위에서
    // 재현한다 — 트랜잭션 콜백이 던지면 Sequelize가 실제 ROLLBACK을 실행해야 한다.
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

// ── AC-06: 크로스 계정 참조 사건 ID 격리(실제 유일 인덱스) ────────────────────

test('AC-02/AC-06(R-IMPL): 서로 다른 계정이 같은 참조 사건 ID 문자열을 제출해도 실제 DB에서 서로 독립적으로 처리된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userA = await createLocalUser('ac06a');
    const userB = await createLocalUser('ac06b');
    const sharedReferenceEventId = 'shared-across-real-accounts';

    const resultA = await economyService.grantReward({ userId: userA, amount: 100, referenceEventId: sharedReferenceEventId });
    // 이전 버전(전역 유일 제약 + 전역 조회)이라면 userB의 요청은 userA의 원장 행을 찾아
    // 그대로 돌려줬거나(계정 간 정보 노출), 전역 유일 인덱스에 걸려 예외를 던졌을 것이다.
    // 지금은 (user_id, reference_event_id) 복합 유일 인덱스라 완전히 독립적으로 성공해야
    // 한다.
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

// ── AC-03: 기본 지급(실제 DB) ────────────────────────────────────────────────

test('AC-03: 실제 DB에서도 기본 프로필 16종 + 평민 테두리 1종이 중복 없이 지급되고 GOLD·DIAMOND 잔액은 0/0으로 시작한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac03');
    const summary = await economyService.getWalletSummary(userId);

    assert.equal(summary.entitlements.length, 17);
    assert.equal(new Set(summary.entitlements.map((e) => e.itemId)).size, 17);
    assert.equal(summary.balanceGold, 0);
    assert.equal(summary.balanceDiamond, 0);
});

// R-IMPL(2026-09-10, AC-03 재검토): 이전에는 기본 지급이 getWalletSummary(지갑/소유품
// 조회 GET) 경로에서만 보장됐다 — 그 GET을 한 번도 거치지 않고(신규 가입 직후 상점을
// 열지 않은 클라이언트, 또는 별도 가입 훅 없이 이관된 기존 계정의 첫 접근) 곧바로 기본
// 프로필을 장착하려 하면 실제 MySQL에서도 ITEM_NOT_OWNED로 잘못 거부됐는지가 이 시험의
// 핵심이다 — economyService.equipItem이 내부에서 ensureDefaultEntitlements를 먼저
// 보장하는지 실제 DB 위에서 확인한다.
test('AC-03(R-IMPL): 실제 DB에서도 지갑 조회 없이 곧바로 기본 프로필을 장착하면 자동으로 기본 지급된 뒤 성공한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('ac03eq');
    const { DEFAULT_PROFILE_PHOTO_ID } = require('../../economy/catalog');

    const loadout = await economyService.equipItem({ userId, slot: 'PROFILE_PHOTO', itemId: DEFAULT_PROFILE_PHOTO_ID });
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID);

    const owned = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId } });
    assert.equal(owned.length, 17, '장착이 트리거한 자동 기본 지급으로 17종을 모두 보유해야 한다');
});

// ── AC-03(CODEX-2): 신규 가입/소셜 가입 완료/기존 계정 백필 — wallet·equip 조회 이전 ──
// 이전 지적: "ensureDefaultEntitlements는 조회·장착 시 지연 지급하므로 직전 지적의 신규
// 가입·기존 계정 이관 시 17종 보유 및 기본 선택 보장 연결 근거는 여전히 없다." 아래
// 테스트들은 economyService.getWalletSummary/equipItem을 단 한 번도 호출하지 않고,
// authService.signup/socialAuthService.completeSocialSignup/backfillDefaultEntitlements가
// 실제 DB 트랜잭션 위에서 직접 그 근거를 남기는지만 확인한다.

const REQ_INFO = { ip: '127.0.0.1', userAgent: 'f08-integration' };

test('AC-03(CODEX-2): authService.signup 직후 — 지갑/장착 조회를 한 번도 거치지 않아도 기본 지급이 이미 끝나 있다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const uuid = crypto.randomUUID();
    const nickname = `sgn${uuid.slice(0, 5)}`.slice(0, 8);
    const user = await authService.signup({
        email: `signup-${uuid}@example.com`,
        password: 'correct-horse-battery-1',
        passwordConfirm: 'correct-horse-battery-1',
        nickname,
        birthDate: '2000-01-01',
    });

    const { DEFAULT_PROFILE_PHOTO_ID, DEFAULT_PROFILE_BORDER_ID } = require('../../economy/catalog');
    const owned = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: user.uuid } });
    assert.equal(owned.length, 17, '가입 트랜잭션이 커밋된 시점에 이미 기본 프로필 16종 + 평민 테두리 1종을 보유해야 한다');
    assert.equal(new Set(owned.map((row) => row.item_id)).size, 17, '중복 지급이 없어야 한다');

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
    assert.equal(owned.length, 17, '소셜 가입 완료 트랜잭션이 커밋된 시점에 이미 기본 지급이 끝나 있어야 한다');

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: signup.user.uuid } });
    const { DEFAULT_PROFILE_PHOTO_ID, DEFAULT_PROFILE_BORDER_ID } = require('../../economy/catalog');
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID);
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID);
});

test('AC-03(CODEX-2): 가입 트랜잭션 실패는 기본 지급까지 함께 롤백한다(부분 계정 방지)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const uuid = crypto.randomUUID();
    const nickname = `rb${uuid.slice(0, 6)}`.slice(0, 8);

    // ensureDefaultEntitlements 안에서 실제로 한 번 지급(itemId 있는 원장 기록)이 성공한
    // 뒤, 그 다음(아직 트랜잭션이 끝나기 전) 단계에서 실패를 주입해 "일부만 지급된 채
    // 커밋되는" 상태가 생기지 않는지 확인한다 — 열여섯 번째 항목에서 실패를 주입해 앞선
    // 열다섯 건은 이미 INSERT된 상태에서 트랜잭션 전체가 롤백되는지를 본다.
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
            email: `rollback-${uuid}@example.com`,
            password: 'correct-horse-battery-1',
            passwordConfirm: 'correct-horse-battery-1',
            nickname,
            birthDate: '2000-01-01',
        }),
        /시뮬레이션된 지급 실패/,
    );

    const userRow = await db.User.findOne({ where: { nickname } });
    assert.equal(userRow, null, '기본 지급이 실패하면 계정 생성 자체도 롤백되어 반쪽 계정이 남으면 안 된다');
});

test('AC-03(CODEX-2): 기존 계정 백필(backfillDefaultEntitlements) — 가입 훅 없이 만들어진 계정도 지갑/장착 조회 없이 지급된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    // createLocalUser는 db.User.create를 직접 호출한다 — authService.signup을 거치지
    // 않으므로 이 슬라이스 이전에 만들어진 "가입 훅을 거친 적 없는 기존 계정"을 그대로
    // 흉내낸다.
    const userId = await createLocalUser('backfill');
    const preOwned = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId } });
    assert.equal(preOwned.length, 0, '백필 전에는 기본 지급을 전혀 받지 않은 상태여야 한다');

    const result = await backfillDefaultEntitlements({ db, batchSize: 50 });
    assert.ok(result.processed >= 1);
    assert.deepEqual(result.failures, []);

    const owned = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId } });
    assert.equal(owned.length, 17, '백필 이후에는 지갑/장착 조회 없이도 기본 프로필 16종 + 평민 테두리 1종을 보유해야 한다');

    const loadout = await db.sequelize.models.EconomyLoadout.findOne({ where: { user_id: userId } });
    const { DEFAULT_PROFILE_PHOTO_ID, DEFAULT_PROFILE_BORDER_ID } = require('../../economy/catalog');
    assert.equal(loadout.selected_profile_photo_id, DEFAULT_PROFILE_PHOTO_ID);
    assert.equal(loadout.selected_profile_border_id, DEFAULT_PROFILE_BORDER_ID);

    // 재실행(체크포인트 재개 흉내) — 멱등이므로 중복 지급되면 안 된다.
    const result2 = await backfillDefaultEntitlements({ db, batchSize: 50 });
    assert.deepEqual(result2.failures, []);
    const ownedAfterRerun = await db.sequelize.models.EconomyEntitlement.findAll({ where: { user_id: userId } });
    assert.equal(ownedAfterRerun.length, 17, '재실행이 중복 지급을 만들면 안 된다');
});

// ── F-08 요구사항: DIAMOND 재화(실제 DB) ─────────────────────────────────────

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

// ── 마이그레이션 재실행 안전성 ────────────────────────────────────────────────

test('0006-add-economy는 재실행해도 기존 데이터를 보존한다(rerun-safe)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('rerun');
    await economyService.grantReward({ userId, amount: 777, referenceEventId: `preserve-${userId}` });

    // 이미 적용된 마이그레이션 목록에 같은 마이그레이션을 다시 적용해도(체크섬 일치)
    // migrationRunner가 skip하고, 기존 economy_* 테이블·데이터는 그대로 남아야 한다.
    const { applied } = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(applied, [], '이미 적용된 마이그레이션은 재적용되면 안 된다');

    const wallet = await db.sequelize.models.EconomyWallet.findOne({ where: { user_id: userId } });
    assert.equal(wallet.balance_gold, 777, '재실행 후에도 기존 지갑 데이터가 보존되어야 한다');
});
