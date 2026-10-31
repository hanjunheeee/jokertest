'use strict';

const crypto = require('crypto');
const db = require('../models');
const userRepository = require('../repositories/user.repositories');
const { hashPassword } = require('../utils/hash');
const { validatePassword } = require('../validation/signupValidation');
const { validateResetToken } = require('../validation/passwordResetValidation');
const mailAdapter = require('../mail/mailAdapter');

const TOKEN_TTL_MS = (() => {
    const parsed = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MS);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000;
})();

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
            return await userRepository.withTransaction(work, { logging: false });
        } catch (error) {
            attempt += 1;
            if (isDeadlock(error) && attempt <= DEADLOCK_MAX_RETRIES) continue;
            throw error;
        }
    }
};

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
    }

    return { ok: true };
};

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

        await db.PasswordResetToken.update(
            { used: true },
            { where: { id: tokenRow.id }, transaction, logging: false },
        );

        const password_hash = await hashPassword(passwordResult.value);
        await userRepository.updateUser(user.uuid, { password_hash }, { transaction, logging: false });

        await userRepository.markOnlineSessionsOffline(user.uuid, { transaction, logging: false });

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
