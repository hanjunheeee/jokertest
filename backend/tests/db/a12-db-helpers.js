'use strict';

// A12 상점·결제 DB 시험이 같이 쓰는 도우미 파일, 시험 DB 준비 · 사람·상품·쿠폰 만들기 · 경제 경로 시험 서버 · 네 표 사진
// tests/db/a12-*.integration.test.js가 맨 먼저 부름 (models보다 먼저 불러야 시험 DB에 붙음)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳)
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
// 토큰 서명 값이 없을 때만 시험 값 (있는 값은 안 읽고 그대로 씀)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a12-db-test-only-jwt-secret';

const crypto = require('node:crypto');
const assert = require('node:assert/strict');

// 진짜 결제사로 요청이 새지 않게: 이 시험 안 fetch는 내 시험 서버(127.0.0.1·localhost)만 허락
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
    const url = new URL(input?.url ?? String(input));
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        return Promise.reject(new Error(`시험 중 바깥 주소 요청 막음: ${url.hostname}`));
    }
    return realFetch(input, init);
};

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const db = require('../../models');
const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const credentials = require('../../utils/auth/credentials');
const { applyLedgerTransaction, ensureWalletRow } = require('../../services/economy/ledger');
const { startRouterServer } = require('../audit-2026-11-09/securityHttp');
const { createFakeTossAdapter, installFakeAdapter } = require('../helpers/fakeTossAdapter');
const money = require('../admin/helpers/money');

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });
const models = () => db.sequelize.models;
const hex = (n = 4) => crypto.randomBytes(n).toString('hex');

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 with-lock.sh testdb로 돌림');
    return true;
};

// 파일 처음 한 번: 시험 DB 비우고 마이그레이션 끝까지
const prepareDb = async () => {
    if (!TEST_DB_URL) return;
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
};

const closeDb = () => db.sequelize.close();

// ── 사람 ──

// 시험마다 새 사람 (내 시험 줄만 세게 uuid·이메일 머리글자 a12d), role 주면 그 권한
const createUser = async (label = 'u', { role } = {}) => {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: 'not-a-real-hash',
        nickname: `d${hex(3)}`,
        email: `a12d-${label}-${uuid}@example.test`,
        ...(role ? { role } : {}),
    });
    return uuid;
};

// 로그인 쿠키 토큰 (세션 id는 새로, 세션 확인은 서버 쪽에서 통과로 바꿔 끼움)
const tokenOf = (uuid) => credentials.generateToken({ uuid, role: 'USER', sessionId: crypto.randomUUID() });

// ── 시험 서버 ──

// /economy·/user 진짜 라우터 + 진짜 오류 처리기, 로그인 세션 확인만 통과로 (DB 세션 표 없이)
const startServer = async (t) => {
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const economyRouter = require('../../routes/economy.routes');
    const userRouter = require('../../routes/user.routes');
    return startRouterServer(t, [['/economy', economyRouter], ['/user', userRouter]]);
};

