'use strict';

// 관리자 로그인 파일 (문 2), 아이디·비번·OTP 한 번에 확인 → 세션 만들기 + 시도·기록 남기기
// auth.controller.js가 POST /admin-api/auth/login에서 부름, 틀리면 어느 칸인지 안 알려 줌
const crypto = require('node:crypto');
const { Op } = require('sequelize');

const { createError } = require('../../../utils/appError');
const { hashPassword, comparePassword } = require('../../../utils/auth/credentials');
const { totpKeyOf } = require('../../config');
const totp = require('./totp');
const secretBox = require('./secretBox');
const loginLock = require('./loginLock');
const session = require('./session');
const audit = require('./audit');
const { AUDIT_ACTIONS } = require('./auditActions');

const defaultDb = () => require('../../../repositories/common/db');

const failed = () => createError('아이디·비밀번호·OTP 번호를 다시 확인해 주세요.', 401, 'ADMIN_LOGIN_FAILED');
const emailMismatch = () => createError('클라우드플레어로 확인한 이메일과 관리자 계정 이메일이 달라요.', 403, 'ADMIN_EMAIL_MISMATCH');
const locked = (retryAfterSec) => {
    const error = createError('로그인 실패가 많아 잠깐 막혔어요. 잠시 뒤 다시 해 주세요.', 429, 'ADMIN_LOGIN_LOCKED');
    error.details = { retryAfterSec };
    return error;
};

// 없는 아이디도 bcrypt 비교 한 번 (걸리는 시간으로 아이디 있는지 안 새게)
let dummyHash = null;
const dummyHashOnce = () => {
    if (!dummyHash) dummyHash = hashPassword(crypto.randomBytes(16).toString('hex'));
    return dummyHash;
};

// 저장된 OTP 비밀 풀어 번호 확인 → 맞은 칸 번호 | null (열쇠·비밀 깨졌으면 null)
const matchedOtpStep = (admin, otp, now) => {
    const key = totpKeyOf();
    if (!key || !admin.totp_secret) return null;
    try {
        const secret = secretBox.open(admin.totp_secret, key);
        return totp.verifyTotp({ secret, code: otp, nowMs: now.getTime(), lastStep: admin.totp_last_step });
    } catch {
        console.warn('[ADMIN] OTP 비밀을 못 풂 — 계정 명령 reset-otp 필요');
        return null;
    }
};

// 아이디·비번·활성·OTP·이메일 차례로 확인 → { admin, step } | { failure }
const checkCredentials = async ({ loginId, password, otp, accessEmail, now }, db) => {
    const admin = await db.AdminUser.findOne({ where: { login_id: loginId } });
    const passwordOk = await comparePassword(password, admin?.password_hash ?? await dummyHashOnce());
    if (!admin || !passwordOk) return { failure: 'BAD_CREDENTIALS', admin };
    if (!admin.is_active) return { failure: 'DISABLED', admin };
    const step = matchedOtpStep(admin, otp, now);
    if (step === null) return { failure: 'BAD_CREDENTIALS', admin };
    // 문 1 이메일 = 관리자 이메일 (Access 꺼진 개발·시험은 건너뜀)
    if (accessEmail && String(admin.email ?? '').toLowerCase() !== accessEmail) return { failure: 'EMAIL_MISMATCH', admin };
    return { admin, step };
};

// 성공: OTP 칸 번호 올리기(같은 번호 두 번이면 0줄) + 세션 + 시도 + 기록을 한 트랜잭션
const startSession = async ({ admin, step, ip, accessEmail, userAgent, now }, db) => db.sequelize.transaction(async (transaction) => {
    const [used] = await db.AdminUser.update(
        { totp_last_step: step, last_login_at: now },
        { where: { id: admin.id, [Op.or]: [{ totp_last_step: null }, { totp_last_step: { [Op.lt]: step } }] }, transaction },
    );
    if (used === 0) return null;
    const created = await session.createSession({ adminId: admin.id, accessEmail, ip, userAgent, now }, { transaction, db });
    await loginLock.recordAttempt({ loginId: admin.login_id, adminId: admin.id, ip, accessEmail, ok: true, now }, { transaction, db });
    await audit.record({ adminId: admin.id, ip, accessEmail, action: AUDIT_ACTIONS.ADMIN_LOGIN, targetType: 'admin', targetId: admin.id }, { transaction, db });
    return created;
});

// 로그인 → { raw, admin:{ id, loginId, email }, csrfToken, idleExpiresAt }
// 막힘 429 · 틀림 401(아이디·비번·OTP·비활성 같은 모양) · 이메일 다름 403
const login = async ({ loginId, password, otp, ip, accessEmail = null, userAgent = null, now = new Date() }, { db = defaultDb() } = {}) => {
    const attempt = { loginId, ip, accessEmail, now };
    const lock = await loginLock.checkLock({ loginId, ip, now }, { db });
    if (lock.locked) {
        await loginLock.recordAttempt({ ...attempt, ok: false, failureCode: 'LOCKED' }, { db });
        throw locked(lock.retryAfterSec);
    }
    const checked = await checkCredentials({ loginId, password, otp, accessEmail, now }, db);
    const created = checked.failure ? null : await startSession({ ...checked, ip, accessEmail, userAgent, now }, db);
    if (!created) {
        const failureCode = checked.failure ?? 'BAD_CREDENTIALS';
        await loginLock.recordAttempt({ ...attempt, adminId: checked.admin?.id ?? null, ok: false, failureCode }, { db });
        throw failureCode === 'EMAIL_MISMATCH' ? emailMismatch() : failed();
    }
    const { admin } = checked;
    return {
        raw: created.raw,
        admin: { id: admin.id, loginId: admin.login_id, email: admin.email ?? null },
        csrfToken: session.csrfTokenOf(created.raw),
        idleExpiresAt: created.idleExpiresAt,
    };
};

module.exports = { login };
