'use strict';

// 상품 관리 서비스 파일, 다이아·골드 상품 목록 · 만들기 · 고치기(값 바꾸면 version + 1) + 관리자 기록
// products.controller.js가 부름, 값 규칙은 게임 서버 normalize.js와 같게 (어긴 줄은 상점에서 조용히 빠지므로 저장 전에 막음)
const { createError } = require('../../../utils/appError');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const queryQueue = require('../core/queryQueue');
const { MAX_BALANCE } = require('../../../services/economy/constants');
const { ALLOWED_CURRENCY_PAIRS, STATUSES } = require('../../../services/economy/currencyProducts/constants');
const { normalizeProductRow, isNonEmptyString } = require('../../../services/economy/currencyProducts/normalize');
const { productModel } = require('../../../repositories/economy/models');

const defaultDb = () => require('../../../repositories/common/db');

// 주소에 그대로 쓰므로 영문·숫자·-·_ 만 (예: 'diamond-1100')
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// 고칠 수 있는 칸 (id·종류·통화는 주문이 가리키므로 안 바꿈 → 새 상품으로)
const EDITABLE = Object.freeze(['displayName', 'payAmount', 'grantAmount', 'bonusAmount', 'status', 'sortOrder']);

const isPositiveInt = (value) => Number.isSafeInteger(value) && value > 0;
const isNonNegativeInt = (value) => Number.isSafeInteger(value) && value >= 0;

const invalidProduct = (field) => {
    const error = createError('상품 값이 규칙에 맞지 않아요. 표시된 칸을 고쳐 주세요.', 400, 'INVALID_PRODUCT');
    error.details = { field };
    return error;
};

// 표 한 줄(snake) → 화면 모양(camel), valid는 상점에 보일 수 있는 줄인지
const toView = (row) => ({
    productId: row.product_id,
    kind: row.kind,
    displayName: row.display_name,
    payCurrency: row.pay_currency,
    payAmount: Number(row.pay_amount),
    grantCurrency: row.grant_currency,
    grantAmount: Number(row.grant_amount),
    bonusAmount: Number(row.bonus_amount),
    status: row.status,
    sortOrder: Number(row.sort_order),
    version: Number(row.version),
    valid: normalizeProductRow({ ...row, pay_amount: Number(row.pay_amount) }) !== null,
});

// 화면 모양 → 표 한 줄
const toRow = (product) => ({
    product_id: product.productId,
    kind: product.kind,
    display_name: product.displayName,
    pay_currency: product.payCurrency,
    pay_amount: product.payAmount,
    grant_currency: product.grantCurrency,
    grant_amount: product.grantAmount,
    bonus_amount: product.bonusAmount,
    status: product.status,
    sort_order: product.sortOrder,
    version: product.version,
});

// 규칙 어긴 첫 칸 이름 (normalize.js 순서 그대로), 다 맞으면 null
const CHECKS = [
    ['productId', (p) => PRODUCT_ID_PATTERN.test(String(p.productId ?? ''))],
    ['displayName', (p) => isNonEmptyString(p.displayName, 100) && p.displayName.trim().length > 0],
    ['kind', (p) => Object.hasOwn(ALLOWED_CURRENCY_PAIRS, p.kind)],
    ['payCurrency', (p) => ALLOWED_CURRENCY_PAIRS[p.kind].payCurrency === p.payCurrency],
    ['grantCurrency', (p) => ALLOWED_CURRENCY_PAIRS[p.kind].grantCurrency === p.grantCurrency],
    ['payAmount', (p) => isPositiveInt(p.payAmount) && p.payAmount <= MAX_BALANCE],
    ['grantAmount', (p) => isPositiveInt(p.grantAmount)],
    ['bonusAmount', (p) => isNonNegativeInt(p.bonusAmount)],
    ['grantAmount', (p) => p.grantAmount + p.bonusAmount <= MAX_BALANCE],
    ['status', (p) => p.status === STATUSES.ON_SALE || p.status === STATUSES.STOPPED],
    ['sortOrder', (p) => Number.isSafeInteger(p.sortOrder)],
];

