'use strict';

// 관리자 세션 파일, 로그인 세션 만들기·확인·끊기 + 쿠키 모양·CSRF 값 (DB 표 admin_sessions)
// 로그인(login.js)·세션 확인·CSRF 미들웨어·로그아웃·계정 명령이 씀, 쿠키 원문은 DB에 없고 sha256만 저장
const crypto = require('node:crypto');
const { Op } = require('sequelize');

const { createError } = require('../../../utils/appError');
const config = require('../../config');

const SESSION_COOKIE = 'mmc_admin_sid';
const RAW_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// 활동 시각은 1분에 한 번만 고침 (요청마다 DB 쓰기 막기)
const TOUCH_GAP_MS = 60 * 1000;

const defaultDb = () => require('../../../repositories/common/db');

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const idOf = (raw) => sha256(raw);
// 화면이 쓰기 머리글 X-Admin-Csrf에 싣는 값 (쿠키 원문에서 만듦 → 표 저장 없음)
const csrfTokenOf = (raw) => sha256(`csrf:${raw}`);

// 쿠키 설정: JS로 못 읽음·다른 사이트 요청엔 안 실림·운영은 https만
const cookieOptions = (env = process.env) => ({
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: config.isProduction(env),
});

const loginRequired = () => createError('로그인이 필요해요.', 401, 'ADMIN_LOGIN_REQUIRED');
const sessionExpired = () => createError('오래 쓰지 않아 로그아웃됐어요. 다시 로그인해 주세요.', 401, 'ADMIN_SESSION_EXPIRED');

const toDate = (value) => (value instanceof Date ? value : new Date(value));
const idleExpiresAtOf = (lastSeen, expiresAt) => new Date(Math.min(lastSeen.getTime() + config.sessionIdleMs(), expiresAt.getTime()));

// 새 세션 → { raw(쿠키에 넣을 원문), idleExpiresAt }
const createSession = async ({ adminId, accessEmail, ip, userAgent, now = new Date() }, { transaction, db = defaultDb() } = {}) => {
    const raw = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + config.SESSION_MAX_MS);
    await db.AdminSession.create({
        id: idOf(raw),
        admin_id: adminId,
        access_email: accessEmail ?? null,
        ip: ip ?? null,
        user_agent: userAgent ? String(userAgent).slice(0, 255) : null,
        created_at: now,
        last_seen_at: now,
        expires_at: expiresAt,
    }, { transaction });
    return { raw, idleExpiresAt: idleExpiresAtOf(now, expiresAt) };
};

// 쿠키 원문 확인 → { sessionId, admin:{ id, loginId, email }, idleExpiresAt }
// 없음·끊김·비활성 관리자·Access 이메일 다름 → 401 LOGIN_REQUIRED / 가만히 30분·12시간 넘음 → 401 SESSION_EXPIRED
// background(자동 새로고침)면 활동 시각을 안 늘림
const resolveSession = async ({ raw, background = false, accessEmail = null, now = new Date() }, { db = defaultDb() } = {}) => {
    if (typeof raw !== 'string' || !RAW_PATTERN.test(raw)) throw loginRequired();
    const row = await db.AdminSession.findByPk(idOf(raw), { include: [{ model: db.AdminUser }] });
    if (!row || row.revoked_at) throw loginRequired();
    const lastSeen = toDate(row.last_seen_at);
    const expiresAt = toDate(row.expires_at);
    if (now >= expiresAt || now.getTime() - lastSeen.getTime() >= config.sessionIdleMs()) throw sessionExpired();
    const admin = row.AdminUser;
    if (!admin || !admin.is_active) throw loginRequired();
    // 문 1을 다른 사람이 지났으면 이 세션을 못 씀
    if (accessEmail && row.access_email && accessEmail !== row.access_email) throw loginRequired();

    let seen = lastSeen;
    if (!background && now.getTime() - lastSeen.getTime() >= TOUCH_GAP_MS) {
        await db.AdminSession.update({ last_seen_at: now }, { where: { id: row.id, revoked_at: null } });
        seen = now;
    }
    return {
        sessionId: row.id,
        admin: { id: admin.id, loginId: admin.login_id, email: admin.email ?? null },
        idleExpiresAt: idleExpiresAtOf(seen, expiresAt),
    };
};

// 로그아웃: 아직 안 끊긴 세션이면 끊고 관리자 id 돌려줌 (없으면 null)
const revokeSession = async ({ raw, now = new Date() }, { transaction, db = defaultDb() } = {}) => {
    if (typeof raw !== 'string' || !RAW_PATTERN.test(raw)) return null;
    const row = await db.AdminSession.findByPk(idOf(raw), { transaction });
    if (!row || row.revoked_at) return null;
    const [changed] = await db.AdminSession.update(
        { revoked_at: now },
        { where: { id: row.id, revoked_at: null }, transaction },
    );
    return changed > 0 ? row.admin_id : null;
};

// 관리자 한 명 세션 전부 끊기 (비활성·비번·OTP 바꿀 때) → 끊은 수
const revokeAllForAdmin = async (adminId, { now = new Date(), transaction, db = defaultDb() } = {}) => {
    const [changed] = await db.AdminSession.update(
        { revoked_at: now },
        { where: { admin_id: adminId, revoked_at: { [Op.is]: null } }, transaction },
    );
    return changed;
};

module.exports = {
    SESSION_COOKIE,
    cookieOptions,
    csrfTokenOf,
    createSession,
    resolveSession,
    revokeSession,
    revokeAllForAdmin,
};
