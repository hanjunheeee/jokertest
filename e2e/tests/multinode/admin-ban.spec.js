// Node 여러 개 — 관리자 정지 (AD-085): 정지 요청은 n1으로, 플레이어는 n2 로비 → 정지 즉시 튕김 + 첫 안내가 정지 문구
// E2E_NODES=2에서만 돎, 관리자 화면(5275)의 정지 요청 주소에 ?node=를 붙여 받는 Node를 고름
const mn = require('./_mn');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const { captureAlert } = require('../../helpers/ui');

const { test, expect, E2E, NODE_IDS } = mn;
const [N1, N2] = NODE_IDS;

test('AD-085: n2에 붙은 플레이어를 n1이 받은 정지로 즉시 튕김', async ({ browser, onNode }) => {
    const target = await onNode.person(N2);
    const context = await browser.newContext({ baseURL: E2E.adminUrl, viewport: { width: 1280, height: 800 } });
    try {
        const admin = await context.newPage();
        // 정지 요청만 n1으로 (앞단이 ?node=를 보고 고름)
        await admin.route('**/admin-api/members/*/bans', (route) => {
            const url = new URL(route.request().url());
            url.searchParams.set('node', N1);
            return route.continue({ url: url.toString() });
        });
        await loginAsAdmin(admin, await createAdmin());
        await admin.goto(`/members/${target.account.uuid}`);
        await admin.getByRole('button', { name: '기간 정지' }).click();
        const dialog = admin.getByRole('dialog', { name: '기간 정지' });
        await dialog.getByLabel('정지 일수').fill('1');
        await dialog.getByLabel(/정지 사유/).fill('욕설');

        // 다른 Node 플레이어도 첫 안내가 "정지된 계정"이어야 함 (세션 내림을 끊기 뒤로 미뤄 "세션 만료"가 먼저 안 뜸)
        const notice = await captureAlert(target.page, () => dialog.getByRole('button', { name: '정지하기' }).click(), { timeoutMs: 15000 });
        expect(notice).toContain('정지된 계정');
        await expect(target.page).toHaveURL(/\/login/, { timeout: 15000 });
        await expect(admin.getByText('접속 1곳을 바로 끊었어요', { exact: false }).first()).toBeVisible();

        await target.page.getByPlaceholder('이메일을 입력하세요').fill(target.account.email);
        await target.page.getByPlaceholder('비밀번호를 입력하세요').fill(target.account.password);
        const refused = await captureAlert(target.page, () => target.page.getByRole('button', { name: '로그인', exact: true }).click());
        expect(refused).toContain('정지된 계정');
        expect(refused).toContain('욕설');
    } finally {
        await context.close();
    }
});
