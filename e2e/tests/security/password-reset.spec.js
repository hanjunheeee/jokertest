// 보안(비번 재설정): 없는 이메일도 같은 응답(계정 열거 막기), 틀린 토큰 거절, 토큰 한 번만 씀, 새 비번 규칙, 캐시 금지
// 근거: docs/보안_점검_2026-11-09.md '인증 비번 재설정·가입 인증 응답 차이'(없는 이메일도 같은 응답)
const { test, expect, mail } = require('../../helpers/fixtures');
const { api, rand } = require('./_sec');

const resetTokenFor = async (account) => {
    const since = Date.now();
    await api('POST', '/auth/password-reset/request', { body: { email: account.email } });
    const url = await mail.waitForResetUrl(account.email, { since });
    return new URL(url).searchParams.get('token');
};

test.describe('계정 열거 막기', () => {
    test('없는 이메일로 재설정 요청 → 있는 계정과 같은 200 (가입 여부 안 드러남)', async ({ accounts }) => {
        const account = await accounts.create();
        const unknown = await api('POST', '/auth/password-reset/request', { body: { email: `nobody-${rand()}@example.test` } });
        const known = await api('POST', '/auth/password-reset/request', { body: { email: account.email } });
        expect(unknown.status).toBe(200);
        expect(known.status).toBe(200);
        expect(unknown.json?.success ?? unknown.json?.ok).toBe(known.json?.success ?? known.json?.ok);
    });

    test('없는 이메일로 요청해도 → 메일이 안 나감', async () => {
        const email = `nobody-${rand()}@example.test`;
        const since = Date.now();
        await api('POST', '/auth/password-reset/request', { body: { email } });
        const got = await mail.waitForResetUrl(email, { since, timeoutMs: 2500 }).catch(() => null);
        expect(got).toBeNull();
    });

    test('재설정 요청·확인 응답은 → Cache-Control: no-store (토큰 든 응답 저장 금지)', async ({ accounts }) => {
        const account = await accounts.create();
        const req = await api('POST', '/auth/password-reset/request', { body: { email: account.email } });
        expect(req.headers['cache-control']).toBe('no-store');
        const verify = await api('GET', '/auth/password-reset/verify?token=whatever');
        expect(verify.headers['cache-control']).toBe('no-store');
    });

    test('여러 곳·끼워 넣기 이메일로 요청 → 400 INVALID_INPUT', async () => {
        const r = await api('POST', '/auth/password-reset/request', { body: { email: 'a@x.test,b@y.test' } });
        expect(r.status).toBe(400);
        expect(r.json?.code).toBe('INVALID_INPUT');
    });
});

test.describe('토큰', () => {
    test('틀린 토큰으로 확인(verify) → ok:false (어느 토큰이 맞는지 안 알려 줌)', async () => {
        const r = await api('GET', '/auth/password-reset/verify?token=totally-bad-token');
        expect(r.json?.ok).toBe(false);
        expect(r.json?.code).toBe('INVALID');
    });

    test('틀린 토큰으로 새 비번 저장(confirm) → 400 INVALID, 비번 안 바뀜', async ({ accounts }) => {
        const account = await accounts.create();
        const r = await api('POST', '/auth/password-reset/confirm', { body: { token: 'bad-token', newPassword: 'NewPass!2345', newPasswordConfirm: 'NewPass!2345' } });
        expect(r.status).toBe(400);
        expect(r.json?.code).toBe('INVALID');
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: account.password } })).status).toBe(200);
    });

    test('맞는 토큰으로 새 비번을 저장하면 → 그 토큰을 다시 쓸 수 없음 (한 번만)', async ({ accounts }) => {
        const account = await accounts.create();
        const token = await resetTokenFor(account);
        const newPass = 'ResetOnce!2345';
        const first = await api('POST', '/auth/password-reset/confirm', { body: { token, newPassword: newPass, newPasswordConfirm: newPass } });
        expect(first.status).toBeLessThan(400);
        const again = await api('POST', '/auth/password-reset/confirm', { body: { token, newPassword: 'Another!2345', newPasswordConfirm: 'Another!2345' } });
        expect(again.status).toBeGreaterThanOrEqual(400);
        // 두 번째 비번으로는 로그인 안 됨
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: 'Another!2345' } })).status).toBe(401);
    });

    test('새 비번이 규칙에 못 미치면(짧음) → 400, 비번 안 바뀜', async ({ accounts }) => {
        const account = await accounts.create();
        const token = await resetTokenFor(account);
        const r = await api('POST', '/auth/password-reset/confirm', { body: { token, newPassword: 'short', newPasswordConfirm: 'short' } });
        expect(r.status).toBe(400);
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: account.password } })).status).toBe(200);
    });

    test('새 비번 칸이 비거나 글자가 아니면(객체·숫자) → 400, 비번 안 바뀜', async ({ accounts }) => {
        const account = await accounts.create();
        const token = await resetTokenFor(account);
        for (const newPassword of [undefined, '', { $ne: null }, 12345678]) {
            const r = await api('POST', '/auth/password-reset/confirm', { body: { token, newPassword } });
            expect(r.status, JSON.stringify(newPassword)).toBe(400);
        }
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: account.password } })).status).toBe(200);
    });

    test('재설정 링크를 끝내면 → 옛 비번으로 로그인 안 되고 새 비번으로 됨', async ({ accounts }) => {
        const account = await accounts.create();
        const token = await resetTokenFor(account);
        const newPass = 'FreshPass!2345';
        await api('POST', '/auth/password-reset/confirm', { body: { token, newPassword: newPass, newPasswordConfirm: newPass } });
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: account.password } })).status).toBe(401);
        expect((await api('POST', '/auth/login', { body: { email: account.email, password: newPass } })).status).toBe(200);
    });
});
