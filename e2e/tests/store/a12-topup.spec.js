'use strict';

// 다이아 충전 브라우저 시험 (PC): 토스 시험 결제창 열고 닫기·성공 복귀(가짜 승인)·거절·느린 승인·실패 주소 까닭·주소 바꿔치기·설정 대기·열린 주문·환불·주문 값
// 목록 A12 브라우저 간단 A12-E-035~052 (쓰는 동안 안 돌림: npx playwright test --list tests/store/a12-topup.spec.js)
const { test, expect, E2E } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { query } = require('../../helpers/db');
const servers = require('../../helpers/servers');
const { openTossWindow, closeTossWindow } = require('../../helpers/toss');
const { startFakeToss } = require('./fakeToss');
const st = require('./store-tools');

// 화면 글 (화면 쪽 currencyMessages.js)
const M = Object.freeze({
    done: '충전이 완료되었습니다.',
    unknown: '결제 결과 확인이 필요합니다. 확인 전까지 다이아는 지급된 것으로 보지 않습니다.',
    canceled: '결제가 취소되었거나 완료되지 않았습니다. 다이아는 충전되지 않았습니다.',
    paymentFailed: '결제가 완료되지 않아 충전하지 않았습니다.',
    amountMismatch: '결제 금액이 주문과 달라 충전하지 않았습니다.',
    notOwner: '다른 계정의 주문이라 충전하지 않았습니다.',
    invalidReturn: '결제 복귀 정보가 올바르지 않아 확인하지 않았습니다.',
    refunded: '환불된 주문입니다. 이 주문의 다이아는 지급되지 않거나 회수되었습니다.',
    cardRejected: '카드사에서 결제를 거절했습니다. 카드 정보·한도를 확인해 주세요. 다이아는 충전되지 않았습니다.',
    aborted: '결제 진행 중 문제가 생겨 결제가 끝나지 않았습니다. 다이아는 충전되지 않았습니다.',
    tossOther: '결제사에서 결제를 끝내지 못했습니다. 다이아는 충전되지 않았습니다.',
    configPending: '결제 설정이 아직 준비되지 않았습니다(설정 대기). 상품 목록을 새로고침한 뒤 다시 시도해 주세요.',
});

// 토스 시험 결제창도 바깥(tosspayments.com·toss.im)으로 안 나가게 전부 가로챔 (사용자 규칙: 진짜 결제·바깥 서버 요청 금지)
// 결제 꾸러미 자리엔 "창 열림·닫힘"만 흉내 내는 작은 스크립트, 결제창 자리엔 제목·닫기 단추만 있는 작은 화면
const FAKE_TOSS_WINDOW = 'https://e2e-fake.tosspayments.com/payment-window';
const FAKE_TOSS_SDK = `window.TossPayments = function () {
  return { payment: function () { return { requestPayment: function () {
    return new Promise(function (resolve, reject) {
      var f = document.createElement('iframe');
      f.src = '${FAKE_TOSS_WINDOW}';
      f.title = '결제창 (시험 흉내)';
      f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647;background:#fff';
      function onMessage(e) {
        if (!e.data || e.data.e2eFakeToss !== 'close') return;
        window.removeEventListener('message', onMessage);
        f.remove();
        var error = new Error('결제 취소'); error.code = 'USER_CANCEL'; reject(error);
      }
      window.addEventListener('message', onMessage);
      document.body.appendChild(f);
    });
  } }; } };
};`;
const FAKE_TOSS_PAGE = '<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body style="background:#fff;color:#111;font:16px sans-serif">'
    + '<h1>결제 방법 선택 (시험 흉내)</h1><button type="button" onclick="parent.postMessage({ e2eFakeToss: \'close\' }, \'*\')">닫기</button></body></html>';
const isTossHost = (url) => /(^|\.)(tosspayments\.com|toss\.im)$/.test(url.hostname);

/** 이 브라우저의 토스 주소 요청을 전부 가로채 가짜로 답함 → 가로챈 주소 목록 (0이면 가로채기가 빠진 것) */
async function blockToss(context) {
    const hits = [];
    await context.route(isTossHost, (route) => {
        const url = route.request().url();
        hits.push(url);
        if (url.startsWith(FAKE_TOSS_WINDOW)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FAKE_TOSS_PAGE });
        if (route.request().resourceType() === 'script') return route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: FAKE_TOSS_SDK });
        return route.fulfill({ status: 204, body: '' });
    });
    return hits;
}

