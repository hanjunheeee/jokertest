'use strict';

// 결제사 확인 파일, 결제사 묻기 · 결제가 주문과 맞나 · 결과 저장
// 확인 흐름이 잡은 주문마다 부름
const { nowOf } = require('./helpers');
const topupOrderRepository = require('../../../repositories/economy/topupOrder');
const { withTransaction } = require('../../../repositories/common');
const { ORDER_STATUS } = require('./constants');

// 승인 또는 조회, 결제사 오류는 결과 모양으로 바꿈
const askProvider = async (adapter, order, mode) => {
    const request = { paymentKey: order.payment_key, orderId: order.order_id, amount: order.pay_amount };
    let result;
    if (mode === 'first') {
        result = await adapter.confirmPayment(request);
        if (!result.ok && result.outcome === 'REJECTED' && result.code === 'ALREADY_PROCESSED_PAYMENT') {
            result = await adapter.getPayment({ paymentKey: request.paymentKey });
        }
    } else {
        result = await adapter.getPayment({ paymentKey: request.paymentKey });
        if (!result.ok && result.outcome === 'PENDING' && result.payment?.providerStatus === 'IN_PROGRESS') {
            result = await adapter.confirmPayment(request);
        }
    }
    return result;
};

// 주문 id·금액·통화가 다 같아야 함
const paymentMatchesOrder = (payment, order) => Boolean(payment)
    && payment.orderId === order.order_id
    && payment.paymentKey === order.payment_key
    && payment.totalAmount === order.pay_amount
    && payment.currency === 'KRW';

// 내 잠금 표일 때만 결과 상태 저장
const persistProviderResult = async (db, deps, { order, leaseToken, nextStatus, failureCode = null }) => {
    const now = nowOf(deps);
    return withTransaction(db, async (t) => {
        const current = await topupOrderRepository.lockOrder(db, order.order_id, t);
        if (!current || current.lease_token !== leaseToken || current.status !== ORDER_STATUS.CONFIRMING) {
            return { lost: true };
        }
        await topupOrderRepository.saveOrder(current, {
            status: nextStatus,
            lease_token: null,
            lease_expires_at: null,
            failure_code: failureCode,
            ...(nextStatus === ORDER_STATUS.PENDING_GRANT ? { approved_at: now } : {}),
        }, t);
        return { lost: false };
    });
};

module.exports = {
    askProvider,
    paymentMatchesOrder,
    persistProviderResult,
};
