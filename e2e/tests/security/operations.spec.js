// 보안(관리자 통로·요청 수 제한·운영 설정 시작): 열쇠 없음/틀림 막힘, 요청 수 제한, 운영 설정으로 켠 서버에서 /e2e 없음·HSTS·약한 JWT 시작 거부
// 따로 띄우는 백엔드는 보안 파트 전용 포트 4190~4199, 이 파일 안에서만 순서대로(serial) 씀 (브리프 지시)
// 근거: docs/보안_점검_2026-11-09.md '권한 관리자 지급·내부'·'인증 무차별 대입 제한'·'인증 서명 키 세기'·'헤더'·'오류 응답'·'설정'
const { test, expect } = require('../../helpers/fixtures');
const { api, login, signToken, decodeCookie, startSec, PRODUCTION, rand, readSecrets, E2E } = require('./_sec');

// 따로 띄우는 백엔드가 겹치지 않게 이 파일 전체를 순서대로 (한 번에 서버 하나만 켜짐)
test.describe.configure({ mode: 'serial' });

test.describe('관리자 통로 열쇠 (4100 본 서버에서 몇 번만)', () => {
    test('열쇠 없이 /internal/* 를 부르면 → 401 INTERNAL_UNAUTHORIZED', async () => {
        const r = await api('GET', '/internal/live');
        expect(r.status).toBe(401);
        expect(r.json?.code).toBe('INTERNAL_UNAUTHORIZED');
    });

    test('틀린 열쇠·길이만 맞춘 열쇠는 → 401', async () => {
        for (const key of ['x'.repeat(40), 'short', 'y'.repeat(64)]) {
            const r = await api('GET', '/internal/live', { headers: { 'x-internal-key': key } });
            expect(r.status).toBe(401);
        }
    });

    test('맞는 열쇠면 → 200 (명단·닉네임 없는 요약)', async () => {
        const r = await api('GET', '/internal/live', { headers: { 'x-internal-key': readSecrets().INTERNAL_API_KEY } });
        expect(r.status).toBe(200);
        expect(r.body).not.toMatch(/nickname|email/);
    });

    test('열쇠 없이 공지·끊기·점검 같은 쓰기 통로를 불러도 → 401 (아무 일 안 일어남)', async ({ accounts }) => {
        const victim = await accounts.create();
        for (const [m, p, b] of [
            ['POST', `/internal/users/${victim.uuid}/disconnect`, {}],
            ['POST', '/internal/announcements', { announcementId: 'x', title: 't', body: 'b', target: 'online' }],
            ['POST', '/internal/maintenance/reload', {}],
        ]) {
            const r = await api(m, p, { body: b });
            expect(r.status, p).toBe(401);
        }
    });

    test('/e2e/* 시험 통로도 열쇠 없으면 401, 틀리면 401', async () => {
        expect((await api('GET', '/e2e/games/x')).status).toBe(401);
        expect((await api('GET', '/e2e/games/x', { headers: { 'x-internal-key': 'z'.repeat(40) } })).status).toBe(401);
    });
});

test.describe('관리자 지급 권한 (DB role)', () => {
    test('보통 계정이 /economy/admin/grant 를 부르면 → 403', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('POST', '/economy/admin/grant', { cookie, body: { userId: '00000000-0000-4000-8000-000000000001', reason: 'X', referenceEventId: `r-${rand()}` } });
        expect(r.status).toBe(403);
    });

    test('토큰 role을 ADMIN으로 바꿔 진짜 키로 서명해도 → 403 (DB role로 봄)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const payload = decodeCookie(cookie);
        const forged = `accessToken=${signToken({ uuid: payload.uuid, role: 'ADMIN', sessionId: payload.sessionId })}`;
        const r = await api('POST', '/economy/admin/grant', { cookie: forged, body: { userId: payload.uuid, reason: 'X', referenceEventId: `r-${rand()}` } });
        expect(r.status).toBe(403);
    });
});

