'use strict';

// 관리자 문의 경로 처리 파일, 주소·몸 검사 한 번 → 문의 목록·하나 읽기 / 답 달기 서비스 → 응답
// inquiries.routes.js가 붙임 (GET·POST /admin-api/inquiries…), 응답 모양은 경계.md 2-16
const { createError } = require('../../utils/appError');
const { listInquiries, getInquiry } = require('../services/inquiries/list');
const { replyToInquiry } = require('../services/inquiries/reply');

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const STATUSES = ['OPEN', 'ANSWERED'];
const LIST_FIELDS = ['status', 'before', 'limit'];
const REPLY_FIELDS = ['requestId', 'body'];
const LIMIT_MAX = 50;
const BODY_MAX = 2000;

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

// 빈 글자는 안 준 것으로 봄
const given = (value) => value !== undefined && value !== '';

// 양의 정수 글자 → 수, 범위 밖이면 오류
const readInt = (query, field, max) => {
    if (!given(query[field])) return null;
    const text = String(query[field]);
    const number = /^\d{1,15}$/.test(text) ? Number(text) : NaN;
    if (!Number.isSafeInteger(number) || number < 1 || number > max) throw invalid(field);
    return number;
};

// 목록 거르기: 모르는 칸·모양 틀림 → 400 { field }
const readFilters = (query = {}) => {
    const unknown = Object.keys(query).find((key) => !LIST_FIELDS.includes(key));
    if (unknown) throw invalid(unknown);
    const status = given(query.status) ? query.status : null;
    if (status !== null && !STATUSES.includes(status)) throw invalid('status');
    return {
        status,
        before: readInt(query, 'before', Number.MAX_SAFE_INTEGER),
        limit: readInt(query, 'limit', LIMIT_MAX) ?? LIMIT_MAX,
    };
};

// 주소 번호: 양의 정수 아니면 없는 문의와 같은 404
const readId = (raw) => {
    const number = typeof raw === 'string' && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(number)) {
        throw createError('문의를 찾을 수 없어요. 목록에서 다시 골라 주세요.', 404, 'INQUIRY_NOT_FOUND');
    }
    return number;
};

// 답 몸: { requestId(UUID), body(앞뒤 빈칸 뺀 1~2000자) }
const readReply = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
    const unknown = Object.keys(body).find((key) => !REPLY_FIELDS.includes(key));
    if (unknown) throw invalid(unknown);
    if (typeof body.requestId !== 'string' || !UUID_PATTERN.test(body.requestId)) throw invalid('requestId');
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (text.length < 1 || text.length > BODY_MAX) throw invalid('body');
    return { requestId: body.requestId, body: text };
};

// GET /admin-api/inquiries → { ok, items, nextBefore }
exports.list = async (req, res) => {
    const page = await listInquiries(readFilters(req.query));
    res.json({ ok: true, ...page });
};

// GET /admin-api/inquiries/:id → { ok, inquiry, user, replies }
exports.detail = async (req, res) => {
    const found = await getInquiry(readId(req.params.id));
    res.json({ ok: true, ...found });
};

// POST /admin-api/inquiries/:id/replies → 201 { ok, reply, inquiry, notified }
exports.reply = async (req, res) => {
    const inquiryId = readId(req.params.id);
    const input = readReply(req.body);
    const result = await replyToInquiry({ req, inquiryId, ...input });
    res.status(201).json({ ok: true, ...result });
};

exports.readFilters = readFilters;
exports.readReply = readReply;
