// 보안(헤더·쿠키·오류 응답): API 보안 헤더·X-Powered-By 없음·저장 금지·CORS·로그인 쿠키 속성·404/오류 문구에 입력이 안 비침
// 근거: docs/보안_점검_2026-11-09.md '헤더'·'오류 응답'·'설정 CORS·쿠키' 줄
const { test, expect } = require('../../helpers/fixtures');
const { api, login, sec, E2E } = require('./_sec');

const REQUIRED = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
};

// 여러 종류 응답 (성공·401·404·400·429 아님) 모두 같은 헤더
const PROBES = [
    ['GET', '/health', '상태 확인 200'],
    ['GET', '/auth/me', '로그인 안 한 401'],
    ['GET', '/없는경로', '없는 경로 404'],
    ['POST', '/auth/login', '빈 로그인 400'],
    ['GET', '/auth/terms', '약관 목록 200'],
    ['GET', '/economy/currency-products', '로그인 필요 경제 401'],
    ['GET', '/internal/live', '열쇠 없는 관리자 통로 401'],
    ['GET', '/e2e/games/x', '열쇠 없는 시험 통로 401'],
    ['GET', '/friends', '로그인 필요 친구 401'],
    ['GET', '/notifications', '로그인 필요 알림 401'],
    ['GET', '/game/x', '로그인 필요 판 결과 401'],
    ['POST', '/reports', '로그인 필요 신고 401'],
    ['GET', '/auth/password-reset/verify?token=x', '재설정 확인 200'],
    ['POST', '/auth/signup/email-code', '가입 번호 요청 400'],
    ['GET', '/user/me/profile', '로그인 필요 내 정보 401'],
];

test.describe('보안 헤더', () => {
    for (const [method, pathname, label] of PROBES) {
        test(`${label}(${method} ${pathname}) 응답 → 보안 헤더 넷·CSP frame-ancestors·Permissions-Policy가 붙고 X-Powered-By는 없음`, async () => {
            const r = await api(method, pathname, method === 'POST' ? { body: {} } : {});
            for (const [name, value] of Object.entries(REQUIRED)) expect(r.headers[name], name).toBe(value);
            expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
            expect(r.headers['content-security-policy']).toContain("default-src 'none'");
            expect(r.headers['permissions-policy']).toContain('camera=()');
            expect(r.headers['x-powered-by']).toBeUndefined();
        });
    }

    test('API 응답 → 기본이 Cache-Control: no-store (사람마다 다른 응답을 저장 안 함)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('GET', '/user/me/profile', { cookie });
        expect(r.status).toBe(200);
        expect(r.headers['cache-control']).toBe('no-store');
    });

    test('비번 재설정·가입 경로 응답 → no-store (토큰 든 응답을 브라우저·프록시가 저장 못 함)', async () => {
        const a = await api('GET', '/auth/password-reset/verify?token=abc');
        const b = await api('POST', '/auth/signup/email-code', { body: { email: 'bad' } });
        expect(a.headers['cache-control']).toBe('no-store');
        expect(b.headers['cache-control']).toBe('no-store');
    });

    test('개발 설정 서버 → HSTS를 안 붙임 (http 시험 서버를 https로 묶지 않음, 운영 HSTS는 운영 설정 시험에서)', async () => {
        const r = await api('GET', '/health');
        expect(r.headers['strict-transport-security']).toBeUndefined();
    });

    test('응답에 Server 머리로 서버 프로그램 이름·버전을 안 실음', async () => {
        const r = await api('GET', '/health');
        expect(r.headers.server ?? '').not.toMatch(/express|node/i);
    });
});

