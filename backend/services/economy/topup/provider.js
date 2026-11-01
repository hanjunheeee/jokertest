'use strict';

// 결제사 확인 파일, 결제사 묻기 · 결제가 주문과 맞나 · 결과 저장
// topup/confirm.js가 잡은 주문마다 부름
const { nowOf } = require('./helpers');
const topupOrderRepository = require('../../../repositories/economy/topupOrder');
const { withTransaction } = require('../../../repositories/common');
const { ORDER_STATUS } = require('./constants');

// 처음이면 승인, 복구면 조회 (값은 주문 행 값만 씀)
const askProvider = async (adapter, order, mode) => {
    const request = { paymentKey: order.payment_key, orderId: order.order_id, amount: order.pay_amount };
    let result;
    // 처음: 승인, 이미 처리된 결제라 하면 조회로 그 결과 받음
    if (mode === 'first') {
        result = await adapter.confirmPayment(request);
        if (!result.ok && result.outcome === 'REJECTED' && result.code === 'ALREADY_PROCESSED_PAYMENT') {
            result = await adapter.getPayment({ paymentKey: request.paymentKey });
        }
    } else {
        // 복구: 조회, 아직 진행 중이면 승인 다시 보냄 (앞 승인이 안 닿은 경우)
        result = await adapter.getPayment({ paymentKey: request.paymentKey });
        if (!result.ok && result.outcome === 'PENDING' && result.payment?.providerStatus === 'IN_PROGRESS') {
            result = await adapter.confirmPayment(request);
        }
    }
    return result;
};

// 주문 id·결제 키·금액·KRW 다 같아야 함 (다른 결제로 지급 막기)
const paymentMatchesOrder = (payment, order) => Boolean(payment)
    && payment.orderId === order.order_id
    && payment.paymentKey === order.payment_key
    && payment.totalAmount === order.pay_amount
    && payment.currency === 'KRW';

// 내 잠금 표일 때만 결과 상태 저장
const persistProviderResult = async (db, deps, { order, leaseToken, nextStatus, failureCode = null }) => {
    const now = nowOf(deps);
    return withTransaction(db, async (t) => {
        // 그사이 잠금 표 잃었으면 저장 안 함 (다른 요청이 처리 중)
        const current = await topupOrderRepository.lockOrder(db, order.order_id, t);
        if (!current || current.lease_token !== leaseToken || current.status !== ORDER_STATUS.CONFIRMING) {
            return { lost: true };
        }
        // 여기부터 진짜 바뀜: 결과 상태 저장·잠금 표 비움 (지급 대기면 승인 시각)
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
