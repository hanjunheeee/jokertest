'use strict';

// 인증 코드 확인 파일, 코드 확인 · 가입 증명 소비
// 틀린 횟수·만료·한 번만 쓰기 확인
const db = require('../../../models');
const userRepository = require('../../../repositories/user.repositories');
const { normalizeEmail } = require('../../../validation/signupEmailVerificationValidation');
const { requireConfig } = require('./config');
const { PURPOSE } = require('./constants');
const { hashCode, generateProof, hashProof } = require('./codes');

// 맞으면 증명 발급, 틀리면 횟수 올리고 남은 횟수 알려 줌
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

// 가입 트랜잭션 안에서 증명 한 번만 쓰기
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
