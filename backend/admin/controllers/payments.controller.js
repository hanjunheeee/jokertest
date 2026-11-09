'use strict';

// 결제·환불 경로 처리 파일, 요청 모양 검사 한 번 → 주문 보기·환불 서비스 → 응답
// payments.routes.js가 붙임 (GET 주문 찾기 · GET 주문 하나 · POST 환불), 응답 모양은 경계.md 2-6
const { createError } = require('../../utils/appError');
const { ORDER_STATUS, ORDER_ID_PATTERN } = require('../../services/economy/topup/constants');
const orders = require('../services/payments/list');
const { refundOrder } = require('../services/payments/refund');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = Object.values(ORDER_STATUS);
const REASON_MAX = 200;

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

const reasonRequired = () => {
    const error = createError('사유를 1~200자로 적어 주세요.', 400, 'REASON_REQUIRED');
    error.details = { field: 'reason' };
    return error;
};

const readBody = (body, allowed) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
    const unknown = Object.keys(body).find((key) => !allowed.includes(key));
    if (unknown) throw invalid(unknown);
    return body;
};

// 비었으면 undefined, 있으면 검사 (예: ('', check) → undefined)
const optional = (value, read) => (value === undefined || value === '' ? undefined : read(value));

// 날짜 글자 → Date (예: '2026-11-10T00:00:00.000Z', 'x' → 400)
const readDate = (field) => (value) => {
    const date = new Date(String(value));
    if (typeof value !== 'string' || Number.isNaN(date.getTime())) throw invalid(field);
    return date;
};

const readOrderId = (value) => {
    if (typeof value !== 'string' || !ORDER_ID_PATTERN.test(value)) throw invalid('orderId');
    return value;
};

const readListQuery = (query = {}) => ({
    userUuid: optional(query.userUuid, (value) => {
        if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw invalid('userUuid');
        return value.toLowerCase();
    }),
    status: optional(query.status, (value) => {
        if (!STATUSES.includes(value)) throw invalid('status');
        return value;
    }),
    from: optional(query.from, readDate('from')),
    to: optional(query.to, readDate('to')),
    before: optional(query.before, (value) => {
        if (typeof value !== 'string' || !ORDER_ID_PATTERN.test(value)) throw invalid('before');
        return value;
    }),
    limit: optional(query.limit, (value) => {
        const limit = /^[1-9]\d?$/.test(String(value)) ? Number(value) : 0;
        if (limit < 1 || limit > 50) throw invalid('limit');
        return limit;
    }),
});

// 빈 칸은 빼고 넘김 (서비스 기본값이 먹게)
const withoutEmpty = (input) => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

// GET /admin-api/payments/orders → { ok, items, nextBefore }
exports.list = async (req, res) => {
    res.json({ ok: true, ...(await orders.listOrders(withoutEmpty(readListQuery(req.query)))) });
};

// GET /admin-api/payments/orders/:orderId → { ok, order, ledger }
exports.detail = async (req, res) => {
    res.json({ ok: true, ...(await orders.getOrder({ orderId: readOrderId(req.params?.orderId) })) });
};

// POST /admin-api/payments/orders/:orderId/refund { reason } → { ok, order, ledgerEntry }
exports.refund = async (req, res) => {
    const orderId = readOrderId(req.params?.orderId);
    const body = readBody(req.body, ['reason']);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 1 || reason.length > REASON_MAX) throw reasonRequired();
    res.json({ ok: true, ...(await refundOrder({ req, orderId, reason })) });
};
