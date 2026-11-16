'use strict';

// API 응답 머리말·쿠키 속성 브라우저 시험 — 시험 서버 응답의 보안 머리말, 운영 값 서버의 HSTS·로그인 쿠키(Secure·HttpOnly·SameSite=Lax), 없는 경로가 주소를 되비추지 않음
// 목록 A15-보안.md 번호 A15-E-059~062 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-headers.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { api, startSec, PRODUCTION, sec } = require('./_sec');

// 이 파일의 따로 띄운 서버 (보안 전용 포트 3번)
const SEC_SLOT = 3;

test('A15-E-059 시험 서버 API 응답 → nosniff·DENY·CSP·Referrer-Policy·Permissions-Policy·COOP·no-store 있음, X-Powered-By 없음 @smoke', async () => {
    const r = await api('GET', '/auth/terms');
    expect(r.status).toBe(200);
    const h = r.headers;
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['content-security-policy']).toBeTruthy();
    expect(h['referrer-policy']).toBeTruthy();
    expect(h['permissions-policy']).toBeTruthy();
    expect(h['cross-origin-opener-policy']).toBeTruthy();
    expect(h['cache-control']).toBe('no-store');
    expect(h['x-powered-by']).toBeUndefined();
});

test('A15-E-062 없는 경로 GET /no-such?token=<시험 글자><script> → 본문에 그 글자 없음', async () => {
    const marker = `a15marker${Date.now().toString(36)}`;
    const r = await api('GET', `/no-such?token=${marker}${encodeURIComponent('<script>')}`);
    expect(r.status).toBe(404);
    expect(r.body).not.toContain(marker);
    expect(r.body).not.toContain('<script>');
});

test.describe('A15 운영 값 서버 머리말·쿠키', () => {
    // 운영 값 서버 하나를 이 묶음이 한 작업자에서 차례로 같이 씀
    test.describe.configure({ mode: 'default' });
    let prod = null;
    test.beforeAll(async () => {
        test.setTimeout(330_000);
        prod = await startSec(SEC_SLOT, { overrides: PRODUCTION });
    });
    test.afterAll(async () => { await prod?.stop(); });

    test('A15-E-060 운영 값 서버 응답 → Strict-Transport-Security 1년·하위 도메인 포함', async () => {
        const r = await api('GET', '/auth/terms', { base: prod.url });
        expect(r.status).toBe(200);
        expect(r.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    });

    test('A15-E-061 운영 값 서버 로그인 응답 Set-Cookie → accessToken·refreshToken 둘 다 Secure·HttpOnly·SameSite=Lax', async ({ accounts }) => {
        const acc = await accounts.create();
        const r = await api('POST', '/auth/login', { base: prod.url, body: { email: acc.email, password: acc.password, rememberMe: true } });
        expect(r.status).toBe(200);
        const cookies = r.setCookies.map((line) => sec.parseSetCookie(line)).filter((c) => c.name === 'accessToken' || c.name === 'refreshToken');
        expect(cookies.map((c) => c.name).sort()).toEqual(['accessToken', 'refreshToken']);
        for (const c of cookies) {
            expect(c.secure, `${c.name} Secure`).toBe(true);
            expect(c.httpOnly, `${c.name} HttpOnly`).toBe(true);
            expect(String(c.sameSite).toLowerCase(), `${c.name} SameSite`).toBe('lax');
        }
    });
});