// 규칙 검사 → 어기면 400 INVALID_PRODUCT { field }, 마지막으로 게임 서버 검사(normalize)도 통과해야 함
const assertProductRules = (product) => {
    const broken = CHECKS.find(([, ok]) => !ok(product));
    if (broken) throw invalidProduct(broken[0]);
    if (!normalizeProductRow(toRow(product))) throw invalidProduct('product');
};

// 목록: 판매 중·중지 전부, 정렬 순서 → id 순
const listProducts = async ({ db = defaultDb() } = {}) => queryQueue.run(async () => {
    const rows = await db.sequelize.query(queryQueue.withTimeoutHint(`SELECT product_id, kind, display_name, pay_currency, pay_amount,
        grant_currency, grant_amount, bonus_amount, status, sort_order, version FROM economy_currency_products
        ORDER BY sort_order ASC, product_id ASC LIMIT 200`), { type: db.Sequelize.QueryTypes.SELECT });
    return { items: rows.map(toView) };
});

// 만들기 → { product } (통화는 비면 종류에 맞게 채움, 처음 version 1)
const createProduct = async ({ req, input }, { db = defaultDb() } = {}) => {
    const pair = ALLOWED_CURRENCY_PAIRS[input.kind] ?? {};
    const product = {
        payCurrency: pair.payCurrency,
        grantCurrency: pair.grantCurrency,
        bonusAmount: 0,
        status: STATUSES.ON_SALE,
        sortOrder: 0,
        ...input,
        version: 1,
    };
    assertProductRules(product);
    try {
        return await db.sequelize.transaction(async (transaction) => {
            const row = await productModel(db).create(toRow(product), { transaction });
            const view = toView(row.get({ plain: true }));
            await audit.record({
                req, action: AUDIT_ACTIONS.PRODUCT_CREATE, targetType: 'product', targetId: view.productId, after: view,
            }, { transaction, db });
            return { product: view };
        });
    } catch (error) {
        if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
        throw createError('이미 있는 상품 id예요. 다른 id를 써 주세요.', 409, 'PRODUCT_EXISTS');
    }
};

// 고치기 → { product } (version + 1, 화면이 본 version과 다르면 409 → 둘이 동시에 고쳐도 하나만)
// 이미 만든 주문은 그때 값을 복사해 둬서 안 바뀜, 옛 화면 가격 주문은 version이 달라 게임 서버가 거절
const updateProduct = async ({ req, productId, expectedVersion, changes }, { db = defaultDb() } = {}) => db.sequelize.transaction(async (transaction) => {
    const row = await productModel(db).findOne({ where: { product_id: productId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw createError('상품을 찾을 수 없어요.', 404, 'PRODUCT_NOT_FOUND');
    const before = toView(row.get({ plain: true }));
    if (before.version !== expectedVersion) {
        const error = createError('다른 관리자가 먼저 고쳤어요. 새로 불러온 뒤 다시 고쳐 주세요.', 409, 'PRODUCT_VERSION_CONFLICT');
        error.details = { currentVersion: before.version };
        throw error;
    }
    const picked = Object.fromEntries(EDITABLE.filter((key) => changes[key] !== undefined).map((key) => [key, changes[key]]));
    const next = { ...before, ...picked, version: before.version + 1 };
    assertProductRules(next);
    // id는 안 바꿈 (주문이 가리킴)
    const patch = toRow(next);
    delete patch.product_id;
    await row.update(patch, { transaction });
    const after = toView(row.get({ plain: true }));
    await audit.record({
        req, action: AUDIT_ACTIONS.PRODUCT_UPDATE, targetType: 'product', targetId: productId, before, after,
    }, { transaction, db });
    return { product: after };
});

module.exports = {
    EDITABLE,
    PRODUCT_ID_PATTERN,
    assertProductRules,
    listProducts,
    createProduct,
    updateProduct,
};
