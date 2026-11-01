'use strict';

// 주문 잡기 파일, 확인할 주문을 잠그고 잠금 표(lease) 붙이기 · 풀기
// 확인 흐름이 부름
const crypto = require('crypto');
const { createError } = require('../../../utils/appError');
const { orderModel, logDeferred, nowOf, orderNotFound, notOwner, leaseMsOf } = require('./helpers');
const { ORDER_STATUS, TERMINAL_FAILURE_STATUSES } = require('./constants');

// 내 잠금 표일 때만 풀기
const releaseLease = async (db, orderId, leaseToken) => {
    try {
        await orderModel(db).update(
            { lease_token: null, lease_expires_at: null },
            { where: { order_id: orderId, lease_token: leaseToken, status: ORDER_STATUS.CONFIRMING } },
        );
    } catch (error) {
        logDeferred('임대 반납 실패', orderId, error);
    }
};

// 주인·상태·금액 확인 뒤 잠금 표 붙임 (다른 요청이 잡고 있으면 진행 중)
const claimOrder = async (db, adapter, deps, { userId, orderId, paymentKey = null, amount = null }) => {
    const now = nowOf(deps);
    return db.sequelize.transaction(async (t) => {
        const order = await orderModel(db).findOne({
            where: { order_id: orderId }, transaction: t, lock: t.LOCK.UPDATE,
        });
        if (!order) throw orderNotFound();
        if (order.user_id !== userId) throw notOwner();
        if (amount !== null && amount !== order.pay_amount) {
            throw createError('결제 금액이 주문과 다릅니다.', 400, 'AMOUNT_MISMATCH');
        }
        if (paymentKey !== null && order.payment_key && order.payment_key !== paymentKey) {
            throw createError('이 주문에 이미 다른 결제키가 연결되어 있습니다.', 409, 'PAYMENT_KEY_MISMATCH');
        }

        if (order.status === ORDER_STATUS.GRANTED) return { kind: 'GRANTED', order };
        if (TERMINAL_FAILURE_STATUSES.has(order.status)) return { kind: 'TERMINAL', order };
        if (order.status === ORDER_STATUS.PENDING_GRANT) return { kind: 'PENDING_GRANT', order };

        const effectiveKey = paymentKey ?? order.payment_key;
        if (order.status === ORDER_STATUS.CREATED && !effectiveKey) return { kind: 'IDLE', order };

        const leaseValid = order.status === ORDER_STATUS.CONFIRMING
            && order.lease_token
            && order.lease_expires_at
            && new Date(order.lease_expires_at) > now;
        if (leaseValid) return { kind: 'BUSY', order };

        adapter.assertConfigured();

        if (!order.payment_key) {
            const holder = await orderModel(db).findOne({
                where: { payment_key: effectiveKey }, transaction: t,
            });
            if (holder && holder.order_id !== order.order_id) {
                throw createError('이 결제키는 다른 주문에서 사용 중입니다.', 409, 'PAYMENT_KEY_CONFLICT');
            }
        }

        const mode = order.status === ORDER_STATUS.CONFIRMING ? 'recover' : 'first';
        const leaseToken = crypto.randomUUID();
        try {
            await order.update({
                payment_key: effectiveKey,
                status: ORDER_STATUS.CONFIRMING,
                lease_token: leaseToken,
                lease_expires_at: new Date(now.getTime() + leaseMsOf(deps)),
            }, { transaction: t });
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                throw createError('이 결제키는 다른 주문에서 사용 중입니다.', 409, 'PAYMENT_KEY_CONFLICT');
            }
            throw error;
        }
        return { kind: 'CLAIMED', order, leaseToken, mode };
    });
};

module.exports = {
    releaseLease,
    claimOrder,
};
