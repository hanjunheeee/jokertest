'use strict';

// 약관 동의 입력 규칙 파일, 만 나이 셈(한국 날짜 기준) · 동의한 약관 id 목록 정리
// 약관 서비스(services/auth/terms/agreements.js)가 가입·재동의 때 부름

// 가입할 수 있는 가장 어린 만 나이
const MIN_SIGNUP_AGE = 14;
// 한국 시간 = UTC + 9시간 (생일이 바뀌는 날을 한국 날짜로 봄)
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 생일(UTC 0시 Date)과 지금으로 만 나이, 생일 모르면 null
// 예: 생일 2012-11-10, 지금 한국 2026-11-09 → 13 / 한국 2026-11-10 → 14
const ageOn = (birthDate, now = new Date()) => {
    if (!(birthDate instanceof Date) || Number.isNaN(birthDate.getTime())) return null;
    const today = new Date(now.getTime() + KST_OFFSET_MS);
    let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
    const beforeBirthday = today.getUTCMonth() < birthDate.getUTCMonth()
        || (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age;
};

// 만 14세 이상인지
const isOldEnoughToSignup = (birthDate, now = new Date()) => {
    const age = ageOn(birthDate, now);
    return age !== null && age >= MIN_SIGNUP_AGE;
};

// 동의한 약관 id 목록 정리: 양의 정수만, 겹침 뺌, 배열 아니면 null
// 예: [2, "3", 2, -1, "x"] → [2, 3]
const normalizeAgreedIds = (value) => {
    if (!Array.isArray(value)) return null;
    const ids = value
        .map((item) => (typeof item === 'string' && /^\d+$/.test(item) ? Number(item) : item))
        .filter((item) => Number.isInteger(item) && item > 0);
    return [...new Set(ids)];
};

module.exports = {
    MIN_SIGNUP_AGE,
    ageOn,
    isOldEnoughToSignup,
    normalizeAgreedIds,
};
