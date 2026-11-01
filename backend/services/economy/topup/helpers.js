'use strict';

// 충전 도우미 파일, 주입 꺼내기(db·결제사·시각·잠금 시간) · 오류 · 주문 모양 · 로그
// 만들기·잡기·지급·조회가 같이 씀
const { createError } = require('../../../utils/appError');
const { LEASE_MS, SAFE_LOG_CODE, ORDER_STATUS } = require('./constants');

// db 안 넘기면 진짜 models (부를 때 require)
const defaultDb = () => require('../../../models');

// 주입 db 먼저
const dbOf = (deps) => deps.db ?? defaultDb();

// 주입 결제사 먼저, 없으면 토스 (부를 때 require)
const adapterOf = (deps) => deps.adapter ?? require('../../../payments/tossAdapter');

// 주입 시각 함수 먼저
const nowOf = (deps) => (typeof deps.now === 'function' ? deps.now() : new Date());

// 주입 잠금 시간이 양의 정수일 때만
const leaseMsOf = (deps) => (Number.isSafeInteger(deps.leaseMs) && deps.leaseMs > 0 ? deps.leaseMs : LEASE_MS);

// 주문 모델 꺼내기
const orderModel = (db) => db.EconomyTopupOrder ?? db.sequelize.models.EconomyTopupOrder;

// 장부 모델 꺼내기
const ledgerModel = (db) => db.EconomyLedgerEntry ?? db.sequelize.models.EconomyLedgerEntry;

// 주문마다 장부 참조 id (두 번 지급 막기)
const referenceEventIdOf = (orderId) => `topup:${orderId}`;

// 지급 다이아 = 기본 + 보너스
const grantTotalOf = (order) => order.grant_amount + order.bonus_amount;

// 없는 주문 404
const orderNotFound = () => createError('주문을 찾을 수 없습니다.', 404, 'ORDER_NOT_FOUND');

// 남의 주문 403
const notOwner = () => createError('다른 계정의 주문에는 접근할 수 없습니다.', 403, 'NOT_OWNER');

// 확인 진행 중 503 (잠시 뒤 다시 조회)
const processingError = () => createError('결제 확인이 진행 중입니다. 잠시 후 다시 조회하세요.', 503, 'PAYMENT_PROCESSING');

// 결제 안 됨 402
const paymentFailed = () => createError('결제가 완료되지 않았습니다.', 402, 'PAYMENT_FAILED');

// 나중에 처리할 일 로그 (코드 모양 맞을 때만 남김)
const logDeferred = (event, orderId, error) => {
    const code = typeof error?.code === 'string' && SAFE_LOG_CODE.test(error.code) ? error.code : 'UNKNOWN';
    console.warn(`[topup] ${event} order=${orderId} code=${code}`);
};

// 문자열·모양 안 맞으면 그 오류
const expectString = (value, pattern, makeError) => {
    if (typeof value !== 'string' || !pattern.test(value)) throw makeError();
    return value;
};

// 화면에 보낼 주문 모양 (+ 잔액)
const toOrderView = (order, balanceDiamond = null) => ({
    orderId: order.order_id,
    status: order.status,
    amount: order.pay_amount,
    orderName: order.order_name,
    productId: order.product_id,
    version: order.version,
    grantAmount: order.grant_amount,
    bonusAmount: order.bonus_amount,
    balanceDiamond: order.status === ORDER_STATUS.GRANTED ? balanceDiamond : null,
    createdAt: order.created_at,
});

module.exports = {
    dbOf,
    adapterOf,
    nowOf,
    leaseMsOf,
    orderModel,
    ledgerModel,
    referenceEventIdOf,
    grantTotalOf,
    orderNotFound,
    notOwner,
    processingError,
    paymentFailed,
    logDeferred,
    expectString,
    toOrderView,
};
