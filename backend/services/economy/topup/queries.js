'use strict';

// 충전 조회 파일, 주문 하나(지급 대기·확인 중이면 복구 시도) · 열린 주문 목록
// topup/index.js 거쳐 controllers/economy/topup.js가 부름
const { createError } = require('../../../utils/appError');
const { dbOf, adapterOf, expectString, orderNotFound, notOwner, toOrderView } = require('./helpers');
const topupOrderRepository = require('../../../repositories/economy/topupOrder');
const { ORDER_ID_PATTERN, ORDER_STATUS, OPEN_ORDER_STATUSES, OPEN_ORDER_LIMIT } = require('./constants');
const { tryGrant, loadGrantedBalance } = require('./grant');
const { claimOrder } = require('./claim');
const { processClaimed } = require('./confirm');

// 남의 주문 거절, 지급 대기·확인 중이면 복구 시도 뒤 최신 상태
const getTopupOrder = async ({ userId, orderId }, deps = {}) => {
    const db = dbOf(deps);
    const adapter = adapterOf(deps);
    // 주문 id 모양 틀리면 404
    expectString(orderId, ORDER_ID_PATTERN, orderNotFound);

    // 없는 주문·남의 주문 거절
    const order = await topupOrderRepository.findOrder(db, orderId);
    if (!order) throw orderNotFound();
    if (order.user_id !== userId) throw notOwner();

    // 지급 대기면 지급 다시 시도
    if (order.status === ORDER_STATUS.PENDING_GRANT) {
        await tryGrant(db, deps, orderId);
    // 확인 중이면 잡아서 결제사에 다시 물음 (응답 놓친 주문 복구)
    } else if (order.status === ORDER_STATUS.CONFIRMING) {
        try {
            const decision = await claimOrder(db, adapter, deps, { userId, orderId });
            if (decision.kind === 'CLAIMED') await processClaimed(db, adapter, deps, decision);
            else if (decision.kind === 'PENDING_GRANT') await tryGrant(db, deps, orderId);
        } catch (error) {
            // 결제 설정 없으면 복구 건너뛰고 지금 상태만
            if (error?.code !== 'CONFIG_MISSING') throw error;
        }
    }

    // 복구 뒤 다시 읽어 최신 상태로
    const fresh = await topupOrderRepository.findOrder(db, orderId);
    if (!fresh) throw orderNotFound();
    const balance = fresh.status === ORDER_STATUS.GRANTED ? await loadGrantedBalance(db, fresh) : null;
    return toOrderView(fresh, balance);
};

// 안 끝난 내 주문 최근 것부터 한도까지
const listOpenTopupOrders = async ({ userId }, deps = {}) => {
    // 로그인 안 했으면 401
    if (typeof userId !== 'string' || userId.length === 0) {
        throw createError('로그인이 필요합니다.', 401);
    }
    const db = dbOf(deps);
    const rows = await topupOrderRepository.listByStatuses(db, { userId, statuses: OPEN_ORDER_STATUSES, limit: OPEN_ORDER_LIMIT });
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
