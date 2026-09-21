'use strict';

// F-31a: 가입 이메일 인증 HTTP 경계. find-id·password-reset과 같은 원칙 — 응답은 항상
// no-store이고, 실패는 고정된 코드·형태로만 응답한다(원본 오류는 안전한 오류 경계로
// 넘긴다). 검증된 입력은 auth.routes.js의 검증 미들웨어가 이미 res.locals에 채워 뒀다.

const signupEmailVerificationService = require('../service/signupEmailVerification.service');

exports.requestSignupCode = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { email } = res.locals.signupEmailCodeInput;
        const result = await signupEmailVerificationService.requestSignupCode({ email });

        if (!result.ok) {
            return res.status(429).json({ ok: false, code: result.code, resendAfterSec: result.resendAfterSec });
        }
        return res.status(200).json({
            ok: true,
            resendAfterSec: result.resendAfterSec,
            expiresInSec: result.expiresInSec,
        });
    } catch (error) {
        return next(error);
    }
};

exports.verifySignupCode = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { email, code } = res.locals.signupEmailCodeInput;
        const result = await signupEmailVerificationService.verifySignupCode({ email, code });

        if (!result.ok) {
            const status = result.code === 'TOO_MANY_ATTEMPTS' ? 429 : 400;
            const body = { ok: false, code: result.code };
            if (result.attemptsRemaining !== undefined) body.attemptsRemaining = result.attemptsRemaining;
            return res.status(status).json(body);
        }
        return res.status(200).json({ ok: true, signupProof: result.signupProof });
    } catch (error) {
        return next(error);
    }
};
