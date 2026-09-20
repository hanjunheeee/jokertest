'use strict';

// F-29b: 비밀번호 재설정 요청·토큰 입력 검증. auth.routes.js가 이 미들웨어를 IP 제한과
// 대상(이메일) 제한 사이에 연결한다 — 제한기 키를 만들기 전에 입력 형식부터 걸러낸다.

const EMAIL_MAX_LENGTH = 100;
const TOKEN_BYTES = 32;
// randomBytes(32).toString('base64url')은 패딩 없이 정확히 43자다(256비트 ÷ 6비트).
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const INVALID_MESSAGE = '입력 형식이 올바르지 않습니다.';

const validateResetEmail = (email) => {
    if (typeof email !== 'string') return { ok: false, message: INVALID_MESSAGE };

    const trimmed = email.trim();
    if (!trimmed) return { ok: false, message: INVALID_MESSAGE };
    if (trimmed.length > EMAIL_MAX_LENGTH) return { ok: false, message: INVALID_MESSAGE };
    if (/\s/.test(trimmed)) return { ok: false, message: INVALID_MESSAGE }; // 내부 공백 금지

    const atIndex = trimmed.indexOf('@');
    if (atIndex <= 0 || atIndex === trimmed.length - 1) return { ok: false, message: INVALID_MESSAGE };

    const domain = trimmed.slice(atIndex + 1);
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
        return { ok: false, message: INVALID_MESSAGE };
    }

    return { ok: true, value: trimmed };
};

// Express 미들웨어. 실패는 배열·비문자열·형식 오류 모두 400 {ok:false,code:'INVALID_INPUT'}로
// 즉시 응답한다(공통 globalErrorHandler를 거치지 않는다 — find-id와 같은 계약). 성공하면
// res.locals.passwordResetInput에 trim된 값을 담고 next()를 부른다.
const validatePasswordResetRequest = (req, res, next) => {
    const body = req.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return res.status(400).json({ ok: false, code: 'INVALID_INPUT' });
    }

    const { email } = body;
    if (Array.isArray(email) || typeof email !== 'string') {
        return res.status(400).json({ ok: false, code: 'INVALID_INPUT' });
    }

    const result = validateResetEmail(email);
    if (!result.ok) {
        return res.status(400).json({ ok: false, code: 'INVALID_INPUT' });
    }

    res.locals.passwordResetInput = { email: result.value };
    return next();
};

// 토큰 원문의 형식만 검사한다 — 실제 존재·만료·사용 여부는 서비스 계층이 해시로 조회해
// 판정한다. 실패 원문(어떤 문자가 왜 틀렸는지)을 오류 메시지에 담지 않는다.
const validateResetToken = (token) => {
    if (typeof token !== 'string') return { ok: false };
    if (!TOKEN_PATTERN.test(token)) return { ok: false };

    let decoded;
    try {
        decoded = Buffer.from(token, 'base64url');
    } catch {
        return { ok: false };
    }
    if (decoded.length !== TOKEN_BYTES) return { ok: false };
    // 재인코딩 일치 — base64url의 마지막 문자가 쓰지 않는 하위 비트를 갖고 있으면 디코딩은
    // 성공해도 표준 형태로 재인코딩한 결과가 원래 문자열과 달라진다.
    if (decoded.toString('base64url') !== token) return { ok: false };

    return { ok: true, value: token };
};

module.exports = {
    EMAIL_MAX_LENGTH,
    TOKEN_BYTES,
    TOKEN_PATTERN,
    validateResetEmail,
    validatePasswordResetRequest,
    validateResetToken,
};
