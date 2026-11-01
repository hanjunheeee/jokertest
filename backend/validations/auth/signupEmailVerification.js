'use strict';

// 가입 이메일 인증 입력 검사 파일, 주소 맞추기·모양 확인 + 인증번호 요청·확인 미들웨어
// routes/auth.routes.js가 미들웨어로 씀, 주소 맞추기·모양 확인은 가입·소셜 가입·인증 서비스도 씀
const EMAIL_MAX_LENGTH = 100;

// 앞뒤 공백 빼고 소문자 (대소문자·공백만 다른 주소를 같은 주소로 셈), 문자열 아니면 그대로
const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : email);

// 주소 모양만 대충 봄: 100자 안, 공백 없음, @ 앞뒤 있음, 도메인에 점
const validateEmailFormat = (email) => {
    if (typeof email !== 'string') return false;
    const trimmed = email.trim();
    if (!trimmed || trimmed.length > EMAIL_MAX_LENGTH) return false;
    if (/\s/.test(trimmed)) return false;

    const atIndex = trimmed.indexOf('@');
    if (atIndex <= 0 || atIndex === trimmed.length - 1) return false;

    const domain = trimmed.slice(atIndex + 1);
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;

    return true;
};

// 배열 아닌 객체 본문인지
const isPlainObjectBody = (body) => typeof body === 'object' && body !== null && !Array.isArray(body);

// 인증번호 요청: 틀리면 400 INVALID_INPUT만, 맞으면 맞춘 주소 넘김 (주소 요청 수 제한 키로도 씀)
const validateCodeRequest = (req, res, next) => {
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

// 인증번호 확인: 자리 수는 설정에서 받아 정규식 한 번만 만듦, 주소 모양 → 숫자 자리 수
const validateCodeVerify = (codeLength) => {
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
    validateCodeRequest,
    validateCodeVerify,
};
