'use strict';

const signupEmailVerificationService = require('../services/auth/signupEmailVerification');

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
