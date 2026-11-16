'use strict';

// 모바일 상점 재화 브라우저 시험: 골드 구매·다이아 부족·충전 성공 복귀(가짜 승인)·카드 거절·다른 주문 확인 중 실패 주소·결제창 닫음·금액 바꿔치기·열린 주문·내역 이름·판매 중지·값 바뀜·설정 대기
// 목록 A12 브라우저 간단 A12-E-094~102·108~110 (쓰는 동안 안 돌림: npx playwright test --list tests/mobile/a12-store-topup.spec.js)
const { test, expect, E2E, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { query } = require('../../helpers/db');
const servers = require('../../helpers/servers');
const { openTossWindow, closeTossWindow } = require('../../helpers/toss');
const { startFakeToss } = require('../store/fakeToss');
const st = require('../store/store-tools');

const M = Object.freeze({
    goldDone: '골드 구매가 완료되었습니다.',
    goldInsufficient: '다이아가 부족합니다. 잔액은 변하지 않았습니다.',
    goldPriceChanged: '상품 정보가 변경되었습니다. 새 조건을 확인한 뒤 다시 구매해 주세요.',
    goldRejected: '골드 구매에 실패했습니다. 재화는 차감되지 않았습니다.',
    done: '충전이 완료되었습니다.',
    canceled: '결제가 취소되었거나 완료되지 않았습니다. 다이아는 충전되지 않았습니다.',
    cardRejected: '카드사에서 결제를 거절했습니다. 카드 정보·한도를 확인해 주세요. 다이아는 충전되지 않았습니다.',
    amountMismatch: '결제 금액이 주문과 달라 충전하지 않았습니다.',
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

// 시험마다 자기 재화 상품을 만들어 씀 (공용 시험 상품 값이 바뀌어도 안 흔들리게), 끝나면 지움
const made = [];
test.afterEach(async () => {
    while (made.length) await query('DELETE FROM economy_currency_products WHERE product_id = ?', [made.pop()]);
});

/** 재화 상품 하나 만들기 (판매 중, 버전 1) → { productId, name, version } */
async function makeProduct(kind, { pay, grant, bonus = 0 }) {
    const tag = st.rand(3);
    const topup = kind === 'DIAMOND_TOPUP';
    const productId = `e2e-a12-${topup ? 'dia' : 'gold'}-${tag.toLowerCase()}`;
    const name = `${topup ? '시험다이아' : '시험금화'} ${tag}`;
    const now = new Date();
    await query(
        'INSERT INTO economy_currency_products (product_id, kind, display_name, pay_currency, pay_amount, grant_currency, grant_amount, bonus_amount, status, sort_order, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [productId, kind, name, topup ? 'KRW' : 'DIAMOND', pay, topup ? 'DIAMOND' : 'GOLD', grant, bonus, 'ON_SALE', 900, 1, now, now],
    );
    made.push(productId);
    return { productId, name, version: 1 };
}

/** 모바일 상점 열기 (입장 영상 건너뛰기 → 위 줄 "쿠폰"이 보일 때까지) */
async function gotoStore(page, path = '/store') {
    await page.goto(path);
    await ui.skipIntro(page);
    await expect(page.getByRole('button', { name: '쿠폰', exact: true })).toBeVisible();
}

/** 상점 → 인게임 재화 → 그 상품 고름 */
async function openCurrency(page, product) {
    await gotoStore(page);
    await st.pickCategory(page, '인게임 재화');
    const slot = page.getByRole('button', { name: new RegExp(`^${product.name}`) });
    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');
}

const detailButton = (page, name) => st.detail(page).getByRole('button', { name, exact: true });
const goldFeedback = (page) => page.getByTestId('gold-feedback');
const feedback = (page) => page.getByTestId('topup-feedback');
const topupRows = async (uuid) => (await st.ledger(uuid)).filter((r) => r.reason === 'DIAMOND_TOPUP');
const orderRow = async (orderId) => (await query('SELECT status FROM economy_topup_orders WHERE order_id = ?', [orderId]))[0];

test('A12-E-094 골드 구매 → 위 골드·다이아 숫자 바뀜 (모바일)', async ({ user }) => {
    const { page, account } = user;
    const product = await makeProduct('GOLD_PURCHASE', { pay: 5, grant: 50 });
    await st.grant(account.uuid, 'DIAMOND', 10);
    await openCurrency(page, product);
    await expect(st.balance(page, '다이아', 10)).toBeVisible();
    await detailButton(page, '골드 구매').click();
    await expect(goldFeedback(page)).toContainText(M.goldDone);
    await expect(st.balance(page, '골드', 50)).toBeVisible();
    await expect(st.balance(page, '다이아', 5)).toBeVisible();
    expect(await st.wallet(account.uuid)).toEqual({ gold: 50, diamond: 5 });
});

test('A12-E-095 다이아 부족 골드 구매 → 부족 글 + "다이아 충전하러 가기"가 읽힘 (모바일)', async ({ user }) => {
    const { page, account } = user;
    const product = await makeProduct('GOLD_PURCHASE', { pay: 5, grant: 50 });
    await st.grant(account.uuid, 'DIAMOND', 4);
    await openCurrency(page, product);
    await detailButton(page, '골드 구매').click();
    await expectReadable(goldFeedback(page).getByText(M.goldInsufficient));
    await expectReadable(goldFeedback(page).getByRole('button', { name: '다이아 충전하러 가기' }));
    expect(await st.wallet(account.uuid)).toEqual({ gold: 0, diamond: 4 });
});

test('A12-E-097 카드 거절 실패 주소(code=REJECT_CARD_COMPANY) → 카드 거절 글이 읽힘 (모바일) @safari', async ({ user }) => {
    const { page, account } = user;
    await gotoStore(page, '/store?topup=fail&code=REJECT_CARD_COMPANY');
    await expectReadable(page.getByText(M.cardRejected, { exact: true }));
    expect((await st.wallet(account.uuid)).diamond).toBe(0);
});

test('A12-E-099 결제창(토스 주소는 가로채 흉내) 열고 닫기 → 취소 글, 바깥 요청 0 (서버에 토스 시험 키가 있어야 돎) (모바일)', async ({ user, context }) => {
    const { page, account } = user;
    const tossHits = await blockToss(context);
    await gotoStore(page);
    await openTossWindow(page, { gotoStore: false });
    await closeTossWindow(page);
    await expectReadable(feedback(page).getByText(M.canceled));
    expect((await st.wallet(account.uuid)).diamond).toBe(0);
    // 결제 꾸러미·결제창 둘 다 가로챘어야 함 (빠지면 진짜 토스로 나간 것)
    expect(tossHits.length).toBeGreaterThanOrEqual(2);
    expect(tossHits.some((u) => u.startsWith(FAKE_TOSS_WINDOW))).toBe(true);
});

test('A12-E-102 재화 내역 이름 → "다이아 충전"·"골드 구매" 줄 (모바일)', async ({ user, context }) => {
    const { page, account } = user;
    // 충전: 승인 끝난(지급 대기) 주문을 주문 조회로 마저 지급 (결제사에 안 물음), 골드 구매: 다이아 5 → 골드 50
    const order = await st.createTopupOrder(account.uuid, { status: 'PENDING_GRANT' });
    const looked = await context.request.get(`${E2E.apiUrl}/economy/topup/orders/${order.orderId}`, { headers: { origin: E2E.desktopUrl } });
    expect((await looked.json()).status).toBe('GRANTED');
    const gold = await makeProduct('GOLD_PURCHASE', { pay: 5, grant: 50 });
    const bought = await context.request.post(`${E2E.apiUrl}/economy/gold-purchases`, {
        data: { productId: gold.productId, version: gold.version, referenceEventId: `e2e-a12:${st.rand(6)}` }, headers: { origin: E2E.desktopUrl },
    });
    expect(bought.status()).toBeLessThan(300);

    await gotoStore(page);
    await st.pickCategory(page, '인게임 재화');
    const lines = page.getByRole('region', { name: '재화 거래 내역' }).getByRole('listitem');
    await expect(lines.filter({ hasText: '다이아 충전' })).toHaveCount(1);
    await expect(lines.filter({ hasText: '골드 구매' })).toHaveCount(2);
});

test('A12-E-108 보는 사이 골드 상품 판매 중지 → 구매 → 실패 글이 읽힘 (모바일)', async ({ user }) => {
    const { page, account } = user;
    const product = await makeProduct('GOLD_PURCHASE', { pay: 5, grant: 50 });
    await st.grant(account.uuid, 'DIAMOND', 10);
    await openCurrency(page, product);
    await query('UPDATE economy_currency_products SET status = ? WHERE product_id = ?', ['STOPPED', product.productId]);
    await detailButton(page, '골드 구매').click();
    await expectReadable(goldFeedback(page).getByText(M.goldRejected));
    expect(await st.wallet(account.uuid)).toEqual({ gold: 0, diamond: 10 });
});

test('A12-E-109 보는 사이 골드 상품 값이 바뀜 → 새 조건 글 → 새 조건 확인 → 새 값(4다이아 → 40골드)으로 됨 (모바일)', async ({ user }) => {
    const { page, account } = user;
    const product = await makeProduct('GOLD_PURCHASE', { pay: 3, grant: 30 });
    await st.grant(account.uuid, 'DIAMOND', 100);
    await openCurrency(page, product);
    await query('UPDATE economy_currency_products SET pay_amount = 4, grant_amount = 40, version = 2 WHERE product_id = ?', [product.productId]);
    await detailButton(page, '골드 구매').click();
    await expectReadable(goldFeedback(page).getByText(M.goldPriceChanged));
    await expect(goldFeedback(page)).toContainText('새 조건: 4 다이아 → 골드 40');
    await goldFeedback(page).getByRole('button', { name: '새 조건 확인' }).click();
    await detailButton(page, '골드 구매').click();
    await expect(goldFeedback(page)).toContainText(M.goldDone);
    expect(await st.wallet(account.uuid)).toEqual({ gold: 40, diamond: 96 });
});

test('A12-E-110 주문 만들기 답을 503 CONFIG_MISSING으로 바꿈 → 단추 "설정 대기" + 설정 대기 글이 읽힘 (모바일)', async ({ user }) => {
    const { page } = user;
    const product = await makeProduct('DIAMOND_TOPUP', { pay: 1100, grant: 10 });
    await page.route(`${E2E.apiUrl}/economy/topup/orders`, (route) => (route.request().method() === 'POST'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'CONFIG_MISSING', message: '결제 설정이 없습니다.' }) })
        : route.fallback()));
    await openCurrency(page, product);
    await detailButton(page, '충전').click();
    await expect(detailButton(page, '설정 대기')).toBeDisabled();
    await expectReadable(page.getByText(M.configPending));
});