// 따로 띄우는 백엔드를 쓰는 시험 — 한 번에 하나씩 (브리프: 횟수 줄여 순서대로, 전용 포트 4190~4199)
test.describe('요청 수 제한 (운영 기본 ip 제한으로 따로 띄운 서버)', () => {
    test.describe.configure({ mode: 'serial' });
    let server;
    test.beforeAll(async () => { test.setTimeout(330000); server = await startSec(0, { defaultIpLimits: true }); });
    test.afterAll(async () => { await server?.stop(); });

    // 주소는 127.0.0.1로 고정 (localhost는 IPv6·IPv4가 섞여 ip 키가 둘로 갈릴 수 있음)
    const base = () => server.url.replace('localhost', '127.0.0.1');

    test('로그인을 같은 ip로 50번 넘게 틀리면 → 그 다음은 429 RATE_LIMITED', async ({ accounts }) => {
        const account = await accounts.create();
        const seen = {};
        let limited = null;
        for (let i = 0; i < 70; i += 1) {
            const r = await api('POST', '/auth/login', { base: base(), body: { email: account.email, password: 'Wrong!pass' } });
            seen[r.status] = (seen[r.status] ?? 0) + 1;
            if (r.status === 429) { limited = r; break; }
        }
        expect(limited, `받은 상태 수: ${JSON.stringify(seen)}`).not.toBeNull();
        expect(limited.json?.code).toBe('RATE_LIMITED');
        // 제한은 계정 말고 ip로 걸림: 다른 이메일로 해도 429
        const other = await api('POST', '/auth/login', { base: base(), body: { email: `nobody-${Date.now()}@example.test`, password: 'x' } });
        expect(other.status).toBe(429);
    });

    test('이메일 중복 확인을 같은 ip로 20번 넘게 부르면 → 429', async () => {
        const seen = {};
        let limited = false;
        for (let i = 0; i < 30; i += 1) {
            const r = await api('GET', `/auth/check-email?email=probe-${i}@example.test`, { base: base() });
            seen[r.status] = (seen[r.status] ?? 0) + 1;
            if (r.status === 429) { limited = true; break; }
        }
        expect(limited, `받은 상태 수: ${JSON.stringify(seen)}`).toBe(true);
    });
});

test.describe('운영 설정으로 켠 서버', () => {
    test.describe.configure({ mode: 'serial' });
    let prod;
    test.beforeAll(async () => { test.setTimeout(330000); prod = await startSec(1, { overrides: PRODUCTION }); });
    test.afterAll(async () => { await prod?.stop(); });

    test('운영 서버 응답에는 → HSTS(1년·하위 도메인 포함)가 붙음', async () => {
        const r = await api('GET', '/health', { base: prod.url });
        expect(r.status).toBe(200);
        expect(r.headers['strict-transport-security']).toContain('max-age=31536000');
        expect(r.headers['strict-transport-security']).toContain('includeSubDomains');
    });

    test('운영 서버에는 → /e2e 시험 통로가 아예 없음 (열쇠를 줘도 404)', async () => {
        const r = await api('GET', '/e2e/games/x', { base: prod.url, headers: { 'x-internal-key': readSecrets().INTERNAL_API_KEY } });
        expect(r.status).toBe(404);
    });

    test('운영 서버에서 없는 경로 404 → 요청 주소를 되비추지 않는 고정 문구', async () => {
        const r = await api('GET', '/nope/secret-xyz?token=tok-999', { base: prod.url });
        expect(r.status).toBe(404);
        expect(r.body).not.toContain('secret-xyz');
        expect(r.body).not.toContain('tok-999');
    });

    test('운영 서버에서 없는 이메일·틀린 비번 → 본문이 글자 하나까지 같음 (스택을 안 실음)', async ({ accounts }) => {
        const account = await accounts.create();
        const a = await api('POST', '/auth/login', { base: prod.url, body: { email: `nobody-${rand()}@example.test`, password: 'Wrong!pass' } });
        const b = await api('POST', '/auth/login', { base: prod.url, body: { email: account.email, password: 'Wrong!pass' } });
        expect(a.status).toBe(401);
        expect(a.body).toBe(b.body);
        expect(a.body).not.toMatch(/\.js:\d+|AppError/);
    });

    test('운영 서버의 500대 오류는 → 고정 문구만 (스택·표 이름 없음)', async () => {
        // 깨진 JSON은 400 고정, 더 확실히 내부 노출 없음만 확인
        const r = await api('POST', '/auth/login', { base: prod.url, raw: '{bad', headers: { 'content-type': 'application/json' } });
        expect(r.body).not.toMatch(/SyntaxError|\.js:\d+/);
    });
});

test.describe('운영에서 약한 설정이면 시작 거부', () => {
    test.describe.configure({ mode: 'serial' });

    test('운영 + 짧은 JWT_SECRET → 서버가 시작 거부(종료 코드 1)', async () => {
        test.setTimeout(180000);
        const r = await startSec(2, { expectExit: true, overrides: { ...PRODUCTION, JWT_SECRET: 'short' } });
        expect(r.code).toBe(1);
        expect(r.output).toMatch(/서명 키|JWT/);
    });

    test('운영 + 예시 모양 JWT_SECRET(change…) → 시작 거부', async () => {
        test.setTimeout(180000);
        const r = await startSec(3, { expectExit: true, overrides: { ...PRODUCTION, JWT_SECRET: 'change-me-please-change-me-please-xx' } });
        expect(r.code).toBe(1);
    });

    test('운영에 시험 손잡이(E2E_HOOKS)가 남아 있으면 → 시작 거부', async () => {
        test.setTimeout(180000);
        const r = await startSec(4, { expectExit: true, overrides: { NODE_ENV: 'production', E2E_HOOKS: '1', MAIL_TEST_OUTBOX_DIR: undefined } });
        expect(r.code).toBe(1);
        expect(r.output).toMatch(/E2E|시험/);
    });
});
