// 보안(세션·토큰): 로그아웃·비번 변경·탈퇴 뒤 옛 쿠키·옛 소켓 끊김, JWT 다른 서명/알고리즘/종류 섞기 거절
// 근거: docs/보안_점검_2026-11-09.md '인증 refresh 회전…'·'로그인 토큰(JWT) 서명 방식·종류 섞임', 결정 '보안 서명 키'
const { test, expect } = require('../../helpers/fixtures');
const { api, login, signToken, decodeCookie, unsignedToken, ban, sec, rand, db, E2E } = require('./_sec');

// 소켓이 붙는지 (쿠키로)
const socketConnects = async (cookie) => {
    const s = await sec.openRawSocket({ cookie, origin: E2E.desktopUrl });
    if (s.connected) s.close();
    return s.connected;
};

test.describe('옛 쿠키·옛 소켓 끊김', () => {
    test('로그아웃하면 → 옛 access 쿠키로 /auth/me가 401', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        expect((await api('GET', '/auth/me', { cookie })).status).toBe(200);
        await api('POST', '/auth/logout', { cookie });
        const after = await api('GET', '/auth/me', { cookie });
        expect(after.status).toBe(401);
    });

    test('로그아웃하면 → 그 전에 붙여 둔 소켓이 끊기고 force_disconnect가 옴', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const s = await sec.openRawSocket({ cookie, origin: E2E.desktopUrl });
        expect(s.connected).toBe(true);
        const gone = new Promise((resolve) => { s.socket.once('disconnect', () => resolve('disconnect')); });
        await api('POST', '/auth/logout', { cookie });
        expect(await Promise.race([gone, new Promise((r) => setTimeout(() => r('stay'), 9000))])).toBe('disconnect');
    });

    test('로그아웃한 쿠키로는 → 소켓을 새로 못 붙임', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        await api('POST', '/auth/logout', { cookie });
        expect(await socketConnects(cookie)).toBe(false);
    });

    test('비번을 바꾸면 → 바꾸기 전 access 쿠키가 401이 됨', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('PATCH', '/user/me/password', { cookie, body: { currentPassword: account.password, newPassword: 'NewPass!2345' } });
        expect(r.status).toBe(200);
        expect((await api('GET', '/auth/me', { cookie })).status).toBe(401);
    });

    test('비번을 바꾸면 → 그 전 소켓이 끊김', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const s = await sec.openRawSocket({ cookie, origin: E2E.desktopUrl });
        expect(s.connected).toBe(true);
        const gone = new Promise((resolve) => { s.socket.once('disconnect', () => resolve('disconnect')); });
        await api('PATCH', '/user/me/password', { cookie, body: { currentPassword: account.password, newPassword: 'NewPass!2345' } });
        expect(await Promise.race([gone, new Promise((r) => setTimeout(() => r('stay'), 9000))])).toBe('disconnect');
    });

    test('비번 재설정을 끝내면 → 옛 비번 로그인은 실패하고 새 비번으로 됨', async ({ accounts }) => {
        const account = await accounts.create();
        const since = Date.now();
        await api('POST', '/auth/password-reset/request', { body: { email: account.email } });
        // 메일 속 링크의 토큰으로 바로 새 비번 저장
        const mailMod = require('../../helpers/mail');
        const url = await mailMod.waitForResetUrl(account.email, { since });
        const token = new URL(url).searchParams.get('token');
        const newPass = 'ResetPass!2345';
        const confirm = await api('POST', '/auth/password-reset/confirm', { body: { token, newPassword: newPass, newPasswordConfirm: newPass } });
        expect(confirm.status).toBeLessThan(400);
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: account.password } })).status).toBe(401);
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: newPass } })).status).toBe(200);
    });

    test('탈퇴하면 → 옛 access 쿠키가 401이 되고 같은 이메일로 로그인도 안 됨', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const r = await api('POST', '/user/me/withdraw', { cookie, body: { password: account.password, confirmEmail: account.email } });
        expect(r.status).toBeLessThan(400);
        expect((await api('GET', '/auth/me', { cookie })).status).toBe(401);
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: account.password } })).status).not.toBe(200);
    });

    test('탈퇴하면 → 그 전 소켓이 끊김', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        const s = await sec.openRawSocket({ cookie, origin: E2E.desktopUrl });
        expect(s.connected).toBe(true);
        const gone = new Promise((resolve) => { s.socket.once('disconnect', () => resolve('disconnect')); });
        await api('POST', '/user/me/withdraw', { cookie, body: { password: account.password, confirmEmail: account.email } });
        expect(await Promise.race([gone, new Promise((r) => setTimeout(() => r('stay'), 9000))])).toBe('disconnect');
    });

    test('정지되면 → 붙어 있던 소켓이 관리자 통로로 끊김', async ({ accounts, internal }) => {
        const account = await accounts.create();
        const { cookie, uuid } = await login(account);
        const s = await sec.openRawSocket({ cookie, origin: E2E.desktopUrl });
        expect(s.connected).toBe(true);
        const gone = new Promise((resolve) => { s.socket.once('disconnect', () => resolve('disconnect')); });
        await ban(uuid, { permanent: true });
        await internal.disconnect(uuid);
        expect(await Promise.race([gone, new Promise((r) => setTimeout(() => r('stay'), 9000))])).toBe('disconnect');
    });

    test('로그아웃은 access가 없어도(만료·삭제) refresh 쿠키의 세션을 끊음', async ({ accounts }) => {
        const { refresh, cookie } = await login(await accounts.create(), { rememberMe: true });
        // access 없이 refresh 쿠키만으로 로그아웃
        await api('POST', '/auth/logout', { cookie: refresh });
        // 원래 access 쿠키는 이제 세션이 끊겨 401
        expect((await api('GET', '/auth/me', { cookie })).status).toBe(401);
    });
});

