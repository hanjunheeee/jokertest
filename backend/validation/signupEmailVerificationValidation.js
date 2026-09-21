'use strict';

// F-31a: 가입 이메일 인증(인증번호 발송·확인) 입력 검증. auth.routes.js가 이 미들웨어를
// IP 제한과 이메일 제한 사이에 연결한다(F-29a find-id·F-29b password-reset과 같은 패턴) —
// 제한기 키를 만들기 전에 입력 형식부터 걸러낸다.
//
// 기존 signupValidation.js의 validateSignupPayload는 이메일을 trim만 하고 형식·길이를
// 검사하지 않는다 — 이 파일의 normalizeEmail(trim + 소문자)을 발송·확인·최종 증명 소비
// (auth.service.js의 signup)까지 동일하게 적용해, "같은 이메일"의 판정 기준이 어디서나
// 하나로 통일되게 한다.

const EMAIL_MAX_LENGTH = 100; // users.email과 같은 상한(signupValidation.js, User 모델).

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : email);

const validateEmailFormat = (email) => {
    if (typeof email !== 'string') return false;
    const trimmed = email.trim();
    if (!trimmed || trimmed.length > EMAIL_MAX_LENGTH) return false;
    if (/\s/.test(trimmed)) return false; // 내부 공백 금지

    const atIndex = trimmed.indexOf('@');
    if (atIndex <= 0 || atIndex === trimmed.length - 1) return false;

    const domain = trimmed.slice(atIndex + 1);
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;

    return true;
};

const isPlainObjectBody = (body) => typeof body === 'object' && body !== null && !Array.isArray(body);

/** POST /auth/signup/email-code — 실패는 입력값을 반사하지 않는 INVALID_INPUT 하나뿐이다. */
const validateSignupCodeRequest = (req, res, next) => {
    const body = req.body;
    if (!isPlainObjectBody(body)) {
        return res.status(400).json({ ok: false, code: 'INVALID_INPUT' });
    }

    const { email } = body;
    if (!validateEmailFormat(email)) {
        return res.status(400).json({ ok: false, code: 'INVALID_INPUT' });
    }

    res.locals.signupEmailCodeInput = { email: normalizeEmail(email) };
    return next();
};

/**
 * POST /auth/signup/email-code/verify — code는 설정된 길이의 숫자 문자열만 수용한다.
 * codeLength는 auth.routes.js가 getSignupEmailVerificationConfig로 구한 값을 그대로
 * 넘긴다(라우터 구성 시 한 번만 계산).
 */
const validateSignupCodeVerify = (codeLength) => {
    const codePattern = new RegExp(`^\\d{${codeLength}}$`);

    return (req, res, next) => {
        const body = req.body;
        if (!isPlainObjectBody(body)) {
            return res.status(400).json({ ok: false, code: 'INVALID_INPUT' });
        }

        const { email, code } = body;
        if (!validateEmailFormat(email)) {
            return res.status(400).json({ ok: false, code: 'INVALID_INPUT' });
        }
        if (typeof code !== 'string' || !codePattern.test(code)) {
            return res.status(400).json({ ok: false, code: 'INVALID_INPUT' });
        }

        res.locals.signupEmailCodeInput = { email: normalizeEmail(email), code };
        return next();
    };
};

module.exports = {
    EMAIL_MAX_LENGTH,
    normalizeEmail,
    validateEmailFormat,
    validateSignupCodeRequest,
    validateSignupCodeVerify,
};
