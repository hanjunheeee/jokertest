'use strict';

// 환불 서비스 파일, 지급된 충전 주문을 환불됨으로 + 준 다이아를 장부로 되돌림 + 관리자 기록 (한 트랜잭션)
// payments.controller.js가 부름, 결제 회사 쪽 취소는 결제 회사 화면에서 (여기선 결제 회사를 안 부름 → 잠근 채 바깥 호출 없음)
const { createError } = require('../../../utils/appError');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const { applyLedgerTransaction, ensureWalletRow } = require('../../../services/economy/ledger');
const { CURRENCIES } = require('../../../services/economy/constants');
const { ORDER_STATUS } = require('../../../services/economy/topup/constants');
const { economyModels } = require('../../../repositories/economy/models');
const walletRepository = require('../../../repositories/economy/wallet');
const topupOrderRepository = require('../../../repositories/economy/topupOrder');

const defaultDb = () => require('../../../repositories/common/db');

const REFUND_REASON = 'TOPUP_REFUND';
const referenceOf = (orderId) => `refund:${orderId}`;

const orderNotFound = () => createError('주문을 찾을 수 없어요.', 404, 'ORDER_NOT_FOUND');

const notRefundable = (status) => {
    const error = createError('지급이 끝난 주문만 환불할 수 있어요.', 409, 'ORDER_NOT_REFUNDABLE');
    error.details = { status };
    return error;
};

// 이미 쓴 다이아라 모자라면 멈춤 (마이너스로 안 만듦)
const balanceShort = (balance, needed) => {
    const error = createError(`다이아가 모자라 환불을 멈췄어요. 지금 ${balance}, 되돌릴 양 ${needed}`, 409, 'REFUND_BALANCE_SHORT');
    error.details = { balance, needed };
    return error;
};

// 환불 → { order:{ orderId, status:'REFUNDED' }, ledgerEntry:{ amount, balanceAfter } }
// 순서(설계 7장): 주문 줄 잠금 → 지급됨 확인 → 지갑 잠금·다이아 ≥ 되돌릴 양 → 장부(바깥 트랜잭션) → 환불됨 → 기록
// 같은 주문 동시 환불 둘: 늦은 쪽은 주문 잠금에서 기다렸다가 REFUNDED를 보고 409 → 장부는 한 줄
const refundOrder = async ({ req, orderId, reason }, { db = defaultDb() } = {}) => db.sequelize.transaction(async (transaction) => {
    const order = await topupOrderRepository.lockOrder(db, orderId, transaction);
    if (!order) throw orderNotFound();
    if (order.status !== ORDER_STATUS.GRANTED) throw notRefundable(order.status);

    const userId = order.user_id;
    const needed = order.grant_amount + order.bonus_amount;
    // 지급 때와 같은 잠금 순서(주문 → 지갑) → 게임 서버 지급과 엇갈려 막히지 않음
    await ensureWalletRow(db, userId, transaction);
    const wallet = await walletRepository.lockWallet(economyModels(db), userId, transaction);
    const balance = Number(wallet.balance_diamond);
    if (balance < needed) throw balanceShort(balance, needed);

    // 여기부터 진짜 바뀜: 장부 한 줄(다이아 음수) → 주문 환불됨 → 기록
    const { ledgerEntry } = await applyLedgerTransaction(db, {
        userId,
        reason: REFUND_REASON,
        currency: CURRENCIES.DIAMOND,
        amount: -needed,
        referenceEventId: referenceOf(orderId),
    }, { transaction });
    await topupOrderRepository.saveOrder(order, { status: ORDER_STATUS.REFUNDED }, transaction);
    const balanceAfter = Number(ledgerEntry.balance_after);
    await audit.record({
        req,
        action: AUDIT_ACTIONS.REFUND,
        targetType: 'order',
        targetId: orderId,
        before: { status: ORDER_STATUS.GRANTED, userId, diamond: balance },
        after: { status: ORDER_STATUS.REFUNDED, userId, diamond: balanceAfter, amount: -needed, ledgerEntryId: Number(ledgerEntry.id) },
        reason,
    }, { transaction, db });

    return {
        order: { orderId, status: ORDER_STATUS.REFUNDED },
        ledgerEntry: { id: Number(ledgerEntry.id), amount: -needed, balanceAfter },
    };
});

module.exports = { REFUND_REASON, referenceOf, refundOrder };
