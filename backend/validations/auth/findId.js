'use strict';

// 아이디 찾기 입력 검사 파일, 닉네임·생일 모양 확인 뒤 res.locals.findIdInput에 넣음
// routes/auth.routes.js가 ip 제한 뒤에 둠 (닉네임 글자·생일 규칙은 signup.js 것 같이 씀)
const { NICKNAME_PATTERN, validateBirthDate } = require('./signup');

// 다듬기 전 길이 상한 (아주 긴 값은 다듬기 전에 거절)
const NICKNAME_RAW_MAX_LENGTH = 200;
// 찾기용 닉네임 길이는 DB 닉네임 칸 크기(50)까지 받음
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 50;

// 어느 칸이 틀렸는지 안 알려 주게 문구 하나만
const INVALID_MESSAGE = '입력 형식이 올바르지 않습니다.';

// 닉네임: 문자열 → 길이 → 글자 종류, 다듬은 값 돌려줌
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

// 본문 객체인지 → 닉네임 → 생일 (생일은 UTC 날짜로 바꿔 돌려줌)
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

// 틀리면 400 INVALID_INPUT만, 맞으면 다듬은 값 넘김 (닉네임 요청 수 제한 키로도 씀)
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
