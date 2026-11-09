// 보안(가입 인증번호): 틀린 번호 5번이면 잠금, 응답에 번호 안 실림, 모양 틀린 이메일은 번호 요청 전에 거절, 가입은 인증 증명 없으면 거절
// 근거: docs/보안_점검_2026-11-09.md '인증 무차별 대입 제한'(인증번호 5번), 가입 인증 증명
const { test, expect, mail } = require('../../helpers/fixtures');
const { api, rand, db } = require('./_sec');

const freshEmail = () => `e2e+sv-${rand()}@example.test`;

test.describe('가입 인증번호', () => {
    test('번호를 요청하면 → 200이고 응답 본문에 인증번호가 안 실림 (메일로만)', async () => {
        const email = freshEmail();
        const r = await api('POST', '/auth/signup/email-code', { body: { email } });
        expect(r.status).toBe(200);
        const code = await mail.waitForCode(email);
        expect(String(code).length).toBeGreaterThanOrEqual(4);
        expect(r.body).not.toContain(String(code));
    });

    test('틀린 번호를 1~4번 넣으면 400 CODE_INVALID, 5번째는 429 TOO_MANY_ATTEMPTS (맞히기 막기)', async () => {
        const email = freshEmail();
        await api('POST', '/auth/signup/email-code', { body: { email } });
        await mail.waitForCode(email);
        for (let i = 1; i <= 4; i += 1) {
            const r = await api('POST', '/auth/signup/email-code/verify', { body: { email, code: '000000' } });
            expect(r.status, `try ${i}`).toBe(400);
            expect(r.json?.code).toBe('CODE_INVALID');
        }
        const fifth = await api('POST', '/auth/signup/email-code/verify', { body: { email, code: '000000' } });
        expect(fifth.status).toBe(429);
        expect(fifth.json?.code).toBe('TOO_MANY_ATTEMPTS');
    });

    test('번호 확인에 아주 긴·글자 섞인 번호를 넣어도 → 400 (500 없음)', async () => {
        const email = freshEmail();
        await api('POST', '/auth/signup/email-code', { body: { email } });
        await mail.waitForCode(email);
        for (const code of ['12', '1'.repeat(50), 'abcdef', { $ne: null }]) {
            const r = await api('POST', '/auth/signup/email-code/verify', { body: { email, code } });
            expect(r.status, JSON.stringify(code)).toBeGreaterThanOrEqual(400);
            expect(r.status).toBeLessThan(500);
        }
    });

    test('인증 증명 없이 가입을 끝내려 하면 → 401 (이메일 인증 필요)', async () => {
        const email = freshEmail();
        const r = await api('POST', '/auth/signup', { body: { email, password: 'GoodPass!2345', passwordConfirm: 'GoodPass!2345', nickname: `n${rand()}`, birthDate: '2000-01-01', agreedTermsVersionIds: [], ageConfirmed: true } });
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(500);
    });

    test('가짜 인증 증명으로 가입을 끝내려 하면 → 401 SIGNUP_PROOF_INVALID, 계정 안 생김', async () => {
        const email = freshEmail();
        // 약관 검사를 지나도록 지금 약관 id를 다 넣음 (증명 검사까지 가게)
        const terms = await api('GET', '/auth/terms');
        const agreedTermsVersionIds = (terms.json?.data?.terms ?? []).map((t) => t.id);
        const r = await api('POST', '/auth/signup', { body: { email, password: 'GoodPass!2345', passwordConfirm: 'GoodPass!2345', nickname: `n${rand()}`, birthDate: '2000-01-01', signupProof: 'forged-proof-token', agreedTermsVersionIds, ageConfirmed: true } });
        expect(r.status).toBe(401);
        expect(r.json?.code).toBe('SIGNUP_PROOF_INVALID');
        const rows = await db.query('SELECT COUNT(*) AS n FROM users WHERE email = ?', [email]);
        expect(Number(rows[0].n)).toBe(0);
    });

    test('생일이 미래 날짜·엉뚱한 모양이면 → 400 (가입 입력 검사에서 막힘)', async () => {
        const nextYear = new Date().getFullYear() + 1;
        for (const birthDate of [`${nextYear}-01-01`, 'not-a-date', '2000-13-40']) {
            const r = await api('POST', '/auth/signup', { body: { email: freshEmail(), password: 'GoodPass!2345', passwordConfirm: 'GoodPass!2345', nickname: `n${rand()}`, birthDate, ageConfirmed: true } });
            expect(r.status, birthDate).toBe(400);
        }
    });

    test('번호 요청에 여러 곳·끼워 넣기 이메일을 넣으면 → 400, 메일 안 나감', async () => {
        for (const email of ['a@x.test,b@y.test', 'a@@x.test']) {
            const r = await api('POST', '/auth/signup/email-code', { body: { email } });
            expect(r.status, email).toBe(400);
            expect(r.json?.code).toBe('INVALID_INPUT');
        }
    });
});
