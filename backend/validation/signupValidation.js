'use strict';

// F-02: 회원가입 입력 검증. frontend/src/domains/auth/validation/signupValidation.js와
// 규칙(길이·문자셋·날짜 파싱)을 동일하게 유지해야 한다 — 두 파일은 모듈 시스템이 달라(ESM/
// CommonJS) 코드를 그대로 공유할 수 없으므로, tests/fixtures/f02-signup-validation.json의
// 같은 벡터를 양쪽 테스트가 돌려 판정이 갈리지 않는지 확인한다.

const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 8;
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/;

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
// bcrypt는 72바이트를 넘는 입력을 조용히 잘라서 해시한다 — 문자 수 상한(64)만으로는
// 멀티바이트 문자(한글 등)가 섞인 입력이 72바이트를 넘는 경우를 걸러내지 못해, 사용자가
// 입력한 값과 실제로 해시되는 값이 달라질 수 있다.
const PASSWORD_MAX_BYTES = 72;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// 'YYYY-MM-DD'를 로컬 타임존과 무관하게 UTC 자정 Date로 만든다. new Date(str)의 브라우저/
// 서버별 파싱차이나 new Date(y,m,d)의 로컬 타임존 조합을 쓰면 실행 위치에 따라 하루가 밀릴
// 수 있어, Date.UTC로만 만들고 그 결과를 다시 UTC 필드로 되읽어 2월 30일 같은 존재하지
// 않는 날짜(달력 롤오버)를 걸러낸다.
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

// 반환값은 UTC 자정 Date다 — 그대로 users.birth_date(Sequelize DATE, 기본 timezone
// '+00:00')에 저장하면 삽입·조회 모두 같은 UTC 오프셋을 거치므로 날짜가 하루 밀리지 않는다.
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

// 요청 바디에서 허용된 필드(email/password/passwordConfirm/nickname/birthDate)만 꺼내
// 검증한다. role/status/email_verified 같은 관리 필드가 실려 와도 이 함수의 반환값에는
// 절대 담기지 않는다 — auth.service.js의 signup은 이 value만 사용해 저장 payload를 만든다.
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
