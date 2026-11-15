'use strict';

// 로그인 쿠키·시간 시험: access 유효 시간 자르기, 로그인 유지 켬·끔 쿠키 수명, 쿠키 속성, 가입 인증 기본 설정 값
// 목록 A11-B-044~050 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md), 돌리기: node --env-file=.env.test --test tests/unit/a11a-session-cookie.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    capAccessTokenTtlSeconds, buildSessionCookieOptions, buildRefreshCookieOptions,
} = require('../../utils/auth/cookieOptions');
const { getSignupEmailConfig } = require('../../config/signupEmailVerification');

const DAY_MS = 24 * 60 * 60 * 1000;
// 함수 안에서 지금 시각을 다시 읽어 몇 ms 차이 남 → 1초 안이면 같은 값으로 봄
const assertAbout = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1000, `${actual} ≠ ${expected}`);

// 시험 동안만 NODE_ENV 바꾸기
const withNodeEnv = (t, value) => {
    const saved = process.env.NODE_ENV;
    if (value === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = value;
    t.after(() => {
        if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved;
    });
};

test('A11-B-044 refresh 끝까지 1000초 남음 → access 900초(15분)', () => {
    const now = new Date('2026-11-16T03:00:00Z');
    assert.equal(capAccessTokenTtlSeconds(900, new Date(now.getTime() + 1000_000), now), 900);
});

test('A11-B-045 refresh 끝까지 600초 남음 → access 600초', () => {
    const now = new Date('2026-11-16T03:00:00Z');
    assert.equal(capAccessTokenTtlSeconds(900, new Date(now.getTime() + 600_000), now), 600);
});

// 브라우저 닫으면 사라지는 쿠키 = 수명 칸 없음
test('A11-B-046 로그인 유지 끔 → access 쿠키 maxAge 없음', () => {
    const options = buildSessionCookieOptions(false);
    assert.equal('maxAge' in options, false);
});

test('A11-B-047 로그인 유지 켬 + 끝 10일 뒤 → access 쿠키 maxAge 10일', () => {
    const options = buildSessionCookieOptions(true, new Date(Date.now() + 10 * DAY_MS));
    assertAbout(options.maxAge, 10 * DAY_MS);
});

// 회전해도 처음 끝 시각 넘게 안 늘어남
test('A11-B-048 refresh 쿠키 끝 3일 뒤 → maxAge 3일 (30일로 안 채움)', () => {
    const options = buildRefreshCookieOptions(new Date(Date.now() + 3 * DAY_MS));
    assertAbout(options.maxAge, 3 * DAY_MS);
});

test('A11-B-049 쿠키 속성: 운영은 httpOnly·Lax·secure, 개발은 secure 없음', (t) => {
    withNodeEnv(t, 'production');
    const prod = buildSessionCookieOptions(true, new Date(Date.now() + DAY_MS));
    assert.equal(prod.httpOnly, true);
    assert.equal(prod.sameSite, 'Lax');
    assert.equal(prod.secure, true);
    process.env.NODE_ENV = 'development';
    const dev = buildRefreshCookieOptions(new Date(Date.now() + DAY_MS));
    assert.equal(dev.httpOnly, true);
    assert.equal(dev.sameSite, 'Lax');
    assert.equal(Boolean(dev.secure), false);
});

test('A11-B-050 가입 인증 기본 값 (환경값 없음)', () => {
    const config = getSignupEmailConfig({});
    assert.deepEqual({
        codeLength: config.codeLength,
        codeTtlMs: config.codeTtlMs,
        resendCooldownMs: config.resendCooldownMs,
        maxAttempts: config.maxAttempts,
        proofTtlMs: config.proofTtlMs,
        emailHour: [config.emailHourWindowMs, config.emailHourMax],
        emailDay: [config.emailDayWindowMs, config.emailDayMax],
        ipHour: [config.ipHourWindowMs, config.ipHourMax],
        ipDay: [config.ipDayWindowMs, config.ipDayMax],
    }, {
        codeLength: 6,
        codeTtlMs: 10 * 60 * 1000,
        resendCooldownMs: 60 * 1000,
        maxAttempts: 5,
        proofTtlMs: 10 * 60 * 1000,
        emailHour: [60 * 60 * 1000, 5],
        emailDay: [DAY_MS, 10],
        ipHour: [60 * 60 * 1000, 30],
        ipDay: [DAY_MS, 100],
    });
});
