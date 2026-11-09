// 관리자 신고 처리 휴대폰 크기 브라우저 시험 (AD-128): 카드 목록 → 상세 → 정지 처리, 가로 넘침 없음
// 프로젝트 admin-phone (375×812)
const crypto = require('node:crypto');
const { test, expect } = require('../../../helpers/fixtures');
const { query } = require('../../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../../helpers/adminAccounts');
const { makeReport } = require('../reportFixture');

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('AD-128: 휴대폰 크기로 신고 카드 → 상세 → 정지 처리', async ({ page, accounts }) => {
    const target = await accounts.create();
    const reportId = await makeReport({ reporter: await accounts.create(), target, text: `욕${crypto.randomBytes(2).toString('hex')}` });
    await loginAsAdmin(page, await createAdmin());

    await page.goto('/reports');
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.getByRole('link').filter({ hasText: target.nickname }).click();
    await expect(page.getByRole('heading', { name: `신고 #${reportId}` })).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);

    await page.getByRole('button', { name: '정지', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('정지 종류').selectOption('PERMANENT');
    await dialog.getByLabel('정지 사유').fill('욕설');
    await dialog.getByRole('button', { name: '정지', exact: true }).click();
    await expect(page.getByText('정지하고 신고를 처리했어요.')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);

    const [row] = await query('SELECT status FROM reports WHERE id = ?', [reportId]);
    expect(row.status).toBe('RESOLVED');
});
