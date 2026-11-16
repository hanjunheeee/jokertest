'use strict';

// 요청 수 제한 브라우저 시험 (PC·모바일 창) — 로그인 51번째·이메일 중복 확인 21번째·가입 인증번호 6번째·재설정 메일 4번째·이메일 바꾸기 번호 6번째·코드 입장 21번째가 막히고 막힘 글이 보임
// 목록 A15-보안.md 번호 A15-E-043~050 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-rate-limit.spec.js)
// ip 제한을 보는 케이스는 운영 기본 제한으로 따로 띄운 서버(startSec)에 화면 요청을 돌려 봄 — 본 서버 4100은 ip 제한을 크게 풀어 둠
// 사람·이메일별 제한(재설정 메일·이메일 바꾸기·코드 입장)은 본 서버도 기본값이라 본 서버에서 봄
const { test, expect, mail } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const { api, startSec, rand } = require('./_sec');
const K = require('../auth/_a11a-kit');
const B = require('../auth/_a11b-kit');
const J = require('../room/_a01b-join-kit');
const account = require('../mypage/account-tools');
const k = require('./_a15-kit');

const LOGIN_LIMITED = '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.';
const TOO_MANY = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
const EMAIL_CODE_LIMITED = '인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
const RESET_LIMITED = '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.';

// 이 파일의 따로 띄운 서버 (보안 전용 포트 1번 칸 = 4191)
const SEC_SLOT = 1;

// 없는 주소로 틀린 비번 n번 (계정 잠금 5번과 안 섞이게 매번 다른 주소) → 마지막 상태
async function sprayLogins(base, ip, times) {
    let last = null;
    for (let i = 0; i < times; i += 1) {
        last = await api('POST', '/auth/login', {
            base, headers: { 'x-forwarded-for': ip }, body: { email: `a15-nobody-${rand()}-${i}@example.test`, password: 'testpass-wrong-1' },
        });
    }
    return last;
}

