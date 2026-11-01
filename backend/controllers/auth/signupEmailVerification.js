'use strict';

// 가입 이메일 인증 컨트롤러 파일, 인증번호 요청 · 확인 응답 (캐시 금지)
// routes/auth.routes.js가 검사 뒤 부름, 서비스 결과 코드를 HTTP 상태로 바꿈
const signupEmailVerificationService = require('../../services/auth/signupEmailVerification');

// 인증번호 요청: 실패는 다시 보내기 대기뿐이라 429 + 남은 초
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

// 인증번호 확인: 맞으면 가입 증명 한 번만 내보냄, 틀리면 남은 횟수 붙임
exports.verifySignupCode = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { email, code } = res.locals.signupEmailCodeInput;
        const result = await signupEmailVerificationService.verifySignupCode({ email, code });

        // 시도 초과만 429, 나머지 실패는 400
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
