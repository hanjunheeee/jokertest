'use strict';

// F-29b: 비밀번호 재설정 발급·검증·확정. request/verify/confirm 셋 다 계정 존재 여부를
// 응답 형태로 드러내지 않는다(AC-01) — verify/confirm은 애초에 이메일을 받지 않으므로
// 자연히 그렇게 된다.

const crypto = require('crypto');
const db = require('../models');
const userRepository = require('../repositories/user.repositories');
const { hashPassword } = require('../utils/hash');
const { validatePassword } = require('../validation/signupValidation');
const { validateResetToken } = require('../validation/passwordResetValidation');
// 모듈 참조를 그대로 들고 있는다(구조 분해하지 않는다) — 시험이 mailAdapter.createHttpMailAdapter를
// 직접 몽키패치(t.mock.method)해 메모리 어댑터로 바꿔치기할 수 있게 하기 위함이다. 구조
// 분해로 함수 참조를 미리 떼어내면 그 패치가 이 파일에는 반영되지 않는다.
const mailAdapter = require('../mail/mailAdapter');

const TOKEN_TTL_MS = (() => {
    const parsed = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MS);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000; // 기본 30분
})();

// request 사용자 잠금 → confirm 토큰 잠금 순서와, confirm 토큰 잠금 → 사용자 잠금 순서가
// 서로 반대 방향으로 경합하면 데드락이 날 수 있다 — 전체 트랜잭션을 재시도해 흡수한다
// (비데드락 오류는 재시도하지 않는다).
const DEADLOCK_MAX_RETRIES = 2;

const generateRawToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const isDeadlock = (error) => (
    error?.name === 'SequelizeDeadlockError'
    || error?.original?.code === 'ER_LOCK_DEADLOCK'
    || error?.parent?.code === 'ER_LOCK_DEADLOCK'
);

const withDeadlockRetry = async (work) => {
    let attempt = 0;
    for (;;) {
        try {
            return await userRepository.withTransaction(work);
        } catch (error) {
            attempt += 1;
            if (isDeadlock(error) && attempt <= DEADLOCK_MAX_RETRIES) continue;
            throw error;
        }
    }
};

