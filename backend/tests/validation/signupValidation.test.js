'use strict';

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
} = require('../../validation/signupValidation');

const FIXTURE_PATH = path.join(__dirname, '..', '..', '..', 'tests', 'fixtures', 'f02-signup-validation.json');
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

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
    assert.equal(parsed.toISOString().slice(0, 10), '2000-06-15');
});

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

test('F-04 AC-04: bcrypt 72바이트를 넘는 비밀번호는 거부된다(멀티바이트 문자 포함)', () => {
    assert.equal(validatePassword('가'.repeat(25)).ok, false);
    assert.equal(validatePassword('가'.repeat(24)).ok, true);
});

test('AC-04: 비밀번호와 비밀번호 확인이 다르면 거부된다', () => {
    assert.equal(validatePasswordConfirm('pw12345678', 'pw12345678').ok, true);
    assert.equal(validatePasswordConfirm('pw12345678', 'different').ok, false);
});

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
