'use strict';

// 이메일 바꾸기 번호 보내기 파일, 본인 확인 → 새 주소 검사·중복 → 다시 보내기 대기 → 번호 저장 → 새 주소로 메일
// 이메일 바꾸기 입구로 controllers/auth/emailChange.js가 부름, 가입 인증 표(목적 EMAIL_CHANGE)를 같이 씀
const userRepository = require('../../../repositories/user');
const verificationRepository = require('../../../repositories/auth/signupEmailVerification');
const mailAdapterModule = require('../../../utils/adapters/mail');
const { isUniqueConstraintName } = require('../../../repositories/common');
const { comparePassword } = require('../../../utils/auth/credentials');
const { createError } = require('../../../utils/appError');
const { requireConfig } = require('../signupEmailVerification/config');
const { generateNumericCode } = require('../signupEmailVerification/codes');
const { PURPOSE, hashChangeCode, parseNewEmail } = require('./codes');

// 트랜잭션 안: 계정 잠금 → 본인 확인 → 같은 주소·남이 쓰는 주소 거절 → 인증 행 잠금 → 대기 시간 → 새 번호
const prepareCode = async ({ uuid, email, currentPassword, config, nowMs }, transaction) => {
    const user = await userRepository.findByUuid(uuid, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw createError('계정을 찾을 수 없습니다.', 404, 'USER_NOT_FOUND');
    // 비번 있는 계정은 현재 비번 확인 (세션만 훔쳐 이메일 바꾸고 비번 재설정하기 막기), 소셜 전용은 번호만
    if (user.has_local_password !== false) {
        const matched = typeof currentPassword === 'string' && currentPassword
            && await comparePassword(currentPassword, user.password_hash);
        if (!matched) throw createError('현재 비밀번호가 올바르지 않습니다.', 400, 'CURRENT_PASSWORD_INVALID');
    }
    if (String(user.email).toLowerCase() === email) {
        throw createError('지금 쓰는 이메일과 같습니다.', 400, 'EMAIL_SAME');
    }
    if (await userRepository.findByEmail(email, { transaction, logging: false })) {
        throw createError('이미 사용 중인 이메일입니다.', 409, 'EMAIL_IN_USE');
    }

    let row = await verificationRepository.lockByEmail({ email, purpose: PURPOSE }, transaction);
    if (!row) {
        try {
            row = await verificationRepository.createVerification({ email, purpose: PURPOSE, generation: 0, attempts: 0 }, transaction);
        } catch (error) {
            if (!isUniqueConstraintName(error)) throw error;
            return { retry: true };
        }
    }
    if (row.sent_at) {
        const elapsed = nowMs - new Date(row.sent_at).getTime();
        if (elapsed < config.resendCooldownMs) {
            return { tooSoonSec: Math.ceil((config.resendCooldownMs - elapsed) / 1000) };
        }
    }

    // 여기부터 진짜 바뀜: 세대 올리고 번호 해시 저장 (옛 번호·다른 사람 번호 무효)
    const generation = row.generation + 1;
    const code = generateNumericCode(config.codeLength);
    await verificationRepository.updateVerification(row.id, {
        generation,
        code_hash: hashChangeCode({ uuid, email, generation, code }, config.hmacSecret),
        code_expires_at: new Date(nowMs + config.codeTtlMs),
        attempts: 0,
        code_consumed_at: null,
        sent_at: new Date(nowMs),
        proof_hash: null,
        proof_expires_at: null,
        proof_consumed_at: null,
    }, transaction);
    return { code };
};

// 번호 보내기, 성공이면 { ok, expiresInSec, resendAfterSec }
exports.requestEmailChangeCode = async (
    { uuid, newEmail, currentPassword },
    { mailAdapter, now = () => new Date(), retried = false } = {},
) => {
    const config = requireConfig();
    const email = parseNewEmail(newEmail);
    if (!email) throw createError('이메일 형식이 올바르지 않습니다.', 400, 'INVALID_INPUT');
    const nowMs = now().getTime();

    const outcome = await userRepository.withTransaction((transaction) => prepareCode(
        { uuid, email, currentPassword, config, nowMs }, transaction,
    ));
    // 동시에 행 만들다 겹치면 한 번만 다시
    if (outcome.retry && !retried) {
        return exports.requestEmailChangeCode({ uuid, newEmail, currentPassword }, { mailAdapter, now, retried: true });
    }
    if (outcome.retry) throw createError('잠시 후 다시 시도해주세요.', 409, 'EMAIL_CHANGE_BUSY');
    if (outcome.tooSoonSec) {
        const error = createError(`${outcome.tooSoonSec}초 뒤에 다시 보낼 수 있습니다.`, 429, 'RESEND_TOO_SOON');
        error.resendAfterSec = outcome.tooSoonSec;
        throw error;
    }

    const expiresInSec = Math.floor(config.codeTtlMs / 1000);
    const mailer = mailAdapter ?? mailAdapterModule.createHttpMailAdapter();
    // 로그인한 본인 요청이라 메일 실패는 알림 (가입과 달리 숨길 가입 여부 없음)
    let sent;
    try {
        const result = await mailer.sendMail({ to: email, template: 'EMAIL_CHANGE_CODE', params: { code: outcome.code, expiresInSec } });
        sent = result?.ok === true;
    } catch {
        sent = false;
    }
    if (!sent) throw createError('인증번호 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.', 503, 'MAIL_SEND_FAILED');
    return { ok: true, expiresInSec, resendAfterSec: Math.floor(config.resendCooldownMs / 1000) };
};
