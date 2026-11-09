// 상점에서 산 스킨·플레이어 카드·프로필 테두리를 마이페이지에서 장착
const { test, expect } = require('../../helpers/fixtures');
const st = require('./store-tools');

// 상점에서 상품 하나 사기 (골드 넣고 → 분류 → 상품 → 구매 → 완료)
async function buy(page, uuid, category, item, price) {
    await st.grant(uuid, 'GOLD', price);
    await st.gotoStore(page);
    await st.pickCategory(page, category);
    await st.pickItem(page, item);
    await st.detail(page).getByRole('button', { name: '구매' }).click();
    await expect(page.getByText('구매가 완료되었습니다.')).toBeVisible();
}

async function openWear(page) {
    await page.goto('/mypage');
    await page.getByRole('button', { name: '스킨&카드 착용' }).click();
    const dialog = page.getByRole('dialog', { name: '스킨&카드 착용' });
    await expect(dialog).toBeVisible();
    return dialog;
}

test.describe('장착', () => {
    test('안 산 스킨은 → 스킨&카드 착용 창에서 미보유로 누를 수 없음', async ({ user }) => {
        const { page } = user;
        const dialog = await openWear(page);
        await expect(dialog.getByRole('button', { name: '귀족-블러드, 미보유' })).toBeDisabled();
        await expect(dialog.getByRole('button', { name: '귀족1, 착용 중' })).toBeVisible();
    });

    test('귀족 블러드 스킨을 사서 고르고 적용하면 → 착용 중으로 바뀌고 장착 표에 남음', async ({ user }) => {
        const { page, account } = user;
        await buy(page, account.uuid, '스킨', '귀족 블러드 500', 500);
        const dialog = await openWear(page);
        await dialog.getByRole('button', { name: '귀족-블러드' }).click();
        await dialog.getByRole('button', { name: '적용' }).click();
        // 적용이 되면 창이 닫힘 → 다시 열면 착용 중
        await expect(dialog).toBeHidden();
        await expect.poll(async () => (await st.loadout(account.uuid))?.selected_skin_noble ?? '').toContain('블러드');
        const again = await openWear(page);
        await expect(again.getByRole('button', { name: '귀족-블러드, 착용 중' })).toBeVisible();
    });

    test('플레이어 카드 가고일을 사서 카드 보기에서 고르고 적용하면 → 장착 표 카드가 가고일', async ({ user }) => {
        const { page, account } = user;
        await buy(page, account.uuid, '플레이어 카드', '가고일 500', 500);
        const dialog = await openWear(page);
        await dialog.getByRole('button', { name: '플레이어 카드 미리보기로 전환' }).click();
        await dialog.getByRole('button', { name: /가고일/ }).first().click();
        await dialog.getByRole('button', { name: '적용' }).click();
        await expect(dialog).toBeHidden();
        await expect.poll(async () => (await st.loadout(account.uuid))?.selected_card_frame_id ?? '').toContain('가고일');
    });

    test('프로필 테두리 남작을 사서 테두리 수정에서 고르고 수정하면 → 장착 표 테두리가 남작', async ({ user }) => {
        const { page, account } = user;
        await buy(page, account.uuid, '프로필 테두리', '남작 200', 200);
        await page.goto('/mypage');
        await page.getByRole('button', { name: '프로필 수정' }).click();
        const dialog = page.getByRole('dialog', { name: '프로필 수정' });
        await dialog.getByRole('tab', { name: '테두리 수정' }).click();
        const grid = dialog.getByRole('region', { name: /테두리 목록/ });
        const options = grid.getByRole('button');
        // 산 테두리는 기본 테두리 뒤에 붙음 → 안 눌린 칸 중 마지막
        await expect(options).not.toHaveCount(0);
        await grid.locator('button[aria-pressed="false"]').last().click();
        await dialog.getByRole('button', { name: '수정하기' }).click();
        await expect.poll(async () => (await st.loadout(account.uuid))?.selected_profile_border_id ?? '').toContain('남작');
    });
});
