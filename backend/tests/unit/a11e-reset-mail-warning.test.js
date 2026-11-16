'use strict';

// 재설정 메일 설정 경고 글 시험(순수 계산): 서버 켤 때 띄울 글 — 설정이 다 있으면 없음, 빠지면 빠진 설정 이름만 (값은 안 나옴)
// 목록 A11-B-939~943 (docs/게임_의도_2026-11-15/시험목록/A11b-비번-이메일-탈퇴-마이페이지.md), 돌리기: node --env-file=.env.test --test tests/unit/a11e-reset-mail-warning.test.js
// DB에 안 닿게 막는 주소 (꼭 models require보다 먼저)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const { describeMailWarning } = require('../../services/auth/passwordReset');

// 다 맞는 설정 (시험 전용 값, 진짜 값 아님)
const SMTP_OK = {
    PASSWORD_RESET_APP_URL: 'https://app.example.com',
    MAIL_SMTP_HOST: 'smtp.example.com',
    MAIL_SMTP_USER: 'sender@example.com',
    MAIL_SMTP_PASS: 'test-only-mail-pass',
    PASSWORD_RESET_MAIL_FROM: 'noreply@example.com',
};
const GATEWAY_OK = {
    PASSWORD_RESET_APP_URL: 'https://app.example.com',
    PASSWORD_RESET_MAIL_GATEWAY_URL: 'https://mail-gateway.example.com/send',
    PASSWORD_RESET_MAIL_GATEWAY_TOKEN: 'test-only-gateway-token',
    PASSWORD_RESET_MAIL_FROM: 'noreply@example.com',
};
const without = (env, name) => Object.fromEntries(Object.entries(env).filter(([key]) => key !== name));

test('A11-B-939 SMTP 설정·앱 주소 다 있음 → 경고 없음(null)', () => {
    assert.equal(describeMailWarning(SMTP_OK), null);
});

test('A11-B-940 게이트웨이 설정·앱 주소 다 있음 → 경고 없음(null)', () => {
    assert.equal(describeMailWarning(GATEWAY_OK), null);
});

test('A11-B-941 앱 주소(PASSWORD_RESET_APP_URL) 빠짐 → 경고 글에 그 이름', () => {
    const warning = describeMailWarning(without(SMTP_OK, 'PASSWORD_RESET_APP_URL'));
    assert.equal(warning, '비밀번호 재설정 메일이 안 나감 — 빠진 설정: PASSWORD_RESET_APP_URL');
});

test('A11-B-942 SMTP 비밀번호 빠짐 → 경고 글에 MAIL_SMTP_PASS, 다른 설정 값은 글에 없음', () => {
    const warning = describeMailWarning(without(SMTP_OK, 'MAIL_SMTP_PASS'));
    assert.equal(warning, '비밀번호 재설정 메일이 안 나감 — 빠진 설정: MAIL_SMTP_PASS');
    for (const value of Object.values(SMTP_OK)) assert.ok(!warning.includes(value), `설정 값이 글에 나옴: ${value}`);
});

test('A11-B-943 메일 설정이 하나도 없음 → 앱 주소 + 게이트웨이 설정 세 개 이름', () => {
    assert.equal(
        describeMailWarning({}),
        '비밀번호 재설정 메일이 안 나감 — 빠진 설정: PASSWORD_RESET_APP_URL, PASSWORD_RESET_MAIL_GATEWAY_URL, PASSWORD_RESET_MAIL_GATEWAY_TOKEN, PASSWORD_RESET_MAIL_FROM',
    );
});
