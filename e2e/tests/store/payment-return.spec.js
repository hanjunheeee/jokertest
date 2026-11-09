// 다이아 충전 결제창 열고 닫기(실제 결제 안 함) + 결제창에서 돌아온 주소(/store?topup=…) 처리·환불된 주문 안내
const { test, expect } = require('../../helpers/fixtures');
const toss = require('../../helpers/toss');
const st = require('./store-tools');

const feedback = (page) => page.getByTestId('topup-feedback');

test.describe('다이아 충전 결제창', () => {
    test('다이아 50개 충전 → 결제창이 뜨고 X로 닫으면 → 취소 안내, 다이아 0 그대로', async ({ user }) => {
        const { page, account } = user;
        await toss.openTossWindow(page, { product: /다이아 50개/ });
        await toss.closeTossWindow(page);
        await expect(feedback(page)).toContainText('결제가 취소되었거나 완료되지 않았습니다. 다이아는 충전되지 않았습니다.');
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
    });

    test('결제창을 닫은 뒤 → 상점이 멈추지 않고 다른 분류·상품을 고를 수 있음', async ({ user }) => {
        const { page } = user;
        await toss.openTossWindow(page);
        await toss.closeTossWindow(page);
        await expect(feedback(page)).toBeVisible();
        await expect(st.detail(page).getByRole('button', { name: '충전' })).toBeEnabled();
        await st.pickCategory(page, '프로필 테두리');
        await st.pickItem(page, '공작 700');
        await expect(st.detail(page).getByRole('heading', { name: '공작' })).toBeVisible();
    });

});

test.describe('결제 돌아옴 주소', () => {
    test('/store?topup=fail 로 돌아오면 → 취소 안내가 뜨고 다이아는 그대로', async ({ user }) => {
        const { page, account } = user;
        await st.gotoStore(page, '/store?topup=fail&code=PAY_PROCESS_CANCELED&message=x');
        await expect(feedback(page)).toContainText('결제가 취소되었거나 완료되지 않았습니다.');
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
    });

    test('/store?topup=success 인데 결제 값이 빠져 있으면 → 복귀 정보가 올바르지 않다는 안내', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page, '/store?topup=success');
        await expect(feedback(page)).toContainText('결제 복귀 정보가 올바르지 않아 확인하지 않았습니다.');
    });

    test('없는 주문 번호로 성공 복귀하면 → 주문을 찾을 수 없다는 안내, 다이아 지급 없음', async ({ user }) => {
        const { page, account } = user;
        await st.gotoStore(page, `/store?topup=success&orderId=e2e-none-${st.rand(6).toLowerCase()}&paymentKey=tgen_x1&amount=1100`);
        await expect(feedback(page)).toContainText('주문을 찾을 수 없어 충전하지 않았습니다.');
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
    });

    test('남의 주문 번호로 성공 복귀하면 → 다른 계정 주문이라 충전 안 한다는 안내', async ({ user, accounts }) => {
        const { page, account } = user;
        const other = await accounts.create();
        const order = await st.createTopupOrder(other.uuid);
        await st.gotoStore(page, `/store?topup=success&orderId=${order.orderId}&paymentKey=${order.paymentKey}&amount=${order.amount}`);
        await expect(feedback(page)).toContainText('다른 계정의 주문이라 충전하지 않았습니다.');
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
    });

    test('금액을 바꾼 주소로 돌아오면 → 결제 금액이 주문과 다르다는 안내', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid);
        await st.gotoStore(page, `/store?topup=success&orderId=${order.orderId}&paymentKey=${order.paymentKey}&amount=100`);
        await expect(feedback(page)).toContainText('결제 금액이 주문과 달라 충전하지 않았습니다.');
    });

    test('주문에 붙은 것과 다른 결제 키로 돌아오면 → 결제 정보가 맞지 않다는 안내', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid, { status: 'CONFIRMING' });
        await st.gotoStore(page, `/store?topup=success&orderId=${order.orderId}&paymentKey=tgen_other_key&amount=${order.amount}`);
        await expect(feedback(page)).toContainText('결제 정보가 주문과 맞지 않아 충전하지 않았습니다.');
    });

    test('환불된 주문(REFUNDED)으로 돌아오면 → 환불된 주문 안내, 다이아 지급 없음', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid, { status: 'REFUNDED' });
        await st.gotoStore(page, `/store?topup=success&orderId=${order.orderId}&paymentKey=${order.paymentKey}&amount=${order.amount}`);
        await expect(feedback(page)).toContainText('환불된 주문입니다. 이 주문의 다이아는 지급되지 않거나 회수되었습니다.');
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
    });

});
