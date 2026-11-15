'use strict';

// 가입 닉네임·생일 규칙 시험: 닉네임 길이·글자 종류, 생일 모양·윤년·미래, 가입 본문 검사 차례
// 목록 A11-B-011~027 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: node --env-file=.env.test --test tests/unit/a11a-nickname-birth.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateNickname, validateBirthDate, validateSignupPayload } = require('../../validations/auth/signup');

const NICK_LENGTH_MESSAGE = '닉네임은 2~8자여야 합니다.';
const NICK_CHAR_MESSAGE = '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.';
const BIRTH_FORMAT_MESSAGE = '생년월일 형식이 올바르지 않습니다.';

// 오늘·내일 UTC 날짜 글자 (예: "2026-11-16")
const utcDay = (offsetDays) => {
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
    return day.toISOString().slice(0, 10);
};

// 닉네임 길이 경계: 1 거절 · 2 통과 · 8 통과 · 9 거절
const nickLengthCases = [
    { id: 'A11-B-011', value: '가', ok: false },
    { id: 'A11-B-012', value: '가나', ok: true },
    { id: 'A11-B-013', value: '가나다라마바사아', ok: true },
    { id: 'A11-B-014', value: '가나다라마바사아자', ok: false },
];
for (const { id, value, ok } of nickLengthCases) {
    test(`${id} 닉네임 ${value.length}자 → ${ok ? '통과' : '거절'}`, () => {
        const result = validateNickname(value);
        assert.equal(result.ok, ok);
        if (!ok) assert.equal(result.message, NICK_LENGTH_MESSAGE);
    });
}

// 못 쓰는 글자: 밑줄·가운데 빈칸·그림 글자
const nickCharCases = [
    { id: 'A11-B-015', value: '가나_다' },
    { id: 'A11-B-016', value: '가 나' },
    { id: 'A11-B-017', value: '가나🎭' },
];
for (const { id, value } of nickCharCases) {
    test(`${id} 닉네임 "${value}" → 글자 종류 거절`, () => {
        const result = validateNickname(value);
        assert.equal(result.ok, false);
        assert.equal(result.message, NICK_CHAR_MESSAGE);
    });
}

test('A11-B-018 빈칸만 넣은 닉네임 → 입력 안내', () => {
    const result = validateNickname('   ');
    assert.equal(result.ok, false);
    assert.equal(result.message, '닉네임을 입력해주세요.');
});

test('A11-B-019 없는 날짜 2010-02-30 → 형식 거절', () => {
    const result = validateBirthDate('2010-02-30');
    assert.equal(result.ok, false);
    assert.equal(result.message, BIRTH_FORMAT_MESSAGE);
});

test('A11-B-020 다른 모양 2010/01/01 → 형식 거절', () => {
    const result = validateBirthDate('2010/01/01');
    assert.equal(result.ok, false);
    assert.equal(result.message, BIRTH_FORMAT_MESSAGE);
});

test('A11-B-021 윤년 2012-02-29 → 통과', () => {
    assert.equal(validateBirthDate('2012-02-29').ok, true);
});

test('A11-B-022 윤년 아닌 2013-02-29 → 형식 거절', () => {
    const result = validateBirthDate('2013-02-29');
    assert.equal(result.ok, false);
    assert.equal(result.message, BIRTH_FORMAT_MESSAGE);
});

test('A11-B-023 오늘(UTC 날짜) 생일 → 통과', () => {
    assert.equal(validateBirthDate(utcDay(0)).ok, true);
});

test('A11-B-024 내일 생일 → 미래 거절', () => {
    const result = validateBirthDate(utcDay(1));
    assert.equal(result.ok, false);
    assert.equal(result.message, '생년월일은 미래일 수 없습니다.');
});

// 시간대 따라 하루 밀리면 아이디 찾기·나이 셈이 틀어짐
test('A11-B-025 생일 2010-05-05 → UTC 2010-05-05 0시', () => {
    const result = validateBirthDate('2010-05-05');
    assert.equal(result.ok, true);
    assert.equal(result.value.getTime(), Date.UTC(2010, 4, 5));
});

// 처음 틀린 칸 문구 하나만 (차례: 이메일 → 닉네임 → 비번 → 확인 → 생일)
test('A11-B-026 이메일 빈 값 + 나머지 다 틀림 → 이메일 문구', () => {
    const result = validateSignupPayload({ email: '', nickname: '가', password: 'abc', passwordConfirm: 'x', birthDate: '2010/01/01' });
    assert.equal(result.ok, false);
    assert.equal(result.message, '이메일을 입력해주세요.');
});

test('A11-B-027 비번·생일 틀림 → 비번 문구', () => {
    const result = validateSignupPayload({
        email: 'b027@example.com', nickname: '가나다', password: 'abcdefg', passwordConfirm: 'abcdefg', birthDate: '2010/01/01',
    });
    assert.equal(result.ok, false);
    assert.equal(result.message, '비밀번호는 8~64자여야 합니다.');
});
