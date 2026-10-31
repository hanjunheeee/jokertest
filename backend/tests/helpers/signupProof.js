'use strict';

process.env.SIGNUP_EMAIL_HMAC_SECRET = process.env.SIGNUP_EMAIL_HMAC_SECRET
    || 'test-only-signup-email-hmac-secret-not-for-prod';

const mailAdapterModule = require('../../mail/mailAdapter');
const signupEmailVerificationService = require('../../service/signupEmailVerification.service');

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