test.describe('오류 응답에 입력·내부 문구 안 비침', () => {
    test('없는 경로에 토큰·스크립트를 실은 쿼리로 부르면 → 404 고정 문구, 주소·쿼리를 되비추지 않음', async () => {
        const r = await api('GET', '/nope/secret-path-abc?token=tok-12345&q=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
        expect(r.status).toBe(404);
        expect(r.body).not.toContain('secret-path-abc');
        expect(r.body).not.toContain('tok-12345');
        expect(r.body).not.toContain('<script>');
        expect(r.json?.message).toBe('요청한 경로를 찾을 수 없습니다.');
    });

    test('없는 경로 404 → 응답이 JSON 고정 문구이고 Express 기본 HTML 오류 쪽이 아님 (스택 숨김은 운영 설정 시험에서)', async () => {
        const r = await api('POST', '/auth/없는/경로', { body: { a: 1 } });
        expect(r.status).toBe(404);
        expect(r.headers['content-type']).toContain('application/json');
        expect(r.body).not.toContain('<!DOCTYPE');
        expect(r.json?.message).toBe('요청한 경로를 찾을 수 없습니다.');
    });

    test('깨진 JSON 본문 → 400 INVALID_INPUT만, 본문 조각·라이브러리 이름·줄 위치 안 실음', async () => {
        const r = await api('POST', '/auth/login', { raw: '{"email":"zzz-fragment-777", ', headers: { 'content-type': 'application/json' } });
        expect(r.status).toBe(400);
        expect(r.json).toEqual({ ok: false, code: 'INVALID_INPUT' });
        expect(r.body).not.toContain('zzz-fragment-777');
        expect(r.body).not.toMatch(/SyntaxError|body-parser|position/i);
    });

    test('로그인 응답 본문 → 토큰·비번 해시·세션 id가 없음 (토큰은 쿠키로만)', async ({ accounts }) => {
        const account = await accounts.create();
        const r = await api('POST', '/auth/login', { body: { email: account.email, password: account.password } });
        expect(r.status).toBe(200);
        expect(r.body).not.toMatch(/password|hash|token|session/i);
        expect(Object.keys(r.json.data.user).sort()).toEqual(['nickname', 'role', 'uuid']);
    });

    test('내 정보(/auth/me) 응답 → uuid·role만, 이메일·비번 해시 없음', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('GET', '/auth/me', { cookie });
        expect(r.status).toBe(200);
        expect(Object.keys(r.json.data).sort()).toEqual(['role', 'uuid']);
        expect(r.body).not.toContain(account.email);
    });

    test('내 프로필 응답 → 비번 해시·실패 횟수·잠금 칸이 없음', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('GET', '/user/me/profile', { cookie });
        expect(r.status).toBe(200);
        expect(r.body).not.toMatch(/password_hash|failed_login|locked_until/);
    });
});

