// 상점 쿠폰 입력: 빈 값·모양 틀림·없는 쿠폰·기간·횟수·성공하면 지갑 다시 불러옴, 요청 수 제한(따로 띄운 서버)
const { test, expect, E2E } = require('../../helpers/fixtures');
const servers = require('../../helpers/servers');
const st = require('./store-tools');

// 쿠폰 창 열기 → 창
async function openCoupon(page) {
    await page.getByRole('button', { name: '쿠폰 입력' }).click();
    const dialog = page.getByRole('dialog', { name: '쿠폰 입력' });
    await expect(dialog).toBeVisible();
    return dialog;
}

async function submitCoupon(dialog, code) {
    await dialog.getByRole('textbox', { name: '쿠폰 코드' }).fill(code);
    await dialog.getByRole('button', { name: '사용하기' }).click();
}

test.describe('쿠폰 입력', () => {
    test('쿠폰 입력을 누르면 → 안내 문구·코드 칸·닫기·사용하기가 있는 창이 뜸', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page);
        const dialog = await openCoupon(page);
        await expect(dialog).toContainText('한 쿠폰은 한 번만 쓸 수 있습니다.');
        await expect(dialog.getByRole('textbox', { name: '쿠폰 코드' })).toHaveAttribute('placeholder', '예: WELCOME-2026');
        await dialog.getByRole('button', { name: '닫기' }).click();
        await expect(dialog).toBeHidden();
    });

    test('빈 칸으로 사용하기를 누르면 → 모양 안내가 뜨고 서버에 안 보냄', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page);
        const dialog = await openCoupon(page);
        let sent = false;
        page.on('request', (r) => { if (r.url().includes('/coupons/redeem')) sent = true; });
        await dialog.getByRole('button', { name: '사용하기' }).click();
        await expect(dialog.getByRole('alert')).toHaveText('쿠폰 코드는 영문·숫자·- 4~40자입니다.');
        expect(sent).toBe(false);
    });

    test('없는 쿠폰 코드를 넣으면 → "쿠폰을 찾을 수 없습니다." 안내, 잔액 그대로', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page);
        const dialog = await openCoupon(page);
        await submitCoupon(dialog, `NOPE-${st.rand(4)}`);
        await expect(dialog.getByRole('alert')).toHaveText('쿠폰을 찾을 수 없습니다.');
        await expect(st.balance(page, '골드', 0)).toBeVisible();
    });

    test('골드 쿠폰을 넣으면 → 받았다는 안내가 뜨고 보유 골드가 새로 고침 없이 늘어남', async ({ user }) => {
        const { page, account } = user;
        const code = await st.createCoupon({ rewardType: 'GOLD', amount: 300 });
        await st.gotoStore(page);
        const dialog = await openCoupon(page);
        await submitCoupon(dialog, code);
        await expect(dialog.getByRole('status')).toHaveText('골드 300개를 받았습니다.');
        await expect(dialog.getByRole('textbox', { name: '쿠폰 코드' })).toHaveValue('');
        await expect(st.balance(page, '골드', 300)).toBeVisible();
        expect((await st.wallet(account.uuid)).gold).toBe(300);
        expect(await st.couponUsedCount(code)).toBe(1);
    });

    test('다이아 쿠폰을 소문자·앞뒤 빈칸으로 넣으면 → 대문자로 맞춰 받고 다이아가 늘어남', async ({ user }) => {
        const { page } = user;
        const code = await st.createCoupon({ rewardType: 'DIAMOND', amount: 7 });
        await st.gotoStore(page);
        const dialog = await openCoupon(page);
        await submitCoupon(dialog, `  ${code.toLowerCase()} `);
        await expect(dialog.getByRole('status')).toHaveText('다이아 7개를 받았습니다.');
        await expect(st.balance(page, '다이아', 7)).toBeVisible();
    });

    test('같은 쿠폰을 두 번 넣으면 → 두 번째는 "이미 사용한 쿠폰입니다." 안내, 골드는 한 번만', async ({ user }) => {
        const { page, account } = user;
        const code = await st.createCoupon({ amount: 100 });
        await st.gotoStore(page);
        const dialog = await openCoupon(page);
        await submitCoupon(dialog, code);
        await expect(dialog.getByRole('status')).toHaveText('골드 100개를 받았습니다.');
        await submitCoupon(dialog, code);
        await expect(dialog.getByRole('alert')).toHaveText('이미 사용한 쿠폰입니다.');
        expect((await st.wallet(account.uuid)).gold).toBe(100);
    });

    test('기간이 끝난 쿠폰을 넣으면 → "기간이 끝난 쿠폰입니다." 안내', async ({ user }) => {
        const { page } = user;
        const code = await st.createCoupon({ endsAt: new Date(Date.now() - 60_000) });
        await st.gotoStore(page);
        const dialog = await openCoupon(page);
        await submitCoupon(dialog, code);
        await expect(dialog.getByRole('alert')).toHaveText('기간이 끝난 쿠폰입니다.');
    });

    test('아직 시작 안 한 쿠폰·사용 중지 쿠폰을 넣으면 → 각각 맞는 안내', async ({ user }) => {
        const { page } = user;
        const future = await st.createCoupon({ startsAt: new Date(Date.now() + 86_400_000) });
        const off = await st.createCoupon({ active: false });
        await st.gotoStore(page);
        const dialog = await openCoupon(page);
        await submitCoupon(dialog, future);
        await expect(dialog.getByRole('alert')).toHaveText('아직 사용할 수 없는 쿠폰입니다.');
        await submitCoupon(dialog, off);
        await expect(dialog.getByRole('alert')).toHaveText('사용이 중지된 쿠폰입니다.');
    });

    test('다 쓴 쿠폰(횟수 1, 이미 1번)을 넣으면 → "모두 사용된 쿠폰입니다." 안내', async ({ user }) => {
        const { page } = user;
        const code = await st.createCoupon({ maxUses: 1, usedCount: 1 });
        await st.gotoStore(page);
        const dialog = await openCoupon(page);
        await submitCoupon(dialog, code);
        await expect(dialog.getByRole('alert')).toHaveText('모두 사용된 쿠폰입니다.');
    });

    test('쿠폰을 1분에 11번 넣으면 → 11번째는 너무 많다는 거절 (따로 띄운 서버)', async ({ accounts }) => {
        test.setTimeout(120_000);
        // 상점·마이페이지 파트 포트 4145~4149 (작업자 번호로 고름)
        const port = 4145 + (test.info().parallelIndex % 5);
        const server = await servers.startExtraBackend({ port, overrides: { SERVER_ID: `e2e-store-${port - 4144}` } });
        try {
            const account = await accounts.create();
            const login = await fetch(`${server.url}/auth/login`, {
                method: 'POST', headers: { 'content-type': 'application/json', origin: E2E.desktopUrl },
                body: JSON.stringify({ email: account.email, password: account.password }),
            });
            expect(login.ok).toBe(true);
            const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
            const statuses = [];
            for (let i = 0; i < 11; i += 1) {
                const res = await fetch(`${server.url}/economy/coupons/redeem`, {
                    method: 'POST', headers: { 'content-type': 'application/json', origin: E2E.desktopUrl, cookie },
                    body: JSON.stringify({ code: `NOPE-${st.rand(4)}` }),
                });
                statuses.push(res.status);
            }
            expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
            expect(statuses[10]).toBe(429);
        } finally {
            await server.stop();
        }
    });
});
