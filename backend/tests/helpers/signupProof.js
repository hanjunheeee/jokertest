'use strict';

// F-31a: 실제 가입 증명 발급 픽스처. f02·f08·f29b의 로컬 가입 픽스처와 auth.signup.rollback
// 시험이 이 파일을 공유한다 — 증명 검사를 스텁하거나 DB에 임의의 값을 직접 심지 않고,
// 실제 requestSignupCode → verifySignupCode를 호출해 진짜 signupProof를 발급받는다.
//
// 이 값이 없으면 signupEmailVerification.service.js가 SIGNUP_EMAIL_CONFIG_INVALID로
// 실패한다 — auth.service.js/signupEmailVerification.service.js를 간접적으로 require하는
// 모든 기존 시험을 깨지 않기 위해 이 값은 여기(테스트 전용 헬퍼)에서만 기본값을 채운다.
process.env.SIGNUP_EMAIL_HMAC_SECRET = process.env.SIGNUP_EMAIL_HMAC_SECRET
    || 'test-only-signup-email-hmac-secret-not-for-prod';

const mailAdapterModule = require('../../mail/mailAdapter');
const signupEmailVerificationService = require('../../service/signupEmailVerification.service');

/**
 * 전용 메모리 메일 어댑터로 실제 발송·확인 서비스를 호출해 유효한 signupProof를 만든다.
 * @param {string} email
 * @param {{now?: () => Date}} [options]
 * @returns {Promise<{signupProof: string, mail: object}>}
 */
const prepareSignupProof = async (email, { now } = {}) => {
    const memoryMail = mailAdapterModule.createMemoryMailAdapter();
    const nowOption = now ? { now } : {};

    const requestResult = await signupEmailVerificationService.requestSignupCode(
        { email }, { mailAdapter: memoryMail, ...nowOption },
    );
    if (!requestResult.ok) {
        throw new Error(`prepareSignupProof: 인증번호 발송이 실패했습니다 (${requestResult.code})`);
    }

    const sentMail = memoryMail.outbox.at(-1);
    if (!sentMail || sentMail.template !== 'SIGNUP_CODE') {
        throw new Error('prepareSignupProof: SIGNUP_CODE 메일이 발송되지 않았습니다.');
    }
    const code = sentMail.params.code;

    const verifyResult = await signupEmailVerificationService.verifySignupCode(
        { email, code }, nowOption,
    );
    if (!verifyResult.ok) {
        throw new Error(`prepareSignupProof: 인증번호 확인이 실패했습니다 (${verifyResult.code})`);
    }

    return { signupProof: verifyResult.signupProof, mail: memoryMail };
};

module.exports = { prepareSignupProof };
