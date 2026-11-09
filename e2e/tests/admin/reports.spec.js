// 관리자 신고 처리 브라우저 시험 (AD-126·127): 정지 처리 → 처리됨·플레이어 튕김, 관리자 창 둘 → 늦은 쪽 "이미 처리됨"
// 프로젝트 admin (1280×800), 신고 줄은 게임 신고 접수와 같은 모양으로 DB에 넣음 (판 신고 화면 자체는 result/report.spec이 확인)
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const { makeReport } = require('./reportFixture');

test.describe('관리자 신고 처리', () => {
    test('AD-126: 신고 열기 → 채팅 증거 → 정지 처리 → 처리됨, 대상 플레이어는 로그인 화면으로 튕김', async ({ page, players, accounts }) => {
        const target = await players.add();
        const reporter = await accounts.create();
        const reportId = await makeReport({ reporter, target: target.account, text: `욕${crypto.randomBytes(2).toString('hex')}` });
        await loginAsAdmin(page, await createAdmin());

        await page.goto('/reports');
        await page.getByRole('row').filter({ hasText: target.account.nickname }).getByRole('link', { name: '열기' }).click();
        await expect(page.getByRole('heading', { name: `신고 #${reportId}` })).toBeVisible();
        await expect(page.getByRole('list', { name: '채팅 증거' })).toContainText(target.account.nickname);

        await page.getByRole('button', { name: '정지', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('정지 일수').fill('3');
        await dialog.getByLabel('정지 사유').fill('욕설');
        await dialog.getByRole('button', { name: '정지', exact: true }).click();

        await expect(page.getByText('정지하고 신고를 처리했어요.')).toBeVisible();
        await expect(page.getByText(/처리됨\(정지\)/)).toBeVisible();
        await expect(target.page).toHaveURL(/\/login/, { timeout: 15000 });
        const [row] = await query('SELECT status FROM reports WHERE id = ?', [reportId]);
        expect(row.status).toBe('RESOLVED');
    });

    test('AD-127: 관리자 창 둘 → 먼저 기각, 늦은 쪽 정지는 "이미 처리됨"', async ({ page, browser, accounts }) => {
        const reportId = await makeReport({ reporter: await accounts.create(), target: await accounts.create() });
        const first = await createAdmin();
        const second = await createAdmin();
        await loginAsAdmin(page, first);
        const otherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1280, height: 800 } });
        try {
            const other = await otherContext.newPage();
            await loginAsAdmin(other, second);
            await page.goto(`/reports/${reportId}`);
            await other.goto(`/reports/${reportId}`);

            await page.getByRole('button', { name: '기각', exact: true }).click();
            await page.getByRole('dialog').getByRole('button', { name: '기각', exact: true }).click();
            await expect(page.getByText('신고를 기각했어요.')).toBeVisible();

            await other.getByRole('button', { name: '정지', exact: true }).click();
            const dialog = other.getByRole('dialog');
            await dialog.getByLabel('정지 사유').fill('늦음');
            await dialog.getByRole('button', { name: '정지', exact: true }).click();
            await expect(other.getByText(new RegExp(`${first.loginId}가 .+에 이미 처리했어요`))).toBeVisible();
            const [row] = await query('SELECT status FROM reports WHERE id = ?', [reportId]);
            expect(row.status).toBe('DISMISSED');
        } finally {
            await otherContext.close();
        }
    });
});
