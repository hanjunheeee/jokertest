'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { maskEmail, FALLBACK_MASK } = require('../../../utils/auth/maskEmail');
const { validateFindIdPayload } = require('../../../validations/auth/findId');
const { validateNickname } = require('../../../validations/auth/signup');

test('로컬 파트 길이 1은 *로만 가려진다', () => {
    assert.equal(maskEmail('a@b.co'), '*@b***.co');
});

test('로컬 파트 길이 2는 첫 글자만 남는다', () => {
    assert.equal(maskEmail('ab@b.co'), 'a*@b***.co');
});

test('로컬 파트 길이 3 이상은 첫/끝 글자만 남는다', () => {
    assert.equal(maskEmail('abc@example.com'), 'a***c@e***.com');
});

test('긴 이메일도 로컬 첫/끝 글자와 도메인 최상위 도메인만 남는다', () => {
    assert.equal(maskEmail('longlocalpart@mail.example.com'), 'l***t@m***.com');
});

test('점이 없는 도메인은 첫 글자만 남긴다', () => {
    assert.equal(maskEmail('user@localhost'), 'u***r@l***');
});

test('여러 단계 서브도메인도 마지막 점 이후(최상위 도메인)만 남는다', () => {
    assert.equal(maskEmail('user@mail.corp.example.co.kr'), 'u***r@m***.kr');
});

test('마스킹 결과가 원문 이메일 전체를 노출하지 않는다', () => {
    for (const email of ['a@b.co', 'ab@b.co', 'abc@example.com', 'longlocalpart@mail.example.com']) {
        assert.notEqual(maskEmail(email), email);
    }
});

test('@ 없음, 빈 로컬/도메인 등 파싱할 수 없는 문자열은 고정 비식별 표시를 돌려준다', () => {
    assert.equal(maskEmail('not-an-email'), FALLBACK_MASK);
    assert.equal(maskEmail('@nodomain.com'), FALLBACK_MASK);
    assert.equal(maskEmail('nolocal@'), FALLBACK_MASK);
    assert.equal(maskEmail(''), FALLBACK_MASK);
    assert.equal(maskEmail(null), FALLBACK_MASK);
    assert.equal(maskEmail(undefined), FALLBACK_MASK);
    assert.equal(maskEmail(12345), FALLBACK_MASK);
});

test('9자 닉네임은 조회에서는 허용된다(가입 8자 상한과 다름)', () => {
    const result = validateFindIdPayload({ nickname: '아홉글자닉네임임', birthDate: '2000-01-01' });
    assert.equal(result.ok, true);
});

test('50자 닉네임은 조회에서 허용된다', () => {
    const nickname = 'a'.repeat(50);
    const result = validateFindIdPayload({ nickname, birthDate: '2000-01-01' });
    assert.equal(result.ok, true);
    assert.equal(result.value.nickname, nickname);
});

test('51자 닉네임은 조회에서 거부된다(400)', () => {
    const nickname = 'a'.repeat(51);
    const result = validateFindIdPayload({ nickname, birthDate: '2000-01-01' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
});

test('8자 닉네임은 가입에서는 통과하지만 9자는 가입에서 거부된다 — 조회와의 차이를 고정한다', () => {
    assert.equal(validateNickname('a'.repeat(8)).ok, true);
    assert.equal(validateNickname('a'.repeat(9)).ok, false);
});

test('가입 검증과 조회 검증의 trim 결과는 같다', () => {
    const signupResult = validateNickname('  같은닉네임  ');
    const findIdResult = validateFindIdPayload({ nickname: '  같은닉네임  ', birthDate: '2000-01-01' });
    assert.equal(signupResult.ok, true);
    assert.equal(findIdResult.ok, true);
    assert.equal(signupResult.value, findIdResult.value.nickname);
});

test('공백만 있는 닉네임은 거부된다', () => {
    const result = validateFindIdPayload({ nickname: '   ', birthDate: '2000-01-01' });
    assert.equal(result.ok, false);
});

test('허용되지 않은 문자가 섞인 닉네임은 거부된다', () => {
    const result = validateFindIdPayload({ nickname: '닉네임!', birthDate: '2000-01-01' });
    assert.equal(result.ok, false);
});

test('닉네임이 문자열이 아니거나 지나치게 길면 거부된다', () => {
    assert.equal(validateFindIdPayload({ nickname: 123, birthDate: '2000-01-01' }).ok, false);
    assert.equal(validateFindIdPayload({ nickname: 'a'.repeat(201), birthDate: '2000-01-01' }).ok, false);
});

test('윤년의 2월 29일은 통과한다', () => {
    const result = validateFindIdPayload({ nickname: '닉네임', birthDate: '2000-02-29' });
    assert.equal(result.ok, true);
});

test('존재하지 않는 날짜(윤년 아닌 해의 2월 29일)는 거부된다', () => {
    const result = validateFindIdPayload({ nickname: '닉네임', birthDate: '2001-02-29' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
});

test('미래 날짜는 거부된다', () => {
    const farFuture = `${new Date().getUTCFullYear() + 5}-01-01`;
    const result = validateFindIdPayload({ nickname: '닉네임', birthDate: farFuture });
    assert.equal(result.ok, false);
});

test('형식이 아닌 생년월일은 거부된다', () => {
    assert.equal(validateFindIdPayload({ nickname: '닉네임', birthDate: '2000/01/01' }).ok, false);
    assert.equal(validateFindIdPayload({ nickname: '닉네임', birthDate: 'not-a-date' }).ok, false);
    assert.equal(validateFindIdPayload({ nickname: '닉네임', birthDate: 20000101 }).ok, false);
});

test('생년월일이 없거나 payload가 객체가 아니면 거부된다', () => {
    assert.equal(validateFindIdPayload({ nickname: '닉네임' }).ok, false);
    assert.equal(validateFindIdPayload(null).ok, false);
    assert.equal(validateFindIdPayload('string').ok, false);
    assert.equal(validateFindIdPayload([]).ok, false);
});

test('성공 시 value.birthDate는 UTC 자정 Date다', () => {
    const result = validateFindIdPayload({ nickname: '닉네임', birthDate: '1999-12-31' });
    assert.equal(result.ok, true);
    assert.equal(result.value.birthDate.getUTCFullYear(), 1999);
    assert.equal(result.value.birthDate.getUTCMonth(), 11);
    assert.equal(result.value.birthDate.getUTCDate(), 31);
    assert.equal(result.value.birthDate.getUTCHours(), 0);
});