// 따로 띄운 백엔드 4160+작업자, 가짜 토스 4200+작업자 (다른 영역: 4150+ 기본·4170+·4180+ 소셜·4190~ 보안)
let fake = null;
let api = null;

// 시험마다 자기 충전 상품을 만들어 씀 (공용 시험 상품 값이 바뀌어도 안 흔들리게), 끝나면 지움
const made = [];

/** 충전 상품 하나 만들기 → { productId, name, pay, grant } */
async function makeTopupProduct({ pay = 1100, grant = 10, bonus = 0 } = {}) {
    const tag = st.rand(3);
    const productId = `e2e-a12-dia-${tag.toLowerCase()}`;
    const name = `시험다이아 ${tag}`;
    const now = new Date();
    await query(
        'INSERT INTO economy_currency_products (product_id, kind, display_name, pay_currency, pay_amount, grant_currency, grant_amount, bonus_amount, status, sort_order, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [productId, 'DIAMOND_TOPUP', name, 'KRW', pay, 'DIAMOND', grant, bonus, 'ON_SALE', 900, 1, now, now],
    );
    made.push(productId);
    return { productId, name, pay, grant };
}

/** 따로 띄운 백엔드로 바로 보내기 (로그인 쿠키 실어) → { status, body } */
async function callApi(context, method, path, data) {
    const res = await context.request.fetch(`${api.url}${path}`, { method, data, headers: { origin: E2E.desktopUrl } });
    return { status: res.status(), body: await res.json().catch(() => null) };
}

/** 서버 길로 주문 만들기 (상품 목록의 지금 버전으로) → { orderId, amount } */
async function createOrder(context, productId) {
    const list = await callApi(context, 'GET', '/economy/currency-products');
    const product = list.body.products.find((p) => p.productId === productId);
    expect(product, `상품 목록에 ${productId} 없음`).toBeTruthy();
    const created = await callApi(context, 'POST', '/economy/topup/orders', { productId, version: product.version });
    expect(created.status).toBe(201);
    return { orderId: created.body.orderId, amount: created.body.amount };
}

// 따로 띄운 백엔드는 토스 주소가 가짜 승인 서버라 진짜 토스 승인 요청이 안 나감

/** 화면의 /economy 요청을 따로 띄운 백엔드로 돌림 (로그인·소켓은 본 서버, 같은 시험 DB) */
async function routeEconomy(page) {
    await page.route((url) => url.href.startsWith(`${E2E.apiUrl}/economy/`), async (route) => {
        try {
            const response = await route.fetch({ url: route.request().url().replace(E2E.apiUrl, api.url) });
            await route.fulfill({ response });
        } catch {
            await route.abort('failed').catch(() => {});
        }
    });
}

const key = (kind) => `pk_${kind}_${st.rand(6).toLowerCase()}`;
const successUrl = (order, paymentKey, amount = order.amount) => `/store?topup=success&orderId=${order.orderId}&paymentKey=${paymentKey}&amount=${amount}`;
const failUrl = (code, extra = '') => `/store?topup=fail&code=${code}${extra}`;
const feedback = (page) => page.getByTestId('topup-feedback');
const topupRows = async (uuid) => (await st.ledger(uuid)).filter((r) => r.reason === 'DIAMOND_TOPUP');
const orderRow = async (orderId) => (await query('SELECT status, payment_key FROM economy_topup_orders WHERE order_id = ?', [orderId]))[0];

/** 결제 확인 요청(POST …/confirm)만 세기 */
function countConfirms(page) {
    const sent = [];
    page.on('request', (r) => { if (r.method() === 'POST' && /\/economy\/topup\/orders\/[^/]+\/confirm$/.test(r.url())) sent.push(r.url()); });
    return sent;
}

