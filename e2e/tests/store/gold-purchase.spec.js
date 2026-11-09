// 골드로 상품 사기: 돈 모자람 안내, 산 뒤 보유 표시·잔액·장부 줄, 일괄구매
const { test, expect } = require('../../helpers/fixtures');
const st = require('./store-tools');

test.describe('골드로 사기', () => {
    test('새 계정으로 상점에 오면 → 골드 0·다이아 0이 보임', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page);
        await expect(st.balance(page, '골드', 0)).toBeVisible();
        await expect(st.balance(page, '다이아', 0)).toBeVisible();
    });

    test('골드가 모자란데 스킨을 사면 → 구매 거부 안내가 뜨고 잔액·보유는 그대로', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', 100);
        await st.gotoStore(page);
        await st.pickItem(page, '귀족 블러드 500');
        await st.detail(page).getByRole('button', { name: '구매' }).click();
        await expect(page.getByText('구매가 거부되었습니다. 재화는 차감되지 않았습니다.')).toBeVisible();
        await expect(page.getByText(/잔액이 부족/)).toBeVisible();
        await expect(st.balance(page, '골드', 100)).toBeVisible();
        expect((await st.wallet(account.uuid)).gold).toBe(100);
        expect(await st.owned(account.uuid)).not.toEqual(expect.arrayContaining([expect.stringContaining('블러드')]));
    });

    test('골드가 넉넉할 때 스킨을 사면 → 완료 안내·버튼이 보유중으로 바뀌고 잔액이 500 줄어듦', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', 1000);
        await st.gotoStore(page);
        await st.pickItem(page, '귀족 블러드 500');
        await st.detail(page).getByRole('button', { name: '구매' }).click();
        await expect(page.getByText('구매가 완료되었습니다.')).toBeVisible();
        await expect(st.detail(page).getByRole('button', { name: '보유중' })).toBeDisabled();
        await expect(st.balance(page, '골드', 500)).toBeVisible();
        expect((await st.wallet(account.uuid)).gold).toBe(500);
        expect((await st.owned(account.uuid)).some((id) => id.includes('블러드'))).toBe(true);
    });

    test('플레이어 카드를 사면 → 장부에 상점 구매 -500 줄이 남고 거래 내역에도 보임', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', 800);
        await st.gotoStore(page);
        await st.pickCategory(page, '플레이어 카드');
        await st.pickItem(page, '가면 500');
        await st.detail(page).getByRole('button', { name: '구매' }).click();
        await expect(page.getByText('구매가 완료되었습니다.')).toBeVisible();
        const rows = await st.ledger(account.uuid);
        const buy = rows.find((l) => l.reason === 'PURCHASE');
        expect(buy).toMatchObject({ currency: 'GOLD', amount: -500, balance_after: 300 });
        await st.pickCategory(page, '인게임 재화');
        await expect(page.getByRole('region', { name: '재화 거래 내역' }).getByRole('listitem').filter({ hasText: '상점 구매' }).first()).toContainText('-500');
    });

    test('이모티콘을 사면 → 이모티콘 팔레트 화면에서 그 이모티콘이 미보유가 아니게 됨', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', 500);
        await st.gotoStore(page);
        await st.pickCategory(page, '이모티콘');
        await st.pickItem(page, '깜짝 500');
        await st.detail(page).getByRole('button', { name: '구매' }).click();
        await expect(page.getByText('구매가 완료되었습니다.')).toBeVisible();
        await page.goto('/mypage/emoticons');
        await expect(page.getByRole('button', { name: '깜짝 팔레트에 넣기' })).toBeEnabled();
        await expect(page.getByRole('button', { name: '깜짝 (미보유)' })).toHaveCount(0);
    });

    test('산 상품을 다시 고르면 → 새로 고친 뒤에도 보유중이고 누를 수 없음', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', 300);
        await st.gotoStore(page);
        await st.pickCategory(page, '프로필 테두리');
        await st.detail(page).getByRole('button', { name: '구매' }).click();
        await expect(page.getByText('구매가 완료되었습니다.')).toBeVisible();
        await st.gotoStore(page);
        await st.pickCategory(page, '프로필 테두리');
        await st.pickItem(page, '남작 200');
        await expect(st.detail(page).getByRole('button', { name: '보유중' })).toBeDisabled();
        await expect(st.balance(page, '골드', 100)).toBeVisible();
    });

    test('일괄구매로 테두리 두 개를 고르고 사면 → 둘 다 보유, 잔액이 합계만큼 줄어듦', async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', 1000);
        await st.gotoStore(page);
        await st.pickCategory(page, '프로필 테두리');
        await page.getByRole('button', { name: '일괄구매' }).click();
        // 일괄구매 켜면 지금 고른 남작이 들어가 있음 → 자작 더함
        await page.getByRole('button', { name: /^자작/ }).first().click();
        await st.detail(page).getByRole('button').last().click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('500');
        await dialog.getByRole('button', { name: /구매/ }).last().click();
        await expect.poll(async () => (await st.wallet(account.uuid)).gold).toBe(500);
        const ids = await st.owned(account.uuid);
        expect(ids).toEqual(expect.arrayContaining(['profile-border-남작', 'profile-border-자작']));
    });

});
