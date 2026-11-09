// 관리자 문의 답 휴대폰 크기 브라우저 시험 (AD-287): 카드 목록 → 문의 열기 → 답 보내기, 가로 넘침 없음
// 프로젝트 admin-phone (375×812)
const crypto = require('node:crypto');
const { test, expect } = require('../../../helpers/fixtures');
const { query } = require('../../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../../helpers/adminAccounts');

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('AD-287: 휴대폰 크기로 문의 카드 → 문의 열기 → 답 보내기', async ({ page, accounts }) => {
    const account = await accounts.create();
    const title = `폰 문의 ${crypto.randomBytes(3).toString('hex')}`;
    await query(
        "INSERT INTO inquiries (user_id, category, title, body, status, created_at, updated_at) VALUES (?, 'ACCOUNT', ?, '닉네임 바꾸는 곳을 못 찾아요', 'OPEN', NOW(), NOW())",
        [account.uuid, title],
    );
    await loginAsAdmin(page, await createAdmin());

    await page.goto('/inquiries');
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.getByRole('link', { name: title }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('닉네임 바꾸는 곳을 못 찾아요')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);

    await page.getByLabel('답').fill('마이페이지 → 닉네임 바꾸기에 있어요.');
    await page.getByRole('button', { name: '답 보내기' }).click();
    await expect(page.getByRole('status').filter({ hasText: '답을 달았어요.' })).toBeVisible();
    await expect(page.getByRole('list', { name: '단 답' })).toContainText('마이페이지 → 닉네임 바꾸기에 있어요.');
    expect(await noSideScroll(page)).toBe(true);

    const [row] = await query('SELECT status FROM inquiries WHERE user_id = ? AND title = ?', [account.uuid, title]);
    expect(row.status).toBe('ANSWERED');
});