test.describe('JWT 서명·알고리즘·종류', () => {
    test('서명 없는 토큰(alg none)을 accessToken 쿠키로 넣으면 → 401', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const payload = decodeCookie(cookie);
        const forged = unsignedToken({ uuid: payload.uuid, role: 'ADMIN', sessionId: payload.sessionId });
        const r = await api('GET', '/auth/me', { cookie: `accessToken=${forged}` });
        expect(r.status).toBe(401);
    });

    test('같은 키라도 HS512로 서명한 토큰 → 401 (HS256만 받음)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const payload = decodeCookie(cookie);
        const forged = signToken({ uuid: payload.uuid, role: payload.role, sessionId: payload.sessionId }, { algorithm: 'HS512' });
        const r = await api('GET', '/auth/me', { cookie: `accessToken=${forged}` });
        expect(r.status).toBe(401);
    });

    test('다른 키로 서명한 토큰 → 401', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const payload = decodeCookie(cookie);
        const forged = signToken({ uuid: payload.uuid, role: payload.role, sessionId: payload.sessionId }, {}, 'another-secret-key-not-the-real-one-xx');
        const r = await api('GET', '/auth/me', { cookie: `accessToken=${forged}` });
        expect(r.status).toBe(401);
    });

    test('만료된 토큰 → 401 ACCESS_TOKEN_EXPIRED', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const payload = decodeCookie(cookie);
        const expired = signToken({ uuid: payload.uuid, role: payload.role, sessionId: payload.sessionId }, { expiresIn: -10 });
        const r = await api('GET', '/auth/me', { cookie: `accessToken=${expired}` });
        expect(r.status).toBe(401);
        expect(r.json?.code).toBe('ACCESS_TOKEN_EXPIRED');
    });

    test('purpose 칸이 있는 토큰(소셜 시도 표 모양)을 accessToken으로 넣으면 → 401 (로그인 토큰으로 안 받음)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const payload = decodeCookie(cookie);
        const attempt = signToken({ uuid: payload.uuid, sessionId: payload.sessionId, purpose: 'signup', provider: 'google' });
        const r = await api('GET', '/auth/me', { cookie: `accessToken=${attempt}` });
        expect(r.status).toBe(401);
    });

    test('role만 ADMIN으로 바꿔 진짜 키로 서명해도 → 관리자 지급은 403 (토큰 role 말고 DB role로 봄)', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const payload = decodeCookie(cookie);
        const forged = `accessToken=${signToken({ uuid: payload.uuid, role: 'ADMIN', sessionId: payload.sessionId })}`;
        const r = await api('POST', '/economy/admin/grant', { cookie: forged, body: { userId: payload.uuid, reason: 'X', referenceEventId: `r-${rand()}` } });
        expect(r.status).toBe(403);
    });

    test('uuid·sessionId 없는 토큰 → 401 (세션 못 찾음)', async () => {
        const forged = signToken({ foo: 'bar' });
        const r = await api('GET', '/auth/me', { cookie: `accessToken=${forged}` });
        expect(r.status).toBe(401);
    });

    test('소켓도 서명 틀린 토큰이면 → 안 붙음', async () => {
        const forged = signToken({ uuid: '00000000-0000-0000-0000-000000000000', sessionId: 'x' }, {}, 'wrong-secret-key-wrong-secret-key-xx');
        expect(await socketConnects(`accessToken=${forged}`)).toBe(false);
    });

    test('소켓도 purpose 칸 있는 토큰이면 → 안 붙음', async ({ accounts }) => {
        const { cookie } = await login(await accounts.create());
        const payload = decodeCookie(cookie);
        const attempt = signToken({ uuid: payload.uuid, sessionId: payload.sessionId, purpose: 'login', provider: 'google' });
        expect(await socketConnects(`accessToken=${attempt}`)).toBe(false);
    });
});
