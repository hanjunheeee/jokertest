'use strict';

// 서버 두 대 관리자 로그인 잠김 어려운 브라우저 시험 (E2E_NODES=2) — ㄱ서버로 3번 + ㄴ서버로 2번 틀리면 맞는 비번도 잠김 글 (셈이 DB 하나)
// 목록 시험목록/A14-관리자.md 번호 A14-H-010 — 서버 2대에서만 돎 / 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a14-admin-lock.spec.js
const mn = require('./_mn');
const { expectReadable } = require('../../helpers/visible');
const { fillLogin, otpNow } = require('../../helpers/adminAccounts');
const { allowAccess } = require('../../helpers/adminAccess');
const k = require('../admin/_a14-kit');

const { test, expect, NODE_IDS } = mn;
const { H, TEXT } = k;

test(`${H(10)} 서버 2대: ㄱ서버로 3번 + ㄴ서버로 2번 틀림 → 맞는 비번도 잠김 글 @hard @smoke`, async ({ browser }) => {
    test.setTimeout(120_000);
    const [near, far] = NODE_IDS;
    const w = await k.openAdminWindow(browser);
    try {
        // 로그인 요청마다 보낼 서버를 바꿈 (앞단이 ?node=로 고름)
        let target = near;
        const served = [];
        await w.page.route('**/admin-api/auth/login*', (route) => {
            const url = new URL(route.request().url());
            url.searchParams.set('node', target);
            served.push(target);
            return route.continue({ url: url.toString() });
        });
        await allowAccess(w.context, w.admin.email);
        await w.page.goto('/login');
        const button = w.page.getByRole('button', { name: '로그인', exact: true });
        const alert = w.page.getByRole('alert');
        for (const node of [near, near, near, far, far]) {
            target = node;
            await fillLogin(w.page, w.admin, { password: `${w.admin.password}x`, otp: otpNow(w.admin.totpSecret) });
            await button.click();
            await expect(alert).toHaveText(TEXT.loginFailed);
        }
        expect(served).toEqual([near, near, near, far, far]);
        // 어느 서버로 가도 잠김 (ㄱ서버로 맞는 비번)
        target = near;
        await fillLogin(w.page, w.admin);
        await button.click();
        await expect(alert).toHaveText(TEXT.locked);
        await expectReadable(alert);
        await expect(w.page).toHaveURL(/\/login/);
    } finally {
        await w.close();
    }
});
