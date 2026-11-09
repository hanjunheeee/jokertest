// 가짜 토스 승인 서버로 충전 승인 끝까지: 성공 → 다이아 지급, 같은 승인 두 번이면 토스엔 한 번만, 카드 거절, 승인 응답 시간 초과 → 조회로 복구, 운영에 가짜 주소 있으면 시작 거부
// 따로 띄운 백엔드(시험 키 + TOSS_API_BASE_URL)로 화면의 /economy 요청만 돌려 보냄 (본 서버 4100은 진짜 토스 주소 그대로), 결제창(토스 화면)은 건너뛰고 성공 복귀 주소부터
const { test, expect, E2E } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const servers = require('../../helpers/servers');
const st = require('./store-tools');
const { startFakeToss } = require('./fakeToss');

// 상점 파트 포트: 따로 띄운 백엔드 4160~4163, 가짜 토스 4164~4167, 시작 거부 시험 4168
const slot = () => test.info().parallelIndex % 4;
const feedback = (page) => page.getByTestId('topup-feedback');
const DONE = '충전이 완료되었습니다.';
let fake = null;
let api = null;

/** 따로 띄운 백엔드로 바로 보내기 (로그인 쿠키 실어) → { status, body } */
async function call(context, method, path, data) {
    const res = await context.request.fetch(`${api.url}${path}`, { method, data, headers: { origin: E2E.desktopUrl } });
    return { status: res.status(), body: await res.json() };
}

/** 다이아 10개 주문을 서버 길(POST /economy/topup/orders)로 만들기 → { orderId, amount } */
async function createOrder(context) {
    const products = await call(context, 'GET', '/economy/currency-products');
    const product = products.body.products.find((p) => p.productId === 'test-diamond-10');
    const created = await call(context, 'POST', '/economy/topup/orders', { productId: product.productId, version: product.version });
    expect(created.status).toBe(201);
    return { orderId: created.body.orderId, amount: created.body.amount };
}

/** 화면의 /economy 요청을 따로 띄운 백엔드로 돌림 (소켓·로그인 길은 본 서버 그대로, 같은 시험 DB) */
async function routeEconomy(page) {
    await page.route(`${E2E.apiUrl}/economy/**`, async (route) => {
        const response = await route.fetch({ url: route.request().url().replace(E2E.apiUrl, api.url) });
        await route.fulfill({ response });
    });
}

const successUrl = (order, paymentKey) => `/store?topup=success&orderId=${order.orderId}&paymentKey=${paymentKey}&amount=${order.amount}`;
const confirmResponse = (page, orderId) => page.waitForResponse((r) => r.url().includes(`/economy/topup/orders/${orderId}/confirm`) && r.request().method() === 'POST');
const confirmCalls = (orderId) => fake.calls.filter((c) => c.method === 'POST' && c.path === '/v1/payments/confirm' && c.body?.orderId === orderId);
const topupLedger = async (uuid) => (await st.ledger(uuid)).filter((r) => r.reason === 'DIAMOND_TOPUP');
const orderRow = async (orderId) => (await query('SELECT status, payment_key, failure_code FROM economy_topup_orders WHERE order_id = ?', [orderId]))[0];
const key = (kind) => `pk_${kind}_${st.rand(6).toLowerCase()}`;

