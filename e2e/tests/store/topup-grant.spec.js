// 다이아 충전 승인 뒤 흐름: 결제사 승인 끝난 주문(지급 대기)으로 성공 복귀 → 다이아 한 번만·장부 한 줄·거래 내역, 두 번 승인 막힘, 확인 중 주문 자동 확인·안 끝난 주문 찾기
// 토스 승인 요청 자체는 주소가 코드에 박혀 있어(utils/adapters/toss.js) 가짜 서버로 못 돌림 → 승인 다음 상태(PENDING_GRANT)를 DB에 넣고 시작
const { test, expect, E2E } = require('../../helpers/fixtures');
const { query, sqlTime } = require('../../helpers/db');
const st = require('./store-tools');

const feedback = (page) => page.getByTestId('topup-feedback');
const DONE = '충전이 완료되었습니다.';
const UNKNOWN = '결제 결과 확인이 필요합니다.';

// 시험 상품 다이아 10개 (1,100원 · 10개 · 보너스 0)
const PRODUCT = { pay: 1100, grant: 10 };

/** 성공 복귀 주소 */
const successUrl = (order) => `/store?topup=success&orderId=${order.orderId}&paymentKey=${order.paymentKey}&amount=${order.amount}`;

/** 주문 줄 한 개 (상태·지급 시각·잠금 표) */
async function orderRow(orderId) {
    const rows = await query('SELECT status, granted_at, lease_token FROM economy_topup_orders WHERE order_id = ?', [orderId]);
    return rows[0] ?? null;
}

/** 다른 요청이 승인 확인 중인 주문으로 바꾸기 (잠금 표 10분 살아 있음 → 서버는 결제사에 안 묻고 "진행 중"으로 답함) */
async function markConfirmingBusy(orderId) {
    await query('UPDATE economy_topup_orders SET status = ?, lease_token = ?, lease_expires_at = ? WHERE order_id = ?',
        ['CONFIRMING', `e2e-lease-${st.rand(4)}`, sqlTime(Date.now() + 10 * 60_000), orderId]);
}

/** 그 확인이 끝나 승인 받음(지급 대기)으로 바꾸기 */
async function markApproved(orderId) {
    await query('UPDATE economy_topup_orders SET status = ?, lease_token = NULL, lease_expires_at = NULL, approved_at = ? WHERE order_id = ?',
        ['PENDING_GRANT', sqlTime(), orderId]);
}

/** 다이아 충전 장부 줄만 */
async function topupLedger(uuid) {
    return (await st.ledger(uuid)).filter((r) => r.reason === 'DIAMOND_TOPUP');
}

/** 승인 요청 응답 기다리기 (화면이 보내는 것) */
const confirmResponse = (page, orderId) => page.waitForResponse((r) => r.url().includes(`/economy/topup/orders/${orderId}/confirm`) && r.request().method() === 'POST');

