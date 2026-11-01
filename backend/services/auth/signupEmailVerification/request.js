'use strict';

// 인증 코드 보내기 파일, 다시 보내기 대기 · 이미 가입 · 메일 보내기
// signupEmailVerification 입구로 controllers/auth/signupEmailVerification.js가 부름 (시험 도우미 tests/helpers/signupProof.js도)
// 이미 가입한 이메일도 같은 응답 (가입 여부 숨김), 메일 실패는 삼킴
const userRepository = require('../../../repositories/user');
const mailAdapterModule = require('../../../utils/adapters/mail');
const { normalizeEmail } = require('../../../validations/auth/signupEmailVerification');
const { PURPOSE, requireConfig } = require('./config');
const { generateNumericCode, hashCode } = require('./codes');
const verificationRepository = require('../../../repositories/auth/signupEmailVerification');
const { isUniqueConstraintName } = require('../../../repositories/common');

// 행 잠금 → 대기 시간 확인 → 새 세대 코드 저장 → 메일, 동시에 행 만들다 겹치면 처음부터 다시
exports.requestSignupCode = async ({ email }, { mailAdapter: injectedMailAdapter, now = () => new Date() } = {}) => {
    // 설정 먼저 확인, 메일·시각은 넘겨받은 것 먼저 (시험 도우미가 넘김)
    const config = requireConfig();
    const normalizedEmail = normalizeEmail(email);
    const mailer = injectedMailAdapter ?? mailAdapterModule.createHttpMailAdapter();
    const nowMs = now().getTime();

    const outcome = await userRepository.withTransaction(async (transaction) => {
        // 이메일당 인증 행 하나, 잠가서 동시 요청 줄 세움
        let row = await verificationRepository.lockByEmail({ email: normalizedEmail, purpose: PURPOSE }, transaction);

        // 행 없으면 만듦, 동시에 만들다 유일 충돌이면 처음부터 다시
        if (!row) {
            try {
                row = await verificationRepository.createVerification({
                    email: normalizedEmail, purpose: PURPOSE, generation: 0, attempts: 0,
                }, transaction);
            } catch (error) {
                if (!isUniqueConstraintName(error)) throw error;
                return { retry: true };
            }
        }

        // 다시 보내기 대기 시간 안이면 남은 초 알려 주고 거절
        if (row.sent_at) {
            const elapsed = nowMs - new Date(row.sent_at).getTime();
            if (elapsed < config.resendCooldownMs) {
                return { tooSoon: true, resendAfterSec: Math.ceil((config.resendCooldownMs - elapsed) / 1000) };
            }
        }

        // 세대 하나 올림 (옛 코드·증명 해시가 안 맞게)
        const nextGeneration = row.generation + 1;
        const previousGeneration = row.generation;
        const previousCodeHash = row.code_hash;
        const sentAt = new Date(nowMs);
        const expiresInSec = Math.floor(config.codeTtlMs / 1000);
        const resendAfterSec = Math.floor(config.resendCooldownMs / 1000);

        const existingUser = await userRepository.findByEmail(normalizedEmail, { transaction, logging: false });

        // 이미 가입한 이메일이면 코드 없이 세대·보낸 시각만 올림 (대기 시간·응답 같게, 가입 여부 숨김)
        if (existingUser) {
            await verificationRepository.updateVerification(row.id, {
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

        // 직전 코드와 같은 숫자면 다시 뽑음 (새 메일 코드가 옛 코드와 같지 않게)
        let code = generateNumericCode(config.codeLength);
        while (
            previousCodeHash
            && hashCode(normalizedEmail, previousGeneration, code, config.hmacSecret) === previousCodeHash
        ) {
            code = generateNumericCode(config.codeLength);
        }
        const codeHash = hashCode(normalizedEmail, nextGeneration, code, config.hmacSecret);
        const codeExpiresAt = new Date(nowMs + config.codeTtlMs);

        // 여기부터 진짜 바뀜: 새 코드 해시 저장, 틀린 횟수·옛 증명 비움
        await verificationRepository.updateVerification(row.id, {
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

    // 행 만들기 충돌이면 입구로 처음부터 다시 (이번엔 행이 있어 잠금으로 들어감)
    if (outcome.retry) {
        return require('./index').requestSignupCode({ email }, { mailAdapter: injectedMailAdapter, now });
    }
    if (outcome.tooSoon) {
        return { ok: false, code: 'RESEND_TOO_SOON', resendAfterSec: outcome.resendAfterSec };
    }

    // 메일은 트랜잭션 끝난 뒤, 이미 가입이면 안 보냄
    if (!outcome.alreadyRegistered) {
        try {
            await mailer.sendMail({
                to: normalizedEmail,
                template: 'SIGNUP_CODE',
                params: { code: outcome.code, expiresInSec: outcome.expiresInSec },
            });
        } catch {
            // 메일 실패는 삼킴 (이미 가입한 이메일과 같은 응답, 가입 여부 숨김)
        }
    }

    return { ok: true, resendAfterSec: outcome.resendAfterSec, expiresInSec: outcome.expiresInSec };
};
