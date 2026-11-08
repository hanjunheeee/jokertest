'use strict';

// 이메일 바꾸기 확인 파일, 번호 확인(틀린 횟수·만료·한 번만) → 남이 먼저 가져갔나 → 이메일 바꿈 → 옛 주소로 알림
// 이메일 바꾸기 입구로 controllers/auth/emailChange.js가 부름
const userRepository = require('../../../repositories/user');
const verificationRepository = require('../../../repositories/auth/signupEmailVerification');
const mailAdapterModule = require('../../../utils/adapters/mail');
const { createError } = require('../../../utils/appError');
const { requireConfig } = require('../signupEmailVerification/config');
const { PURPOSE, hashChangeCode, parseNewEmail, maskEmail } = require('./codes');

const CODE_ERRORS = {
    CODE_INVALID: '인증번호가 올바르지 않습니다.',
    CODE_EXPIRED: '인증번호가 만료되었습니다. 다시 받아주세요.',
    TOO_MANY_ATTEMPTS: '인증번호를 여러 번 틀렸습니다. 다시 받아주세요.',
};

// 트랜잭션 안: 인증 행 잠금 → 번호 확인 → 계정 잠금 → 중복 → 바꿈, 실패는 { code, attemptsRemaining }
const applyChange = async ({ uuid, email, code, config, nowMs }, transaction) => {
    const row = await verificationRepository.lockByEmail({ email, purpose: PURPOSE }, transaction);
    if (!row || !row.code_hash || row.code_consumed_at) return { code: 'CODE_INVALID' };
    if (row.attempts >= config.maxAttempts) return { code: 'TOO_MANY_ATTEMPTS' };
    if (!row.code_expires_at || new Date(row.code_expires_at).getTime() <= nowMs) return { code: 'CODE_EXPIRED' };

    // 요청한 사람·주소·세대가 같아야 맞음 (같은 주소를 남이 나중에 요청하면 내 번호는 무효)
    if (hashChangeCode({ uuid, email, generation: row.generation, code }, config.hmacSecret) !== row.code_hash) {
        const attempts = row.attempts + 1;
        await verificationRepository.updateVerification(row.id, { attempts }, transaction);
        if (attempts >= config.maxAttempts) return { code: 'TOO_MANY_ATTEMPTS' };
        return { code: 'CODE_INVALID', attemptsRemaining: config.maxAttempts - attempts };
    }

    const user = await userRepository.findByUuid(uuid, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw createError('계정을 찾을 수 없습니다.', 404, 'USER_NOT_FOUND');
    const taken = await userRepository.findByEmail(email, { transaction, logging: false });
    if (taken && taken.uuid !== uuid) throw createError('이미 사용 중인 이메일입니다.', 409, 'EMAIL_IN_USE');

    // 여기부터 진짜 바뀜: 번호 쓴 표시 + 이메일 바꿈 (동시 가입이 앞 검사를 지나쳐도 유일 제약이 409)
    const oldEmail = user.email;
    await verificationRepository.updateVerification(row.id, { code_consumed_at: new Date(nowMs) }, transaction);
    await userRepository.updateUser(uuid, { email, email_verified: true }, { transaction });
    return { oldEmail };
};

// 확인, 성공이면 { ok, email }
exports.confirmEmailChange = async ({ uuid, newEmail, code }, { mailAdapter, now = () => new Date() } = {}) => {
    const config = requireConfig();
    const email = parseNewEmail(newEmail);
    const codePattern = new RegExp(`^\\d{${config.codeLength}}$`);
    if (!email || typeof code !== 'string' || !codePattern.test(code)) {
        throw createError('입력 형식이 올바르지 않습니다.', 400, 'INVALID_INPUT');
    }
    const outcome = await userRepository.withTransaction((transaction) => applyChange(
        { uuid, email, code, config, nowMs: now().getTime() }, transaction,
    ));
    if (outcome.code) {
        const error = createError(CODE_ERRORS[outcome.code], 400, outcome.code);
        if (outcome.attemptsRemaining !== undefined) error.attemptsRemaining = outcome.attemptsRemaining;
        throw error;
    }

    // 옛 주소로 알림 (실패해도 바뀐 건 그대로)
    try {
        const mailer = mailAdapter ?? mailAdapterModule.createHttpMailAdapter();
        await mailer.sendMail({ to: outcome.oldEmail, template: 'EMAIL_CHANGED', params: { maskedNewEmail: maskEmail(email) } });
    } catch {
        // 알림 메일 실패는 삼킴
    }
    return { ok: true, email };
};
