// 관리자 골드·다이아 주고 뺏기 브라우저 시험 (AD-205): 회원 상세에서 골드 주기 → 숫자 바뀜·장부 ADMIN_GRANT, 모자란 뺏기 → 안내·그대로
// 프로젝트 admin (1280×800), 회원 상세 화면(1-1) 안 골드·다이아 칸(WalletPanel)
const { test, expect } = require('../../helpers/fixtures');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const st = require('../store/store-tools');

async function adjust(panel, { currency, amount, reason, button }) {
    await panel.getByLabel('재화').selectOption({ label: currency });
    await panel.getByLabel('금액').fill(String(amount));
    await panel.getByLabel('사유').fill(reason);
    await panel.getByRole('button', { name: button, exact: true }).click();
}

test.describe('관리자 골드·다이아 주고 뺏기', () => {
    test('AD-205: 골드 주기 → 숫자·장부 바뀜·플레이어 상점에 보임, 모자란 뺏기 → 안내, 숫자 그대로', async ({ page, accounts, players }) => {
        const member = await accounts.create();
        await loginAsAdmin(page, await createAdmin());
        await page.goto(`/members/${member.uuid}`);
        const panel = page.getByRole('region', { name: '골드·다이아' });
        await expect(panel.getByTestId('wallet-gold')).toHaveText('0');

        await adjust(panel, { currency: '골드', amount: 500, reason: '버그로 잃은 골드 보상', button: '주기' });
        const dialog = page.getByRole('dialog');
        await expect(dialog).toContainText('금액: +500');
        await dialog.getByRole('button', { name: '주기' }).click();
        await expect(dialog).toBeHidden();
        await expect(panel.getByTestId('wallet-gold')).toHaveText('500');
        await expect(panel.getByRole('cell', { name: '관리자 지급' })).toBeVisible();
        expect((await st.wallet(member.uuid)).gold).toBe(500);
        expect((await st.ledger(member.uuid)).filter((row) => row.reason === 'ADMIN_GRANT')).toHaveLength(1);

        await adjust(panel, { currency: '골드', amount: 501, reason: '잘못 준 골드 회수', button: '뺏기' });
        await expect(dialog).toContainText('금액: -501');
        await dialog.getByRole('button', { name: '뺏기' }).click();
        await expect(dialog.getByRole('alert')).toContainText('뺏을 양이 모자라요');
        await dialog.getByRole('button', { name: '취소' }).click();
        await expect(panel.getByTestId('wallet-gold')).toHaveText('500');
        expect((await st.wallet(member.uuid)).gold).toBe(500);
        expect((await st.ledger(member.uuid)).some((row) => row.reason === 'ADMIN_REVOKE')).toBe(false);

        const player = await players.add({ account: member });
        await st.gotoStore(player.page);
        await expect(st.balance(player.page, '골드', 500)).toBeVisible();
    });
});
