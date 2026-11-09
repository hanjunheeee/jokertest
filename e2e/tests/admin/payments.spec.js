// 관리자 결제·환불 브라우저 시험 (AD-186·187): 주문 찾기 → 환불 → 환불됨·플레이어 다이아 줄어듦, 다이아 모자란 주문 → 안내·지급됨 그대로
// 프로젝트 admin (1280×800), 주문은 시험 DB에 지급 끝 상태로 직접 넣고 다이아는 장부로 넣음 (지갑 = 장부 합 유지)
const { test, expect } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const st = require('../store/store-tools');

// 지급 끝난 다이아 10개 주문 + 다이아 diamonds개 (장부로) → 주문 id
async function grantedOrder(uuid, diamonds) {
    const { orderId } = await st.createTopupOrder(uuid, { productId: 'test-diamond-10', status: 'GRANTED' });
    if (diamonds > 0) await st.grant(uuid, 'DIAMOND', diamonds);
    return orderId;
}

async function openOrder(page, uuid) {
    await page.goto('/payments');
    await expect(page.getByRole('heading', { name: '결제', level: 1 })).toBeVisible();
    await page.getByLabel('회원 UUID').fill(uuid);
    await page.getByRole('button', { name: '찾기', exact: true }).click();
    await expect(page.getByRole('row')).toHaveCount(2);
    await page.getByRole('link', { name: '열기' }).click();
    await expect(page.getByRole('heading', { name: '충전 주문', level: 1 })).toBeVisible();
}

async function refund(page, reason) {
    await page.getByRole('button', { name: '환불', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('되돌릴 다이아: 10');
    await expect(dialog.getByRole('button', { name: '환불' })).toBeDisabled();
    await dialog.getByLabel('사유').fill(reason);
    await dialog.getByRole('button', { name: '환불' }).click();
    return dialog;
}

const orderStatus = async (orderId) => (await query('SELECT status FROM economy_topup_orders WHERE order_id = ?', [orderId]))[0]?.status;

test.describe('관리자 결제·환불', () => {
    test('AD-186: 주문 찾기 → 환불 → 환불됨, 장부 한 줄, 플레이어 상점 다이아 0', async ({ page, accounts, players }) => {
        const member = await accounts.create();
        const orderId = await grantedOrder(member.uuid, 10);
        await loginAsAdmin(page, await createAdmin());

        await openOrder(page, member.uuid);
        await expect(page.getByTestId('order-status')).toHaveText('지급됨');
        const dialog = await refund(page, '결제 회사 화면에서 취소함');
        await expect(dialog).toBeHidden();
        await expect(page.getByTestId('order-status')).toHaveText('환불됨');
        await expect(page.getByRole('status')).toContainText('다이아 -10');
        await expect(page.getByRole('cell', { name: '충전 환불' })).toBeVisible();

        expect(await orderStatus(orderId)).toBe('REFUNDED');
        expect((await st.wallet(member.uuid)).diamond).toBe(0);
        const refunds = (await st.ledger(member.uuid)).filter((row) => row.reason === 'TOPUP_REFUND');
        expect(refunds).toHaveLength(1);
        expect(refunds[0]).toMatchObject({ currency: 'DIAMOND', amount: -10, balance_after: 0 });

        const player = await players.add({ account: member });
        await st.gotoStore(player.page);
        await expect(st.balance(player.page, '다이아', 0)).toBeVisible();
    });

    test('AD-187: 다이아를 이미 써서 모자란 주문 → 창에 안내, 주문·다이아 그대로', async ({ page, accounts }) => {
        const member = await accounts.create();
        const orderId = await grantedOrder(member.uuid, 4);
        await loginAsAdmin(page, await createAdmin());

        await openOrder(page, member.uuid);
        const dialog = await refund(page, '결제 취소 요청');
        await expect(dialog.getByRole('alert')).toContainText('다이아가 모자라 환불을 멈췄어요');
        await dialog.getByRole('button', { name: '취소' }).click();
        await expect(page.getByTestId('order-status')).toHaveText('지급됨');

        expect(await orderStatus(orderId)).toBe('GRANTED');
        expect((await st.wallet(member.uuid)).diamond).toBe(4);
        expect((await st.ledger(member.uuid)).some((row) => row.reason === 'TOPUP_REFUND')).toBe(false);
    });
});
