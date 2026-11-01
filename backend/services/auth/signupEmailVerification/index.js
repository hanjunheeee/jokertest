'use strict';

const crypto = require('crypto');
const { createError } = require('../../../utils/appError');
const db = require('../../../models');
const userRepository = require('../../../repositories/user.repositories');
const mailAdapterModule = require('../../../mail/mailAdapter');
const { getSignupEmailVerificationConfig } = require('../../../config/signupEmailVerification');
const { normalizeEmail } = require('../../../validation/signupEmailVerificationValidation');

const PURPOSE = 'SIGNUP';

const requireConfig = () => {
    const config = getSignupEmailVerificationConfig(process.env);
    if (!config.hmacSecret) {
        throw createError('가입 이메일 인증 설정이 올바르지 않습니다.', 500, 'SIGNUP_EMAIL_CONFIG_INVALID');
    }
    return config;
};

const hmacHex = (secret, label, parts) => (
    crypto.createHmac('sha256', secret).update(`${label}:${parts.join(':')}`).digest('hex')
);
const hashCode = (email, generation, code, secret) => hmacHex(secret, 'signup-code-v1', [email, String(generation), code]);
const hashProof = (email, generation, proof, secret) => hmacHex(secret, 'signup-proof-v1', [email, String(generation), proof]);

const generateNumericCode = (length) => {
    const max = 10 ** length;
    const value = crypto.randomInt(0, max);
    return String(value).padStart(length, '0');
};

const generateProof = () => crypto.randomBytes(32).toString('base64url');

exports.requestSignupCode = async ({ email }, { mailAdapter: injectedMailAdapter, now = () => new Date() } = {}) => {
    const config = requireConfig();
    const normalizedEmail = normalizeEmail(email);
    const mailer = injectedMailAdapter ?? mailAdapterModule.createHttpMailAdapter();
    const nowMs = now().getTime();

    const outcome = await userRepository.withTransaction(async (transaction) => {
        let row = await db.SignupEmailVerification.findOne({
            where: { email: normalizedEmail, purpose: PURPOSE },
            transaction, lock: transaction.LOCK.UPDATE, logging: false,
        });

        if (!row) {
            try {
                row = await db.SignupEmailVerification.create({
                    email: normalizedEmail, purpose: PURPOSE, generation: 0, attempts: 0,
                }, { transaction, logging: false });
            } catch (error) {
                if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
                return { retry: true };
            }
        }

        if (row.sent_at) {
            const elapsed = nowMs - new Date(row.sent_at).getTime();
            if (elapsed < config.resendCooldownMs) {
                return { tooSoon: true, resendAfterSec: Math.ceil((config.resendCooldownMs - elapsed) / 1000) };
            }
        }

        const nextGeneration = row.generation + 1;
        const previousGeneration = row.generation;
        const previousCodeHash = row.code_hash;
        const sentAt = new Date(nowMs);
        const expiresInSec = Math.floor(config.codeTtlMs / 1000);
        const resendAfterSec = Math.floor(config.resendCooldownMs / 1000);

        const existingUser = await userRepository.findByEmail(normalizedEmail, { transaction, logging: false });

        if (existingUser) {
            await db.SignupEmailVerification.update({
                generation: nextGeneration,
                code_hash: null,
                code_expires_at: null,
                attempts: 0,
                code_consumed_at: null,
                sent_at: sentAt,
                proof_hash: null,
                proof_expires_at: null,
                proof_consumed_at: null,
            }, { where: { id: row.id }, transaction, logging: false });
            return { alreadyRegistered: true, expiresInSec, resendAfterSec };
        }

        let code = generateNumericCode(config.codeLength);
        while (
            previousCodeHash
            && hashCode(normalizedEmail, previousGeneration, code, config.hmacSecret) === previousCodeHash
        ) {
            code = generateNumericCode(config.codeLength);
        }
        const codeHash = hashCode(normalizedEmail, nextGeneration, code, config.hmacSecret);
        const codeExpiresAt = new Date(nowMs + config.codeTtlMs);

        await db.SignupEmailVerification.update({
            generation: nextGeneration,
            code_hash: codeHash,
            code_expires_at: codeExpiresAt,
            attempts: 0,
            code_consumed_at: null,
            sent_at: sentAt,
            proof_hash: null,
            proof_expires_at: null,
            proof_consumed_at: null,
        }, { where: { id: row.id }, transaction, logging: false });

        return { code, expiresInSec, resendAfterSec };
    });

    if (outcome.retry) {
        return exports.requestSignupCode({ email }, { mailAdapter: injectedMailAdapter, now });
    }
    if (outcome.tooSoon) {
        return { ok: false, code: 'RESEND_TOO_SOON', resendAfterSec: outcome.resendAfterSec };
    }

    if (!outcome.alreadyRegistered) {
        try {
            await mailer.sendMail({
                to: normalizedEmail,
                template: 'SIGNUP_CODE',
                params: { code: outcome.code, expiresInSec: outcome.expiresInSec },
            });
        } catch {
        }
    }

    return { ok: true, resendAfterSec: outcome.resendAfterSec, expiresInSec: outcome.expiresInSec };
};

