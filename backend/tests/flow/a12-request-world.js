'use strict';

// A12 요청 시험 판: 경제·팔레트 경로만 붙인 작은 서버 + 로그인 쿠키 + 가짜 DB 끼우기 + 가짜 결제사
// tests/flow/a12-*.test.js가 씀, 진짜 DB·진짜 토스로 요청 안 나감 (결제사는 늘 가짜, 키는 지어낸 글자)

// 모델이 진짜 DB에 못 붙게 맨 먼저 막는 주소로 (모델 require보다 앞)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
// 시험 전용 서명 값 (시험 환경값에 없을 때만, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a12-request-world-test-only';

const jwt = require('jsonwebtoken');

const models = require('../../models');
const userRepository = require('../../repositories/user');
const userService = require('../../services/user');
const { startRouterServer, send, json, withEnv } = require('../audit-2026-11-09/securityHttp');
const { createFakeEconomyDb, seedWallet, goldProductRow } = require('../audit-2026-11-09/fakeEconomyDb');
const { attachCouponTables } = require('../audit-2026-11-09/opsFakes');
const { createFakeTopupDb } = require('../helpers/fakeTopupDb');
const { createFakeTossAdapter, installFakeAdapter, FAKE_CLIENT_KEY } = require('../helpers/fakeTossAdapter');

// 경로 묶음은 한 번만 불러 씀 (쿠폰 횟수 제한 칸도 파일 안에서 하나)
const economyRouter = require('../../routes/economy.routes');
const userRouter = require('../../routes/user.routes');

// 가짜 DB로 바꿔 끼울 models 칸 (서비스가 이 칸들로만 표에 닿음)
const DB_KEYS = ['sequelize', 'EconomyLedgerEntry', 'EconomyCurrencyProduct', 'EconomyTopupOrder', 'Coupon', 'CouponRedemption', 'AchievementGrant'];

// 로그인된 계정 (uuid → 역할), 세션 확인·관리자 확인이 여기서 찾음
const accounts = new Map();
let authInstalled = false;

// 세션 확인·계정 찾기를 메모리로 (DB 안 감), 파일마다 한 번
const installAuth = () => {
    if (authInstalled) return;
    authInstalled = true;
    userRepository.findActiveSession = async (sessionId, uuid) => (
        accounts.has(uuid) && sessionId === `sess-${uuid}`
            ? { is_online: true, refresh_token_expires_at: null, User: { status: 'ACTIVE' } }
            : null
    );
    userRepository.checkActiveBan = async () => null;
    userRepository.markOnlineSessionsOffline = async () => {};
    userService.findByUuid = async (uuid) => (accounts.has(uuid) ? { uuid, role: accounts.get(uuid) } : null);
};

// 로그인한 사람 쿠키 (로그인 때 주는 것과 같은 모양 토큰, 15분)
const login = (uuid, { role = 'USER' } = {}) => {
    installAuth();
    accounts.set(uuid, role);
    const token = jwt.sign({ uuid, sessionId: `sess-${uuid}` }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: 900 });
    return `accessToken=${token}`;
};

// 경제(/economy)·팔레트(/user) 경로 서버, 앞단은 index.js와 같은 순서
const startApp = async (t) => {
    installAuth();
    return startRouterServer(t, [['/economy', economyRouter], ['/user', userRouter]]);
};

// models 칸을 가짜 DB 것으로, 시험 끝에 되돌림
const useDb = (t, fakeDb) => {
    const saved = Object.fromEntries(DB_KEYS.map((key) => [key, models[key]]));
    for (const key of DB_KEYS) models[key] = fakeDb[key];
    t.after(() => Object.assign(models, saved));
    return fakeDb;
};

// 요청 하나 → { status, body, headers, text }
const call = async (base, method, path, { cookie, body, raw } = {}) => json(await send(base, method, path, { cookie, body, raw }));

// ── 아이템·지갑 가짜 DB (지갑·장부·가진 것·장착·구매 요청·팔레트·골드 상품·쿠폰) ──

// 없는 계정 흉내: 지갑 행은 계정을 가리켜서 모르는 계정이면 외래 키 오류
const foreignKeyError = () => Object.assign(new Error('Cannot add or update a child row: a foreign key constraint fails'), {
    name: 'SequelizeForeignKeyConstraintError',
});

