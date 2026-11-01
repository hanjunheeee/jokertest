'use strict';

// 인증 코드 보내기 파일, 다시 보내기 대기 · 이미 가입 · 메일 보내기
// 이미 가입한 이메일도 같은 응답 (가입 여부 숨김), 메일 실패는 삼킴
const userRepository = require('../../../repositories/user.repositories');
const mailAdapterModule = require('../../../utils/adapters/mail');
const { normalizeEmail } = require('../../../validations/auth/signupEmailVerification');
const { requireConfig } = require('./config');
const { PURPOSE } = require('./constants');
const { generateNumericCode, hashCode } = require('./codes');
const signupVerificationRepository = require('../../../repositories/auth/signupEmailVerification');
const { isUniqueConstraintName } = require('../../../repositories/common');

// 행 잠금 → 대기 시간 확인 → 새 세대 코드 저장 → 메일, 동시에 행 만들다 겹치면 처음부터 다시
exports.requestSignupCode = async ({ email }, { mailAdapter: injectedMailAdapter, now = () => new Date() } = {}) => {
    const config = requireConfig();
    const normalizedEmail = normalizeEmail(email);
    const mailer = injectedMailAdapter ?? mailAdapterModule.createHttpMailAdapter();
    const nowMs = now().getTime();

    const outcome = await userRepository.withTransaction(async (transaction) => {
        let row = await signupVerificationRepository.lockByEmail({ email: normalizedEmail, purpose: PURPOSE }, transaction);

        if (!row) {
            try {
                row = await signupVerificationRepository.createVerification({
                    email: normalizedEmail, purpose: PURPOSE, generation: 0, attempts: 0,
                }, transaction);
            } catch (error) {
                if (!isUniqueConstraintName(error)) throw error;
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
            await signupVerificationRepository.updateVerification(row.id, {
                generation: nextGeneration,
                code_hash: null,
                code_expires_at: null,
                attempts: 0,
                code_consumed_at: null,
                sent_at: sentAt,
                proof_hash: null,
                proof_expires_at: null,
                proof_consumed_at: null,
            }, transaction);
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

        await signupVerificationRepository.updateVerification(row.id, {
            generation: nextGeneration,
            code_hash: codeHash,
            code_expires_at: codeExpiresAt,
            attempts: 0,
            code_consumed_at: null,
            sent_at: sentAt,
            proof_hash: null,
            proof_expires_at: null,
            proof_consumed_at: null,
        }, transaction);

        return { code, expiresInSec, resendAfterSec };
    });

    if (outcome.retry) {
        return require('./index').requestSignupCode({ email }, { mailAdapter: injectedMailAdapter, now });
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
