'use strict';

// 열린 방·판 경로 처리 파일, GET /admin-api/live?node= → 주소 칸 검사 → 열린 방·판 서비스 → { ok:true, ... }
// live.routes.js가 붙임, 응답 모양은 경계.md 2-13 (/internal/live와 같음)
const { createError } = require('../../utils/appError');
const summary = require('../services/live/summary');

// Node 이름 모양 (예: n2, node-a)
const NODE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

const readQuery = (query = {}) => {
    const unknown = Object.keys(query).find((key) => key !== 'node');
    if (unknown) throw invalid(unknown);
    if (query.node === undefined || query.node === '') return {};
    if (typeof query.node !== 'string' || !NODE_PATTERN.test(query.node)) throw invalid('node');
    return { node: query.node };
};

exports.getLive = async (req, res) => {
    res.json({ ok: true, ...(await summary.getLive(readQuery(req.query))) });
};
