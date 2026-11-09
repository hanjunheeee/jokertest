'use strict';

// 금지어 경로 처리 파일, 요청 모양 검사 한 번 → 금지어 서비스 → 응답
// bannedWords.routes.js가 붙임 (GET 목록 · POST 넣기 · PATCH 켜고 끄기), 응답 모양은 경계.md 2-5
const { createError } = require('../../utils/appError');
const manage = require('../services/bannedWords/manage');

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

// 몸에 정한 칸만 있는지 (모르는 칸이면 그 이름으로 400)
const readBody = (body, allowed) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
    const unknown = Object.keys(body).find((key) => !allowed.includes(key));
    if (unknown) throw invalid(unknown);
    return body;
};

// 양의 정수 글자 → 수 (예: '12' → 12, 'x'·'0' → null)
const positiveInt = (value) => (/^[1-9]\d{0,15}$/.test(String(value)) ? Number(value) : null);

const readListQuery = (query = {}) => {
    const out = {};
    if (query.q !== undefined && query.q !== '') {
        if (typeof query.q !== 'string' || query.q.length > 100) throw invalid('q');
        out.q = query.q;
    }
    if (query.active !== undefined && query.active !== '') {
        if (query.active !== 'true' && query.active !== 'false') throw invalid('active');
        out.active = query.active === 'true';
    }
    if (query.before !== undefined && query.before !== '') {
        out.before = positiveInt(query.before);
        if (!out.before) throw invalid('before');
    }
    if (query.limit !== undefined && query.limit !== '') {
        out.limit = positiveInt(query.limit);
        if (!out.limit || out.limit > 50) throw invalid('limit');
    }
    return out;
};

// GET /admin-api/banned-words → { ok, items, nextBefore }
exports.list = async (req, res) => {
    const input = readListQuery(req.query);
    res.json({ ok: true, ...(await manage.listWords(input)) });
};

// POST /admin-api/banned-words { word } → 201 { ok, word, nodes, partial }
exports.add = async (req, res) => {
    const { word } = readBody(req.body, ['word']);
    const text = typeof word === 'string' ? word.trim() : '';
    if (text.length < 1 || text.length > 100) throw invalid('word');
    res.status(201).json({ ok: true, ...(await manage.addWord({ req, word: text })) });
};

// PATCH /admin-api/banned-words/:id { isActive } → { ok, word, nodes, partial }
exports.toggle = async (req, res) => {
    const id = positiveInt(req.params?.id);
    if (!id) throw invalid('id');
    const { isActive } = readBody(req.body, ['isActive']);
    if (typeof isActive !== 'boolean') throw invalid('isActive');
    res.json({ ok: true, ...(await manage.toggleWord({ req, id, isActive })) });
};
