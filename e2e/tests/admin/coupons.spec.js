// 관리자 쿠폰 브라우저 시험 (AD-214): 쿠폰 만들기 → 플레이어가 상점에서 코드 넣음 → 보상 → 관리자 쓴 사람 1
// 프로젝트 admin (1280×800), 플레이어 쿠폰 입력 화면은 기존 상점 것 그대로
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const st = require('../store/store-tools');

test.describe('관리자 쿠폰', () => {
    test('AD-214: 만들기 → 플레이어 코드 입력 → 골드 받음 → 관리자 쓴 사람 1', async ({ page, players }) => {
        const code = `ADM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        await loginAsAdmin(page, await createAdmin());
        await page.goto('/coupons');
        await page.getByRole('button', { name: '새 쿠폰' }).click();
        await page.getByLabel('쿠폰 코드').fill(code.toLowerCase());
        await page.getByLabel('보상 양').fill('250');
        await page.getByLabel('쓸 수 있는 횟수').fill('5');
        await page.getByRole('button', { name: '만들기' }).click();
        await expect(page.getByText(`${code} 쿠폰을 만들었어요.`)).toBeVisible();
        const row = page.getByRole('row').filter({ hasText: code });
        await expect(row.getByRole('cell', { name: '0 / 5' })).toBeVisible();

        const player = await players.add();
        await st.gotoStore(player.page);
        await player.page.getByRole('button', { name: '쿠폰 입력' }).click();
        const dialog = player.page.getByRole('dialog', { name: '쿠폰 입력' });
        await dialog.getByRole('textbox', { name: '쿠폰 코드' }).fill(code);
        await dialog.getByRole('button', { name: '사용하기' }).click();
        await expect(dialog.getByRole('status')).toHaveText('골드 250개를 받았습니다.');
        expect((await st.wallet(player.account.uuid)).gold).toBe(250);
        expect((await st.ledger(player.account.uuid)).filter((entry) => entry.reason === 'COUPON_REWARD')).toHaveLength(1);

        await page.reload();
        await expect(row.getByRole('cell', { name: '1 / 5' })).toBeVisible();
        await row.getByRole('button', { name: `${code} 쓴 사람` }).click();
        await expect(page.getByRole('heading', { name: `${code} 쓴 사람 (1명)` })).toBeVisible();
        await expect(page.getByRole('link', { name: player.account.nickname })).toBeVisible();

        // 끄면 다음 사람은 못 씀
        await row.getByRole('button', { name: `${code} 끄기` }).click();
        await expect(page.getByText(`${code} 쿠폰을 껐어요.`)).toBeVisible();
        const other = await players.add();
        await st.gotoStore(other.page);
        await other.page.getByRole('button', { name: '쿠폰 입력' }).click();
        const otherDialog = other.page.getByRole('dialog', { name: '쿠폰 입력' });
        await otherDialog.getByRole('textbox', { name: '쿠폰 코드' }).fill(code);
        await otherDialog.getByRole('button', { name: '사용하기' }).click();
        await expect(otherDialog.getByRole('alert')).toBeVisible();
        expect((await st.wallet(other.account.uuid)).gold).toBe(0);
    });
});
