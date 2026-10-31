'use strict';

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
