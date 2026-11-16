'use strict';

// 가입 입력 규칙 거절 글 시험(DB 없이): 닉네임·비번·비번 확인·생일 규칙에 걸리면 400에 안내 글이 실림, 앱이 안 만든 오류 글은 안 실림
// 목록 A11-B-371~379·386~388 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: node --env-file=.env.test --test tests/flow/a11e-signup-reject-text.test.js
// DB에 안 닿게 막는 주소 (꼭 models require보다 먼저), 규칙 거절이 DB 가기 전에 끝나는지 같이 봄
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { startAuthApp, nextIp, request } = require('./a11a-auth-app');
const { applyFrontMiddlewares, listen } = require('../audit-2026-11-09/securityHttp');
const { globalErrorHandler } = require('../../middlewares/errorHandler.middleware');

// 다 맞는 가입 값 (칸 하나만 바꿔 규칙에 걸리게 함, 증명은 규칙 검사 뒤에 봐서 아무 글자)
const validBody = () => ({
    email: 'a11e-reject@example.com',
    password: 'TestOnly-Pass-1',
    passwordConfirm: 'TestOnly-Pass-1',
    nickname: '가면손님',
    birthDate: '1995-05-05',
    signupProof: 'not-checked-yet',
});

// 규칙에 걸리는 칸 하나 → 그 칸 안내 글
const RULE_CASES = [
    ['A11-B-371', '닉네임 1자', { nickname: '가' }, '닉네임은 2~8자여야 합니다.'],
    ['A11-B-372', '닉네임 "가_나"', { nickname: '가_나' }, '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.'],
    // 길이·바이트 거절은 영문+숫자를 넣어 그 까닭 하나로만 걸리게 함
    ['A11-B-373', '비번 65자', { password: `${'p'.repeat(64)}1`, passwordConfirm: `${'p'.repeat(64)}1` }, '비밀번호는 8~64자여야 합니다.'],
    ['A11-B-374', '비번 한글 24자+a1b(75바이트)', { password: `${'가'.repeat(24)}a1b`, passwordConfirm: `${'가'.repeat(24)}a1b` }, '비밀번호는 72바이트를 넘을 수 없습니다.'],
    ['A11-B-375', '비번 확인 다름', { passwordConfirm: 'TestOnly-Pass-2' }, '비밀번호 확인이 일치하지 않습니다.'],
    ['A11-B-376', '생일 내일', { birthDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) }, '생년월일은 미래일 수 없습니다.'],
    ['A11-B-377', '생일 2월 30일', { birthDate: '2000-02-30' }, '생년월일 형식이 올바르지 않습니다.'],
    // 영문+숫자 섞기 (2026-11-16 결정 다섯째 2)
    ['A11-B-386', '비번 영문만 8자', { password: 'abcdefgh', passwordConfirm: 'abcdefgh' }, '비밀번호는 영문과 숫자를 모두 포함해야 합니다.'],
    ['A11-B-387', '비번 숫자만 8자', { password: '12345678', passwordConfirm: '12345678' }, '비밀번호는 영문과 숫자를 모두 포함해야 합니다.'],
    ['A11-B-388', '비번 한글만 8자', { password: '가면무도회살인사', passwordConfirm: '가면무도회살인사' }, '비밀번호는 영문과 숫자를 모두 포함해야 합니다.'],
];

for (const [id, name, change, message] of RULE_CASES) {
    test(`${id} 가입 ${name} → 400 INVALID_INPUT + "${message}"`, async (t) => {
        const base = await startAuthApp(t);
        const res = await request(base, 'POST', '/auth/signup', { body: { ...validBody(), ...change }, ip: nextIp() });
        assert.equal(res.status, 400);
        assert.deepEqual(res.body, { ok: false, code: 'INVALID_INPUT', message });
    });
}

// 가입 경로에서 오류를 그대로 넘기는 작은 서버 (오류 처리기만 진짜)
async function appThatThrows(t, makeError) {
    const app = express();
    applyFrontMiddlewares(app);
    app.post('/auth/signup', (req, res, next) => next(makeError()));
    app.use(globalErrorHandler);
    return listen(t, app);
}

test('A11-B-378 가입 경로에서 앱이 안 만든 400(라이브러리 오류) → 글 없이 { ok:false, code:"INVALID_INPUT" }만', async (t) => {
    const base = await appThatThrows(t, () => Object.assign(new Error('내부 글: a11e-secret@example.com 줄'), { status: 400 }));
    const res = await request(base, 'POST', '/auth/signup', { body: validBody(), ip: nextIp() });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, code: 'INVALID_INPUT' });
    assert.ok(!res.text.includes('a11e-secret'), '내부 글이 응답에 실림');
});

test('A11-B-379 가입 경로의 500 → 글 없이 { ok:false, code:"SERVER_ERROR" }만 (앱이 만든 오류여도)', async (t) => {
    const { createError } = require('../../utils/appError');
    const base = await appThatThrows(t, () => createError('내부 글: users 표 줄', 500));
    const res = await request(base, 'POST', '/auth/signup', { body: validBody(), ip: nextIp() });
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { ok: false, code: 'SERVER_ERROR' });
});
