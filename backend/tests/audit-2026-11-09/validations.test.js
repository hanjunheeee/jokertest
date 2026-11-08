'use strict';

// 입력 검사 시험: 경제 필드 표 · 가입(닉네임·비번·생일) · 아이디 찾기 · 비번 재설정 · 가입 이메일 인증
const test = require('node:test');
const assert = require('node:assert/strict');

const economyValidation = require('../../validations/economy');
const signup = require('../../validations/auth/signup');
const findId = require('../../validations/auth/findId');
const passwordReset = require('../../validations/auth/passwordReset');
const emailVerification = require('../../validations/auth/signupEmailVerification');

// 미들웨어 한 번 부르고 응답 또는 next 통과를 돌려줌
const runMiddleware = (middleware, body) => {
    const res = {
        locals: {},
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
    let passed = false;
    middleware({ body }, res, () => { passed = true; });
    return { passed, status: res.statusCode, body: res.body, locals: res.locals };
};

const isoDaysFromToday = (days) => {
    const today = signup.todayUtc();
    return new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10);
};

// 경제 필드 표
test('경제 검사: 허용 표에 없는 필드가 하나라도 있으면 그 경로 오류 코드로 400', () => {
    assert.throws(() => economyValidation.rejectUnknownFields({ itemId: 'a', hack: 1 }, economyValidation.ALLOWED_PURCHASE_FIELDS, 'X_CODE'),
        (error) => error.status === 400 && error.code === 'X_CODE');
});

test('경제 검사: 본문이 null·undefined면 모르는 필드 없음으로 통과', () => {
    assert.doesNotThrow(() => economyValidation.rejectUnknownFields(null, economyValidation.ALLOWED_PURCHASE_FIELDS, 'X'));
    assert.doesNotThrow(() => economyValidation.rejectUnknownFields(undefined, economyValidation.ALLOWED_PURCHASE_FIELDS, 'X'));
});

test('경제 검사: __proto__ 키가 실린 JSON 본문도 모르는 필드로 거절', () => {
    const body = JSON.parse('{"itemId":"a","__proto__":{"admin":true}}');
    assert.throws(() => economyValidation.rejectUnknownFields(body, economyValidation.ALLOWED_PURCHASE_FIELDS, 'X'), (error) => error.code === 'X');
});

test('경제 검사: 양의 안전 정수 판정 (1·최대 안전 정수 통과, 0·-1·1.5·"1"·NaN·큰 수 거절)', () => {
    const ok = economyValidation.isPositiveSafeInteger;
    assert.equal(ok(1), true);
    assert.equal(ok(Number.MAX_SAFE_INTEGER), true);
    for (const value of [0, -1, 1.5, '1', Number.NaN, Number.MAX_SAFE_INTEGER + 1, null, undefined, true]) {
        assert.equal(ok(value), false, String(value));
    }
});

test('경제 검사: 골드 구매 참고용 필드 목록에 productId·version·referenceEventId는 없다 (진짜 필드를 지우지 않음)', () => {
    for (const field of economyValidation.ALLOWED_GOLD_PURCHASE_FIELDS) {
        assert.equal(economyValidation.IGNORED_GOLD_PURCHASE_REFERENCE_FIELDS.includes(field), false, field);
    }
});

// 닉네임
test('닉네임: 2자·8자는 통과, 1자·9자는 거절', () => {
    assert.equal(signup.validateNickname('가나').ok, true);
    assert.equal(signup.validateNickname('가나다라마바사아').ok, true);
    assert.equal(signup.validateNickname('가').ok, false);
    assert.equal(signup.validateNickname('가나다라마바사아자').ok, false);
});

test('닉네임: 앞뒤 공백은 다듬은 값으로 돌려준다', () => {
    assert.deepEqual(signup.validateNickname('  joker1 '), { ok: true, value: 'joker1' });
});

test('닉네임: 공백만 있으면 "입력해주세요"로 거절', () => {
    const result = signup.validateNickname('   ');
    assert.equal(result.ok, false);
    assert.match(result.message, /입력/);
});

test('닉네임: 가운데 공백·특수문자·이모지·자모만은 거절', () => {
    for (const nickname of ['조 커', 'joker!', '조커😀', 'ㅋㅋㅋ', '<b>a</b>']) {
        assert.equal(signup.validateNickname(nickname).ok, false, nickname);
    }
});

test('닉네임: 문자열이 아니면(숫자·배열·null) 거절', () => {
    for (const nickname of [12345, ['조커'], null, undefined, { a: 1 }]) {
        assert.equal(signup.validateNickname(nickname).ok, false);
    }
});

