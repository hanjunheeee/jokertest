// 보안(로그인): 실패 문구로 가입 여부를 알 수 없음, 틀린 횟수 안내 없음, 5번째 잠금, 잠긴 동안 맞는 비번도 거절, 정지·비활성 계정
// 근거: docs/보안_점검_2026-11-09.md '인증 로그인 계정 열거'·'무차별 대입 제한', 결정 문서 '보안 로그인 문구'
const { test, expect, ui } = require('../../helpers/fixtures');
const { api, login, ban, expiredBan, setExpiredLock, loginErrorText, rand, db } = require('./_sec');

const FAIL = '이메일 또는 비밀번호가 일치하지 않습니다.';
const tryLogin = (email, password) => api('POST', '/auth/login', { body: { email, password } });
const nobody = () => `e2e+nobody-${rand()}@example.test`;

test.describe('실패 문구 같음 (가입 여부 안 드러남)', () => {
    test('없는 이메일과 틀린 비번 → 상태 401·문구·코드가 같음 (가입 여부 안 드러남, 운영은 본문도 글자까지 같음 — ops 파일에서 확인)', async ({ accounts }) => {
        const account = await accounts.create();
        const a = await tryLogin(nobody(), 'Wrong!pass123');
        const b = await tryLogin(account.email, 'Wrong!pass123');
        expect(a.status).toBe(401);
        expect(b.status).toBe(401);
        // 개발 서버는 응답에 스택을 실어 본문이 줄마다 다름 → 뜻 있는 칸(문구·코드)만 비교
        expect(a.json.message).toBe(b.json.message);
        expect(a.json.code).toBe(b.json.code);
        expect(a.json.message).toBe(FAIL);
    });

    test('1~4번째 틀림 → 매번 같은 문구, "(n/5)" 같은 횟수 안내가 없음', async ({ accounts }) => {
        const account = await accounts.create();
        for (let i = 1; i <= 4; i += 1) {
            const r = await tryLogin(account.email, `Wrong!${i}`);
            expect(r.status).toBe(401);
            expect(r.json.message).toBe(FAIL);
            expect(r.body).not.toMatch(/\d\s*\/\s*5|회/);
        }
    });

    test('대소문자만 바꾼 이메일로 틀려도 → 같은 문구', async ({ accounts }) => {
        const account = await accounts.create();
        const r = await tryLogin(account.email.toUpperCase(), 'Wrong!pass');
        expect(r.status).toBe(401);
        expect(r.json.message).toBe(FAIL);
    });

    test('없는 이메일 실패와 틀린 비번 실패 → 둘 다 쿠키를 안 주고 상태가 같음 (쿠키 유무로도 구별 안 됨)', async ({ accounts }) => {
        const account = await accounts.create();
        const a = await tryLogin(nobody(), 'Wrong!pass');
        const b = await tryLogin(account.email, 'Wrong!pass');
        expect(a.status).toBe(b.status);
        expect(a.setCookies.some((l) => /^accessToken=[^;]+/.test(l))).toBe(false);
        expect(b.setCookies.some((l) => /^accessToken=[^;]+/.test(l))).toBe(false);
    });

    test('없는 이메일 응답 → bcrypt 비교를 한 번 하느라 시간이 걸림 (건너뛰면 가입 여부가 시간으로 드러남)', async ({ accounts }) => {
        // bcrypt 비교는 수십 ms, 건너뛴 경로는 한 자리수 ms → 없는 이메일 응답이 그만큼 걸리면 비교를 한 것
        const time = async (email) => { const t = performance.now(); await tryLogin(email, 'Wrong!pass'); return performance.now() - t; };
        await time(nobody()); // 워밍업
        const missing = [];
        for (let i = 0; i < 5; i += 1) missing.push(await time(nobody()));
        const median = missing.sort((x, y) => x - y)[2];
        expect(median).toBeGreaterThan(20);
    });

    test('데스크톱 화면에서 없는 이메일·틀린 비번 → 알림 문구가 같음', async ({ page, accounts }) => {
        const account = await accounts.create();
        const a = await loginErrorText(page, { email: nobody() });
        const b = await loginErrorText(page, account);
        expect(a).toBe(b);
        await expect(page).toHaveURL(/\/login$/);
    });

    test('모바일 화면에서 없는 이메일·틀린 비번 → 안내 문구가 같음', async ({ players, accounts }) => {
        const p = await players.add({ mobile: true, login: false });
        const account = await accounts.create();
        const a = await loginErrorText(p.page, { email: nobody() }, { mobile: true });
        const b = await loginErrorText(p.page, account, { mobile: true });
        expect(a).toBe(b);
    });

    test('없는 이메일로 실패 → 로그인 기록이 안 생김 (남의 계정 줄에 쓰지 않음)', async () => {
        const email = nobody();
        await tryLogin(email, 'Wrong!pass');
        const rows = await db.query('SELECT COUNT(*) AS n FROM users WHERE email = ?', [email]);
        expect(Number(rows[0].n)).toBe(0);
    });
});

