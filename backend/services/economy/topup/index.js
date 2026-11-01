'use strict';

// 다이아 충전 입구 파일, 충전 상수·참조 id·주문 만들기/확인/조회 내보냄
// economy/index.js·controllers/economy/topup.js가 부름 (시험이 이 객체 함수 갈아끼움)
const { ORDER_STATUS, OPEN_ORDER_LIMIT, LEASE_MS, ORDER_ID_PATTERN, PAYMENT_KEY_PATTERN } = require('./constants');
const { referenceEventIdOf } = require('./helpers');
const { createTopupOrder } = require('./create');
const { confirmTopupOrder } = require('./confirm');
const { getTopupOrder, listOpenTopupOrders } = require('./queries');

module.exports = {
    ORDER_STATUS,
    OPEN_ORDER_LIMIT,
    LEASE_MS,
    ORDER_ID_PATTERN,
    PAYMENT_KEY_PATTERN,
    referenceEventIdOf,
    createTopupOrder,
    confirmTopupOrder,
    getTopupOrder,
    listOpenTopupOrders,
};
