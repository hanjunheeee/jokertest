'use strict';

// 클라우드플레어 Access 확인 미들웨어 (문 1), 표 서명 확인 뒤 이메일·IP를 요청에 실음 + 다른 주소 읽기 허락 머리글 지움
// admin/index.js가 /admin-api 맨 앞쪽에 붙임 (이름 requireAccess 그대로), 끄기 값은 개발·시험만
const { createError } = require('../../utils/appError');
const { getClientIp } = require('../../utils/request');
const { isAccessOff } = require('../config');
const { verifyAccessToken } = require('../services/core/accessToken');

const ACCESS_HEADER = 'cf-access-jwt-assertion';

// 플레이어 화면 주소용 CORS 허락이 관리자 응답에 붙지 않게 (같은 주소 관리자 화면만 응답을 읽음)
const CORS_HEADERS = [
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials',
    'Access-Control-Expose-Headers',
];
const dropCorsHeaders = (res) => {
    for (const name of CORS_HEADERS) res.removeHeader(name);
};

// 통과하면 req.adminAccessEmail(소문자, 꺼짐이면 null) · req.adminRequestMeta = { ip, accessEmail }
const requireAccess = async (req, res, next) => {
    dropCorsHeaders(res);
    const ip = getClientIp(req);
    if (isAccessOff()) {
        req.adminAccessEmail = null;
        req.adminRequestMeta = { ip, accessEmail: null };
        return next();
    }
    const token = req.get(ACCESS_HEADER);
    if (!token) return next(createError('관리자 확인을 먼저 거쳐야 해요.', 403, 'ADMIN_ACCESS_REQUIRED'));
    const { email } = await verifyAccessToken(token);
    req.adminAccessEmail = email;
    req.adminRequestMeta = { ip, accessEmail: email };
    return next();
};

module.exports = { requireAccess, isAccessOff };
