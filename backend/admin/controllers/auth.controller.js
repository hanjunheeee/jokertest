'use strict';

// 관리자 로그인 경로 처리 파일, 요청 모양 검사 → 로그인·세션 서비스 → 응답·쿠키
// auth.routes.js가 붙임 (POST /login · GET /me · POST /logout), 응답 모양은 경계.md 0-2
const { createError } = require('../../utils/appError');
const { getClientIp } = require('../../utils/request');
const { login: loginService } = require('../services/core/login');
const session = require('../services/core/session');
const audit = require('../services/core/audit');
const { AUDIT_ACTIONS } = require('../services/core/auditActions');

const defaultDb = () => require('../../repositories/common/db');

// 로그인 몸 칸: 이름 → 맞는 값인지
const LOGIN_FIELDS = Object.freeze({
    loginId: (value) => typeof value === 'string' && value.length >= 1 && value.length <= 50,
    password: (value) => typeof value === 'string' && value.length >= 1 && value.length <= 200,
    otp: (value) => typeof value === 'string' && /^\d{6}$/.test(value),
});

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

// 모르는 칸·빠진 칸·모양 틀림 → 400 { field }
const readLoginBody = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
    const unknown = Object.keys(body).find((key) => !Object.hasOwn(LOGIN_FIELDS, key));
    if (unknown) throw invalid(unknown);
    for (const [field, isValid] of Object.entries(LOGIN_FIELDS)) {
        if (!isValid(body[field])) throw invalid(field);
    }
    return { loginId: body.loginId, password: body.password, otp: body.otp };
};

const sessionBody = ({ admin, csrfToken, idleExpiresAt }) => ({
    ok: true,
    admin,
    csrfToken,
    idleExpiresAt: new Date(idleExpiresAt).toISOString(),
});

// POST /admin-api/auth/login → { ok, admin, csrfToken, idleExpiresAt } + 쿠키
exports.login = async (req, res) => {
    const input = readLoginBody(req.body);
    const result = await loginService({
        ...input,
        ip: getClientIp(req),
        accessEmail: req.adminAccessEmail ?? null,
        userAgent: req.get('user-agent') ?? null,
    });
    res.cookie(session.SESSION_COOKIE, result.raw, session.cookieOptions());
    res.json(sessionBody(result));
};

// GET /admin-api/auth/me (세션 확인 뒤) → 로그인과 같은 모양
exports.me = (req, res) => {
    const raw = req.cookies[session.SESSION_COOKIE];
    res.json(sessionBody({ admin: req.admin, csrfToken: session.csrfTokenOf(raw), idleExpiresAt: req.adminSession.idleExpiresAt }));
};

// POST /admin-api/auth/logout → { ok:true }, 살아 있던 세션이면 끊고 기록, 쿠키는 늘 지움
exports.logout = async (req, res) => {
    const raw = req.cookies?.[session.SESSION_COOKIE];
    if (raw) {
        const db = defaultDb();
        await db.sequelize.transaction(async (transaction) => {
            const adminId = await session.revokeSession({ raw }, { transaction, db });
            if (!adminId) return;
            await audit.record({ req, adminId, action: AUDIT_ACTIONS.ADMIN_LOGOUT, targetType: 'admin', targetId: adminId }, { transaction, db });
        });
    }
    res.clearCookie(session.SESSION_COOKIE, session.cookieOptions());
    res.json({ ok: true });
};
