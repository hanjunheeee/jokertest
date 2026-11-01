'use strict';

// 충전 확인 파일, 잡은 주문 처리 · 확인 요청 전체 흐름
// economy 경로 확인 요청이 부름
const { createError } = require('../../../utils/appError');
const { askProvider, paymentMatchesOrder, persistProviderResult } = require('./provider');
const { releaseLease, claimOrder } = require('./claim');
const { ORDER_STATUS, FAILURE_STATUS_BY_OUTCOME, SAFE_LOG_CODE, ORDER_ID_PATTERN, PAYMENT_KEY_PATTERN, FAILURE_STATUSES } = require('./constants');
const { tryGrant, loadGrantedBalance } = require('./grant');
const { dbOf, adapterOf, expectString, orderNotFound, paymentFailed, processingError } = require('./helpers');

// 결제사 확인 → 결과 저장 → 지급, 응답 유실이면 다음 요청이 복구
const processClaimed = async (db, adapter, deps, claimed) => {
    const { order, leaseToken, mode } = claimed;

    let result;
    try {
        result = await askProvider(adapter, order, mode);
    } catch (error) {
        await releaseLease(db, order.order_id, leaseToken);
        throw error;
    }

    let nextStatus;
    let failureCode = null;
    if (result.ok) {
        if (paymentMatchesOrder(result.payment, order)) {
            nextStatus = ORDER_STATUS.PENDING_GRANT;
        } else {
            nextStatus = ORDER_STATUS.FAILED;
            failureCode = 'PAYMENT_MISMATCH';
        }
    } else if (FAILURE_STATUS_BY_OUTCOME[result.outcome]) {
        nextStatus = FAILURE_STATUS_BY_OUTCOME[result.outcome];
        failureCode = typeof result.code === 'string' && SAFE_LOG_CODE.test(result.code) ? result.code : 'PAYMENT_FAILED';
    } else {
        await releaseLease(db, order.order_id, leaseToken);
        return { status: ORDER_STATUS.CONFIRMING };
    }

    let persisted;
    try {
        persisted = await persistProviderResult(db, deps, { order, leaseToken, nextStatus, failureCode });
    } catch (error) {
        await releaseLease(db, order.order_id, leaseToken);
        throw error;
    }
    if (persisted.lost) return { status: ORDER_STATUS.CONFIRMING };
    if (nextStatus !== ORDER_STATUS.PENDING_GRANT) return { status: nextStatus };

    return tryGrant(db, deps, order.order_id);
};

// 값 모양 확인 → 주문 잡기 → 처리, 이미 끝난 주문은 그 결과 그대로
const confirmTopupOrder = async ({ userId, orderId, paymentKey, amount }, deps = {}) => {
    const db = dbOf(deps);
    const adapter = adapterOf(deps);
    expectString(orderId, ORDER_ID_PATTERN, orderNotFound);
    expectString(paymentKey, PAYMENT_KEY_PATTERN, () => createError('paymentKey가 올바르지 않습니다.', 400, 'INVALID_TOPUP_CONFIRM_REQUEST'));
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw createError('amount가 올바르지 않습니다.', 400, 'INVALID_TOPUP_CONFIRM_REQUEST');
    }

    const decision = await claimOrder(db, adapter, deps, { userId, orderId, paymentKey, amount });
    let outcome;
    switch (decision.kind) {
        case 'GRANTED':
            return { status: ORDER_STATUS.GRANTED, balanceDiamond: await loadGrantedBalance(db, decision.order) };
        case 'TERMINAL':
            throw paymentFailed();
        case 'BUSY':
            throw processingError();
        case 'PENDING_GRANT':
            outcome = await tryGrant(db, deps, orderId);
            break;
        case 'CLAIMED':
            outcome = await processClaimed(db, adapter, deps, decision);
            break;
        default:
            throw processingError();
    }

    if (outcome.status === ORDER_STATUS.GRANTED) {
        return { status: ORDER_STATUS.GRANTED, balanceDiamond: outcome.balanceDiamond };
    }
    if (outcome.status === ORDER_STATUS.PENDING_GRANT) return { status: ORDER_STATUS.PENDING_GRANT };
    if (FAILURE_STATUSES.has(outcome.status)) throw paymentFailed();
    throw processingError();
};

module.exports = {
    processClaimed,
    confirmTopupOrder,
};
