'use strict';

// 가입 입력 규칙 파일, 닉네임·비번·비번 확인·생일 검사 + 가입 본문 전체 검사
// 가입·소셜 가입·닉네임 바꾸기·비번 바꾸기·비번 재설정·아이디 찾기가 같이 씀
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 8;
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/;

// 비번은 글자 수와 바이트 수 둘 다 봄 (bcrypt가 72바이트 뒤는 버림)
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const PASSWORD_MAX_BYTES = 72;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// YYYY-MM-DD를 UTC 날짜로, 없는 날짜(2월 30일 같은)는 null
const parseIsoDateUtc = (value) => {
    if (typeof value !== 'string') return null;
    const match = ISO_DATE_PATTERN.exec(value);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    // Date가 넘친 날을 다음 달로 넘겼으면 없는 날짜
    const rollOver = date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day;
    if (rollOver) return null;

    return date;
};

// 오늘 UTC 0시 (미래 생일 비교용)
const todayUtc = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

// 닉네임: 다듬은 뒤 길이 → 글자 종류, 다듬은 값 돌려줌
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

// 생일: 날짜 모양 → 미래 아님, Date로 돌려줌
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

// 비번: 빈 값 → 글자 수 → 바이트 수 (다듬지 않고 원문 그대로)
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

// 비번 확인 칸이 같은지
const validatePasswordConfirm = (password, passwordConfirm) => {
    if (password !== passwordConfirm) {
        return { ok: false, message: '비밀번호 확인이 일치하지 않습니다.' };
    }
    return { ok: true };
};

// 본문 객체 → 이메일 있음 → 닉네임 → 비번 → 비번 확인 → 생일, 처음 틀린 칸 문구만 돌려줌
// 이메일 모양은 여기서 안 봄 (가입 증명이 인증한 주소에 묶임)
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
