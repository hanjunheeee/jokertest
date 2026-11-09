// 관리자 상품 브라우저 시험 (AD-194): 새 골드 상품 → 플레이어 상점에 보임 → 값 고침 → 상점 값 바뀜 → 판매 중지 → 안 보임
// 프로젝트 admin (1280×800), 시험이 만든 상품만 만지고 끝에 지움 (기존 시험 상품은 안 건드림)
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const st = require('../store/store-tools');

async function openGoldShelf(page) {
    await st.gotoStore(page);
    await st.pickCategory(page, '인게임 재화');
}

test.describe('관리자 상품', () => {
    test('AD-194: 만들기 → 상점에 보임 → 값 고침 → 상점 값 바뀜 → 판매 끄면 안 보임', async ({ page, players }) => {
        const tag = crypto.randomBytes(2).toString('hex');
        const productId = `e2e-gold-${tag}`;
        const name = `금화 ${parseInt(tag, 16) % 900 + 1000}개`;
        try {
            await loginAsAdmin(page, await createAdmin());
            await page.goto('/products');
            await page.getByRole('button', { name: '새 상품' }).click();
            await page.getByLabel('상품 id').fill(productId);
            await page.getByLabel('종류').selectOption('GOLD_PURCHASE');
            await page.getByLabel('이름').fill(name);
            await page.getByLabel('값(다이아)').fill('7');
            await page.getByLabel('받는 양').fill('70');
            await page.getByLabel('순서').fill('999');
            await page.getByRole('button', { name: '저장' }).click();
            await expect(page.getByText(`'${name}' 저장했어요 (1판).`)).toBeVisible();

            const player = await players.add();
            await openGoldShelf(player.page);
            await expect(player.page.getByRole('button', { name: `${name} 7`, exact: true })).toBeVisible();

            await page.getByRole('button', { name: `${name} 고치기` }).click();
            await page.getByLabel('값(다이아)').fill('9');
            await page.getByRole('button', { name: '저장' }).click();
            await expect(page.getByText(`'${name}' 저장했어요 (2판).`)).toBeVisible();
            await openGoldShelf(player.page);
            await expect(player.page.getByRole('button', { name: `${name} 9`, exact: true })).toBeVisible();
            await expect(player.page.getByRole('button', { name: `${name} 7`, exact: true })).toHaveCount(0);

            await page.getByRole('button', { name: `${name} 고치기` }).click();
            await page.getByLabel('판매').selectOption('STOPPED');
            await page.getByRole('button', { name: '저장' }).click();
            await expect(page.getByText(`'${name}' 저장했어요 (3판).`)).toBeVisible();
            await openGoldShelf(player.page);
            await expect(player.page.getByRole('button', { name: `${name} 9`, exact: true })).toHaveCount(0);
            const [row] = await query('SELECT status, version, pay_amount FROM economy_currency_products WHERE product_id = ?', [productId]);
            expect(row).toMatchObject({ status: 'STOPPED', version: 3, pay_amount: 9 });
        } finally {
            await query('DELETE FROM economy_currency_products WHERE product_id = ?', [productId]);
        }
    });
});