test.describe('5번 잠금', () => {
    test('5번째 틀리면 → 423 잠금 문구, 그 뒤 맞는 비번도 423', async ({ accounts }) => {
        const account = await accounts.create();
        for (let i = 1; i <= 4; i += 1) expect((await tryLogin(account.email, `Wrong!${i}`)).status).toBe(401);
        const fifth = await tryLogin(account.email, 'Wrong!5');
        expect(fifth.status).toBe(423);
        expect(fifth.json.message).toContain('15분');
        const right = await tryLogin(account.email, account.password);
        expect(right.status).toBe(423);
        expect(right.setCookies.some((l) => /^accessToken=[^;]+/.test(l))).toBe(false);
    });

    test('잠긴 계정 → DB에 15분 뒤까지 잠금 시각이 남음', async ({ accounts }) => {
        const account = await accounts.create();
        for (let i = 1; i <= 5; i += 1) await tryLogin(account.email, `Wrong!${i}`);
        const [row] = await db.query('SELECT locked_until FROM users WHERE uuid = ?', [account.uuid]);
        const ms = new Date(row.locked_until).getTime() - Date.now();
        expect(ms).toBeGreaterThan(13 * 60 * 1000);
        expect(ms).toBeLessThanOrEqual(15 * 60 * 1000 + 5000);
    });

    test('4번 틀린 뒤 맞는 비번 → 로그인되고 실패 횟수가 0으로 돌아감', async ({ accounts }) => {
        const account = await accounts.create();
        for (let i = 1; i <= 4; i += 1) await tryLogin(account.email, `Wrong!${i}`);
        expect((await tryLogin(account.email, account.password)).status).toBe(200);
        const [row] = await db.query('SELECT failed_login_count FROM users WHERE uuid = ?', [account.uuid]);
        expect(Number(row.failed_login_count)).toBe(0);
    });

    test('잠금 시간이 지난 계정 → 한 번 틀려도 바로 다시 안 잠김 (0부터 셈)', async ({ accounts }) => {
        const account = await accounts.create();
        await setExpiredLock(account.uuid);
        const r = await tryLogin(account.email, 'Wrong!again');
        expect(r.status).toBe(401);
        expect((await tryLogin(account.email, account.password)).status).toBe(200);
    });

    test('다른 계정이 잠겨도 → 내 계정 로그인은 됨 (잠금은 계정마다)', async ({ accounts }) => {
        const [locked, mine] = await accounts.createMany(2);
        for (let i = 1; i <= 5; i += 1) await tryLogin(locked.email, `Wrong!${i}`);
        expect((await tryLogin(mine.email, mine.password)).status).toBe(200);
    });

    test('화면에서 5번 틀리면 → 다섯 번째 알림이 잠금 안내, 로그인 화면에 그대로', async ({ page, accounts }) => {
        const account = await accounts.create();
        for (let i = 1; i <= 4; i += 1) await tryLogin(account.email, `Wrong!${i}`);
        const message = await loginErrorText(page, account, { password: 'Wrong!5' });
        expect(message).toMatch(/잠/);
        await expect(page).toHaveURL(/\/login$/);
    });

    test('현재 비번을 5번 틀리게 비번 바꾸기 → 6번째는 429 PASSWORD_CHANGE_LOCKED, 로그인은 안 잠김', async ({ accounts }) => {
        const account = await accounts.create();
        const { cookie } = await login(account);
        for (let i = 1; i <= 5; i += 1) {
            const r = await api('PATCH', '/user/me/password', { cookie, body: { currentPassword: `Wrong!${i}x`, newPassword: 'NewPass!2345' } });
            expect(r.status, `try ${i}`).toBeGreaterThanOrEqual(400);
        }
        const sixth = await api('PATCH', '/user/me/password', { cookie, body: { currentPassword: account.password, newPassword: 'NewPass!2345' } });
        expect(sixth.status).toBe(429);
        expect(sixth.json?.code).toBe('PASSWORD_CHANGE_LOCKED');
        expect((await tryLogin(account.email, account.password)).status).toBe(200);
    });
});

test.describe('정지·비활성 계정 로그인', () => {
    test('정지 계정에 맞는 비번 → 403 정지 안내, 쿠키 안 줌', async ({ accounts }) => {
        const account = await accounts.create();
        await ban(account.uuid, { reason: '시험 사유' });
        const r = await tryLogin(account.email, account.password);
        expect(r.status).toBe(403);
        expect(r.json.message).toContain('정지된 계정입니다');
        expect(r.setCookies.some((l) => /^accessToken=[^;]+/.test(l))).toBe(false);
    });

    test('정지 계정에 틀린 비번 → 보통 실패 문구 (비번 모르는 사람에게 정지 사유 안 보임)', async ({ accounts }) => {
        const account = await accounts.create();
        await ban(account.uuid, { reason: '숨길 사유-777' });
        const r = await tryLogin(account.email, 'Wrong!pass');
        expect(r.status).toBe(401);
        expect(r.body).not.toContain('숨길 사유-777');
        expect(r.json.message).toBe(FAIL);
    });

    test('영구 정지 → 로그인 403', async ({ accounts }) => {
        const account = await accounts.create();
        await ban(account.uuid, { permanent: true });
        expect((await tryLogin(account.email, account.password)).status).toBe(403);
    });

    test('정지 기간이 끝난 줄만 있으면 → 로그인 됨', async ({ accounts }) => {
        const account = await accounts.create();
        await expiredBan(account.uuid);
        expect((await tryLogin(account.email, account.password)).status).toBe(200);
    });

    test('계정 상태가 ACTIVE가 아니면(비활성) → 403 ACCOUNT_INACTIVE, 쿠키 안 줌', async ({ accounts }) => {
        const account = await accounts.create();
        await db.query("UPDATE users SET status = 'SUSPENDED' WHERE uuid = ?", [account.uuid]);
        const r = await tryLogin(account.email, account.password);
        expect(r.status).toBe(403);
        expect(r.json?.code).toBe('ACCOUNT_INACTIVE');
        expect(r.setCookies.some((l) => /^accessToken=[^;]+/.test(l))).toBe(false);
    });

    test('화면에서 정지 계정으로 로그인 → 정지 알림이 뜨고 로비로 안 감', async ({ page, accounts }) => {
        const account = await accounts.create();
        await ban(account.uuid);
        const message = await loginErrorText(page, account, { password: account.password });
        expect(message).toContain('정지');
        await expect(page).not.toHaveURL(/\/lobby/);
    });
});