// 요청 하나 → { status, body } (uuid 주면 그 사람으로 로그인, ip 주면 그 주소로 보임)
const call = async (base, uuid, method, path, body, { ip, token } = {}) => {
    const headers = { Connection: 'close' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const cookieToken = token ?? (uuid ? tokenOf(uuid) : null);
    if (cookieToken) headers.cookie = `accessToken=${cookieToken}`;
    if (ip) headers['x-forwarded-for'] = ip;
    const res = await fetch(`${base}${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, body: parsed };
};

// 아이템 하나 사기 · 묶음 사기 (참조 번호 안 주면 새로)
const buy = (base, uuid, itemId, referenceEventId = `a12d-${hex()}`) =>
    call(base, uuid, 'POST', '/economy/purchase', { itemId, referenceEventId });
const buyBulk = (base, uuid, itemIds, referenceEventId = `a12d-${hex()}`) =>
    call(base, uuid, 'POST', '/economy/purchases/bulk', { items: itemIds.map((itemId) => ({ itemId })), referenceEventId });

// ── 돈·표 읽기 ──

// 장부로 잔액 넣기 (지갑 직접 안 고침)
const fund = (uuid, currency, amount) => money.fund(uuid, currency, amount);

// 잔액 0 지갑 줄 만들어 두기 (지갑 읽기를 한 번 한 보통 계정처럼, 거절 뒤 "지갑 그대로" 비교용)
const ensureWallet = (uuid) => ensureWalletRow(db, uuid);

// 장부 한 줄 바로 넣기 (판 보상·기본 지급처럼 이 영역 밖에서 생기는 줄 흉내)
const addLedger = (uuid, { reason, currency = 'GOLD', amount, referenceEventId = `a12d:${crypto.randomUUID()}` }) =>
    applyLedgerTransaction(db, { userId: uuid, reason, currency, amount, referenceEventId });

const walletOf = money.walletOf;
const ledgerOf = money.ledgerOf;
const entitlementsOf = (uuid) => models().EconomyEntitlement.findAll({ where: { user_id: uuid }, order: [['id', 'ASC']], raw: true });
const requestsOf = (uuid) => models().EconomyPurchaseRequest.findAll({ where: { user_id: uuid }, order: [['id', 'ASC']], raw: true });
const walletRowOf = (uuid) => models().EconomyWallet.findOne({ where: { user_id: uuid }, raw: true });

// 네 표 사진: 지갑·장부·가진 것·구매 요청 (거절 뒤 하나도 안 바뀌었나 비교용)
const fourTables = async (uuid) => {
    const [wallet, ledger, entitlements, requests] = await Promise.all([
        walletRowOf(uuid), ledgerOf(uuid), entitlementsOf(uuid), requestsOf(uuid),
    ]);
    return { wallet, ledger, entitlements, requests };
};

// 지갑 = 장부 합 (골드·다이아 둘 다, 참조 번호 겹침 없음)
const assertWalletMatchesLedger = money.assertWalletMatchesLedger;

// ── 재화 상품·쿠폰·충전 ──

// 재화 상품 한 줄 (기본은 판매 중 골드 상품: 다이아 10 → 골드 1000)
const createProduct = async (overrides = {}) => {
    const row = {
        product_id: `a12d-${hex(6)}`,
        kind: 'GOLD_PURCHASE',
        display_name: '골드 1000개',
        pay_currency: 'DIAMOND',
        pay_amount: 10,
        grant_currency: 'GOLD',
        grant_amount: 1000,
        bonus_amount: 0,
        status: 'ON_SALE',
        sort_order: 0,
        version: 1,
        ...overrides,
    };
    await models().EconomyCurrencyProduct.create(row);
    return row;
};

// 다이아 충전 상품 (원화 1100 → 다이아 100 + 덤 10)
const createTopupProduct = (overrides = {}) => createProduct({
    kind: 'DIAMOND_TOPUP', display_name: '다이아 110개', pay_currency: 'KRW', pay_amount: 1100,
    grant_currency: 'DIAMOND', grant_amount: 100, bonus_amount: 10, ...overrides,
});

// 쿠폰 한 줄 (코드 머리글자 A12D-, 기본은 골드 100 · 횟수 무제한 · 기간 없음)
const createCoupon = async (overrides = {}) => {
    const row = {
        code: `A12D-${hex(4).toUpperCase()}`,
        reward_type: 'GOLD',
        reward_amount: 100,
        max_uses: null,
        used_count: 0,
        starts_at: null,
        ends_at: null,
        is_active: true,
        ...overrides,
    };
    const created = await db.Coupon.create(row);
    return { ...row, id: created.id };
};

// 가짜 결제사 끼우기 (시험 끝나면 원래대로), tweak 주면 끼우기 전에 가짜 답을 바꿈
const installFakeToss = (t, tweak) => {
    const fake = createFakeTossAdapter();
    if (tweak) tweak(fake);
    return installFakeAdapter(t, fake);
};

// 결제 키 (가짜 결제사 안에서만 쓰는 지어낸 값)
const newPaymentKey = () => `pk_ok_a12d${hex(8)}`;

// 충전 한 번: 주문 만들기 → 가짜 결제사에 결제 등록(시나리오) → 결제 확인 요청 → { orderId, paymentKey, amount, confirm }
const runTopup = async (base, uuid, fake, product, { scenario = 'approve', paymentKey = newPaymentKey() } = {}) => {
    const created = await call(base, uuid, 'POST', '/economy/topup/orders', { productId: product.product_id, version: product.version });
    assert.equal(created.status, 201, `주문 만들기 ${JSON.stringify(created.body)}`);
    const { orderId, amount } = created.body;
    fake.registerPayment(paymentKey, { orderId, amount, scenario });
    const confirm = await call(base, uuid, 'POST', `/economy/topup/orders/${orderId}/confirm`, { paymentKey, amount });
    return { orderId, paymentKey, amount, confirm };
};

const orderOf = (orderId) => models().EconomyTopupOrder.findOne({ where: { order_id: orderId }, raw: true });

// 몇 줄인지 세기 (조건에 맞는 장부 줄)
const countLedger = (uuid, where = {}) => db.EconomyLedgerEntry.count({ where: { user_id: uuid, ...where } });

// 글자 모양 확인 도우미 (오류 코드)
const assertCode = (res, status, code) => {
    assert.equal(res.status, status, `상태 ${res.status} 본문 ${JSON.stringify(res.body)}`);
    assert.equal(res.body?.code, code, `본문 ${JSON.stringify(res.body)}`);
};

module.exports = {
    TEST_DB_URL,
    db,
    models,
    hex,
    noDb,
    prepareDb,
    closeDb,
    createUser,
    tokenOf,
    startServer,
    call,
    buy,
    buyBulk,
    fund,
    ensureWallet,
    addLedger,
    walletOf,
    ledgerOf,
    entitlementsOf,
    requestsOf,
    walletRowOf,
    fourTables,
    assertWalletMatchesLedger,
    createProduct,
    createTopupProduct,
    createCoupon,
    installFakeToss,
    newPaymentKey,
    runTopup,
    orderOf,
    countLedger,
    assertCode,
};
