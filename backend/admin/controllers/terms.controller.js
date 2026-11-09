'use strict';

// 약관 경로 처리 파일, 목록 · 새 버전 넣기 (몸 칸 검사는 여기서 한 번)
// terms.routes.js가 붙임, 응답 모양은 경계.md 2-12
const { createError } = require('../../utils/appError');
const versions = require('../services/terms/versions');

const BODY_MAX = 60_000;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const invalidTerms = (field, message = '약관 입력을 다시 확인해 주세요.') => {
    const error = createError(message, 400, 'INVALID_TERMS');
    error.details = { field };
    return error;
};

const trimmed = (value) => (typeof value === 'string' ? value.trim() : value);
const isText = (min, max) => (value) => typeof value === 'string' && value.length >= min && value.length <= max;
const isHttpUrl = (value) => {
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
        return false;
    }
};

// 칸 이름 → 맞는 값인지 (body·url은 null·빈 글자 허용, 둘 중 하나는 있어야 함은 아래에서)
const FIELDS = Object.freeze({
    kind: (value) => versions.TERMS_KINDS.includes(value),
    version: (value) => isText(1, 40)(value) && /^[0-9A-Za-z._-]+$/.test(value),
    title: isText(1, 100),
    body: (value) => value === null || value === '' || isText(1, BODY_MAX)(value),
    url: (value) => value === null || value === '' || (isText(1, 500)(value) && isHttpUrl(value)),
    effectiveAt: (value) => typeof value === 'string' && ISO_PATTERN.test(value) && !Number.isNaN(Date.parse(value)),
    isRequired: (value) => typeof value === 'boolean',
});

// 몸 → 넣을 값, 모르는 칸 400 INVALID_INPUT, 칸 모양·본문 주소 둘 다 없음·시행일 과거 → 400 INVALID_TERMS
const readCreateBody = (body, now = new Date()) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalidTerms('body');
    const unknown = Object.keys(body).find((key) => !Object.hasOwn(FIELDS, key));
    if (unknown) {
        const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
        error.details = { field: unknown };
        throw error;
    }
    const input = Object.fromEntries(Object.keys(FIELDS).map((key) => [key, trimmed(body[key] ?? null)]));
    for (const [field, isValid] of Object.entries(FIELDS)) {
        if (!isValid(input[field])) throw invalidTerms(field);
    }
    if (!input.body && !input.url) throw invalidTerms('body', '본문이나 전문 주소 중 하나는 넣어 주세요.');
    const effectiveAt = new Date(input.effectiveAt);
    if (effectiveAt.getTime() < now.getTime()) throw invalidTerms('effectiveAt', '시행일은 지금보다 뒤로 골라 주세요.');
    return { ...input, body: input.body || null, url: input.url || null, effectiveAt };
};

// GET /admin-api/terms → { ok, items }
exports.listTerms = async (req, res) => {
    res.json({ ok: true, ...(await versions.listTerms()) });
};

// POST /admin-api/terms → 201 { ok, terms }
exports.createTerms = async (req, res) => {
    const input = readCreateBody(req.body);
    res.status(201).json({ ok: true, ...(await versions.createTerms(input, { req })) });
};

exports.readCreateBody = readCreateBody;
