'use strict';

// F-31a: 가입 이메일 인증번호 발송·확인, 그리고 그 결과로 발급되는 일회용 가입 증명
// (signupProof)의 소비. 인증번호·가입 증명의 원문은 어디에도 저장하지 않는다 —
// db.SignupEmailVerification에는 이메일·목적·generation을 결합한 HMAC(code_hash/
// proof_hash)만 남는다(AC-06). 원문은 발송 메일 본문과, verify 성공 응답의 signupProof
// 한 번(A-01의 승인된 예외)에만 나타난다.

const crypto = require('crypto');
const { createError } = require('../utils/appError');
const db = require('../models');
const userRepository = require('../repositories/user.repositories');
const mailAdapterModule = require('../mail/mailAdapter');
const { getSignupEmailVerificationConfig } = require('../config/signupEmailVerification');
const { normalizeEmail } = require('../validation/signupEmailVerificationValidation');

const PURPOSE = 'SIGNUP';

const requireConfig = () => {
    const config = getSignupEmailVerificationConfig(process.env);
    if (!config.hmacSecret) {
        // 설정 자체(숫자값)는 항상 유효한 기본값을 갖지만, 전용 HMAC 비밀값은 그렇지
        // 않다 — 여기서 처음으로 실제 발급·소비 시도가 있을 때만 실패시킨다(config
        // 모듈 자체는 라우터 구성처럼 무관한 호출부까지 깨뜨리지 않도록 던지지 않는다).
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

/**
 * 인증번호를 발송한다. email+SIGNUP 행을 잠가 재발송 대기(sent_at)를 확인한 뒤, 이전
 * 번호·증명을 모두 무효화하는 새 generation으로 교체한다. 이미 가입된 이메일에도 같은
 * 성공 응답 형태를 유지하되(열거 방지) 실제로는 확인 가능한 자격을 만들지 않고 번호도
 * 보내지 않는다.
 */
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
            // (아래 create가 유일 제약에 걸리면 outcome.retry로 새 트랜잭션에서 재조회한다)
            try {
                row = await db.SignupEmailVerification.create({
                    email: normalizedEmail, purpose: PURPOSE, generation: 0, attempts: 0,
                }, { transaction, logging: false });
            } catch (error) {
                // 최초 행 생성 경합 — 동시에 같은 이메일이 처음 요청되면 유일 제약이
                // 하나만 통과시킨다. 진 쪽은 새 트랜잭션으로 재조회한다(아래 outcome.retry).
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
        const sentAt = new Date(nowMs);
        const expiresInSec = Math.floor(config.codeTtlMs / 1000);
        const resendAfterSec = Math.floor(config.resendCooldownMs / 1000);

        const existingUser = await userRepository.findByEmail(normalizedEmail, { transaction, logging: false });

        if (existingUser) {
            // 이미 가입된 이메일 — 재발송 대기 상태(generation·sent_at)는 똑같이
            // 진행시키되, 실제로 검증 가능한 번호·증명은 만들지 않는다.
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

        const code = generateNumericCode(config.codeLength);
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
            // 발송 실패·예외는 이미 커밋된 발급 상태를 되돌리지 않는다 — 컨트롤러는
            // 항상 같은 성공 형태로 응답한다(AC-06).
        }
    }

    return { ok: true, resendAfterSec: outcome.resendAfterSec, expiresInSec: outcome.expiresInSec };
};

/**
 * 인증번호를 확인한다. 성공하면 번호를 소비하고 일회용 가입 증명을 발급해 원문을 한
 * 번 반환한다. 오답 횟수는(이 함수가 반환하기 전에 이미 커밋된 상태로) 매번 갱신되고,
 * 다섯 번째 오답부터는 정답이어도 TOO_MANY_ATTEMPTS로 거부한다.
 */
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

/**
 * 가입 증명을 소비한다. 호출부(auth.service.js의 signup)가 이미 열어 둔 transaction
 * 안에서 행을 잠가 검사하고 소비 표시를 쓴다 — 자체적으로 커밋하지 않으므로, 이후
 * 단계(계정 생성 등)가 실패하면 이 소비도 함께 롤백된다(AC-04).
 */
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