// 비번
test('비번: 8자·64자 통과, 7자·65자 거절', () => {
    assert.equal(signup.validatePassword('a'.repeat(8)).ok, true);
    assert.equal(signup.validatePassword('a'.repeat(64)).ok, true);
    assert.equal(signup.validatePassword('a'.repeat(7)).ok, false);
    assert.equal(signup.validatePassword('a'.repeat(65)).ok, false);
});

test('비번: 한글 24자(72바이트)는 통과, 25자(75바이트)는 바이트 초과로 거절', () => {
    assert.equal(signup.validatePassword('가'.repeat(24)).ok, true);
    const result = signup.validatePassword('가'.repeat(25));
    assert.equal(result.ok, false);
    assert.match(result.message, /바이트/);
});

test('비번: 앞뒤 공백을 다듬지 않고 원문 그대로 돌려준다', () => {
    assert.deepEqual(signup.validatePassword(' pass word '), { ok: true, value: ' pass word ' });
});

test('비번: 문자열이 아니면 거절', () => {
    assert.equal(signup.validatePassword(12345678).ok, false);
    assert.equal(signup.validatePassword(['a'.repeat(8)]).ok, false);
});

test('비번 확인: 같으면 통과, 공백 하나만 달라도 거절', () => {
    assert.equal(signup.validatePasswordConfirm('abcdefgh', 'abcdefgh').ok, true);
    assert.equal(signup.validatePasswordConfirm('abcdefgh', 'abcdefgh ').ok, false);
});

// 생일
test('생일: 윤년 2월 29일은 통과, 평년 2월 29일·2월 30일·13월은 거절', () => {
    assert.equal(signup.validateBirthDate('2000-02-29').ok, true);
    assert.equal(signup.validateBirthDate('2001-02-29').ok, false);
    assert.equal(signup.validateBirthDate('2000-02-30').ok, false);
    assert.equal(signup.validateBirthDate('2000-13-01').ok, false);
});

test('생일: 어제는 통과, 모레는 미래라 거절 (자정 걸침에도 안 흔들리게 하루 여유)', () => {
    assert.equal(signup.validateBirthDate(isoDaysFromToday(-1)).ok, true);
    const tomorrow = signup.validateBirthDate(isoDaysFromToday(2));
    assert.equal(tomorrow.ok, false);
    assert.match(tomorrow.message, /미래/);
});

test('생일: 슬래시·한 자리 월·시간 붙은 값은 형식 오류', () => {
    for (const value of ['2000/01/01', '2000-1-01', '2000-01-01T00:00:00Z', '20000101']) {
        assert.equal(signup.validateBirthDate(value).ok, false, value);
    }
});

test('생일: 돌려준 값은 그 날 UTC 0시 Date', () => {
    const result = signup.validateBirthDate(' 1999-12-31 ');
    assert.equal(result.ok, true);
    assert.equal(result.value.toISOString(), '1999-12-31T00:00:00.000Z');
});

// 가입 본문
test('가입 본문: 배열·null·문자열 본문은 400 형식 오류', () => {
    for (const payload of [[], null, 'x']) {
        const result = signup.validateSignupPayload(payload);
        assert.equal(result.ok, false);
        assert.equal(result.status, 400);
    }
});

test('가입 본문: 여러 칸이 틀리면 이메일→닉네임→비번 순서로 처음 틀린 칸만 알려 준다', () => {
    const result = signup.validateSignupPayload({ email: 'a@b.com', nickname: 'x', password: '1', passwordConfirm: '2', birthDate: 'bad' });
    assert.match(result.message, /닉네임/);
});

