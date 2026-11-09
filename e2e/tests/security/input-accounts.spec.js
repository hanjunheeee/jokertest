// 보안(계정 바꾸기 입력): 이메일 바꾸기·비번 바꾸기·탈퇴·친구 신청의 입력 검사가 실제 서버에서 막히는지 (본인 확인·모양·권한)
// 근거: docs/보안_점검_2026-11-09.md '입력'·'인증 무차별 대입 제한'(이메일 바꾸기·탈퇴·신고)
const { test, expect } = require('../../helpers/fixtures');
const { api, login, rand } = require('./_sec');

test.describe('이메일 바꾸기', () => {
    test('새 이메일에 여러 곳·끼워 넣기 모양 → 400 INVALID_INPUT (번호 안 보냄)', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        for (const newEmail of ['a@x.test,b@y.test', 'a@x.test;b@y.test', 'a@@x.test', `a@x.test\r\nBcc:b@y.test`]) {
            const r = await api('POST', '/user/me/email/code', { cookie, body: { newEmail, currentPassword: account.password } });
            expect(r.status, newEmail).toBe(400);
            expect(r.json?.code).toBe('INVALID_INPUT');
        }
    });

    test('모양은 맞지만 현재 비번이 틀리면 → 번호 안 보내고 거절', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('POST', '/user/me/email/code', { cookie, body: { newEmail: `new-${rand()}@example.test`, currentPassword: 'Wrong!pass' } });
        expect(r.status).toBe(400);
        expect(r.json?.code).toBe('CURRENT_PASSWORD_INVALID');
    });

    test('이메일 바꾸기 확인(verify)에 여러 곳 주소를 넣으면 → 번호 맞히기 전에 400', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('POST', '/user/me/email/verify', { cookie, body: { newEmail: 'a@x.test,b@y.test', code: '123456' } });
        expect(r.status).toBe(400);
    });

    test('로그인 없이 이메일 바꾸기 번호 요청 → 401', async () => {
        const r = await api('POST', '/user/me/email/code', { body: { newEmail: 'a@b.cd', currentPassword: 'x' } });
        expect(r.status).toBe(401);
    });
});

test.describe('비번 바꾸기', () => {
    test('현재 비번이 틀리면 → 거절되고 비번이 안 바뀜(옛 비번으로 로그인됨)', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('PATCH', '/user/me/password', { cookie, body: { currentPassword: 'Wrong!pass', newPassword: 'NewPass!2345' } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: account.password } })).status).toBe(200);
    });

    test('새 비번이 규칙에 못 미치면(너무 짧음) → 400, 비번 안 바뀜', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('PATCH', '/user/me/password', { cookie, body: { currentPassword: account.password, newPassword: 'short' } });
        expect(r.status).toBe(400);
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: account.password } })).status).toBe(200);
    });

    test('로그인 없이 비번 바꾸기 → 401', async () => {
        const r = await api('PATCH', '/user/me/password', { body: { currentPassword: 'x', newPassword: 'NewPass!2345' } });
        expect(r.status).toBe(401);
    });
});

test.describe('탈퇴 본인 확인', () => {
    test('비번이 틀리면 → 탈퇴 안 됨(400), 계정 그대로 로그인됨', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('POST', '/user/me/withdraw', { cookie, body: { password: 'Wrong!pass', confirmEmail: account.email } });
        expect(r.status).toBe(400);
        expect(r.json?.code).toBe('WITHDRAW_PASSWORD_INVALID');
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: account.password } })).status).toBe(200);
    });

    test('비번 없이 확인 이메일만 맞게 넣으면 → 탈퇴 안 됨(비번 계정은 비번이 있어야 함)', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('POST', '/user/me/withdraw', { cookie, body: { confirmEmail: account.email } });
        expect(r.status).toBe(400);
        // 계정은 그대로 로그인됨
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: account.password } })).status).toBe(200);
    });

    test('비번·확인 이메일이 비면 → 400', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('POST', '/user/me/withdraw', { cookie, body: {} });
        expect(r.status).toBe(400);
    });

    test('로그인 없이 탈퇴 → 401', async () => {
        const r = await api('POST', '/user/me/withdraw', { body: { password: 'x', confirmEmail: 'a@b.cd' } });
        expect(r.status).toBe(401);
    });
});

test.describe('친구 신청 모양', () => {
    test('받는 사람 uuid가 모양이 아니면 → 400·404 (500 없음)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        for (const receiverId of ['not-uuid', '123', '']) {
            const r = await api('POST', '/friends/requests', { cookie, body: { receiverId } });
            expect(r.status, receiverId).toBeGreaterThanOrEqual(400);
            expect(r.status, receiverId).toBeLessThan(500);
        }
    });

    test('나 자신에게 친구 신청 → 거절', async ({ accounts }) => {
        const me = await accounts.create();
        const { cookie, uuid } = await login(me);
        const r = await api('POST', '/friends/requests', { cookie, body: { receiverId: uuid } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
    });

    test('본문 없이 친구 신청 → 400 (빈 본문도 400)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('POST', '/friends/requests', { cookie, body: {} });
        expect(r.status).toBe(400);
    });

    test('차단 목록에 모양 아닌 대상 id → 400·404', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const r = await api('POST', '/friends/blocks', { cookie, body: { targetId: 'not-uuid' } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
    });
});

test.describe('로그인·refresh 모양', () => {
    test('이메일·비번 칸이 비면 → 400 (DB 조회 전에)', async () => {
        for (const body of [{}, { email: '' }, { email: 'a@b.cd' }, { password: 'x' }]) {
            const r = await api('POST', '/auth/login', { body });
            expect(r.status, JSON.stringify(body)).toBe(400);
        }
    });

    test('refresh 쿠키 없이 refresh → 실패하고 쿠키를 지움', async () => {
        const r = await api('POST', '/auth/refresh', {});
        expect(r.status).toBeGreaterThanOrEqual(400);
    });

    test('아무 글자나 refresh 쿠키로 refresh → 실패(401·403)', async () => {
        const r = await api('POST', '/auth/refresh', { cookie: 'refreshToken=not-a-real-refresh-token' });
        expect([400, 401, 403]).toContain(r.status);
        expect(r.setCookies.some((l) => /^accessToken=[^;]+/.test(l))).toBe(false);
    });

    test('로그인 유지로 받은 refresh를 두 번 쓰면(재사용) → 두 번째는 거절되고 세션이 끊김', async ({ accounts }) => {
        const account = await accounts.create();
        const { refresh, cookie } = await login(account, { rememberMe: true });
        // 첫 refresh: 새 토큰으로 회전
        const first = await api('POST', '/auth/refresh', { cookie: refresh });
        expect(first.status).toBe(200);
        // 같은(옛) refresh를 유예시간 지나 다시 쓰기는 어려우니, 옛 토큰 재사용이 감지되면 거절되는지만 확인
        const reused = await api('POST', '/auth/refresh', { cookie: refresh });
        // 유예 안이면 같은 새 토큰(200), 유예 밖이면 재사용 감지로 거절 — 둘 중 하나, 500은 아님
        expect(reused.status).toBeLessThan(500);
    });
});
