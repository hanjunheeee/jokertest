'use strict';

const { NICKNAME_PATTERN, validateBirthDate } = require('./signup');

const NICKNAME_RAW_MAX_LENGTH = 200;
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 50;

const INVALID_MESSAGE = '입력 형식이 올바르지 않습니다.';

const validateFindIdNickname = (nickname) => {
    if (typeof nickname !== 'string') {
        return { ok: false, message: INVALID_MESSAGE };
    }
    if (nickname.length > NICKNAME_RAW_MAX_LENGTH) {
        return { ok: false, message: INVALID_MESSAGE };
    }
    const trimmed = nickname.trim();
    if (trimmed.length < NICKNAME_MIN_LENGTH || trimmed.length > NICKNAME_MAX_LENGTH) {
        return { ok: false, message: INVALID_MESSAGE };
    }
    if (!NICKNAME_PATTERN.test(trimmed)) {
        return { ok: false, message: INVALID_MESSAGE };
    }
    return { ok: true, value: trimmed };
};

const validateFindIdPayload = (payload) => {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return { ok: false, message: INVALID_MESSAGE, status: 400 };
    }

    const { nickname, birthDate } = payload;

    const nicknameResult = validateFindIdNickname(nickname);
    if (!nicknameResult.ok) return { ok: false, message: nicknameResult.message, status: 400 };

    if (typeof birthDate !== 'string') {
        return { ok: false, message: INVALID_MESSAGE, status: 400 };
    }
    const birthDateResult = validateBirthDate(birthDate);
    if (!birthDateResult.ok) return { ok: false, message: birthDateResult.message, status: 400 };

    return {
        ok: true,
        value: {
            nickname: nicknameResult.value,
            birthDate: birthDateResult.value,
        },
    };
};

const validateFindIdRequest = (req, res, next) => {
    const result = validateFindIdPayload(req.body);
    if (!result.ok) {
        return res.status(400).json({ ok: false, code: 'INVALID_INPUT' });
    }
    res.locals.findIdInput = result.value;
    return next();
};

module.exports = {
    NICKNAME_MIN_LENGTH,
    NICKNAME_MAX_LENGTH,
    NICKNAME_RAW_MAX_LENGTH,
    validateFindIdNickname,
    validateFindIdPayload,
    validateFindIdRequest,
};
