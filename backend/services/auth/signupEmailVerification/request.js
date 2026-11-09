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

// 이메일당 인증 행 하나, 잠가서 동시 요청 줄 세움, 없으면 만듦 (동시에 만들다 유일 충돌이면 null = 처음부터 다시)
const lockOrCreateRow = async (normalizedEmail, transaction) => {
    const row = await verificationRepository.lockByEmail({ email: normalizedEmail, purpose: PURPOSE }, transaction);
    if (row) return row;
    try {
        return await verificationRepository.createVerification({
            email: normalizedEmail, purpose: PURPOSE, generation: 0, attempts: 0,
        }, transaction);
    } catch (error) {
        if (!isUniqueConstraintName(error)) throw error;
        return null;
    }
};

// 다시 보내기 대기 시간 남은 초 (안 남았으면 0)
const resendWaitSecOf = (row, nowMs, config) => {
    if (!row.sent_at) return 0;
    const elapsed = nowMs - new Date(row.sent_at).getTime();
    if (elapsed >= config.resendCooldownMs) return 0;
    return Math.ceil((config.resendCooldownMs - elapsed) / 1000);
};

// 직전 코드와 같은 숫자면 다시 뽑음 (새 메일 코드가 옛 코드와 같지 않게)
const drawFreshCode = (config, normalizedEmail, row) => {
    let code = generateNumericCode(config.codeLength);
    while (
        row.code_hash
        && hashCode(normalizedEmail, row.generation, code, config.hmacSecret) === row.code_hash
    ) {
        code = generateNumericCode(config.codeLength);
    }
    return code;
};

// 세대 하나 올려 저장 (옛 코드·증명 해시가 안 맞게), 틀린 횟수·옛 증명 비움
const saveNextGeneration = (row, { codeHash, codeExpiresAt, sentAt }, transaction) => verificationRepository.updateVerification(row.id, {
    generation: row.generation + 1,
    code_hash: codeHash,
    code_expires_at: codeExpiresAt,
    attempts: 0,
    code_consumed_at: null,
    sent_at: sentAt,
    proof_hash: null,
    proof_expires_at: null,
    proof_consumed_at: null,
}, transaction);

// 트랜잭션 안: 행 잠금 → 대기 시간 → (이미 가입이면 코드 없이) 새 세대 저장
const writeSignupCode = async ({ normalizedEmail, nowMs, config }, transaction) => {
    const row = await lockOrCreateRow(normalizedEmail, transaction);
    if (!row) return { retry: true };

    // 다시 보내기 대기 시간 안이면 남은 초 알려 주고 거절
    const waitSec = resendWaitSecOf(row, nowMs, config);
    if (waitSec > 0) return { tooSoon: true, resendAfterSec: waitSec };

    const sentAt = new Date(nowMs);
    const expiresInSec = Math.floor(config.codeTtlMs / 1000);
    const resendAfterSec = Math.floor(config.resendCooldownMs / 1000);

    const existingUser = await userRepository.findByEmail(normalizedEmail, { transaction, logging: false });

    // 이미 가입한 이메일이면 코드 없이 세대·보낸 시각만 올림 (대기 시간·응답 같게, 가입 여부 숨김)
    if (existingUser) {
        await saveNextGeneration(row, { codeHash: null, codeExpiresAt: null, sentAt }, transaction);
        return { alreadyRegistered: true, expiresInSec, resendAfterSec };
    }

    // 여기부터 진짜 바뀜: 새 코드 해시 저장
    const code = drawFreshCode(config, normalizedEmail, row);
    const codeHash = hashCode(normalizedEmail, row.generation + 1, code, config.hmacSecret);
    await saveNextGeneration(row, { codeHash, codeExpiresAt: new Date(nowMs + config.codeTtlMs), sentAt }, transaction);

    return { code, expiresInSec, resendAfterSec };
};

// 행 잠금 → 대기 시간 확인 → 새 세대 코드 저장 → 메일, 동시에 행 만들다 겹치면 처음부터 다시
exports.requestSignupCode = async ({ email }, { mailAdapter: injectedMailAdapter, now = () => new Date() } = {}) => {
    // 설정 먼저 확인, 메일·시각은 넘겨받은 것 먼저 (시험 도우미가 넘김)
    const config = requireConfig();
    const normalizedEmail = normalizeEmail(email);
    const mailer = injectedMailAdapter ?? mailAdapterModule.createHttpMailAdapter();
    const nowMs = now().getTime();

    const outcome = await userRepository.withTransaction(
        (transaction) => writeSignupCode({ normalizedEmail, nowMs, config }, transaction),
    );

    // 행 만들기 충돌이면 처음부터 다시 (이번엔 행이 있어 잠금으로 들어감, 모듈 객체로 불러 시험 패치 먹게)
    if (outcome.retry) {
        return exports.requestSignupCode({ email }, { mailAdapter: injectedMailAdapter, now });
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
