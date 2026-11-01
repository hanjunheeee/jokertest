'use strict';

// 충전 주문 저장소 파일, 주문 만들기·찾기·잠그기·바꾸기 · 열린 주문 목록 · 지급 장부 행
// 충전 서비스(services/economy/topup)가 부름 (상태 판단은 서비스 몫)
const { orderModel, ledgerModel } = require('./models');

// 주문 한 줄 만들기
const createOrder = (db, row) => orderModel(db).create(row);

// 주문 id로 하나 (잠금 없이)
const findOrder = (db, orderId) => orderModel(db).findOne({ where: { order_id: orderId } });

// 트랜잭션 안에서 주문 잠가 읽기 (동시 확인·지급 막기)
const lockOrder = (db, orderId, transaction) => orderModel(db).findOne({
    where: { order_id: orderId }, transaction, lock: transaction.LOCK.UPDATE,
});

// 그 결제 키를 쓰는 주문 (다른 주문이 이미 쓰는지 확인용)
const findByPaymentKey = (db, paymentKey, transaction) => orderModel(db).findOne({
    where: { payment_key: paymentKey }, transaction,
});

// 내 잠금 표이고 그 상태일 때만 잠금 표 비우기 (그사이 다른 요청이 잡았으면 안 건드림)
const clearLease = (db, { orderId, leaseToken, status }) => orderModel(db).update(
    { lease_token: null, lease_expires_at: null },
    { where: { order_id: orderId, lease_token: leaseToken, status } },
);

// 읽어 둔 주문 행 바꾸기
const saveOrder = (order, patch, transaction) => order.update(patch, { transaction });

// 그 사람 주문 중 상태 목록에 든 것 최근 것부터 한도까지
const listByStatuses = (db, { userId, statuses, limit }) => orderModel(db).findAll({
    where: { user_id: userId, status: statuses },
    order: [['created_at', 'DESC'], ['order_id', 'DESC']],
    limit,
});

// 주문 지급 장부 행 (이미 지급된 주문의 지금 잔액 읽기, 트랜잭션 주면 그 안에서)
const findGrantLedgerEntry = (db, { userId, referenceEventId }, transaction) => ledgerModel(db).findOne({
    where: { user_id: userId, reference_event_id: referenceEventId },
    ...(transaction ? { transaction } : {}),
});

module.exports = {
    createOrder,
    findOrder,
    lockOrder,
    findByPaymentKey,
    clearLease,
    saveOrder,
    listByStatuses,
    findGrantLedgerEntry,
};