exports.verifySignupCode = async ({ email, code }, { now = () => new Date() } = {}) => {
    const config = requireConfig();
    const normalizedEmail = normalizeEmail(email);
    const nowMs = now().getTime();

    return userRepository.withTransaction(async (transaction) => {
        const row = await db.SignupEmailVerification.findOne({
            where: { email: normalizedEmail, purpose: PURPOSE },
            transaction, lock: transaction.LOCK.UPDATE, logging: false,
        });

        if (!row || !row.code_hash || row.code_consumed_at) {
            return { ok: false, code: 'CODE_INVALID' };
        }
        if (row.attempts >= config.maxAttempts) {
            return { ok: false, code: 'TOO_MANY_ATTEMPTS' };
        }
        if (!row.code_expires_at || new Date(row.code_expires_at).getTime() <= nowMs) {
            return { ok: false, code: 'CODE_EXPIRED' };
        }

        const presentedHash = hashCode(normalizedEmail, row.generation, code, config.hmacSecret);
        if (presentedHash !== row.code_hash) {
            const nextAttempts = row.attempts + 1;
            await db.SignupEmailVerification.update(
                { attempts: nextAttempts },
                { where: { id: row.id }, transaction, logging: false },
            );
            if (nextAttempts >= config.maxAttempts) {
                return { ok: false, code: 'TOO_MANY_ATTEMPTS' };
            }
            return { ok: false, code: 'CODE_INVALID', attemptsRemaining: config.maxAttempts - nextAttempts };
        }

        const proof = generateProof();
        const proofHash = hashProof(normalizedEmail, row.generation, proof, config.hmacSecret);
        const proofExpiresAt = new Date(nowMs + config.proofTtlMs);

        await db.SignupEmailVerification.update({
            code_consumed_at: new Date(nowMs),
            proof_hash: proofHash,
            proof_expires_at: proofExpiresAt,
            proof_consumed_at: null,
        }, { where: { id: row.id }, transaction, logging: false });

        return { ok: true, signupProof: proof };
    });
};

exports.consumeSignupProof = async ({ email, signupProof }, { transaction, now = () => new Date() } = {}) => {
    const config = requireConfig();
    if (typeof signupProof !== 'string' || !signupProof) {
        return { ok: false, code: 'SIGNUP_PROOF_INVALID' };
    }
    const normalizedEmail = normalizeEmail(email);
    const nowMs = now().getTime();

    const row = await db.SignupEmailVerification.findOne({
        where: { email: normalizedEmail, purpose: PURPOSE },
        transaction, lock: transaction.LOCK.UPDATE, logging: false,
    });

    if (!row || !row.proof_hash || row.proof_consumed_at) {
        return { ok: false, code: 'SIGNUP_PROOF_INVALID' };
    }
    if (!row.proof_expires_at || new Date(row.proof_expires_at).getTime() <= nowMs) {
        return { ok: false, code: 'SIGNUP_PROOF_INVALID' };
    }

    const presentedHash = hashProof(normalizedEmail, row.generation, signupProof, config.hmacSecret);
    if (presentedHash !== row.proof_hash) {
        return { ok: false, code: 'SIGNUP_PROOF_INVALID' };
    }

    await db.SignupEmailVerification.update(
        { proof_consumed_at: new Date(nowMs) },
        { where: { id: row.id }, transaction, logging: false },
    );

    return { ok: true };
};

exports.PURPOSE = PURPOSE;
exports.__testables = { hashCode, hashProof, generateNumericCode, generateProof };
