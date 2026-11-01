'use strict';

// 충전 조회 파일, 주문 하나 · 열린 주문 목록
// 조회 때 지급 대기면 지급 다시 시도함
const { createError } = require('../../../utils/appError');
const { dbOf, adapterOf, expectString, orderNotFound, orderModel, notOwner, toOrderView } = require('./helpers');
const { ORDER_ID_PATTERN, ORDER_STATUS, OPEN_ORDER_STATUSES, OPEN_ORDER_LIMIT } = require('./constants');
const { tryGrant, loadGrantedBalance } = require('./grant');
const { claimOrder } = require('./claim');
const { processClaimed } = require('./confirm');

// 남의 주문 거절, 확인 중이면 결제사 조회로 복구 시도
const getTopupOrder = async ({ userId, orderId }, deps = {}) => {
    const db = dbOf(deps);
    const adapter = adapterOf(deps);
    expectString(orderId, ORDER_ID_PATTERN, orderNotFound);

    const order = await orderModel(db).findOne({ where: { order_id: orderId } });
    if (!order) throw orderNotFound();
    if (order.user_id !== userId) throw notOwner();

    if (order.status === ORDER_STATUS.PENDING_GRANT) {
        await tryGrant(db, deps, orderId);
    } else if (order.status === ORDER_STATUS.CONFIRMING) {
        try {
            const decision = await claimOrder(db, adapter, deps, { userId, orderId });
            if (decision.kind === 'CLAIMED') await processClaimed(db, adapter, deps, decision);
            else if (decision.kind === 'PENDING_GRANT') await tryGrant(db, deps, orderId);
        } catch (error) {
            if (error?.code !== 'CONFIG_MISSING') throw error;
        }
    }

    const fresh = await orderModel(db).findOne({ where: { order_id: orderId } });
    if (!fresh) throw orderNotFound();
    const balance = fresh.status === ORDER_STATUS.GRANTED ? await loadGrantedBalance(db, fresh) : null;
    return toOrderView(fresh, balance);
};

// 안 끝난 내 주문 최근 것부터 한도까지
const listOpenTopupOrders = async ({ userId }, deps = {}) => {
    if (typeof userId !== 'string' || userId.length === 0) {
        throw createError('로그인이 필요합니다.', 401);
    }
    const db = dbOf(deps);
    const rows = await orderModel(db).findAll({
        where: { user_id: userId, status: OPEN_ORDER_STATUSES },
        order: [['created_at', 'DESC'], ['order_id', 'DESC']],
        limit: OPEN_ORDER_LIMIT,
    });
    return rows.map((row) => ({
        orderId: row.order_id,
        status: row.status,
        amount: row.pay_amount,
        orderName: row.order_name,
        createdAt: row.created_at,
    }));
};

module.exports = {
    getTopupOrder,
    listOpenTopupOrders,
};
