'use strict';

// 처리 이력 경로 처리 파일, 거르기 값 검사 한 번 → 이력 읽기 서비스 → 목록 응답
// auditLogs.routes.js가 붙임 (GET /admin-api/audit-logs · GET /admin-api/admins), 응답 모양은 경계.md 1-4
const { createError } = require('../../utils/appError');
const { listAuditLogs, listAdmins } = require('../services/auditLogs/list');

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const KINDS = ['all', 'announce', 'sanction'];
const FIELDS = ['kind', 'memberUuid', 'adminId', 'from', 'to', 'before', 'limit'];
const LIMIT_MAX = 50;

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

// 빈 글자는 안 준 것으로 봄
const given = (value) => value !== undefined && value !== '';

const readUuid = (query, field) => {
    if (!given(query[field])) return null;
    if (typeof query[field] !== 'string' || !UUID_PATTERN.test(query[field])) throw invalid(field);
    return query[field];
};

// ISO 시각 글자 → Date (예: '2026-11-09T15:00:00.000Z')
const readTime = (query, field) => {
    if (!given(query[field])) return null;
    const value = query[field];
    const time = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : null;
    if (!time || Number.isNaN(time.getTime())) throw invalid(field);
    return time;
};

// 양의 정수 글자 → 수, 범위 밖이면 오류
const readInt = (query, field, max) => {
    if (!given(query[field])) return null;
    const text = String(query[field]);
    const number = /^\d{1,15}$/.test(text) ? Number(text) : NaN;
    if (!Number.isSafeInteger(number) || number < 1 || number > max) throw invalid(field);
    return number;
};

// 거르기 값 검사: 모르는 칸·모양 틀림 → 400 { field }
const readFilters = (query = {}) => {
    const unknown = Object.keys(query).find((key) => !FIELDS.includes(key));
    if (unknown) throw invalid(unknown);
    const kind = given(query.kind) ? query.kind : 'all';
    if (!KINDS.includes(kind)) throw invalid('kind');
    const from = readTime(query, 'from');
    const to = readTime(query, 'to');
    if (from && to && from >= to) throw invalid('to');
    return {
        kind,
        memberUuid: readUuid(query, 'memberUuid'),
        adminId: readUuid(query, 'adminId'),
        from,
        to,
        before: readInt(query, 'before', Number.MAX_SAFE_INTEGER),
        limit: readInt(query, 'limit', LIMIT_MAX) ?? LIMIT_MAX,
    };
};

// GET /admin-api/audit-logs → { ok, items, nextBefore }
exports.list = async (req, res) => {
    const page = await listAuditLogs(readFilters(req.query));
    res.json({ ok: true, ...page });
};

// GET /admin-api/admins → { ok, items:[{ id, loginId }] }
exports.admins = async (req, res) => {
    if (Object.keys(req.query ?? {}).length > 0) throw invalid(Object.keys(req.query)[0]);
    const page = await listAdmins();
    res.json({ ok: true, ...page });
};

exports.readFilters = readFilters;