// 서버 설정(PASSWORD_RESET_APP_URL)만 링크의 기반 URL로 쓴다 — 요청의 Host·redirectUrl 등은
// 절대 반영하지 않는다(A-05). 설정이 없거나 형식이 잘못되면 링크를 만들지 않고 null을
// 돌려준다(호출부는 그 경우 메일을 보내지 않는다).
const buildResetUrl = (rawToken) => {
    const base = process.env.PASSWORD_RESET_APP_URL;
    if (typeof base !== 'string' || !base.trim()) return null;

    let target;
    try {
        target = new URL(base.trim());
    } catch {
        return null;
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;

    target.pathname = `${target.pathname.replace(/\/+$/, '')}/password-reset`;
    target.search = '';
    target.searchParams.set('token', rawToken);
    return target.toString();
};

/**
 * 이메일 또는 계정 없음 — 공통 200 {ok:true}를 위해 예외를 던지지 않는다. 메일 발송 실패도
 * 이 함수 바깥으로 전파하지 않는다(호출부인 컨트롤러가 한 번 더 감싸므로, 여기서도
 * 방어적으로 흡수한다).
 */
exports.requestPasswordReset = async ({ email }, { mailAdapter: injectedMailAdapter } = {}) => {
    const mailer = injectedMailAdapter ?? mailAdapter.createHttpMailAdapter();
    const issued = await withDeadlockRetry(async (transaction) => {
        const user = await userRepository.findByEmail(email, {
            transaction, lock: transaction.LOCK.UPDATE, logging: false,
        });
        if (!user) return null;

        if (user.has_local_password === false) {
            return { socialOnly: true, toEmail: user.email };
        }

        // 새 재설정 요청 발급 이후에는 이전 미사용 링크도 거부되어야 한다(AC-03) — 새 토큰을
        // 만들기 전에 기존 미사용 토큰을 모두 폐기한다.
        await db.PasswordResetToken.update(
            { used: true, revoked_at: new Date() },
            { where: { user_id: user.uuid, used: false, revoked_at: null }, transaction, logging: false },
        );

        const rawToken = generateRawToken();
        await db.PasswordResetToken.create({
            user_id: user.uuid,
            token: null,
            token_hash: hashToken(rawToken),
            expired_at: new Date(Date.now() + TOKEN_TTL_MS),
            used: false,
        }, { transaction, logging: false });

        return { socialOnly: false, toEmail: user.email, rawToken };
    });

    if (!issued) return { ok: true };

    try {
        if (issued.socialOnly) {
            await mailer.sendMail({ to: issued.toEmail, template: 'SOCIAL_LOGIN_GUIDE', params: {} });
        } else {
            const resetUrl = buildResetUrl(issued.rawToken);
            if (resetUrl) {
                await mailer.sendMail({ to: issued.toEmail, template: 'PASSWORD_RESET', params: { resetUrl } });
            }
        }
    } catch {
        // 발송 실패·예외도 공통 응답을 바꾸지 않는다(AC-01).
    }

    return { ok: true };
};

/** 소비하지 않는다 — 조회만으로 상태를 판정한다. */
exports.verifyPasswordReset = async (rawToken) => {
    const tokenResult = validateResetToken(rawToken);
    if (!tokenResult.ok) return { ok: false, code: 'INVALID' };

    const row = await db.PasswordResetToken.findOne({
        where: { token_hash: hashToken(rawToken) },
        logging: false,
    });

    if (!row || row.revoked_at) return { ok: false, code: 'INVALID' };
    if (row.used) return { ok: false, code: 'USED' };
    if (row.expired_at <= new Date()) return { ok: false, code: 'EXPIRED' };
    return { ok: true, status: 'VALID' };
};

exports.confirmPasswordReset = async (rawToken, newPassword) => {
    const tokenResult = validateResetToken(rawToken);
    if (!tokenResult.ok) return { ok: false, status: 400, code: 'INVALID' };

    const passwordResult = validatePassword(newPassword);
    if (!passwordResult.ok) {
        return { ok: false, status: 400, code: 'INVALID_PASSWORD', message: passwordResult.message };
    }

    const tokenHash = hashToken(rawToken);

    const outcome = await withDeadlockRetry(async (transaction) => {
        const tokenRow = await db.PasswordResetToken.findOne({
            where: { token_hash: tokenHash },
            transaction, lock: transaction.LOCK.UPDATE, logging: false,
        });
        if (!tokenRow || tokenRow.revoked_at) return { code: 'INVALID' };
        if (tokenRow.used) return { code: 'USED' };
        if (tokenRow.expired_at <= new Date()) return { code: 'EXPIRED' };

        const user = await userRepository.findByUuid(tokenRow.user_id, {
            transaction, lock: transaction.LOCK.UPDATE, logging: false,
        });
        if (!user) return { code: 'INVALID' };
        if (user.has_local_password === false) return { code: 'SOCIAL_ONLY' };

        // 사용 처리 — 이 토큰 자체는 revoked_at을 건드리지 않는다(USED로 남긴다).
        await db.PasswordResetToken.update(
            { used: true },
            { where: { id: tokenRow.id }, transaction, logging: false },
        );

        const password_hash = await hashPassword(passwordResult.value);
        await userRepository.updateUser(user.uuid, { password_hash }, { transaction, logging: false });

        // 세션 전체 폐기 — HTTP·Socket.IO 양쪽 모두 다음 재검증에서 거부된다.
        await userRepository.markOnlineSessionsOffline(user.uuid, { transaction, logging: false });

        // 나머지 미사용 토큰도 함께 폐기한다(방금 소비한 토큰은 이미 used=true라 이 where에
        // 다시 걸리지 않는다).
        await db.PasswordResetToken.update(
            { used: true, revoked_at: new Date() },
            { where: { user_id: user.uuid, used: false, revoked_at: null }, transaction, logging: false },
        );

        return { code: 'OK' };
    });

    if (outcome.code === 'OK') return { ok: true };
    if (outcome.code === 'SOCIAL_ONLY') return { ok: false, status: 400, code: 'SOCIAL_ONLY' };
    if (outcome.code === 'USED') return { ok: false, status: 400, code: 'USED' };
    if (outcome.code === 'EXPIRED') return { ok: false, status: 400, code: 'EXPIRED' };
    return { ok: false, status: 400, code: 'INVALID' };
};

exports.TOKEN_TTL_MS = TOKEN_TTL_MS;
exports.__testables = { buildResetUrl, hashToken, generateRawToken, isDeadlock };
