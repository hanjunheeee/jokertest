'use strict';

// 신고 경로 처리 파일, 요청 모양 검사 한 번 → 신고 서비스 → 응답
// reports.routes.js가 붙임 (목록 · 상세 · 처리(정지) · 기각), 응답 모양은 경계.md 2-1
const { createError } = require('../../utils/appError');
const { listReports, getReport } = require('../services/reports/list');
const { resolveReport, dismissReport } = require('../services/reports/handle');

const STATUSES = Object.freeze(['OPEN', 'RESOLVED', 'DISMISSED']);
const MAX_DAYS = 3650;
const MAX_REASON = 200;
const MAX_MEMO = 500;

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// 정한 칸만 있는지 (모르는 칸이면 그 이름으로 400)
const readBody = (body, allowed, field = 'body') => {
    if (body === undefined && field === 'body') return {};
    if (!isPlainObject(body)) throw invalid(field);
    const unknown = Object.keys(body).find((key) => !allowed.includes(key));
    if (unknown) throw invalid(unknown);
    return body;
};

// 양의 정수 글자 → 수 (예: '12' → 12, 'x'·'0' → null)
const positiveInt = (value) => (/^[1-9]\d{0,15}$/.test(String(value)) ? Number(value) : null);

const readId = (params) => {
    const id = positiveInt(params?.id);
    if (!id) throw invalid('id');
    return id;
};

// 관리자 메모 0~500자 (비면 없음)
const readMemo = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > MAX_MEMO) throw invalid('memo');
    return value.trim() || null;
};

// 정지 사유 1~200자, 비면 400 REASON_REQUIRED (플레이어에게 보이는 사유)
const readReason = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) {
        const error = createError('정지 사유를 적어 주세요.', 400, 'REASON_REQUIRED');
        error.details = { field: 'reason' };
        throw error;
    }
    if (text.length > MAX_REASON) throw invalid('reason');
    return text;
};

// 정지 칸 { kind:'PERIOD', days:7, reason } 또는 { kind:'PERMANENT', reason }
const readBan = (raw) => {
    const ban = readBody(raw, ['kind', 'days', 'reason'], 'ban');
    if (ban.kind === 'PERMANENT') {
        if (ban.days !== undefined) throw invalid('days');
        return { kind: 'PERMANENT', reason: readReason(ban.reason) };
    }
    if (ban.kind !== 'PERIOD') throw invalid('kind');
    if (!Number.isInteger(ban.days) || ban.days < 1 || ban.days > MAX_DAYS) throw invalid('days');
    return { kind: 'PERIOD', days: ban.days, reason: readReason(ban.reason) };
};

const readListQuery = (query = {}) => {
    const out = {};
    if (query.status !== undefined && query.status !== '') {
        if (!STATUSES.includes(query.status)) throw invalid('status');
        out.status = query.status;
    }
    for (const field of ['before', 'limit']) {
        if (query[field] === undefined || query[field] === '') continue;
        out[field] = positiveInt(query[field]);
        if (!out[field] || (field === 'limit' && out[field] > 50)) throw invalid(field);
    }
    return out;
};

// GET /admin-api/reports → { ok, items, nextBefore }
exports.list = async (req, res) => {
    res.json({ ok: true, ...(await listReports(readListQuery(req.query))) });
};

// GET /admin-api/reports/:id → { ok, report, evidence, targetHistory }
exports.detail = async (req, res) => {
    res.json({ ok: true, ...(await getReport({ req, id: readId(req.params) })) });
};

// POST /admin-api/reports/:id/resolve { ban, memo? } → { ok, report, ban, disconnect }
exports.resolve = async (req, res) => {
    const id = readId(req.params);
    const body = readBody(req.body, ['ban', 'memo']);
    const input = { ban: readBan(body.ban), memo: readMemo(body.memo) };
    res.json({ ok: true, ...(await resolveReport({ req, id, ...input })) });
};

// POST /admin-api/reports/:id/dismiss { memo? } → { ok, report }
exports.dismiss = async (req, res) => {
    const id = readId(req.params);
    const body = readBody(req.body, ['memo']);
    res.json({ ok: true, ...(await dismissReport({ req, id, memo: readMemo(body.memo) })) });
};
