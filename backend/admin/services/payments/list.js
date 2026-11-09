'use strict';

// 결제 주문 보기 서비스 파일, 충전 주문 찾기(회원·상태·기간, 50줄씩) · 주문 하나 + 그 주문 장부 줄
// payments.controller.js가 부름, 읽기만 (관리자 조회 줄 + 시간 제한)
const { createError } = require('../../../utils/appError');
const queryQueue = require('../core/queryQueue');

const defaultDb = () => require('../../../repositories/common/db');

const isoOf = (value) => (value ? new Date(value).toISOString() : null);

const ORDER_COLUMNS = `o.order_id, o.user_id, u.nickname, o.product_id, o.version, o.order_name, o.pay_amount, o.grant_amount,
    o.bonus_amount, o.status, o.failure_code, o.created_at, o.approved_at, o.granted_at`;

// 주문 한 줄 → 화면 모양 (예: { order_id:'o1', pay_amount:1100 } → { orderId:'o1', payAmount:1100, … })
const toOrderView = (row) => ({
    orderId: row.order_id,
    user: { uuid: row.user_id, nickname: row.nickname ?? null },
    productId: row.product_id,
    version: Number(row.version),
    orderName: row.order_name,
    payAmount: Number(row.pay_amount),
    grantAmount: Number(row.grant_amount),
    bonusAmount: Number(row.bonus_amount),
    status: row.status,
    failureCode: row.failure_code ?? null,
    createdAt: isoOf(row.created_at),
    approvedAt: isoOf(row.approved_at),
    grantedAt: isoOf(row.granted_at),
});

const select = (db, sql, replacements) => db.sequelize.query(queryQueue.withTimeoutHint(sql), {
    replacements, type: db.Sequelize.QueryTypes.SELECT,
});

// 커서 줄의 만든 시각은 SQL 안에서 바로 읽음 (시각을 JS로 꺼냈다 다시 넣으면 시간대가 어긋날 수 있음)
const CURSOR_AT = '(SELECT c.created_at FROM economy_topup_orders c WHERE c.order_id = :cursorId)';

// 찾기 조건 → WHERE 조각 (커서는 만든 시각 → 주문 id 순, 같은 시각 주문도 안 빠지게)
const buildWhere = ({ userUuid, status, from, to }, cursorId) => {
    const where = [];
    const replacements = {};
    if (userUuid) { where.push('o.user_id = :userUuid'); replacements.userUuid = userUuid; }
    if (status) { where.push('o.status = :status'); replacements.status = status; }
    if (from) { where.push('o.created_at >= :from'); replacements.from = from; }
    if (to) { where.push('o.created_at < :to'); replacements.to = to; }
    if (cursorId) {
        where.push(`(o.created_at < ${CURSOR_AT} OR (o.created_at = ${CURSOR_AT} AND o.order_id < :cursorId))`);
        replacements.cursorId = cursorId;
    }
    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', replacements };
};

// 주문 찾기 → { items, nextBefore } (nextBefore = 마지막 주문 id, null이면 끝)
const listOrders = async ({ userUuid, status, from, to, before, limit = 50 }, { db = defaultDb() } = {}) => queryQueue.run(async () => {
    const { clause, replacements } = buildWhere({ userUuid, status, from, to }, before);
    const rows = await select(db, `SELECT ${ORDER_COLUMNS} FROM economy_topup_orders o LEFT JOIN users u ON u.uuid = o.user_id
        ${clause} ORDER BY o.created_at DESC, o.order_id DESC LIMIT :limit`, { ...replacements, limit: limit + 1 });
    const items = rows.slice(0, limit).map(toOrderView);
    return { items, nextBefore: rows.length > limit ? items[items.length - 1].orderId : null };
});

// 주문 하나 → { order, ledger } (장부는 이 주문 지급 topup:<id> · 환불 refund:<id> 줄)
const getOrder = async ({ orderId }, { db = defaultDb() } = {}) => queryQueue.run(async () => {
    const [row] = await select(db, `SELECT ${ORDER_COLUMNS} FROM economy_topup_orders o LEFT JOIN users u ON u.uuid = o.user_id
        WHERE o.order_id = :orderId`, { orderId });
    if (!row) throw createError('주문을 찾을 수 없어요.', 404, 'ORDER_NOT_FOUND');
    const ledger = await select(db, `SELECT id, reason, currency, amount, balance_after, reference_event_id, created_at
        FROM economy_ledger_entries WHERE user_id = :userId AND reference_event_id IN (:references) ORDER BY id ASC`, {
        userId: row.user_id, references: [`topup:${orderId}`, `refund:${orderId}`],
    });
    return {
        order: toOrderView(row),
        ledger: ledger.map((entry) => ({
            id: Number(entry.id),
            reason: entry.reason,
            currency: entry.currency,
            amount: Number(entry.amount),
            balanceAfter: Number(entry.balance_after),
            referenceEventId: entry.reference_event_id,
            createdAt: isoOf(entry.created_at),
        })),
    };
});

module.exports = { listOrders, getOrder, toOrderView };