test.describe('A15 요청 수 제한 (따로 띄운 운영 기본 제한 서버 + 본 서버)', () => {
    // 따로 띄운 서버 하나를 이 묶음이 한 작업자에서 차례로 같이 씀 (케이스마다 접속 ip를 달리해 셈이 안 섞임)
    test.describe.configure({ mode: 'default' });
    let server = null;

    test.beforeAll(async () => {
        test.setTimeout(330_000);
        // 가입 인증번호 다시 보내기 대기만 1초로 (6번 보내는 데 5분 기다리지 않게)
        server = await startSec(SEC_SLOT, { defaultIpLimits: true, overrides: { SIGNUP_EMAIL_RESEND_COOLDOWN_MS: '1000' } });
    });
    test.afterAll(async () => { await server?.stop(); });

    for (const [id, label, mobile] of [['A15-E-043', 'PC', false], ['A15-E-044', '모바일', true]]) {
        const smoke = id === 'A15-E-043' ? ' @smoke' : '';
        test(`${id} ${label} 같은 ip로 API 틀린 비번 50번 → 화면에서 51번째 로그인 → "${LOGIN_LIMITED}"${smoke}`, async ({ players, accounts }) => {
            test.setTimeout(150_000);
            const ip = k.uniqueIp();
            const fiftieth = await sprayLogins(server.url, ip, 50);
            expect(fiftieth.status, '50번째는 아직 안 막힘 (401)').toBe(401);
            const acc = await accounts.create();
            const person = await players.add({ mobile, account: acc, login: false, lobby: false });
            const page = person.page;
            await k.pointApiAt(page, server.url, { ip });
            await page.goto('/login');
            await page.getByPlaceholder('이메일을 입력하세요').fill(acc.email);
            await page.getByPlaceholder('비밀번호를 입력하세요', { exact: true }).fill(acc.password);
            // 맞는 비번이어도 ip가 막혀 있음
            const text = await ui.captureAlert(page, () => page.getByRole('button', { name: '로그인', exact: true }).click(), { close: !mobile });
            expect(text).toBe(LOGIN_LIMITED);
            if (mobile) {
                // 모바일은 화면 안 안내 창 → 글이 눈에 읽힘 (PC는 브라우저 알림 창이라 대비를 못 잼)
                const dialog = page.getByRole('alertdialog', { name: '안내' });
                await expectReadable(dialog.getByText(LOGIN_LIMITED, { exact: true }));
            }
            await expect(page).toHaveURL(/\/login$/);
        });
    }

    test(`A15-E-045 PC 같은 ip로 이메일 중복 확인 20번 → 가입 화면 21번째 "중복확인" → "${TOO_MANY}" 보임`, async ({ page }) => {
        const ip = k.uniqueIp();
        for (let i = 0; i < 20; i += 1) {
            const r = await api('GET', `/auth/check-email?email=a15-probe-${rand()}-${i}%40example.test`, { base: server.url, headers: { 'x-forwarded-for': ip } });
            expect(r.status, `${i + 1}번째는 안 막힘`).toBe(200);
        }
        await k.pointApiAt(page, server.url, { ip });
        await K.openSignup(page);
        await K.fillSignup(page, { email: `a15-check-${rand()}@example.test` });
        const answered = page.waitForResponse((r) => r.url().includes('/auth/check-email'));
        await page.getByRole('button', { name: '이메일 중복확인' }).click();
        expect((await answered).status()).toBe(429);
        await expectReadable(page.getByText(TOO_MANY, { exact: true }));
    });

    test(`A15-E-046 PC 가입 인증번호 같은 주소 6번째 "인증번호 받기" → "${TOO_MANY}" 보임, 메일은 5통`, async ({ page }) => {
        test.setTimeout(150_000);
        const ip = k.uniqueIp();
        const email = `e2e+a15-code-${rand()}@example.test`;
        await k.pointApiAt(page, server.url, { ip });
        await K.openSignup(page);
        await K.fillSignup(page, { email });
        const statuses = [];
        let lastSentAt = 0;
        for (let i = 1; i <= 6; i += 1) {
            // 다시 보내기 대기(1초)가 지난 뒤 누름 — 화면도 그 전엔 안 보냄
            await expect.poll(() => Date.now() - lastSentAt, { timeout: 5000 }).toBeGreaterThan(1300);
            await expect(K.codeSend(page)).toBeEnabled();
            const answered = page.waitForResponse((r) => r.url().includes('/auth/signup/email-code') && r.request().method() === 'POST');
            await K.codeSend(page).click();
            statuses.push((await answered).status());
            lastSentAt = Date.now();
        }
        expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
        await expect(K.codeNotice(page)).toContainText(TOO_MANY);
        await expectReadable(K.codeNotice(page));
        expect(mail.readMails(email).filter((m) => m.template === 'SIGNUP_CODE')).toHaveLength(5);
    });

    test(`A15-E-047 PC 비밀번호 찾기 화면 같은 주소 4번째 → "${RESET_LIMITED}" 보임, 메일 1통`, async ({ page, accounts }) => {
        const acc = await accounts.create();
        expect(await B.requestResetUi(page, acc.email)).toBe(200);
        await expect(B.requestSentNotice(page, false)).toBeVisible();
        // "다시 보내기"는 보낸 뒤 1분 꺼짐(결정 2026-11-16) → 2~4번째는 요청 화면을 새로 열어 같은 주소로
        await expect(page.getByRole('button', { name: '다시 보내기', exact: true })).toBeDisabled();
        for (let i = 2; i <= 4; i += 1) {
            expect(await B.requestResetUi(page, acc.email), `${i}번째`).toBe(i <= 3 ? 200 : 429);
            if (i <= 3) await expect(B.requestSentNotice(page, false)).toBeVisible();
        }
        await expectReadable(page.getByText(RESET_LIMITED, { exact: true }));
        // 1분 안 다시 요청은 서버가 메일 없이 건너뜀(1시간 3번 셈에는 들어감) → 첫 메일 1통만
        await mail.waitForMail(acc.email, { template: 'PASSWORD_RESET' });
        expect(B.mailsOf(acc.email, 'PASSWORD_RESET')).toHaveLength(1);
    });

    test(`A15-E-048 PC 계정 관리 이메일 바꾸기 번호 6번째 → "${EMAIL_CODE_LIMITED}" 보임`, async ({ user }) => {
        test.setTimeout(150_000);
        const { page } = user;
        await account.gotoAccount(page);
        const box = account.section(page, '이메일 변경');
        const statuses = [];
        for (let i = 1; i <= 6; i += 1) {
            // 새 주소마다 다시 보내기 대기가 따로라 매번 다른 새 주소 (한 사람 1시간 5번 셈만 봄)
            await box.getByPlaceholder('새 이메일', { exact: true }).fill(`e2e+a15-change-${rand()}-${i}@example.test`);
            // 주소를 고치면 화면이 번호 넣기 단계에서 처음 단계로 돌아감 → 매번 "번호 받기" (현재 비번 칸은 그대로 남음)
            if (i === 1) await box.getByPlaceholder('현재 비밀번호', { exact: true }).fill(user.account.password);
            await expect(box.getByPlaceholder('현재 비밀번호', { exact: true })).toHaveValue(user.account.password);
            const answered = page.waitForResponse((r) => r.url().includes('/user/me/email/code') && r.request().method() === 'POST');
            await box.getByRole('button', { name: '번호 받기', exact: true }).click();
            statuses.push((await answered).status());
        }
        expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
        await expectReadable(box.getByText(EMAIL_CODE_LIMITED, { exact: false }));
    });

    test('A15-E-049 PC 없는 코드 20번 뒤 맞는 코드(정원 5 방) → "입장 시도가 너무 많습니다…", 대기방 안 감', async ({ user, bots }) => {
        test.setTimeout(150_000);
        const page = user.page;
        const { code, host } = await J.botRoom(bots, { max: 5, count: 1 });
        const startedAt = Date.now();
        await J.typeCode(page, J.NO_SUCH_CODE);
        for (let i = 0; i < 20; i += 1) await ui.captureAlert(page, () => J.joinButton(page).click());
        const text = await J.codeAlert(page, code);
        expect(Date.now() - startedAt, '21번 시도가 1분 안').toBeLessThan(60_000);
        expect(text).toBe(J.MSG.TOO_MANY);
        // PC는 알림 창을 닫은 뒤에도 까닭 글이 화면 띠에 남음 → 그 글이 사람 눈에 읽히는지
        await J.expectEntryNotice(page, J.MSG.TOO_MANY);
        await expect(page).not.toHaveURL(/\/game-matching/);
        expect(await J.roomSize(host.account.uuid)).toBe(1);
    });

    test(`A15-E-050 PC 로그인 막힘은 ip 단위: 막힌 직후 같은 브라우저(같은 ip)에서 다른 계정 → "${LOGIN_LIMITED}"`, async ({ page, accounts }) => {
        test.setTimeout(150_000);
        const ip = k.uniqueIp();
        await sprayLogins(server.url, ip, 50);
        const first = await accounts.create();
        const second = await accounts.create();
        await k.pointApiAt(page, server.url, { ip });
        expect(await K.loginAlert(page, first.email, first.password)).toBe(LOGIN_LIMITED);
        expect(await K.loginAlert(page, second.email, second.password)).toBe(LOGIN_LIMITED);
        await expect(page).toHaveURL(/\/login$/);
    });
});