const economyDb = (t, { products = [goldProductRow()], coupons = [], knownUsers = null } = {}) => {
    const db = createFakeEconomyDb({ products });
    const couponTables = attachCouponTables(db, coupons);
    if (knownUsers) {
        const wallet = db.sequelize.models.EconomyWallet;
        const create = wallet.create.bind(wallet);
        wallet.create = async (row, options) => {
            if (!knownUsers.has(row.user_id)) throw foreignKeyError();
            return create(row, options);
        };
    }
    useDb(t, db);
    return { db, couponTables };
};

// 가짜 경제 DB 전부를 글자로 (요청 전후 같은지 볼 때)
const economyState = (db) => JSON.stringify({
    wallets: [...db._inspect.wallets.values()].map(({ user_id: u, balance_gold: g, balance_diamond: d }) => [u, g, d]),
    ledger: db._inspect.ledgerEntries,
    entitlements: db._inspect.entitlements,
    loadouts: [...db._inspect.loadouts.entries()],
    requests: db._inspect.purchaseRequests,
    palettes: [...db._inspect.palettes.entries()],
});

// ── 충전 가짜 DB (상품·주문·장부·지갑) ──

// 다이아 충전 상품 행 (DB 칸 이름 그대로, 값은 시험용)
const topupProductRow = (overrides = {}) => ({
    product_id: 'dia-100',
    kind: 'DIAMOND_TOPUP',
    display_name: '다이아 100',
    pay_currency: 'KRW',
    pay_amount: 1100,
    grant_currency: 'DIAMOND',
    grant_amount: 100,
    bonus_amount: 10,
    status: 'ON_SALE',
    sort_order: 1,
    version: 3,
    ...overrides,
});

// 정렬 칸 [[칸, ASC|DESC], …] 대로
const sortBy = (rows, order) => rows.sort((a, b) => {
    for (const [column, direction] of order ?? []) {
        if (a[column] === b[column]) continue;
        const sign = direction === 'DESC' ? -1 : 1;
        return (a[column] < b[column] ? -1 : 1) * sign;
    }
    return 0;
});

// 조건 칸이 배열이면 그 안에 든 것, 아니면 같은 값
const rowMatches = (row, where = {}) => Object.entries(where).every(([key, expected]) => (
    Array.isArray(expected) ? expected.includes(row[key]) : row[key] === expected
));

const topupDb = (t, { products = [topupProductRow()] } = {}) => {
    const db = createFakeTopupDb();
    for (const row of products) db.addProduct(row);
    // 주문 목록 읽기 (공용 가짜에 없어 여기서 붙임, 조건·정렬·개수는 받은 그대로)
    db.EconomyTopupOrder.findAll = async ({ where = {}, order, limit } = {}) => {
        const rows = sortBy(db.orders().filter((row) => rowMatches(row, where)), order);
        return typeof limit === 'number' ? rows.slice(0, limit) : rows;
    };
    useDb(t, db);
    return db;
};

// 주문 한 줄 바로 넣기 (준비용, 값은 상품 행에서 복사)
let seededOrders = 0;
const seedOrder = (db, { userId, status = 'CREATED', product = topupProductRow(), ...rest }) => {
    seededOrders += 1;
    return db.EconomyTopupOrder.create({
        order_id: `a12-order-${String(seededOrders).padStart(4, '0')}`,
        user_id: userId,
        product_id: product.product_id,
        version: product.version,
        pay_amount: product.pay_amount,
        grant_amount: product.grant_amount,
        bonus_amount: product.bonus_amount,
        order_name: product.display_name,
        status,
        ...rest,
    });
};

// 충전 가짜 DB 전부를 글자로 (요청 전후 같은지 볼 때)
const topupState = (db) => JSON.stringify({
    orders: db.orders().map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'update'))),
    ledger: db.ledger(),
});

// 가짜 결제사 끼우기 (진짜 토스 함수 자리에, 시험 끝에 되돌림)
const fakeToss = (t, options) => installFakeAdapter(t, createFakeTossAdapter(options));

// 시험 안에서 겹치지 않는 이름
let seq = 0;
const uid = (prefix) => {
    seq += 1;
    return `${prefix}-${process.pid}-${seq}`;
};

module.exports = {
    login,
    startApp,
    useDb,
    call,
    withEnv,
    economyDb,
    economyState,
    seedWallet,
    goldProductRow,
    topupDb,
    topupProductRow,
    seedOrder,
    topupState,
    fakeToss,
    FAKE_CLIENT_KEY,
    uid,
};