test.describe('가짜 토스 승인', () => {
    // 한 작업자에서 차례로 (따로 띄운 백엔드를 시험마다 띄우지 않게)
    test.describe.configure({ mode: 'default' });
    test.beforeAll(async () => {
        test.setTimeout(200_000);
        const n = slot();
        fake = await startFakeToss(4164 + n);
        api = await servers.startExtraBackend({
            port: 4160 + n, defaultIpLimits: false, timeoutMs: 150_000,
            overrides: { SERVER_ID: `e2e-store-toss-${n}`, TOSS_API_BASE_URL: fake.url },
        });
    });
    test.afterAll(async () => {
        await api?.stop();
        await fake?.close();
    });

    test('승인 성공으로 돌아오면 → 토스에 승인 한 번(시험 비밀키·주문 멱등키·주문 값), 완료 안내·다이아 10·장부 한 줄', async ({ user, context }) => {
        const { page, account } = user;
        const order = await createOrder(context);
        const pk = key('ok');
        await routeEconomy(page);
        const confirmed = confirmResponse(page, order.orderId);
        await st.gotoStore(page, successUrl(order, pk));
        const res = await confirmed;
        expect(res.status()).toBe(200);
        expect(await res.json()).toEqual({ ok: true, status: 'GRANTED', balanceDiamond: 10 });
        await expect(feedback(page)).toContainText(DONE);
        await expect(st.balance(page, '다이아', 10)).toBeVisible();

        const calls = confirmCalls(order.orderId);
        expect(calls).toHaveLength(1);
        expect(calls[0].auth).toMatch(/^Basic [A-Za-z0-9+/=]+$/);
        expect(Buffer.from(calls[0].auth.slice(6), 'base64').toString('utf8')).toMatch(/^test_sk_.+:$/);
        expect(calls[0].idempotencyKey).toBe(`topup-confirm:${order.orderId}`);
        expect(calls[0].body).toEqual({ paymentKey: pk, orderId: order.orderId, amount: 1100 });

        expect(await st.wallet(account.uuid)).toEqual({ gold: 0, diamond: 10 });
        const rows = await topupLedger(account.uuid);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ currency: 'DIAMOND', amount: 10, balance_after: 10 });
        expect(await orderRow(order.orderId)).toMatchObject({ status: 'GRANTED', payment_key: pk });
    });

    test('같은 성공 주소를 두 번 열면 → 두 번째는 토스에 다시 안 묻고 지급됨 답, 다이아·장부 한 번만', async ({ user, context }) => {
        const { page, account } = user;
        const order = await createOrder(context);
        const pk = key('ok');
        await routeEconomy(page);
        await st.gotoStore(page, successUrl(order, pk));
        await expect(feedback(page)).toContainText(DONE);
        const again = confirmResponse(page, order.orderId);
        await st.gotoStore(page, successUrl(order, pk));
        expect(await (await again).json()).toEqual({ ok: true, status: 'GRANTED', balanceDiamond: 10 });
        await expect(feedback(page)).toContainText(DONE);
        expect(confirmCalls(order.orderId)).toHaveLength(1);
        expect((await st.wallet(account.uuid)).diamond).toBe(10);
        expect(await topupLedger(account.uuid)).toHaveLength(1);
    });

    test('토스가 카드 거절로 답하면 → 결제 안 됨 안내, 주문 실패(거절 코드 저장), 다이아·장부 없음', async ({ user, context }) => {
        const { page, account } = user;
        const order = await createOrder(context);
        await routeEconomy(page);
        const confirmed = confirmResponse(page, order.orderId);
        await st.gotoStore(page, successUrl(order, key('reject')));
        const res = await confirmed;
        expect(res.status()).toBe(402);
        expect((await res.json()).code).toBe('PAYMENT_FAILED');
        await expect(feedback(page)).toContainText('결제가 완료되지 않아 충전하지 않았습니다.');
        expect(await orderRow(order.orderId)).toMatchObject({ status: 'FAILED', failure_code: 'REJECT_CARD_PAYMENT' });
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
        expect(await topupLedger(account.uuid)).toHaveLength(0);
    });

    test('토스 승인 응답이 시간 초과되면 → 확인 필요 안내, 자동 확인이 결제 조회로 승인을 찾아 완료·다이아 10 한 번만', async ({ user, context }) => {
        const { page, account } = user;
        const order = await createOrder(context);
        const pk = key('slow');
        await routeEconomy(page);
        const confirmed = confirmResponse(page, order.orderId);
        await st.gotoStore(page, successUrl(order, pk));
        const res = await confirmed;
        expect(res.status()).toBe(503);
        expect((await res.json()).code).toBe('PAYMENT_PROCESSING');
        await expect(feedback(page)).toContainText('결제 결과 확인이 필요합니다.');
        expect((await st.wallet(account.uuid)).diamond).toBe(0);

        await expect(feedback(page)).toContainText(DONE, { timeout: 20_000 });
        expect(fake.calls.some((c) => c.method === 'GET' && c.path === `/v1/payments/${pk}`)).toBe(true);
        await expect(st.balance(page, '다이아', 10)).toBeVisible();
        expect((await st.wallet(account.uuid)).diamond).toBe(10);
        expect(await topupLedger(account.uuid)).toHaveLength(1);
        expect((await orderRow(order.orderId)).status).toBe('GRANTED');
    });
});

test.describe('가짜 토스 주소 지킴', () => {
    test('운영(NODE_ENV=production)에 TOSS_API_BASE_URL이 있으면 → 서버가 시작 거부', async () => {
        test.setTimeout(200_000);
        const r = await servers.startExtraBackend({
            port: 4168, expectExit: true, timeoutMs: 150_000,
            overrides: { SERVER_ID: 'e2e-store-toss-prod', NODE_ENV: 'production', E2E_HOOKS: undefined, MAIL_TEST_OUTBOX_DIR: undefined, TOSS_API_BASE_URL: 'http://127.0.0.1:4167' },
        });
        expect(r.code).toBe(1);
        expect(r.output).toMatch(/TOSS_API_BASE_URL/);
    });
});
