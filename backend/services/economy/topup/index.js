'use strict';

// 다이아 충전 입구, 옛 topup.service와 같은 이름만 골라 내보냄
// economy 경로가 이 입구로 부름 (시험이 confirmTopupOrder를 이 객체에서 갈아끼움)
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
