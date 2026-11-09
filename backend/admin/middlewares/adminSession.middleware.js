'use strict';

// 관리자 로그인 세션 확인 빈 자리 (문 2), 지금은 늘 401 (로그인 기능이 생기기 전엔 아무도 못 들어오게)
// admin/index.js가 영역 경로 앞에 붙임, 0-2 단위가 세션 표 확인으로 바꿈 (이름 requireAdminSession 그대로)
const { createError } = require('../../utils/appError');

const requireAdminSession = (req, res, next) => next(createError('로그인이 필요해요.', 401, 'ADMIN_LOGIN_REQUIRED'));

module.exports = { requireAdminSession };
