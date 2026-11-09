// 다이아로 금화(골드) 사기: 다이아 모자람 안내·충전하러 가기, 산 뒤 잔액·장부·거래 내역
const { test, expect } = require('../../helpers/fixtures');
const st = require('./store-tools');

// 인게임 재화 → 금화 상품 고르기
async function pickGold(page, name) {
    await st.gotoStore(page);
    await st.pickCategory(page, '인게임 재화');
    await st.pickItem(page, name);
}

test.describe('다이아 → 골드', () => {
    test('다이아가 모자란데 금화를 사면 → 다이아 부족 안내와 충전하러 가기 버튼, 잔액 그대로', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'DIAMOND', 3);
        await pickGold(page, '금화 50개 5');
        await st.detail(page).getByRole('button').last().click();
        const fb = page.getByTestId('gold-feedback');
        await expect(fb).toContainText('다이아가 부족합니다. 잔액은 변하지 않았습니다.');
        await expect(fb.getByRole('button', { name: '다이아 충전하러 가기' })).toBeVisible();
        expect(await st.wallet(account.uuid)).toEqual({ gold: 0, diamond: 3 });
    });

    test('다이아 부족 안내에서 충전하러 가기를 누르면 → 다이아 충전 상품이 골라짐', async ({ user }) => {
        const { page } = user;
        await pickGold(page, '금화 50개 5');
        await st.detail(page).getByRole('button').last().click();
        await page.getByRole('button', { name: '다이아 충전하러 가기' }).click();
        await expect(st.detail(page).getByRole('heading', { name: /^다이아 \d+개$/ })).toBeVisible();
        await expect(st.detail(page).getByRole('button', { name: '충전' })).toBeVisible();
    });

    test('다이아가 넉넉할 때 금화 100개를 사면 → 완료 안내, 다이아 -10·골드 +100이 바로 보임', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'DIAMOND', 25);
        await pickGold(page, '금화 100개 10');
        await st.detail(page).getByRole('button').last().click();
        await expect(page.getByTestId('gold-feedback')).toContainText('골드 구매가 완료되었습니다.');
        await expect(st.balance(page, '다이아', 15)).toBeVisible();
        await expect(st.balance(page, '골드', 100)).toBeVisible();
        expect(await st.wallet(account.uuid)).toEqual({ gold: 100, diamond: 15 });
    });

    test('금화를 사면 → 거래 내역에 골드 구매 줄(다이아 -·골드 +)이 생김', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'DIAMOND', 50);
        await pickGold(page, '금화 500개 50');
        await st.detail(page).getByRole('button').last().click();
        await expect(page.getByTestId('gold-feedback')).toContainText('골드 구매가 완료되었습니다.');
        const history = page.getByRole('region', { name: '재화 거래 내역' });
        await expect(history.getByRole('listitem').filter({ hasText: '골드 구매' }).filter({ hasText: '다이아' }).first()).toContainText('-50');
        await expect(history.getByRole('listitem').filter({ hasText: '골드 구매' }).filter({ hasText: '+500' }).first()).toBeVisible();
        const rows = await st.ledger(account.uuid);
        expect(rows.filter((r) => r.reason === 'GOLD_PURCHASE').map((r) => `${r.currency}${r.amount}`).sort()).toEqual(['DIAMOND-50', 'GOLD500']);
    });

});