test.describe('다이아 충전 승인 뒤', () => {
    test('승인 끝난 주문으로 성공 복귀하면 → 완료 안내, 다이아 10 바로 보임, 장부 한 줄·주문 지급됨', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid, { status: 'PENDING_GRANT' });
        const confirmed = confirmResponse(page, order.orderId);
        await st.gotoStore(page, successUrl(order));
        const res = await confirmed;
        expect(res.status()).toBe(200);
        expect(await res.json()).toEqual({ ok: true, status: 'GRANTED', balanceDiamond: PRODUCT.grant });
        await expect(feedback(page)).toContainText(DONE);
        await expect(st.balance(page, '다이아', PRODUCT.grant)).toBeVisible();
        expect(await st.wallet(account.uuid)).toEqual({ gold: 0, diamond: PRODUCT.grant });
        const rows = await topupLedger(account.uuid);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ currency: 'DIAMOND', amount: PRODUCT.grant, balance_after: PRODUCT.grant });
        const row = await orderRow(order.orderId);
        expect(row.status).toBe('GRANTED');
        expect(row.granted_at).not.toBeNull();
    });

    test('충전이 끝나면 → 인게임 재화 거래 내역에 다이아 충전 +10 줄이 생김', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid, { status: 'PENDING_GRANT' });
        await st.gotoStore(page, successUrl(order));
        await expect(feedback(page)).toContainText(DONE);
        await st.pickCategory(page, '인게임 재화');
        const history = page.getByRole('region', { name: '재화 거래 내역' });
        const line = history.getByRole('listitem').filter({ hasText: '다이아 충전' });
        await expect(line).toHaveCount(1);
        await expect(line).toContainText('+10');
        await expect(line).toContainText(`잔액 ${PRODUCT.grant}`);
    });

    test('같은 성공 복귀 주소를 다시 열고 승인도 또 보내면 → 매번 지급됨 답, 다이아·장부는 한 번만', async ({ user, context }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid, { status: 'PENDING_GRANT' });
        await st.gotoStore(page, successUrl(order));
        await expect(feedback(page)).toContainText(DONE);

        // 두 번째: 같은 주소 다시 열기 → 화면이 승인을 또 보냄
        const again = confirmResponse(page, order.orderId);
        await st.gotoStore(page, successUrl(order));
        const res = await again;
        expect(await res.json()).toEqual({ ok: true, status: 'GRANTED', balanceDiamond: PRODUCT.grant });
        await expect(feedback(page)).toContainText(DONE);
        await expect(st.balance(page, '다이아', PRODUCT.grant)).toBeVisible();

        // 세 번째: 같은 승인 요청을 바로 보냄
        const third = await context.request.post(`${E2E.apiUrl}/economy/topup/orders/${order.orderId}/confirm`, {
            data: { paymentKey: order.paymentKey, amount: order.amount }, headers: { origin: E2E.desktopUrl },
        });
        expect(third.status()).toBe(200);
        expect(await third.json()).toEqual({ ok: true, status: 'GRANTED', balanceDiamond: PRODUCT.grant });

        expect((await st.wallet(account.uuid)).diamond).toBe(PRODUCT.grant);
        expect(await topupLedger(account.uuid)).toHaveLength(1);
        expect((await orderRow(order.orderId)).status).toBe('GRANTED');
    });

    test('결제 실패로 끝난 주문(FAILED)으로 성공 복귀하면 → 결제 안 됨 안내, 다이아·장부 없음', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid, { status: 'FAILED' });
        const confirmed = confirmResponse(page, order.orderId);
        await st.gotoStore(page, successUrl(order));
        const res = await confirmed;
        expect(res.status()).toBe(402);
        expect((await res.json()).code).toBe('PAYMENT_FAILED');
        await expect(feedback(page)).toContainText('결제가 완료되지 않아 충전하지 않았습니다.');
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
        expect(await topupLedger(account.uuid)).toHaveLength(0);
    });
});

test.describe('충전 주문 상태 묻기', () => {
    test('다른 요청이 확인 중인 주문으로 복귀하면 → 확인 필요 안내 뒤 주문 상태를 물어, 승인되면 완료·다이아 10', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid);
        await markConfirmingBusy(order.orderId);
        const lookups = [];
        page.on('request', (r) => { if (r.method() === 'GET' && r.url().includes(`/economy/topup/orders/${order.orderId}`)) lookups.push(r.url()); });
        const confirmed = confirmResponse(page, order.orderId);
        await st.gotoStore(page, successUrl(order));
        expect((await confirmed).status()).toBe(503);
        await expect(feedback(page)).toContainText(UNKNOWN);
        expect((await st.wallet(account.uuid)).diamond).toBe(0);

        // 그사이 다른 요청이 승인을 받아 둠 → 다음 자동 확인(2초마다)이 주문을 물어 지급까지
        await markApproved(order.orderId);
        await expect(feedback(page)).toContainText(DONE, { timeout: 15_000 });
        expect(lookups.length).toBeGreaterThan(0);
        await expect(st.balance(page, '다이아', PRODUCT.grant)).toBeVisible();
        expect(await topupLedger(account.uuid)).toHaveLength(1);
        expect((await orderRow(order.orderId)).status).toBe('GRANTED');
    });

    test('결제창을 닫고 상점을 새로 열면 → 안 끝난 주문을 찾아 확인 필요 안내, 승인되면 완료로 바뀜', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid);
        await markConfirmingBusy(order.orderId);
        const listed = page.waitForResponse((r) => r.url().includes('/economy/topup/orders?state=open'));
        await st.gotoStore(page);
        const body = await (await listed).json();
        expect(body.orders.map((o) => o.orderId)).toEqual([order.orderId]);
        await expect(feedback(page)).toContainText(UNKNOWN);
        await expect(feedback(page).getByRole('button', { name: '결과 확인' })).toBeVisible();

        await markApproved(order.orderId);
        await expect(feedback(page)).toContainText(DONE, { timeout: 15_000 });
        await expect(st.balance(page, '다이아', PRODUCT.grant)).toBeVisible();
        expect(await topupLedger(account.uuid)).toHaveLength(1);
    });

    test('안 끝난 주문이 없으면 → 상점을 열어도 충전 안내가 안 뜸', async ({ user }) => {
        const { page, account } = user;
        await st.createTopupOrder(account.uuid, { status: 'GRANTED' });
        const listed = page.waitForResponse((r) => r.url().includes('/economy/topup/orders?state=open'));
        await st.gotoStore(page);
        expect((await (await listed).json()).orders).toEqual([]);
        await expect(feedback(page)).toHaveCount(0);
    });
});
