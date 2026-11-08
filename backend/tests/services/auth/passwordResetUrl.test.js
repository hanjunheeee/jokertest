'use strict';

// 재설정 링크 주소 시험: PASSWORD_RESET_APP_URL이 앱 주소든 /password-reset 화면 주소든 링크가 한 번만 /password-reset
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResetUrl } = require('../../../services/auth/passwordReset/tokens');

const withAppUrl = (t, value) => {
    const saved = process.env.PASSWORD_RESET_APP_URL;
    t.after(() => { if (saved === undefined) delete process.env.PASSWORD_RESET_APP_URL; else process.env.PASSWORD_RESET_APP_URL = saved; });
    if (value === undefined) delete process.env.PASSWORD_RESET_APP_URL; else process.env.PASSWORD_RESET_APP_URL = value;
};

for (const [base, expected] of [
    ['http://localhost:5173', 'http://localhost:5173/password-reset?token=abc'],
    ['http://localhost:5173/', 'http://localhost:5173/password-reset?token=abc'],
    ['http://localhost:5173/password-reset', 'http://localhost:5173/password-reset?token=abc'],
    ['http://localhost:5173/password-reset/', 'http://localhost:5173/password-reset?token=abc'],
    ['https://game.example.test/app?x=1', 'https://game.example.test/app/password-reset?token=abc'],
]) {
    test(`앱 주소 ${base} → ${expected}`, (t) => {
        withAppUrl(t, base);
        assert.equal(buildResetUrl('abc'), expected);
    });
}

test('앱 주소가 없거나 http(s)가 아니면 null (메일 안 보냄)', (t) => {
    withAppUrl(t, undefined);
    assert.equal(buildResetUrl('abc'), null);
    process.env.PASSWORD_RESET_APP_URL = 'ftp://x.test';
    assert.equal(buildResetUrl('abc'), null);
});
