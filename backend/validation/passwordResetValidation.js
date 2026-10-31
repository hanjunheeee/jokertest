'use strict';

const EMAIL_MAX_LENGTH = 100;
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const INVALID_MESSAGE = '입력 형식이 올바르지 않습니다.';

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
    validatePasswordResetRequest,
    validateResetToken,
};
