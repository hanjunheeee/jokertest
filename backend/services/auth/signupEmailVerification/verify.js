'use strict';

// 인증 코드 확인 파일, 코드 확인 · 가입 증명 소비
// signupEmailVerification 입구로 controllers/auth/signupEmailVerification.js(확인)·account/signup.js·social/signup.js(소비)가 부름
// 틀린 횟수·만료·한 번만 쓰기 확인
const userRepository = require('../../../repositories/user');
const { normalizeEmail } = require('../../../validations/auth/signupEmailVerification');
const { PURPOSE, requireConfig } = require('./config');
const { hashCode, generateProof, hashProof } = require('./codes');
const verificationRepository = require('../../../repositories/auth/signupEmailVerification');

// 맞으면 증명 발급, 틀리면 횟수 올리고 남은 횟수 알려 줌
exports.verifySignupCode = async ({ email, code }, { now = () => new Date() } = {}) => {
    const config = requireConfig();
    const normalizedEmail = normalizeEmail(email);
    const nowMs = now().getTime();

    return userRepository.withTransaction(async (transaction) => {
        // 행 잠가서 동시 확인이 틀린 횟수 덮어쓰지 않게
        const row = await verificationRepository.lockByEmail({ email: normalizedEmail, purpose: PURPOSE }, transaction);

        // 코드 없거나 이미 쓴 코드 거절
        if (!row || !row.code_hash || row.code_consumed_at) {
            return { ok: false, code: 'CODE_INVALID' };
        }
        // 횟수 다 쓰면 맞혀도 거절 (계속 맞혀 보기 막기)
        if (row.attempts >= config.maxAttempts) {
            return { ok: false, code: 'TOO_MANY_ATTEMPTS' };
        }
        if (!row.code_expires_at || new Date(row.code_expires_at).getTime() <= nowMs) {
            return { ok: false, code: 'CODE_EXPIRED' };
        }

        // 틀리면 횟수 올리고, 마지막 기회였으면 TOO_MANY_ATTEMPTS
        const presentedHash = hashCode(normalizedEmail, row.generation, code, config.hmacSecret);
        if (presentedHash !== row.code_hash) {
            const nextAttempts = row.attempts + 1;
            await verificationRepository.updateVerification(row.id, { attempts: nextAttempts }, transaction);
            if (nextAttempts >= config.maxAttempts) {
                return { ok: false, code: 'TOO_MANY_ATTEMPTS' };
            }
            return { ok: false, code: 'CODE_INVALID', attemptsRemaining: config.maxAttempts - nextAttempts };
        }

        // 여기부터 진짜 바뀜: 코드 쓴 표시 + 증명 발급 (원래 증명은 응답으로만, DB엔 해시)
        const proof = generateProof();
        const proofHash = hashProof(normalizedEmail, row.generation, proof, config.hmacSecret);
        const proofExpiresAt = new Date(nowMs + config.proofTtlMs);

        await verificationRepository.updateVerification(row.id, {
            code_consumed_at: new Date(nowMs),
            proof_hash: proofHash,
            proof_expires_at: proofExpiresAt,
            proof_consumed_at: null,
        }, transaction);

        return { ok: true, signupProof: proof };
    });
};

// 가입 트랜잭션 안에서 증명 한 번만 쓰기 (가입 실패면 소비도 같이 되돌아감)
exports.consumeSignupProof = async ({ email, signupProof }, { transaction, now = () => new Date() } = {}) => {
    // 설정 먼저 확인, 증명 없으면 DB 안 감
    const config = requireConfig();
    if (typeof signupProof !== 'string' || !signupProof) {
        return { ok: false, code: 'SIGNUP_PROOF_INVALID' };
    }
    const normalizedEmail = normalizeEmail(email);
    const nowMs = now().getTime();

    // 부르는 쪽 트랜잭션으로 행 잠금 (같은 증명 동시 가입 줄 세움)
    const row = await verificationRepository.lockByEmail({ email: normalizedEmail, purpose: PURPOSE }, transaction);

    // 증명 없거나 이미 썼거나 만료면 거절
    if (!row || !row.proof_hash || row.proof_consumed_at) {
        return { ok: false, code: 'SIGNUP_PROOF_INVALID' };
    }
    if (!row.proof_expires_at || new Date(row.proof_expires_at).getTime() <= nowMs) {
        return { ok: false, code: 'SIGNUP_PROOF_INVALID' };
    }

    // 지금 세대 증명 해시와 다르면 거절
    const presentedHash = hashProof(normalizedEmail, row.generation, signupProof, config.hmacSecret);
    if (presentedHash !== row.proof_hash) {
        return { ok: false, code: 'SIGNUP_PROOF_INVALID' };
    }

    // 여기부터 진짜 바뀜: 증명 쓴 표시 (같은 증명으로 두 번 가입 막기)
    await verificationRepository.updateVerification(row.id, { proof_consumed_at: new Date(nowMs) }, transaction);

    return { ok: true };
};
