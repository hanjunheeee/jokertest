// 관리자 제재 휴대폰 크기 브라우저 시험 (AD-084): 카드 목록 → 상세 → 영구 정지 → 제재 해제, 가로 넘침 없음
// 프로젝트 admin-phone (375×812)
const { test, expect } = require('../../../helpers/fixtures');
const { query } = require('../../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../../helpers/adminAccounts');

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('AD-084: 휴대폰 크기에서 회원 카드 → 영구 정지 → 제재 해제', async ({ page, accounts }) => {
    const member = await accounts.create();
    await loginAsAdmin(page, await createAdmin());

    await page.goto(`/members?q=${encodeURIComponent(member.uuid)}`);
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.getByRole('link', { name: member.nickname }).click();
    await expect(page.getByRole('heading', { level: 1, name: member.nickname })).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);

    await page.getByRole('button', { name: '영구 정지' }).click();
    const banDialog = page.getByRole('dialog', { name: '영구 정지' });
    await banDialog.getByLabel(/정지 사유/).fill('핵 사용');
    await expect(banDialog).toContainText('기간: 영구');
    await banDialog.getByRole('button', { name: '정지하기' }).click();
    await expect(page.getByText('정지했어요', { exact: false }).first()).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    const [banned] = await query('SELECT is_permanent FROM user_bans WHERE user_id = ?', [member.uuid]);
    expect(Number(banned.is_permanent)).toBe(1);

    await page.getByRole('button', { name: '제재 해제' }).click();
    const liftDialog = page.getByRole('dialog', { name: '제재 해제' });
    await liftDialog.getByLabel('해제 사유').fill('오해였음');
    await liftDialog.getByRole('button', { name: '해제하기' }).click();
    await expect(page.getByText('정지 1건을 풀었어요', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('list', { name: '정지 기록' })).toContainText('오해였음');
    expect(await noSideScroll(page)).toBe(true);
    const [lifted] = await query('SELECT lift_reason, is_permanent FROM user_bans WHERE user_id = ?', [member.uuid]);
    expect(lifted.lift_reason).toBe('오해였음');
    expect(Number(lifted.is_permanent)).toBe(0);
});
