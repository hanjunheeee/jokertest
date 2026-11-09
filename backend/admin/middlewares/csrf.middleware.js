'use strict';

// 관리자 쓰기 요청 확인 미들웨어 (CSRF), Origin = ADMIN_ORIGIN + 머리글 X-Admin-Csrf = 쿠키에서 만든 값 (+ 쿠키 SameSite=Strict)
// admin/index.js가 로그인 확인 뒤에 붙임 (이름 requireCsrf 그대로), 로그인·로그아웃은 Origin만 봄(requireAdminOrigin)
const crypto = require('node:crypto');

const { createError } = require('../../utils/appError');
const { adminOriginOf } = require('../config');
const { SESSION_COOKIE, csrfTokenOf } = require('../services/core/session');

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const csrfFailed = () => createError('요청을 확인하지 못했어요. 화면을 새로 고친 뒤 다시 해 주세요.', 403, 'ADMIN_CSRF_FAILED');

// 길이 달라도 안전하게 같은지 (시간으로 안 새게)
const sameText = (left, right) => {
    const a = Buffer.from(String(left));
    const b = Buffer.from(String(right));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// 관리자 화면 주소에서 온 요청인지 (ADMIN_ORIGIN 없으면 늘 아님)
const isAdminOrigin = (req) => {
    const expected = adminOriginOf();
    const origin = req.get('origin');
    return Boolean(expected && origin) && sameText(origin, expected);
};

// 로그인·로그아웃: Origin만 확인 (CSRF 값은 로그인 뒤에 생김)
const requireAdminOrigin = (req, res, next) => (isAdminOrigin(req) ? next() : next(csrfFailed()));

// 쓰기 전부: Origin + CSRF 머리글, 읽기는 통과
const requireCsrf = (req, res, next) => {
    if (READ_METHODS.has(req.method)) return next();
    const raw = req.cookies?.[SESSION_COOKIE];
    const header = req.get('x-admin-csrf');
    if (!isAdminOrigin(req) || !raw || !header || !sameText(header, csrfTokenOf(raw))) return next(csrfFailed());
    return next();
};

module.exports = { requireCsrf, requireAdminOrigin, READ_METHODS };
