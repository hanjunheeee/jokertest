'use strict';

// 주문 잡기 파일, 확인할 주문을 잠그고 잠금 표(lease) 붙이기 · 풀기
// topup/confirm.js·topup/queries.js가 부름
const crypto = require('crypto');
const { createError } = require('../../../utils/appError');
const { logDeferred, nowOf, orderNotFound, notOwner, leaseMsOf } = require('./helpers');
const topupOrderRepository = require('../../../repositories/economy/topupOrder');
const { withTransaction, isUniqueConstraintName } = require('../../../repositories/common');
const { ORDER_STATUS, FAILURE_STATUSES } = require('./constants');

// 내 잠금 표일 때만 풀기
const releaseLease = async (db, orderId, leaseToken) => {
    try {
        await topupOrderRepository.clearLease(db, { orderId, leaseToken, status: ORDER_STATUS.CONFIRMING });
    } catch (error) {
        // 풀기 실패는 로그만 (잠금 시간 지나면 다른 요청이 잡음)
        logDeferred('임대 반납 실패', orderId, error);
    }
};

// 주인·상태·금액 확인 뒤 잠금 표 붙임 (다른 요청이 잡고 있으면 진행 중)
const claimOrder = async (db, adapter, deps, { userId, orderId, paymentKey = null, amount = null }) => {
    const now = nowOf(deps);
    return withTransaction(db, async (t) => {
        // 주문 잠그고 없는 주문·남의 주문 거절
        const order = await topupOrderRepository.lockOrder(db, orderId, t);
        if (!order) throw orderNotFound();
        if (order.user_id !== userId) throw notOwner();
        // 금액이 주문과 다르거나 이미 다른 결제 키가 붙었으면 거절
        if (amount !== null && amount !== order.pay_amount) {
            throw createError('결제 금액이 주문과 다릅니다.', 400, 'AMOUNT_MISMATCH');
        }
        if (paymentKey !== null && order.payment_key && order.payment_key !== paymentKey) {
            throw createError('이 주문에 이미 다른 결제키가 연결되어 있습니다.', 409, 'PAYMENT_KEY_MISMATCH');
        }

        // 끝났거나 지급 대기면 잡지 않고 상태만 알림
        if (order.status === ORDER_STATUS.GRANTED) return { kind: 'GRANTED', order };
        if (FAILURE_STATUSES.has(order.status)) return { kind: 'TERMINAL', order };
        if (order.status === ORDER_STATUS.PENDING_GRANT) return { kind: 'PENDING_GRANT', order };

        // 결제 키 아직 없는 새 주문이면 결제사에 물을 게 없음
        const effectiveKey = paymentKey ?? order.payment_key;
        if (order.status === ORDER_STATUS.CREATED && !effectiveKey) return { kind: 'IDLE', order };

        // 다른 요청 잠금 표가 아직 살아 있으면 진행 중
        const leaseValid = order.status === ORDER_STATUS.CONFIRMING
            && order.lease_token
            && order.lease_expires_at
            && new Date(order.lease_expires_at) > now;
        if (leaseValid) return { kind: 'BUSY', order };

        // 결제 설정 없으면 잡기 전에 거절 (트랜잭션 롤백)
        adapter.assertConfigured();

        // 새로 붙일 결제 키가 다른 주문에 이미 쓰였는지
        if (!order.payment_key) {
            const holder = await topupOrderRepository.findByPaymentKey(db, effectiveKey, t);
            if (holder && holder.order_id !== order.order_id) {
                throw createError('이 결제키는 다른 주문에서 사용 중입니다.', 409, 'PAYMENT_KEY_CONFLICT');
            }
        }

        // 확인 중인데 잠금 표 없음·만료면 복구, 새 주문이면 처음
        const mode = order.status === ORDER_STATUS.CONFIRMING ? 'recover' : 'first';
        // 여기부터 진짜 바뀜: 결제 키·확인 중·잠금 표·만료 시각 저장
        const leaseToken = crypto.randomUUID();
        try {
            await topupOrderRepository.saveOrder(order, {
                payment_key: effectiveKey,
                status: ORDER_STATUS.CONFIRMING,
                lease_token: leaseToken,
                lease_expires_at: new Date(now.getTime() + leaseMsOf(deps)),
            }, t);
        } catch (error) {
            // 결제 키 유일 제약에 걸리면 같은 409
            if (isUniqueConstraintName(error)) {
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
