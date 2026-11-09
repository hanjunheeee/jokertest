'use strict';
// 가입 경로 오류 처리기 시험 (브라우저 시험 auth #2, 2026-11-09)
// 가입 서비스가 던지는 코드 오류는 전부 정한 문구로 나가야 함 (빠지면 500 + "API 요청 중 에러")

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const { createError } = require('../../utils/appError');

const handle = (url, err) => {
    const res = {
        statusCode: 200, headers: {}, headersSent: false,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        set(name, value) { this.headers[name] = value; return this; },
    };
    globalErrorHandler(err, { method: 'POST', url, originalUrl: url }, res, () => {});
    return res;
};

test('금지어 닉네임 가입은 400 + 정한 문구 (500 아님)', () => {
    const res = handle('/auth/signup', createError('raw', 400, 'NICKNAME_BANNED_WORD'));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'NICKNAME_BANNED_WORD');
    assert.equal(res.body.message, '사용할 수 없는 단어가 들어간 닉네임입니다.');
});

// 가입 경로(/auth/signup·인증번호)가 부르는 파일에서 던지는 코드 오류를 모아 표에 다 있나 봄
test('가입 경로 파일이 던지는 코드는 전부 정한 문구 표에 있음 (500 SERVER_ERROR로 안 바뀜)', () => {
    const root = path.join(__dirname, '..', '..');
    const files = [
        'services/auth/account/signup.js',
        'services/auth/terms/agreements.js',
        'controllers/auth/account.js',
        'controllers/auth/signupEmailVerification.js',
    ];
    // checkSignupAgreements 안 코드만 (재동의 함수 agreeToTerms 코드는 가입 경로 아님)
    const signupOnly = (file, source) => (file.endsWith('agreements.js')
        ? source.slice(source.indexOf('const checkSignupAgreements'), source.indexOf('const recordAgreements'))
        : source);
    // 500 코드는 내부 오류라 숨기는 게 맞음
    const codes = new Set();
    for (const file of files) {
        const source = signupOnly(file, fs.readFileSync(path.join(root, file), 'utf8'));
        for (const match of source.matchAll(/createError\([^)]*?,\s*(\d{3})\s*,\s*[^)]*?['"]([A-Z0-9_]+)['"]/g)) {
            if (Number(match[1]) < 500) codes.add(match[2]);
        }
    }
    assert.ok(codes.size >= 6, `코드를 못 모음: ${[...codes]}`);
    for (const code of codes) {
        const res = handle('/auth/signup', createError('raw', 400, code));
        assert.notEqual(res.statusCode, 500, `${code}가 500으로 바뀜`);
        assert.equal(res.body.code, code);
    }
});
