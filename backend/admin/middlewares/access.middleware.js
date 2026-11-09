'use strict';

// 클라우드플레어 Access 확인 빈 자리 (문 1), 지금은 막는 쪽: 꺼짐 값(개발·시험만)일 때만 통과, 아니면 403
// admin/index.js가 붙임, 0-2 단위가 표 서명 확인으로 바꿈 (이름 requireAccess 그대로)
const { createError } = require('../../utils/appError');

// 운영이면 off 값을 무시 (설정 실수로 문이 열리지 않게)
const isAccessOff = (env = process.env) => env.ADMIN_ACCESS_MODE === 'off' && env.NODE_ENV !== 'production';

const requireAccess = (req, res, next) => {
    if (isAccessOff()) return next();
    return next(createError('관리자 확인을 먼저 거쳐야 해요.', 403, 'ADMIN_ACCESS_REQUIRED'));
};

module.exports = { requireAccess, isAccessOff };
