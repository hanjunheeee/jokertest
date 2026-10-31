'use strict';

const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 8;
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/;

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const PASSWORD_MAX_BYTES = 72;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseIsoDateUtc = (value) => {
    if (typeof value !== 'string') return null;
    const match = ISO_DATE_PATTERN.exec(value);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    const rollOver = date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day;
    if (rollOver) return null;

    return date;
};

const todayUtc = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const validateNickname = (nickname) => {
    if (typeof nickname !== 'string' || !nickname.trim()) {
        return { ok: false, message: '닉네임을 입력해주세요.' };
    }
    const trimmed = nickname.trim();
    if (trimmed.length < NICKNAME_MIN_LENGTH || trimmed.length > NICKNAME_MAX_LENGTH) {
        return { ok: false, message: `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자여야 합니다.` };
    }
    if (!NICKNAME_PATTERN.test(trimmed)) {
        return { ok: false, message: '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.' };
    }
    return { ok: true, value: trimmed };
};

const validateBirthDate = (birthDate) => {
    if (typeof birthDate !== 'string' || !birthDate.trim()) {
        return { ok: false, message: '생년월일을 입력해주세요.' };
    }
    const parsed = parseIsoDateUtc(birthDate.trim());
    if (!parsed) {
        return { ok: false, message: '생년월일 형식이 올바르지 않습니다.' };
    }
    if (parsed.getTime() > todayUtc().getTime()) {
        return { ok: false, message: '생년월일은 미래일 수 없습니다.' };
    }
    return { ok: true, value: parsed };
};

const validatePassword = (password) => {
    if (typeof password !== 'string' || password.length === 0) {
        return { ok: false, message: '비밀번호를 입력해주세요.' };
    }
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
        return { ok: false, message: `비밀번호는 ${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH}자여야 합니다.` };
    }
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
        return { ok: false, message: `비밀번호는 ${PASSWORD_MAX_BYTES}바이트를 넘을 수 없습니다.` };
    }
    return { ok: true, value: password };
};

const validatePasswordConfirm = (password, passwordConfirm) => {
    if (password !== passwordConfirm) {
        return { ok: false, message: '비밀번호 확인이 일치하지 않습니다.' };
    }
    return { ok: true };
};

const validateSignupPayload = (payload) => {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return { ok: false, message: '요청 형식이 올바르지 않습니다.', status: 400 };
    }

    const { email, password, passwordConfirm, nickname, birthDate } = payload;

    if (typeof email !== 'string' || !email.trim()) {
        return { ok: false, message: '이메일을 입력해주세요.', status: 400 };
    }

    const nicknameResult = validateNickname(nickname);
    if (!nicknameResult.ok) return { ok: false, message: nicknameResult.message, status: 400 };

    const passwordResult = validatePassword(password);
    if (!passwordResult.ok) return { ok: false, message: passwordResult.message, status: 400 };

    const confirmResult = validatePasswordConfirm(password, passwordConfirm);
    if (!confirmResult.ok) return { ok: false, message: confirmResult.message, status: 400 };

    const birthDateResult = validateBirthDate(birthDate);
    if (!birthDateResult.ok) return { ok: false, message: birthDateResult.message, status: 400 };

    return {
        ok: true,
        value: {
            email: email.trim(),
            password: passwordResult.value,
            nickname: nicknameResult.value,
            birthDate: birthDateResult.value,
        },
    };
};

module.exports = {
    NICKNAME_MIN_LENGTH,
    NICKNAME_MAX_LENGTH,
    NICKNAME_PATTERN,
    PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MAX_BYTES,
    parseIsoDateUtc,
    todayUtc,
    validateNickname,
    validateBirthDate,
    validatePassword,
    validatePasswordConfirm,
    validateSignupPayload,
};