test.describe('충전 확인 (가짜 토스 승인 서버, 모바일)', () => {
    // 따로 띄운 백엔드를 시험마다 띄우지 않게 한 작업자에서 차례로
    test.describe.configure({ mode: 'default' });
    let fake = null;
    let api = null;

    test.beforeAll(async ({}, workerInfo) => {
        test.setTimeout(200_000);
        const n = workerInfo.parallelIndex;
        // 따로 띄운 백엔드 4160+작업자, 가짜 토스 4200+작업자 (다른 영역: 4150+ 기본·4170+·4180+ 소셜·4190~ 보안)
        fake = await startFakeToss(4200 + n);
        api = await servers.startExtraBackend({
            port: 4160 + n, defaultIpLimits: false, timeoutMs: 150_000,
            overrides: { SERVER_ID: `e2e-a12-toss-m${n}`, TOSS_API_BASE_URL: fake.url },
        });
    });
    test.afterAll(async () => {
        await api?.stop();
        await fake?.close();
    });

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

    /** 서버 길로 주문 만들기 → { orderId, amount } */
    async function createOrder(context, product) {
        const res = await context.request.post(`${api.url}/economy/topup/orders`, {
            data: { productId: product.productId, version: product.version }, headers: { origin: E2E.desktopUrl },
        });
        expect(res.status()).toBe(201);
        const body = await res.json();
        return { orderId: body.orderId, amount: body.amount };
    }

    const key = () => `pk_ok_${st.rand(6).toLowerCase()}`;
    const successUrl = (order, amount = order.amount) => `/store?topup=success&orderId=${order.orderId}&paymentKey=${key()}&amount=${amount}`;

    test('A12-E-096 가짜 승인 성공 주소로 돌아옴 → 완료 글이 읽힘, 다이아 10 (모바일) @smoke @safari', async ({ user, context }) => {
        const { page, account } = user;
        const product = await makeProduct('DIAMOND_TOPUP', { pay: 1100, grant: 10 });
        const order = await createOrder(context, product);
        await routeEconomy(page);
        await gotoStore(page, successUrl(order));
        await expectReadable(feedback(page).getByText(M.done));
        await expect(st.balance(page, '다이아', 10)).toBeVisible();
        expect((await st.wallet(account.uuid)).diamond).toBe(10);
        expect(await topupRows(account.uuid)).toHaveLength(1);
    });

    test('A12-E-098 [버그 2] 지급 대기 주문이 있는 계정이 실패 주소로 들어옴 → 그 주문이 끝난 뒤에도 카드 거절 안내가 읽힘 (모바일)', async ({ user }) => {
        const { page, account } = user;
        const pending = await st.createTopupOrder(account.uuid, { status: 'PENDING_GRANT' });
        await routeEconomy(page);
        await gotoStore(page, '/store?topup=fail&code=REJECT_CARD_COMPANY');
        await expect.poll(async () => (await orderRow(pending.orderId)).status, { timeout: 20_000 }).toBe('GRANTED');
        await expect(page.getByText(M.done).first()).toBeVisible();
        await expectReadable(page.getByText(M.cardRejected, { exact: true }));
    });

    test('A12-E-100 성공 주소 amount 바꿔치기(+1) → 금액 다름 글이 읽힘, 다이아 그대로 (모바일)', async ({ user, context }) => {
        const { page, account } = user;
        const product = await makeProduct('DIAMOND_TOPUP', { pay: 1100, grant: 10 });
        const order = await createOrder(context, product);
        await routeEconomy(page);
        await gotoStore(page, successUrl(order, order.amount + 1));
        await expectReadable(feedback(page).getByText(M.amountMismatch));
        expect((await st.wallet(account.uuid)).diamond).toBe(0);
        expect((await orderRow(order.orderId)).status).toBe('CREATED');
    });

    test('A12-E-101 지급 대기 주문이 있는 계정이 상점 들어옴 → 다이아 늘어남 (모바일)', async ({ user }) => {
        const { page, account } = user;
        const order = await st.createTopupOrder(account.uuid, { status: 'PENDING_GRANT' });
        const [row] = await query('SELECT grant_amount, bonus_amount FROM economy_topup_orders WHERE order_id = ?', [order.orderId]);
        const grant = Number(row.grant_amount) + Number(row.bonus_amount);
        await routeEconomy(page);
        await gotoStore(page);
        await expect(feedback(page)).toContainText(M.done);
        await expect(st.balance(page, '다이아', grant)).toBeVisible();
        expect((await st.wallet(account.uuid)).diamond).toBe(grant);
    });
});
