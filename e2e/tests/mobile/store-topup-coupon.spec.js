// 모바일 상점(375×812) 다이아 충전·쿠폰: 결제창 열고 닫기(실제 결제 안 함)·승인 끝난 주문 성공 복귀·쿠폰 넣으면 잔액이 바로 늘어남
// 데스크톱과 같은 흐름을 휴대폰 화면에서, DB 넣기·확인은 tests/store/store-tools.js 그대로 씀
const { test, expect } = require('../../helpers/fixtures');
const toss = require('../../helpers/toss');
const st = require('../store/store-tools');

const feedback = (page) => page.getByTestId('topup-feedback');
const tabButton = (page, name) => page.getByRole('complementary').filter({ has: page.getByRole('button', { name: '스킨' }) }).getByRole('button', { name, exact: true });
const info = (page) => page.getByRole('region', { name: '선택한 아이템 정보' });

/** 쿠폰 창 열고 코드 넣어 사용하기 → 창 */
async function redeem(page, code) {
    await page.getByRole('button', { name: '쿠폰', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '쿠폰 입력' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: '쿠폰 코드' }).fill(code);
    await dialog.getByRole('button', { name: '사용하기' }).click();
    return dialog;
}

/**
 * 휴대폰 토스 결제창 닫기: 데스크톱과 달리 창 위 줄 이름 없는 뒤로 버튼으로 닫음 (카드 고르기·결제는 안 함)
 * 취소할지 묻는 창이 뜨면 결제 취소하기 → 토스 화면이 사라질 때까지
 */
async function closeMobileToss(page) {
    const frame = await toss.waitTossFrame(page);
    await expect(frame.getByText('실제 결제가 안되는 테스트입니다')).toBeVisible({ timeout: 20000 });
    await frame.getByRole('navigation').getByRole('button').first().click();
    // "결제가 완료되지 않았습니다. 결제를 취소할까요?" → 결제 취소하기
    await frame.getByText('결제 취소하기', { exact: true }).click();
    await expect.poll(() => page.frames().some((f) => f.url().includes(toss.TOSS_HOST)), { timeout: 15000 }).toBe(false);
}

test.describe('모바일 다이아 충전', () => {
    test('다이아 10개 충전을 누르면 → 토스 결제창이 뜨고, 닫으면 상점으로 돌아와 취소 안내·다이아 0', async ({ user }) => {
        const { page, account } = user;
        await page.goto('/store');
        await tabButton(page, '인게임 재화').click();
        await page.getByRole('button', { name: /다이아 10개/ }).first().click();
        await info(page).getByRole('button', { name: '충전' }).click();
        await closeMobileToss(page);
        await expect(page).toHaveURL(/\/store/);
        await expect(feedback(page)).toContainText('결제가 취소되었거나 완료되지 않았습니다. 다이아는 충전되지 않았습니다.');
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
    });

    test('승인 끝난 주문으로 성공 복귀하면 → 완료 안내, 위 줄 유료 재화가 10으로 바로 바뀜, 장부 한 줄', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid, { status: 'PENDING_GRANT' });
        await page.goto(`/store?topup=success&orderId=${order.orderId}&paymentKey=${order.paymentKey}&amount=${order.amount}`);
        await expect(feedback(page)).toContainText('충전이 완료되었습니다.');
        await expect(st.balance(page, '다이아', 10)).toBeVisible();
        expect((await st.wallet(account.uuid)).diamond).toBe(10);
        expect((await st.ledger(account.uuid)).filter((r) => r.reason === 'DIAMOND_TOPUP')).toHaveLength(1);
    });
});

test.describe('모바일 쿠폰 사용', () => {
    test('골드 쿠폰을 넣으면 → 받았다는 안내, 위 줄 무료 재화가 새로 고침 없이 300으로 늘어남', async ({ user }) => {
        const { page, account } = user;
        const code = await st.createCoupon({ rewardType: 'GOLD', amount: 300 });
        await page.goto('/store');
        await expect(st.balance(page, '골드', 0)).toBeVisible();
        const dialog = await redeem(page, code);
        await expect(dialog.getByRole('status')).toHaveText('골드 300개를 받았습니다.');
        await expect(st.balance(page, '골드', 300)).toBeVisible();
        expect((await st.wallet(account.uuid)).gold).toBe(300);
        expect(await st.couponUsedCount(code)).toBe(1);
    });

    test('다이아 쿠폰을 넣고 같은 쿠폰을 또 넣으면 → 다이아 7 한 번만, 두 번째는 이미 사용 안내', async ({ user }) => {
        const { page, account } = user;
        const code = await st.createCoupon({ rewardType: 'DIAMOND', amount: 7 });
        await page.goto('/store');
        const dialog = await redeem(page, code);
        await expect(dialog.getByRole('status')).toHaveText('다이아 7개를 받았습니다.');
        await expect(st.balance(page, '다이아', 7)).toBeVisible();
        await dialog.getByRole('textbox', { name: '쿠폰 코드' }).fill(code);
        await dialog.getByRole('button', { name: '사용하기' }).click();
        await expect(dialog.getByRole('alert')).toHaveText('이미 사용한 쿠폰입니다.');
        expect((await st.wallet(account.uuid)).diamond).toBe(7);
    });
});
