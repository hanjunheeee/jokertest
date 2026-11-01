'use strict';

// 충전 지급 파일, 지급된 잔액 읽기 · 지급 대기 주문 지급 · 지급 시도
// 확인 흐름·조회 복구가 부름
// 장부 거래·통화는 economy 잎에서 바로 (economy 입구를 부르면 입구 ↔ 충전 순환)
const { applyLedgerTransaction } = require('../ledger');
const { CURRENCIES } = require('../constants');
const { ledgerModel, referenceEventIdOf, nowOf, orderModel, orderNotFound, grantTotalOf, logDeferred } = require('./helpers');
const { ORDER_STATUS } = require('./constants');

// 이미 지급된 주문이면 장부로 지금 잔액
const loadGrantedBalance = async (db, order, transaction) => {
    const entry = await ledgerModel(db).findOne({
        where: { user_id: order.user_id, reference_event_id: referenceEventIdOf(order.order_id) },
        ...(transaction ? { transaction } : {}),
    });
    return entry ? entry.balance_after : null;
};

// 지급 대기 주문을 잠그고 장부 거래로 다이아 지급 (참조 id로 한 번만)
const grantPendingOrder = async (db, deps, orderId) => {
    const now = nowOf(deps);
    return db.sequelize.transaction(async (t) => {
        const order = await orderModel(db).findOne({
            where: { order_id: orderId }, transaction: t, lock: t.LOCK.UPDATE,
        });
        if (!order) throw orderNotFound();
        if (order.status === ORDER_STATUS.GRANTED) {
            return { status: ORDER_STATUS.GRANTED, balanceDiamond: await loadGrantedBalance(db, order, t) };
        }
        if (order.status !== ORDER_STATUS.PENDING_GRANT) return { status: order.status };

        const { ledgerEntry } = await applyLedgerTransaction(db, {
            userId: order.user_id,
            reason: 'DIAMOND_TOPUP',
            currency: CURRENCIES.DIAMOND,
            amount: grantTotalOf(order),
            itemId: null,
            referenceEventId: referenceEventIdOf(order.order_id),
        }, { transaction: t });

        await order.update({ status: ORDER_STATUS.GRANTED, granted_at: now }, { transaction: t });
        return { status: ORDER_STATUS.GRANTED, balanceDiamond: ledgerEntry.balance_after };
    });
};

// 지급 실패해도 던지지 않고 나중에 다시 (로그만)
const tryGrant = async (db, deps, orderId) => {
    try {
        return await grantPendingOrder(db, deps, orderId);
    } catch (error) {
        logDeferred('지급 지연 — PENDING_GRANT 유지', orderId, error);
        return { status: ORDER_STATUS.PENDING_GRANT };
    }
};

module.exports = {
    loadGrantedBalance,
    tryGrant,
};