test('가입 본문: 맞으면 이메일·닉네임은 다듬고 생일은 Date로 돌려준다', () => {
    const result = signup.validateSignupPayload({
        email: '  a@b.com ', nickname: ' 조커 ', password: 'password1', passwordConfirm: 'password1', birthDate: '2000-01-01',
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.email, 'a@b.com');
    assert.equal(result.value.nickname, '조커');
    assert.ok(result.value.birthDate instanceof Date);
});

// 아이디 찾기
test('아이디 찾기: 닉네임 50자 통과, 51자 거절 (DB 칸 크기)', () => {
    assert.equal(findId.validateFindIdNickname('a'.repeat(50)).ok, true);
    assert.equal(findId.validateFindIdNickname('a'.repeat(51)).ok, false);
});

test('아이디 찾기: 다듬기 전 201자는 공백뿐이어도 바로 거절', () => {
    assert.equal(findId.validateFindIdNickname(`${' '.repeat(199)}ab`).ok, false);
});

test('아이디 찾기: 틀린 칸이 달라도 문구는 하나로 같다', () => {
    const a = findId.validateFindIdPayload({ nickname: 'x', birthDate: '2000-01-01' });
    const b = findId.validateFindIdPayload({ nickname: '조커', birthDate: 5 });
    assert.equal(a.message, b.message);
});

test('아이디 찾기 미들웨어: 틀리면 400 {ok:false, code:INVALID_INPUT}만, 맞으면 다듬은 값을 넘긴다', () => {
    const bad = runMiddleware(findId.validateFindIdRequest, { nickname: '!', birthDate: '2000-01-01' });
    assert.equal(bad.passed, false);
    assert.deepEqual(bad.body, { ok: false, code: 'INVALID_INPUT' });
    const good = runMiddleware(findId.validateFindIdRequest, { nickname: ' 조커 ', birthDate: '2000-01-01' });
    assert.equal(good.passed, true);
    assert.equal(good.locals.findIdInput.nickname, '조커');
});

// 비번 재설정
test('비번 재설정 주소: 100자 통과, 101자 거절', () => {
    // @ 앞은 64자까지라 도메인을 늘려 100자 만듦
    const local = 'a'.repeat(60);
    const domain = `${'b'.repeat(100 - 60 - 1 - '.com'.length)}.com`;
    assert.equal(`${local}@${domain}`.length, 100);
    assert.equal(passwordReset.validateResetEmail(`${local}@${domain}`).ok, true);
    assert.equal(passwordReset.validateResetEmail(`${local}@b${domain}`).ok, false);
});

test('비번 재설정 주소: @ 없음·@로 시작·끝·도메인 점 없음·점으로 끝·공백은 거절', () => {
    for (const email of ['ab.com', '@b.com', 'a@', 'a@b', 'a@b.', 'a@.b', 'a b@c.com']) {
        assert.equal(passwordReset.validateResetEmail(email).ok, false, email);
    }
});

test('비번 재설정 미들웨어: 이메일이 배열이면 400 INVALID_INPUT', () => {
    const result = runMiddleware(passwordReset.validateResetRequest, { email: ['a@b.com'] });
    assert.equal(result.status, 400);
    assert.equal(result.passed, false);
});

test('비번 재설정 미들웨어: 맞으면 다듬은 주소를 넘긴다', () => {
    const result = runMiddleware(passwordReset.validateResetRequest, { email: ' a@b.com ' });
    assert.equal(result.passed, true);
    assert.deepEqual(result.locals.passwordResetInput, { email: 'a@b.com' });
});

test('재설정 토큰: 32바이트 base64url 43자는 통과', () => {
    const token = Buffer.alloc(32, 7).toString('base64url');
    assert.deepEqual(passwordReset.validateResetToken(token), { ok: true, value: token });
});

test('재설정 토큰: 42자·44자·+/ 문자·문자열 아님은 거절', () => {
    const token = Buffer.alloc(32, 7).toString('base64url');
    for (const value of [token.slice(1), `${token}A`, `${token.slice(0, 42)}+`, 123, null]) {
        assert.equal(passwordReset.validateResetToken(value).ok, false, String(value));
    }
});

test('재설정 토큰: 마지막 글자만 바꾼 같은 바이트 다른 표기는 거절', () => {
    const token = Buffer.alloc(32, 0).toString('base64url'); // 마지막 글자 'A'
    const alias = `${token.slice(0, 42)}B`; // 남는 비트만 달라 같은 32바이트로 풀림
    assert.equal(Buffer.from(alias, 'base64url').length, 32);
    assert.equal(passwordReset.validateResetToken(alias).ok, false);
});

// 가입 이메일 인증
test('이메일 맞추기: 앞뒤 공백 빼고 소문자, 문자열 아니면 그대로', () => {
    assert.equal(emailVerification.normalizeEmail('  A@B.Com '), 'a@b.com');
    assert.equal(emailVerification.normalizeEmail(5), 5);
});

test('인증번호 요청 미들웨어: 맞추어진(소문자) 주소를 넘긴다', () => {
    const result = runMiddleware(emailVerification.validateCodeRequest, { email: 'User@Mail.COM' });
    assert.equal(result.passed, true);
    assert.deepEqual(result.locals.signupEmailCodeInput, { email: 'user@mail.com' });
});

test('인증번호 확인 미들웨어: 정한 자리 수 숫자만 통과 (6자리 기준 5·7자리·글자·전각 숫자 거절)', () => {
    const verify = emailVerification.validateCodeVerify(6);
    assert.equal(runMiddleware(verify, { email: 'a@b.com', code: '012345' }).passed, true);
    for (const code of ['12345', '1234567', '12a456', '１２３４５６', 123456]) {
        assert.equal(runMiddleware(verify, { email: 'a@b.com', code }).passed, false, String(code));
    }
});

test('인증번호 확인 미들웨어: 본문이 배열이면 400 INVALID_INPUT', () => {
    const result = runMiddleware(emailVerification.validateCodeVerify(6), ['a@b.com', '123456']);
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { ok: false, code: 'INVALID_INPUT' });
});