test.describe('다이아 충전 (가짜 토스 승인 서버)', () => {
    // 따로 띄운 백엔드를 시험마다 띄우지 않게 한 작업자에서 차례로
    test.describe.configure({ mode: 'default' });

    test.beforeAll(async ({}, workerInfo) => {
        test.setTimeout(200_000);
        const n = workerInfo.parallelIndex;
        fake = await startFakeToss(4200 + n);
        api = await servers.startExtraBackend({
            port: 4160 + n, defaultIpLimits: false, timeoutMs: 150_000,
            overrides: { SERVER_ID: `e2e-a12-toss-${n}`, TOSS_API_BASE_URL: fake.url },
        });
    });
    test.afterAll(async () => {
        await api?.stop();
        await fake?.close();
    });
    test.afterEach(async () => {
        while (made.length) await query('DELETE FROM economy_currency_products WHERE product_id = ?', [made.pop()]);
    });

    test('A12-E-035 충전 → 결제창(토스 주소는 가로채 흉내)이 뜸 → 닫기 → 취소 글이 읽힘, 다이아 그대로, 바깥 요청 0 (서버에 토스 시험 키가 있어야 돎)', async ({ user, context }) => {
        const { page, account } = user;
        const tossHits = await blockToss(context);
        await routeEconomy(page);
        await st.gotoStore(page);
        await openTossWindow(page, { gotoStore: false });
        await closeTossWindow(page);
        await expectReadable(feedback(page).getByText(M.canceled));
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
        expect(await topupRows(account.uuid)).toHaveLength(0);
        // 결제 꾸러미·결제창 둘 다 가로챘어야 함 (빠지면 진짜 토스로 나간 것)
        expect(tossHits.length).toBeGreaterThanOrEqual(2);
        expect(tossHits.some((u) => u.startsWith(FAKE_TOSS_WINDOW))).toBe(true);
    });

    test('A12-E-036 가짜 승인(pk_ok_) 성공 주소로 돌아옴 → "충전이 완료되었습니다."가 읽힘, 다이아 10, 장부 1줄 @smoke', async ({ user, context }) => {
        const { page, account } = user;
        const product = await makeTopupProduct();
        const order = await createOrder(context, product.productId);
        await routeEconomy(page);
        await st.gotoStore(page, successUrl(order, key('ok')));
        await expectReadable(feedback(page).getByText(M.done));
        await expect(st.balance(page, '다이아', 10)).toBeVisible();
        expect((await st.wallet(account.uuid)).diamond).toBe(10);
        const rows = await topupRows(account.uuid);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ currency: 'DIAMOND', amount: 10 });
    });

    test('A12-E-037 성공 주소에서 새로고침 → 다이아 그대로 10, 장부 1줄', async ({ user, context }) => {
        const { page, account } = user;
        const product = await makeTopupProduct();
        const order = await createOrder(context, product.productId);
        await routeEconomy(page);
        await st.gotoStore(page, successUrl(order, key('ok')));
        await expect(feedback(page)).toContainText(M.done);
        await page.reload();
        await expect(feedback(page)).toContainText(M.done);
        await expect(st.balance(page, '다이아', 10)).toBeVisible();
        expect((await st.wallet(account.uuid)).diamond).toBe(10);
        expect(await topupRows(account.uuid)).toHaveLength(1);
    });

    test('A12-E-038 카드 거절(pk_reject_, 확인 단계) → 실패 글이 읽힘, 다이아 그대로', async ({ user, context }) => {
        const { page, account } = user;
        const product = await makeTopupProduct();
        const order = await createOrder(context, product.productId);
        await routeEconomy(page);
        await st.gotoStore(page, successUrl(order, key('reject')));
        await expectReadable(feedback(page).getByText(M.paymentFailed));
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
        expect(await topupRows(account.uuid)).toHaveLength(0);
    });

    test('A12-E-039 결제사 답이 느림(pk_slow_, 서버 10초 한도 넘김) → 결과 확인 안내 → 결과 확인 → 완료, 장부 1줄 @realtime', async ({ user, context }) => {
        // 가짜 승인이 13초 뒤 답하고, 서버가 결과를 다시 물어 끝낼 때까지 진짜로 기다림
        test.setTimeout(180_000);
        const { page, account } = user;
        const product = await makeTopupProduct();
        const order = await createOrder(context, product.productId);
        await routeEconomy(page);
        await st.gotoStore(page, successUrl(order, key('slow')));
        await expect(feedback(page)).toContainText(M.unknown, { timeout: 30_000 });
        await expectReadable(feedback(page).getByText(M.unknown));
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
        // 결과 확인 단추가 보이면 누름 → 서버가 결제사에 다시 물어 지급하면 완료
        await expect(async () => {
            const check = feedback(page).getByRole('button', { name: '결과 확인' });
            if (await check.isVisible()) await check.click();
            await expect(feedback(page)).toContainText(M.done, { timeout: 3000 });
        }).toPass({ timeout: 90_000, intervals: [2000, 5000] });
        expect((await st.wallet(account.uuid)).diamond).toBe(10);
        expect(await topupRows(account.uuid)).toHaveLength(1);
    });

    const FAIL_CODES = [
        ['A12-E-040', 'PAY_PROCESS_CANCELED', M.canceled, null],
        ['A12-E-041', 'REJECT_CARD_COMPANY', M.cardRejected, null],
        ['A12-E-042', 'PAY_PROCESS_ABORTED', M.aborted, null],
        ['A12-E-043', 'E2E_UNLISTED_CODE', M.tossOther, '결제사 실패 코드: E2E_UNLISTED_CODE'],
    ];
    for (const [id, code, text, note] of FAIL_CODES) {
        test(`${id} [버그 2] 실패 주소 code=${code} → 그 까닭 글이 읽힘${note ? ' + 코드 줄' : ''}, 결제 확인 요청 0`, async ({ user }) => {
            const { page, account } = user;
            await routeEconomy(page);
            const confirms = countConfirms(page);
            await st.gotoStore(page, failUrl(code));
            await expectReadable(page.getByText(text, { exact: true }));
            if (note) await expectReadable(page.getByText(note, { exact: true }));
            expect(confirms).toHaveLength(0);
            expect((await st.wallet(account.uuid)).diamond).toBe(0);
        });
    }

    test('A12-E-044 [버그 2] 지급 대기 주문(DB)이 있는 계정이 실패 주소로 들어옴 → 그 주문이 끝난 뒤에도 카드 거절 안내가 읽힘', async ({ user }) => {
        const { page, account } = user;
        const pending = await st.createTopupOrder(account.uuid, { status: 'PENDING_GRANT' });
        await routeEconomy(page);
        await st.gotoStore(page, failUrl('REJECT_CARD_COMPANY'));
        // 다른 주문은 찾기로 마저 지급됨 → 그래도 이번 실패 까닭은 남아 보여야 함
        await expect.poll(async () => (await orderRow(pending.orderId)).status, { timeout: 20_000 }).toBe('GRANTED');
        await expect(page.getByText(M.done).first()).toBeVisible();
        await expectReadable(page.getByText(M.cardRejected, { exact: true }));
    });

    test('A12-E-045 [지금 동작] 실패 주소에 결제사 글(message=가짜 안내)을 붙여 옴 → 그 글은 화면에 없음', async ({ user }) => {
        const { page } = user;
        await routeEconomy(page);
        await st.gotoStore(page, failUrl('PAY_PROCESS_CANCELED', `&message=${encodeURIComponent('가짜 안내')}`));
        await expect(page.getByText(M.canceled, { exact: true })).toBeVisible();
        await expect(page.getByText('가짜 안내')).toHaveCount(0);
    });

    test('A12-E-046 성공 주소 amount를 주문+1로 바꿔치기 → "결제 금액이 주문과 달라 충전하지 않았습니다."가 읽힘, 다이아 그대로', async ({ user, context }) => {
        const { page, account } = user;
        const product = await makeTopupProduct();
        const order = await createOrder(context, product.productId);
        await routeEconomy(page);
        await st.gotoStore(page, successUrl(order, key('ok'), order.amount + 1));
        await expectReadable(feedback(page).getByText(M.amountMismatch));
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
        expect((await orderRow(order.orderId)).status).toBe('CREATED');
        expect(await topupRows(account.uuid)).toHaveLength(0);
    });

    test('A12-E-047 다른 계정의 주문 id로 성공 주소 → "다른 계정의 주문이라 충전하지 않았습니다."가 읽힘, 그 주문 그대로', async ({ user, accounts }) => {
        const { page, account } = user;
        const other = await accounts.create();
        const order = await st.createTopupOrder(other.uuid, { paymentKey: null });
        await routeEconomy(page);
        await st.gotoStore(page, successUrl(order, key('ok')));
        await expectReadable(feedback(page).getByText(M.notOwner));
        expect(await orderRow(order.orderId)).toMatchObject({ status: 'CREATED', payment_key: null });
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
        expect((await st.wallet(other.uuid)).diamond).toBe(0);
    });

    test('A12-E-048 깨진 성공 주소(paymentKey 없음) → "결제 복귀 정보가 올바르지 않아 확인하지 않았습니다."가 읽힘, 확인 요청 0', async ({ user, context }) => {
        const { page } = user;
        const product = await makeTopupProduct();
        const order = await createOrder(context, product.productId);
        await routeEconomy(page);
        const confirms = countConfirms(page);
        await st.gotoStore(page, `/store?topup=success&orderId=${order.orderId}&amount=${order.amount}`);
        await expectReadable(feedback(page).getByText(M.invalidReturn));
        expect(confirms).toHaveLength(0);
        expect((await orderRow(order.orderId)).status).toBe('CREATED');
    });

    test('A12-E-049 주문 만들기 답을 503 CONFIG_MISSING으로 바꿈 → 단추 "설정 대기" + 설정 대기 글이 읽힘', async ({ user }) => {
        const { page } = user;
        const product = await makeTopupProduct();
        await routeEconomy(page);
        // 나중에 건 길이 먼저 잡음 → 주문 만들기만 설정 없음 답으로
        await page.route(`${E2E.apiUrl}/economy/topup/orders`, (route) => (route.request().method() === 'POST'
            ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'CONFIG_MISSING', message: '결제 설정이 없습니다.' }) })
            : route.fallback()));
        await st.gotoStore(page);
        await st.pickCategory(page, '인게임 재화');
        await page.getByRole('button', { name: new RegExp(`^${product.name}`) }).click();
        await st.detail(page).getByRole('button', { name: '충전', exact: true }).click();
        await expect(st.detail(page).getByRole('button', { name: '설정 대기', exact: true })).toBeDisabled();
        await expectReadable(page.getByText(M.configPending));
    });

    test('A12-E-050 지급 대기(PENDING_GRANT) 주문이 있는 계정이 상점 들어옴 → 다이아 늘어남, "충전이 완료되었습니다."', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid, { status: 'PENDING_GRANT' });
        await routeEconomy(page);
        await st.gotoStore(page);
        const grant = await orderGrant(order.orderId);
        await expectReadable(feedback(page).getByText(M.done));
        await expect(st.balance(page, '다이아', grant)).toBeVisible();
        expect((await st.wallet(account.uuid)).diamond).toBe(grant);
        expect((await orderRow(order.orderId)).status).toBe('GRANTED');
        expect(await topupRows(account.uuid)).toHaveLength(1);
    });

    test('A12-E-051 환불된(REFUNDED) 주문의 성공 주소 → 환불 글이 읽힘, 다이아 그대로', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid, { status: 'REFUNDED' });
        await routeEconomy(page);
        await st.gotoStore(page, successUrl(order, order.paymentKey));
        await expectReadable(feedback(page).getByText(M.refunded));
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
        expect(await topupRows(account.uuid)).toHaveLength(0);
    });

    test('A12-E-052 주문 뒤 DB에서 상품 값을 바꿈 → 성공 주소 → 주문 때 값(2,200원 → 20다이아)으로 지급', async ({ user, context }) => {
        const { page, account } = user;
        const product = await makeTopupProduct({ pay: 2200, grant: 20 });
        const order = await createOrder(context, product.productId);
        expect(order.amount).toBe(2200);
        await query('UPDATE economy_currency_products SET pay_amount = 3300, grant_amount = 30, version = version + 1 WHERE product_id = ?', [product.productId]);
        await routeEconomy(page);
        await st.gotoStore(page, successUrl(order, key('ok')));
        await expect(feedback(page)).toContainText(M.done);
        expect((await st.wallet(account.uuid)).diamond).toBe(20);
        const rows = await topupRows(account.uuid);
        expect(rows).toHaveLength(1);
        expect(rows[0].amount).toBe(20);
    });
});

/** 주문 줄의 지급 다이아 (지급 + 덤) */
async function orderGrant(orderId) {
    const [row] = await query('SELECT grant_amount, bonus_amount FROM economy_topup_orders WHERE order_id = ?', [orderId]);
    return Number(row.grant_amount) + Number(row.bonus_amount);
}
