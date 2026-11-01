'use strict';

// 충전 주문 만들기 파일, 상품 버전 확인 뒤 주문 행 만듦
// topup/index.js 거쳐 controllers/economy/topup.js가 부름
const crypto = require('crypto');
const { createError } = require('../../../utils/appError');
const currencyProducts = require('../currencyProducts');
const { dbOf, adapterOf } = require('./helpers');
const topupOrderRepository = require('../../../repositories/economy/topupOrder');
const { ORDER_STATUS } = require('./constants');

// 판매 중 다이아 충전 상품만, 금액은 상품 값 그대로
const createTopupOrder = async ({ userId, productId, version }, deps = {}) => {
    const db = dbOf(deps);
    const adapter = adapterOf(deps);
    // 로그인 안 했으면 401
    if (typeof userId !== 'string' || userId.length === 0) {
        throw createError('로그인이 필요합니다.', 401);
    }

    // 판매 중·버전 맞는 다이아 충전 상품만 (아니면 404·409)
    const product = await currencyProducts.getCurrencyProduct(
        { productId, version, kind: currencyProducts.KINDS.DIAMOND_TOPUP }, db,
    );
    // 결제 설정 없으면 주문 만들기 전에 거절
    const clientKey = adapter.getClientKey();

    // 여기부터 진짜 바뀜: 상품 값 그대로 주문 행 만듦 (만듦 상태)
    const orderId = crypto.randomUUID();
    await topupOrderRepository.createOrder(db, {
        order_id: orderId,
        user_id: userId,
        product_id: product.productId,
        version: product.version,
        pay_amount: product.payAmount,
        grant_amount: product.grantAmount,
        bonus_amount: product.bonusAmount,
        order_name: product.displayName,
        status: ORDER_STATUS.CREATED,
    });

    return { orderId, amount: product.payAmount, orderName: product.displayName, clientKey };
};

module.exports = {
    createTopupOrder,
};
