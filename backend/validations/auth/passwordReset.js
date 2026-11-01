'use strict';

// 비번 재설정 입력 검사 파일, 메일 요청 주소 검사(미들웨어) · 링크 토큰 모양 확인
// routes/auth.routes.js가 메일 요청 앞에 두고, 토큰 확인은 services/auth/passwordReset/confirm.js가 부름
const EMAIL_MAX_LENGTH = 100;
// 토큰 원문은 32바이트를 base64url로 쓴 43자
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// 어느 칸이 틀렸는지 안 알려 주게 문구 하나만
const INVALID_MESSAGE = '입력 형식이 올바르지 않습니다.';

// 주소 모양만 대충 봄: 100자 안, 공백 없음, @ 앞뒤 있음, 도메인에 점
const validateResetEmail = (email) => {
    if (typeof email !== 'string') return { ok: false, message: INVALID_MESSAGE };

    const trimmed = email.trim();
    if (!trimmed) return { ok: false, message: INVALID_MESSAGE };
    if (trimmed.length > EMAIL_MAX_LENGTH) return { ok: false, message: INVALID_MESSAGE };
    if (/\s/.test(trimmed)) return { ok: false, message: INVALID_MESSAGE };

    const atIndex = trimmed.indexOf('@');
    if (atIndex <= 0 || atIndex === trimmed.length - 1) return { ok: false, message: INVALID_MESSAGE };

    const domain = trimmed.slice(atIndex + 1);
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
        return { ok: false, message: INVALID_MESSAGE };
    }

    return { ok: true, value: trimmed };
};

// 틀리면 400 INVALID_INPUT만, 맞으면 다듬은 주소 넘김 (주소 요청 수 제한 키로도 씀)
const validateResetRequest = (req, res, next) => {
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

// 43자 글자 확인 → 풀어서 32바이트인지 → 다시 써도 같은 글자인지 (같은 토큰 다른 표기 막기)
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
    if (decoded.toString('base64url') !== token) return { ok: false };

    return { ok: true, value: token };
};

module.exports = {
    EMAIL_MAX_LENGTH,
    TOKEN_BYTES,
    TOKEN_PATTERN,
    validateResetEmail,
    validateResetRequest,
    validateResetToken,
};
