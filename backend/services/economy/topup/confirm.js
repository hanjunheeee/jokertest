'use strict';

// 충전 확인 파일, 잡은 주문 처리 · 확인 요청 전체 흐름
// topup/index.js 거쳐 controllers/economy/topup.js가 부름, processClaimed는 topup/queries.js도
const { createError } = require('../../../utils/appError');
const { askProvider, paymentMatchesOrder, persistProviderResult } = require('./provider');
const { releaseLease, claimOrder } = require('./claim');
const { ORDER_STATUS, FAILURE_STATUS_BY_OUTCOME, SAFE_LOG_CODE, ORDER_ID_PATTERN, PAYMENT_KEY_PATTERN, FAILURE_STATUSES } = require('./constants');
const { tryGrant, loadGrantedBalance } = require('./grant');
const { dbOf, adapterOf, expectString, orderNotFound, paymentFailed, processingError } = require('./helpers');

// 결제사 확인 → 결과 저장 → 지급, 응답 유실이면 다음 요청이 복구
const processClaimed = async (db, adapter, deps, claimed) => {
    const { order, leaseToken, mode } = claimed;

    // 결제사 묻다 오류면 잠금 표 풀고 그대로 던짐
    let result;
    try {
        result = await askProvider(adapter, order, mode);
    } catch (error) {
        await releaseLease(db, order.order_id, leaseToken);
        throw error;
    }

    // 결제 됐으면 주문과 맞는지 보고 지급 대기, 안 맞으면 실패
    let nextStatus;
    let failureCode = null;
    if (result.ok) {
        if (paymentMatchesOrder(result.payment, order)) {
            nextStatus = ORDER_STATUS.PENDING_GRANT;
        } else {
            nextStatus = ORDER_STATUS.FAILED;
            failureCode = 'PAYMENT_MISMATCH';
        }
    // 실패 결과면 그 실패 상태 (코드는 모양 맞을 때만)
    } else if (FAILURE_STATUS_BY_OUTCOME[result.outcome]) {
        nextStatus = FAILURE_STATUS_BY_OUTCOME[result.outcome];
        failureCode = typeof result.code === 'string' && SAFE_LOG_CODE.test(result.code) ? result.code : 'PAYMENT_FAILED';
    // 진행 중·모름이면 확인 중 그대로 두고 잠금 표만 풂 (다음 조회가 다시 물음)
    } else {
        await releaseLease(db, order.order_id, leaseToken);
        return { status: ORDER_STATUS.CONFIRMING };
    }

    // 결과 저장 실패면 잠금 표 풀고 던짐
    let persisted;
    try {
        persisted = await persistProviderResult(db, deps, { order, leaseToken, nextStatus, failureCode });
    } catch (error) {
        await releaseLease(db, order.order_id, leaseToken);
        throw error;
    }
    // 잠금 표 잃었으면 확인 중으로 답함 (다른 요청이 마무리)
    if (persisted.lost) return { status: ORDER_STATUS.CONFIRMING };
    if (nextStatus !== ORDER_STATUS.PENDING_GRANT) return { status: nextStatus };

    // 지급 대기면 바로 지급 시도
    return tryGrant(db, deps, order.order_id);
};

// 값 모양 확인 → 주문 잡기 → 처리, 이미 끝난 주문은 그 결과 그대로
const confirmTopupOrder = async ({ userId, orderId, paymentKey, amount }, deps = {}) => {
    const db = dbOf(deps);
    const adapter = adapterOf(deps);
    // 주문 id·결제 키·금액 모양 확인
    expectString(orderId, ORDER_ID_PATTERN, orderNotFound);
    expectString(paymentKey, PAYMENT_KEY_PATTERN, () => createError('paymentKey가 올바르지 않습니다.', 400, 'INVALID_TOPUP_CONFIRM_REQUEST'));
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw createError('amount가 올바르지 않습니다.', 400, 'INVALID_TOPUP_CONFIRM_REQUEST');
    }

    // 잡기 결과마다: 지급됨이면 잔액, 끝난 실패면 402, 남이 잡고 있으면 503
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
        // 남은 경우(IDLE)는 진행 중으로
        default:
            throw processingError();
    }

    // 처리 결과를 응답으로 (지급됨·지급 대기·실패 402·진행 중 503)
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
