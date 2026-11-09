'use strict';

// 관리자 로그인 세션 확인 미들웨어 (문 2), 쿠키 mmc_admin_sid만 읽음 (플레이어 accessToken은 아예 안 봄)
// admin/index.js가 영역 경로 앞에, auth 라우터가 me 앞에 붙임 (이름 requireAdminSession 그대로)
const { createError } = require('../../utils/appError');
const session = require('../services/core/session');

// 통과하면 req.admin = { id, loginId, email } · req.adminSession = { id, idleExpiresAt }
// 자동 새로고침(X-Admin-Background: 1)은 활동으로 안 셈, 끝난 세션이면 쿠키도 지움
const requireAdminSession = async (req, res, next) => {
    const raw = req.cookies?.[session.SESSION_COOKIE];
    if (!raw) return next(createError('로그인이 필요해요.', 401, 'ADMIN_LOGIN_REQUIRED'));
    try {
        const resolved = await session.resolveSession({
            raw,
            background: req.get('x-admin-background') === '1',
            accessEmail: req.adminAccessEmail ?? null,
        });
        req.admin = resolved.admin;
        req.adminSession = { id: resolved.sessionId, idleExpiresAt: resolved.idleExpiresAt };
        return next();
    } catch (error) {
        if (error?.status === 401) res.clearCookie(session.SESSION_COOKIE, session.cookieOptions());
        return next(error);
    }
};

module.exports = { requireAdminSession };
