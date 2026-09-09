'use strict';

// F-02 AC-01/AC-03/AC-04: 닉네임 길이·문자셋, 생년월일 유효성, 비밀번호 길이 검증이
// tests/fixtures/f02-signup-validation.json의 벡터에 대해 정확히 판정하는지 확인한다.
// frontend/src/domains/auth/validation/__tests__/signupValidation.test.js가 같은 벡터를
// 프론트 검증 모듈로 돌려, 두 쪽이 같은 값에 같은 판정을 내리는지(AC-01) 나눠서 증명한다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    NICKNAME_MIN_LENGTH,
    NICKNAME_MAX_LENGTH,
    validateNickname,
    validateBirthDate,
    validatePassword,
    validatePasswordConfirm,
    validateSignupPayload,
    parseIsoDateUtc,
} = require('../signupValidation');

const FIXTURE_PATH = path.join(__dirname, '..', '..', '..', 'tests', 'fixtures', 'f02-signup-validation.json');
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

// ── AC-01: 닉네임 1/9자 거부, 2/8자 허용, 한글/영문/숫자만 허용 ──────────────────────

test('AC-01: fixture 경계값과 동일한 min/max를 사용한다', () => {
    assert.equal(NICKNAME_MIN_LENGTH, fixture.nickname.minLength);
    assert.equal(NICKNAME_MAX_LENGTH, fixture.nickname.maxLength);
});

test('AC-01: fixture의 유효한 닉네임은 모두 통과한다', () => {
    for (const value of fixture.nickname.valid) {
        const result = validateNickname(value);
        assert.equal(result.ok, true, `"${value}"는 통과해야 합니다`);
    }
});

test('AC-01: fixture의 무효한 닉네임은 모두 거부된다', () => {
    for (const { value, reason } of fixture.nickname.invalid) {
        const result = validateNickname(value);
        assert.equal(result.ok, false, `"${value}"는 거부되어야 합니다 (${reason})`);
    }
});

test('AC-01: 1자/9자 경계는 거부, 2자/8자 경계는 허용된다', () => {
    assert.equal(validateNickname('가').ok, false);
    assert.equal(validateNickname('일이삼사오육칠팔구').ok, false);
    assert.equal(validateNickname('가나').ok, true);
    assert.equal(validateNickname('일이삼사오육칠팔').ok, true);
});

// ── AC-03: 생년월일 필수/형식/미래 날짜 거부, 시간대 무관 저장 ──────────────────────

test('AC-03: fixture의 유효한 생년월일은 모두 통과하고 UTC Date를 돌려준다', () => {
    for (const value of fixture.birthDate.valid) {
        const result = validateBirthDate(value);
        assert.equal(result.ok, true, `"${value}"는 통과해야 합니다`);
        assert.ok(result.value instanceof Date);
    }
});

test('AC-03: fixture의 무효한 생년월일(빈값/형식오류/존재하지 않는 날짜)은 모두 거부된다', () => {
    for (const { value, reason } of fixture.birthDate.invalid) {
        const result = validateBirthDate(value);
        assert.equal(result.ok, false, `"${value}"는 거부되어야 합니다 (${reason})`);
    }
});

test('AC-03: 미래 날짜는 거부된다', () => {
    const now = new Date();
    const tomorrowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const iso = tomorrowUtc.toISOString().slice(0, 10);
    assert.equal(validateBirthDate(iso).ok, false);
});

test('AC-03: 오늘 날짜는 미래가 아니므로 허용된다', () => {
    const now = new Date();
    const todayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        .toISOString().slice(0, 10);
    assert.equal(validateBirthDate(todayIso).ok, true);
});

test('AC-03: 파싱된 날짜는 UTC 자정을 가리켜 시간대 차이로 하루가 이동하지 않는다', () => {
    const parsed = parseIsoDateUtc('2000-06-15');
    assert.equal(parsed.getUTCFullYear(), 2000);
    assert.equal(parsed.getUTCMonth(), 5);
    assert.equal(parsed.getUTCDate(), 15);
    assert.equal(parsed.getUTCHours(), 0);
    // ISO 문자열로 되읽어도(복원) 같은 날짜가 나와야 한다 — 로컬 타임존 변환을 거치지 않았다는 증거.
    assert.equal(parsed.toISOString().slice(0, 10), '2000-06-15');
});

// ── AC-04: 비밀번호 8~64자, 비밀번호 확인 불일치 거부 ────────────────────────────

test('AC-04: fixture의 유효한 비밀번호는 모두 통과한다', () => {
    for (const value of fixture.password.valid) {
        assert.equal(validatePassword(value).ok, true, `길이 ${value.length}는 통과해야 합니다`);
    }
});

test('AC-04: fixture의 무효한 비밀번호는 모두 거부된다', () => {
    for (const { value, reason } of fixture.password.invalid) {
        assert.equal(validatePassword(value).ok, false, `"${reason}" 케이스는 거부되어야 합니다`);
    }
});

test('AC-04: 비밀번호와 비밀번호 확인이 다르면 거부된다', () => {
    assert.equal(validatePasswordConfirm('pw12345678', 'pw12345678').ok, true);
    assert.equal(validatePasswordConfirm('pw12345678', 'different').ok, false);
});

// ── AC-06: 관리 필드는 검증 결과 value에 담기지 않는다 ──────────────────────────

test('AC-06: role/status/email_verified가 섞인 요청도 value에는 허용된 필드만 남는다', () => {
    const result = validateSignupPayload({
        email: 'a@b.com',
        password: 'pw12345678',
        passwordConfirm: 'pw12345678',
        nickname: '테스트닉',
        birthDate: '2000-01-01',
        role: 'ADMIN',
        status: 'BANNED',
        email_verified: true,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.value).sort(), ['birthDate', 'email', 'nickname', 'password']);
    assert.equal(result.value.email, 'a@b.com');
});
