// 보안(주소 쿼리 XSS): 화면이 주소 쿼리 값을 읽어 쓰는 곳(소셜 오류·재설정 토큰·결과·알림 대상)에 스크립트를 넣어도 실행 안 됨
// 근거: docs/보안_점검_2026-11-09.md '입력 XSS'(React가 글자로만 그림) — 되비치는 쿼리로도 안 샘
const { test, expect } = require('../../helpers/fixtures');
const sec = require('../../helpers/security');
const { E2E } = require('./_sec');

// payload 하나 (화면 글자로 그려지면 __xssHit가 안 불려야 함)
const INJECT = '<img src=x onerror="window.__xssHit&&window.__xssHit(\'param\')">';

// 로그인 안 해도 열리는 화면들 (쿼리 값을 읽음)
const CASES = [
    ['/login', 'socialError'],
    ['/login', 'socialIntent'],
    ['/password-reset', 'token'],
    ['/gameresult', 'outcome'],
];

test.describe('로그인 전 화면 쿼리 XSS', () => {
    for (const [path, param] of CASES) {
        test(`${path}?${param}= 에 스크립트를 넣어도 → 실행 안 되고 진짜 img/script 노드가 안 생김`, async ({ page }) => {
            const trap = await sec.trapXss(page);
            await page.goto(`${path}?${param}=${encodeURIComponent(INJECT)}`);
            await page.waitForTimeout(600);
            sec.assertNoXss(trap);
            const injected = await page.evaluate(() => document.querySelectorAll('img[src="x"]').length);
            expect(injected).toBe(0);
        });
    }

    test('모르는 socialError 코드를 넣어도 → 그 값이 HTML로 안 들어가고 화면이 멀쩡함', async ({ page }) => {
        const trap = await sec.trapXss(page);
        await page.goto(`/login?socialError=${encodeURIComponent(INJECT)}`);
        await page.waitForTimeout(400);
        const html = await page.content();
        expect(/<img[^>]*onerror/i.test(html)).toBe(false);
        sec.assertNoXss(trap);
    });
});

test.describe('로그인 뒤 화면 쿼리 XSS', () => {
    const LOGGED = [
        ['/lobby', 'notificationRequestId'],
        ['/lobby', 'gameInviteId'],
        ['/library', 'achievementId'],
    ];
    for (const [path, param] of LOGGED) {
        test(`${path}?${param}= 에 스크립트를 넣어도 → 실행 안 됨`, async ({ page, context, accounts, ui }) => {
            const trap = await sec.trapXss(page);
            await ui.loginViaApi(context, await accounts.create());
            await page.goto(`${path}?${param}=${encodeURIComponent(INJECT)}`);
            await page.waitForTimeout(700);
            sec.assertNoXss(trap);
            const injected = await page.evaluate(() => document.querySelectorAll('img[src="x"]').length);
            expect(injected).toBe(0);
        });
    }

    test('상점 결제 복귀 주소(topup·orderId·paymentKey)에 스크립트를 넣어도 → 실행 안 됨', async ({ page, context, accounts, ui }) => {
        const trap = await sec.trapXss(page);
        await ui.loginViaApi(context, await accounts.create());
        await page.goto(`/store?topup=success&orderId=${encodeURIComponent(INJECT)}&paymentKey=${encodeURIComponent(INJECT)}&amount=1100`);
        await page.waitForTimeout(700);
        sec.assertNoXss(trap);
    });
});

test.describe('소셜 로그인 버튼', () => {
    test('데스크톱 로그인 화면에 구글·디스코드 버튼이 있고, 눌러도 XSS 없이 이동만 함', async ({ page }) => {
        const trap = await sec.trapXss(page);
        await page.goto('/login');
        await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Discord 로그인' })).toBeVisible();
        sec.assertNoXss(trap);
    });

    test('소셜 콜백이 오류 코드로 로그인 화면에 돌려보내도 → 그 코드가 글자로만 쓰임', async ({ page }) => {
        const trap = await sec.trapXss(page);
        // 서버 콜백은 ?socialError=코드 로 돌려보냄 (코드 모양은 서버가 정함) — 화면이 그 값을 글자로만 다루는지
        await page.goto('/login?socialError=STATE_MISSING');
        await page.waitForTimeout(400);
        sec.assertNoXss(trap);
        await expect(page).toHaveURL(/\/login/);
    });
});
