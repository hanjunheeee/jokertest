'use strict';

// F-29a: 아이디 찾기(닉네임+생년월일 → 마스킹 이메일) 입력 검증.
//
// backend/validation/signupValidation.js의 validateNickname은 가입 8자 상한을 포함하므로
// 조회 요청에 직접 쓸 수 없다(AC-04: 8자를 넘는 기존 닉네임도 조회할 수 있어야 한다). 대신
// 같은 정규화(trim)와 같은 문자셋(NICKNAME_PATTERN)만 가져오고, 길이 상한은 조회 대상인
// users.nickname 저장 한도(STRING(50))에 맞춘다. 생년월일 검증은 가입과 완전히 같은 규칙
// (UTC 자정 Date, 달력 유효성, 미래 날짜 금지)이 필요하므로 validateBirthDate를 그대로
// 재사용한다 — 두 경로의 판정이 갈리면 같은 날짜가 가입은 통과하고 조회는 거부되는 식의
// 불일치가 생긴다.
const { NICKNAME_PATTERN, validateBirthDate } = require('./signupValidation');

// 원문 길이 상한(trim 이전). 트림 후 상한(50)보다 넉넉히 크게 잡아, 앞뒤 공백이 아주 많은
// 입력도 "형식 오류"로 걸러내되 과도하게 긴 문자열을 정규식·trim 처리에 그대로 넘기지
// 않는다.
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

// 입력은 요청 body다. 객체 여부와 두 필드의 문자열 타입·형식을 검사한 뒤, 성공하면
// 정규화된 닉네임과 UTC 자정 Date(생년월일)를 value에 담는다.
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

// Express 미들웨어. 실패는 400 {ok:false,code:'INVALID_INPUT'}로 즉시 응답하고(공통
// globalErrorHandler를 거치지 않는다 — AC-03이 요구하는 고정 응답 계약), 성공하면 정규화된
// 값을 res.locals.findIdInput에 저장하고 next()를 호출한다.
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
