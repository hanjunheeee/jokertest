'use strict';

// 관리자 쓰기 요청 확인 빈 자리 (CSRF), 지금은 읽기만 통과·쓰기는 늘 403
// admin/index.js가 로그인 확인 뒤에 붙임, 0-2 단위가 Origin·머리글 확인으로 바꿈 (이름 requireCsrf 그대로)
const { createError } = require('../../utils/appError');

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const requireCsrf = (req, res, next) => {
    if (READ_METHODS.has(req.method)) return next();
    return next(createError('요청을 확인하지 못했어요. 화면을 새로 고친 뒤 다시 해 주세요.', 403, 'ADMIN_CSRF_FAILED'));
};

module.exports = { requireCsrf, READ_METHODS };