test.describe('CORS', () => {
    test('남의 사이트 Origin으로 부르면 → Access-Control-Allow-Origin을 안 줌 (와일드카드도 없음)', async () => {
        const r = await api('GET', '/health', { headers: { origin: 'https://evil.example' } });
        expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('데스크톱·모바일 화면 Origin → 그 주소 그대로 + 쿠키 허용', async () => {
        for (const origin of [E2E.desktopUrl, E2E.mobileUrl]) {
            const r = await api('GET', '/health', { headers: { origin } });
            expect(r.headers['access-control-allow-origin']).toBe(origin);
            expect(r.headers['access-control-allow-credentials']).toBe('true');
        }
    });

    test('남의 사이트 미리 묻기(OPTIONS) → 남의 주소를 되비추지 않고 * 도 안 줌', async () => {
        const r = await api('OPTIONS', '/auth/login', {
            headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
        });
        expect(r.headers['access-control-allow-origin'] ?? '').not.toBe('https://evil.example');
        expect(r.headers['access-control-allow-origin'] ?? '').not.toBe('*');
    });

    test('화면 주소를 앞에 붙인 비슷한 남의 주소(localhost:5273.evil.example) → 허용 안 함', async () => {
        const r = await api('GET', '/health', { headers: { origin: 'http://localhost:5273.evil.example' } });
        expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('브라우저에서 남의 사이트 페이지가 쿠키 실어 API를 읽으려 하면 → 막혀 응답을 못 읽음', async ({ page, context, accounts, ui }) => {
        await ui.loginViaApi(context, await accounts.create());
        // 남의 사이트 흉내: 이 브라우저 안에서만 가짜 주소에 빈 페이지를 돌려줌 (밖으로 안 나감)
        await page.route('http://other-site.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>other</title>' }));
        await page.goto('http://other-site.test/');
        const result = await page.evaluate(async (url) => {
            try {
                const res = await fetch(`${url}/user/me/profile`, { credentials: 'include' });
                return `read:${res.status}`;
            } catch (e) { return 'blocked'; }
        }, E2E.apiUrl);
        expect(result).toBe('blocked');
    });
});

test.describe('로그인 쿠키', () => {
    test('로그인 유지 안 하고 로그인 → accessToken이 HttpOnly·SameSite=Lax·Path=/, Max-Age 없음(브라우저 닫으면 사라짐), 개발은 Secure 없음', async ({ accounts }) => {
        const account = await accounts.create();
        const r = await api('POST', '/auth/login', { body: { email: account.email, password: account.password } });
        const access = r.setCookies.map(sec.parseSetCookie).find((c) => c.name === 'accessToken');
        expect(access.httpOnly).toBe(true);
        expect(access.sameSite?.toLowerCase()).toBe('lax');
        expect(access.path).toBe('/');
        expect(access.maxAge).toBeNull();
        expect(access.secure).toBe(false);
    });

    test('로그인 유지로 로그인 → accessToken·refreshToken 둘 다 HttpOnly·SameSite=Lax, 30일 안 Max-Age', async ({ accounts }) => {
        const account = await accounts.create();
        const r = await api('POST', '/auth/login', { body: { email: account.email, password: account.password, rememberMe: true } });
        const cookies = r.setCookies.map(sec.parseSetCookie);
        for (const name of ['accessToken', 'refreshToken']) {
            const c = cookies.find((x) => x.name === name);
            expect(c, name).toBeTruthy();
            expect(c.httpOnly).toBe(true);
            expect(c.sameSite?.toLowerCase()).toBe('lax');
            expect(c.maxAge).toBeGreaterThan(0);
            expect(c.maxAge).toBeLessThanOrEqual(30 * 24 * 3600);
        }
    });

    test('로그인 유지 안 하면 → refreshToken 쿠키를 지우는 줄만 오고 새 refresh는 없음', async ({ accounts }) => {
        const account = await accounts.create();
        const r = await api('POST', '/auth/login', { body: { email: account.email, password: account.password } });
        const refresh = r.setCookies.find((l) => l.startsWith('refreshToken='));
        expect(refresh).toBeTruthy();
        expect(refresh.split(';')[0]).toBe('refreshToken=');
    });

    test('로그아웃 → accessToken·refreshToken 둘 다 지우는 Set-Cookie (같은 속성)', async ({ accounts }) => {
        const { both } = await login(await accounts.create(), { rememberMe: true });
        const r = await api('POST', '/auth/logout', { cookie: both });
        expect(r.status).toBe(200);
        const cleared = r.setCookies.map(sec.parseSetCookie);
        for (const name of ['accessToken', 'refreshToken']) {
            const c = cleared.find((x) => x.name === name);
            expect(c, name).toBeTruthy();
            expect(c.httpOnly).toBe(true);
        }
        expect(r.setCookies.every((l) => /=;|=\s*;|Expires=Thu, 01 Jan 1970/i.test(l))).toBe(true);
    });

    test('데스크톱 화면에서 로그인 → 페이지 스크립트(document.cookie)로 토큰 쿠키를 못 읽음', async ({ page, accounts, ui }) => {
        await ui.loginViaUi(page, await accounts.create());
        const visible = await page.evaluate(() => document.cookie);
        expect(visible).not.toContain('accessToken');
        expect(visible).not.toContain('refreshToken');
        const attrs = await sec.cookieAttributes(page.context());
        expect(attrs.find((c) => c.name === 'accessToken')?.httpOnly).toBe(true);
    });

    test('모바일 화면에서 로그인 유지로 로그인 → 스크립트로 토큰 쿠키를 못 읽음', async ({ players, accounts, ui }) => {
        const p = await players.add({ mobile: true, login: false });
        await ui.loginViaUi(p.page, await accounts.create(), { remember: true });
        expect(await p.page.evaluate(() => document.cookie)).not.toMatch(/accessToken|refreshToken/);
        const attrs = await sec.cookieAttributes(p.context);
        expect(attrs.filter((c) => /Token$/.test(c.name)).every((c) => c.httpOnly && c.sameSite === 'Lax')).toBe(true);
    });

    test('토큰을 Authorization 머리로만 보내면 → 쿠키가 아니라 401 (토큰은 쿠키로만 받음)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const token = cookie.replace(/^accessToken=/, '');
        const r = await api('GET', '/auth/me', { headers: { authorization: `Bearer ${token}` } });
        expect(r.status).toBe(401);
    });

    test('토큰을 쿼리(?accessToken=)에 실으면 → 401', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('GET', `/auth/me?accessToken=${encodeURIComponent(cookie.replace(/^accessToken=/, ''))}`);
        expect(r.status).toBe(401);
    });
});
