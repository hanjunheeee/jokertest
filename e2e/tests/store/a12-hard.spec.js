'use strict';

// 상점 어려운 브라우저 시험: 같은 계정 두 창 동시 구매·남은 1번 쿠폰 동시·충전 확인 중 창 닫기·성공 주소 두 창·30초 끊김·다른 탭 로그아웃·골드 구매 동시·처음부터 끝까지·PC에서 사고 모바일에서 봄
// 목록 A12 브라우저 어려움 A12-H-001~010 (쓰는 동안 안 돌림: npx playwright test --list tests/store/a12-hard.spec.js)
const { test, expect, E2E, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { query } = require('../../helpers/db');
const servers = require('../../helpers/servers');
const { startFakeToss } = require('./fakeToss');
const st = require('./store-tools');

const M = Object.freeze({
    done: '구매가 완료되었습니다.',
    owned: '이미 보유한 상품입니다.',
    insufficient: '잔액이 부족합니다.',
    network: '인터넷 연결이 끊겨 구매 결과를 확인하지 못했습니다. 연결을 확인한 뒤 결과 확인을 눌러 주세요.',
    goldDone: '골드 구매가 완료되었습니다.',
    goldInsufficient: '다이아가 부족합니다. 잔액은 변하지 않았습니다.',
    topupDone: '충전이 완료되었습니다.',
    topupUnknown: '결제 결과 확인이 필요합니다. 확인 전까지 다이아는 지급된 것으로 보지 않습니다.',
    couponOk: '골드 300개를 받았습니다.',
    couponExhausted: '모두 사용된 쿠폰입니다.',
});
const SKIN = Object.freeze({ slot: '귀족 블러드 500', id: 'player-skin-귀족1-블러드', name: '귀족-블러드' });
const SKIN2 = Object.freeze({ slot: '귀족 로코코 500', id: 'player-skin-귀족2-로코코' });
const BULK_URL = `${E2E.apiUrl}/economy/purchases/bulk`;
const COUPON_URL = `${E2E.apiUrl}/economy/coupons/redeem`;

const buyButton = (page, name = '구매') => st.detail(page).getByRole('button', { name, exact: true });
const blockReason = (page) => st.detail(page).getByTestId('purchase-block-reason');
const purchaseRows = async (uuid) => (await st.ledger(uuid)).filter((r) => r.reason === 'PURCHASE');
const topupRows = async (uuid) => (await st.ledger(uuid)).filter((r) => r.reason === 'DIAMOND_TOPUP');
const feedback = (page) => page.getByTestId('topup-feedback');

// 시험마다 자기 재화 상품을 만들어 씀, 끝나면 지움
const made = [];
test.afterEach(async () => {
    while (made.length) await query('DELETE FROM economy_currency_products WHERE product_id = ?', [made.pop()]);
});

/** 재화 상품 하나 만들기 (판매 중, 버전 1) → { productId, name, version } */
async function makeProduct(kind, { pay, grant }) {
    const tag = st.rand(3);
    const topup = kind === 'DIAMOND_TOPUP';
    const productId = `e2e-a12-${topup ? 'dia' : 'gold'}-${tag.toLowerCase()}`;
    const name = `${topup ? '시험다이아' : '시험금화'} ${tag}`;
    const now = new Date();
    await query(
        'INSERT INTO economy_currency_products (product_id, kind, display_name, pay_currency, pay_amount, grant_currency, grant_amount, bonus_amount, status, sort_order, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [productId, kind, name, topup ? 'KRW' : 'DIAMOND', pay, topup ? 'DIAMOND' : 'GOLD', grant, 0, 'ON_SALE', 900, 1, now, now],
    );
    made.push(productId);
    return { productId, name, version: 1 };
}

/** 지갑 = 장부 합 (골드·다이아 각각) */
async function expectWalletMatchesLedger(uuid) {
    const sums = await query('SELECT currency, COALESCE(SUM(amount), 0) AS total FROM economy_ledger_entries WHERE user_id = ? GROUP BY currency', [uuid]);
    const sumOf = (c) => Number(sums.find((r) => r.currency === c)?.total ?? 0);
    const w = await st.wallet(uuid);
    expect(Number(w.gold)).toBe(sumOf('GOLD'));
    expect(Number(w.diamond)).toBe(sumOf('DIAMOND'));
}

/** 상점 열고 분류·칸 고름 */
async function openItem(page, category, slot) {
    await st.gotoStore(page);
    await st.pickCategory(page, category);
    await st.pickItem(page, slot);
}

/** 상점 → 인게임 재화 → 그 상품 고름 */
async function openCurrency(page, product) {
    await st.gotoStore(page);
    await st.pickCategory(page, '인게임 재화');
    const slot = page.getByRole('button', { name: new RegExp(`^${product.name}`) });
    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');
}

/** 이 화면에 끝 글(둘 중 하나)이 뜰 때까지 → 뜬 글 */
async function outcomeOf(page, scope, texts) {
    let seen = null;
    await expect.poll(async () => {
        for (const text of texts) {
            if (await scope.getByText(text, { exact: true }).first().isVisible().catch(() => false)) { seen = text; return text; }
        }
        return null;
    }, { timeout: 20_000 }).not.toBeNull();
    return seen;
}

// 같은 계정 두 창 = 같은 브라우저(같은 로그인)의 탭 둘 → { page }
// 한 사람 한 세션이라 다른 브라우저로 또 로그인하면 옛 브라우저가 로그아웃됨 (backend/services/auth/account/session.js)
// 옛 탭에 뜨는 "다른 창에서 접속" 알림(브라우저 대화상자)은 Playwright가 바로 닫음, 구매 요청은 그대로 됨
const secondTab = async (context) => ({ page: await context.newPage() });

/** 쿠폰은 같은 ip 10분 30번 제한 → 이 화면의 쿠폰 요청만 다른 ip로 (서버는 프록시 1단 뒤 주소를 믿음) */
async function spreadCouponIp(page) {
    const n = () => 1 + Math.floor(Math.random() * 250);
    const ip = `10.${n()}.${n()}.${n()}`;
    await page.route(COUPON_URL, (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }));
}

test('A12-H-001 같은 계정 두 창(같은 브라우저 탭 둘)이 같은 스킨을 동시에 삼 → 장부 1줄, 한 창 "보유중"·다른 창 "이미 보유한 상품입니다."가 단추 아래 읽힘 @hard @smoke', async ({ user }) => {
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    const second = await secondTab(context);
    await openItem(page, '스킨', SKIN.slot);
    await openItem(second.page, '스킨', SKIN.slot);
    await Promise.all([buyButton(page).click(), buyButton(second.page).click()]);

    const results = await Promise.all([page, second.page].map((p) => outcomeOf(p, st.detail(p), [M.done, M.owned])));
    expect([...results].sort()).toEqual([M.done, M.owned].sort());
    const winner = results[0] === M.done ? page : second.page;
    const loser = results[0] === M.done ? second.page : page;
    await expect(buyButton(winner, '보유중')).toBeDisabled();
    await expectReadable(st.detail(loser).getByText(M.owned));
    expect(await purchaseRows(account.uuid)).toHaveLength(1);
    expect((await st.wallet(account.uuid)).gold).toBe(500);
});

test('A12-H-002 같은 계정 두 창이 다른 스킨을 동시에, 잔액은 하나 값(500)만 → 하나만 됨, 다른 창 잔액 부족 글, 골드 0, 지갑 = 장부 합 @hard', async ({ user }) => {
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 500);
    const second = await secondTab(context);
    await openItem(page, '스킨', SKIN.slot);
    await openItem(second.page, '스킨', SKIN2.slot);
    await Promise.all([buyButton(page).click(), buyButton(second.page).click()]);

    const results = await Promise.all([page, second.page].map((p) => outcomeOf(p, st.detail(p), [M.done, M.insufficient])));
    expect([...results].sort()).toEqual([M.done, M.insufficient].sort());
    const loser = results[0] === M.done ? second.page : page;
    await expectReadable(st.detail(loser).getByText(M.insufficient, { exact: true }).first());
    expect(await purchaseRows(account.uuid)).toHaveLength(1);
    expect((await st.wallet(account.uuid)).gold).toBe(0);
    await expectWalletMatchesLedger(account.uuid);
});

test('A12-H-003 남은 1번 쿠폰을 두 계정이 동시에 → 한 계정만 받음, 다른 계정 "모두 사용된 쿠폰입니다." @hard', async ({ players }) => {
    const code = await st.createCoupon({ amount: 300, maxUses: 1 });
    const a = await players.add();
    const b = await players.add();
    const dialogs = [];
    for (const p of [a, b]) {
        await spreadCouponIp(p.page);
        await st.gotoStore(p.page);
        await p.page.getByRole('button', { name: '쿠폰 입력' }).click();
        const dialog = p.page.getByRole('dialog', { name: '쿠폰 입력' });
        await dialog.getByRole('textbox', { name: '쿠폰 코드' }).fill(code);
        dialogs.push(dialog);
    }
    await Promise.all(dialogs.map((d) => d.getByRole('button', { name: '사용하기' }).click()));

    const results = await Promise.all([a, b].map((p, i) => outcomeOf(p.page, dialogs[i], [M.couponOk, M.couponExhausted])));
    expect([...results].sort()).toEqual([M.couponOk, M.couponExhausted].sort());
    const loser = results[0] === M.couponOk ? 1 : 0;
    await expectReadable(dialogs[loser].getByRole('alert'));
    expect(await st.couponUsedCount(code)).toBe(1);
    const golds = await Promise.all([a, b].map(async (p) => (await st.wallet(p.account.uuid)).gold));
    expect([...golds].sort((x, y) => x - y)).toEqual([0, 300]);
});

test('A12-H-006 구매 보내자마자 인터넷 30초 끊김 → 다시 연결 → 결과 확인 → 장부 1줄, 골드 한 번만 @hard @realtime', async ({ user }) => {
    // 끊긴 30초는 진짜로 기다림
    test.setTimeout(180_000);
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    await openItem(page, '스킨', SKIN.slot);
    // 요청은 서버에 닿고 그 순간 오프라인 → 답을 못 받음
    await page.route(BULK_URL, async (route) => {
        await route.fetch();
        await context.setOffline(true);
        await route.abort('internetdisconnected');
    });
    await buyButton(page).click();
    await expectReadable(st.detail(page).getByText(M.network));
    await page.waitForTimeout(30_000);
    await context.setOffline(false);
    await page.unroute(BULK_URL);
    await st.detail(page).getByRole('button', { name: '결과 확인' }).click();
    await expect(st.detail(page).getByText(M.done)).toBeVisible();
    await expect(buyButton(page, '보유중')).toBeDisabled();
    expect(await purchaseRows(account.uuid)).toHaveLength(1);
    expect((await st.wallet(account.uuid)).gold).toBe(500);
});

test('A12-H-007 탭 1이 구매를 보낸 사이 탭 2에서 로그아웃 → 다시 로그인 → 상점에서 결과 확인 → 장부 1줄, 안내 보임 @hard', async ({ user }) => {
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 500);
    await openItem(page, '스킨', SKIN.slot);

    // 탭 1 구매: 서버는 처리하고, 탭 2 로그아웃이 끝난 뒤에 답이 도착하게 붙잡음
    let processed;
    const serverDone = new Promise((resolve) => { processed = resolve; });
    let release;
    const loggedOut = new Promise((resolve) => { release = resolve; });
    await page.route(BULK_URL, async (route) => {
        const response = await route.fetch();
        processed();
        await loggedOut;
        await route.fulfill({ response }).catch(() => {});
    });
    await buyButton(page).click();
    await serverDone;

    const other = await context.newPage();
    await ui.gotoLobby(other);
    await other.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '종료' }).click();
    await expect(other).toHaveURL(/\/login/);
    release();

    // 탭 1: 답은 받았지만 다음 요청(잔액 다시 받기)이 로그인 풀림 → 로그인 화면 → 다시 로그인 → 상점
    await expect(page).toHaveURL(/\/login/);
    await ui.loginViaUi(page, account);
    await st.gotoStore(page);
    await expectReadable(st.detail(page).getByText(M.done));
    await st.pickItem(page, SKIN.slot);
    await expect(buyButton(page, '보유중')).toBeDisabled();
    expect(await purchaseRows(account.uuid)).toHaveLength(1);
    expect((await st.wallet(account.uuid)).gold).toBe(0);
});

test('A12-H-008 골드 구매를 두 창에서 동시에, 다이아는 한 번 값(5)만 → 하나만 됨, 다른 창 다이아 부족 글 + 충전하러 가기 @hard', async ({ user }) => {
    const { page, account, context } = user;
    const product = await makeProduct('GOLD_PURCHASE', { pay: 5, grant: 50 });
    await st.grant(account.uuid, 'DIAMOND', 5);
    const second = await secondTab(context);
    await openCurrency(page, product);
    await openCurrency(second.page, product);
    await Promise.all([page, second.page].map((p) => buyButton(p, '골드 구매').click()));

    const results = await Promise.all([page, second.page].map((p) => outcomeOf(p, p.getByTestId('gold-feedback'), [M.goldDone, M.goldInsufficient])));
    expect([...results].sort()).toEqual([M.goldDone, M.goldInsufficient].sort());
    const loser = results[0] === M.goldDone ? second.page : page;
    await expectReadable(loser.getByTestId('gold-feedback').getByText(M.goldInsufficient));
    await expectReadable(loser.getByTestId('gold-feedback').getByRole('button', { name: '다이아 충전하러 가기' }));
    expect(await st.wallet(account.uuid)).toEqual({ gold: 50, diamond: 0 });
    await expectWalletMatchesLedger(account.uuid);
});

test('A12-H-010 PC에서 스킨 삼 → 모바일 상점에 "보유중"·단추 꺼짐, 모바일에서 골드 0으로 다른 스킨 → 잔액 부족 글이 읽힘 @hard', async ({ user, players }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 500);
    await openItem(page, '스킨', SKIN.slot);
    await buyButton(page).click();
    await expect(st.detail(page).getByText(M.done)).toBeVisible();

    const phone = await players.add({ account, mobile: true });
    await phone.page.goto('/store');
    await ui.skipIntro(phone.page);
    await expect(phone.page.getByRole('button', { name: '쿠폰', exact: true })).toBeVisible();
    await st.pickCategory(phone.page, '스킨');
    await st.pickItem(phone.page, SKIN.slot);
    await expect(buyButton(phone.page, '보유중')).toBeDisabled();
    await st.pickItem(phone.page, SKIN2.slot);
    await expect(st.balance(phone.page, '골드', 0)).toBeVisible();
    await expect(buyButton(phone.page)).toBeDisabled();
    await expect(blockReason(phone.page)).toHaveText(M.insufficient);
    await expectReadable(blockReason(phone.page));
});

test.describe('어려움 — 충전 (가짜 토스 승인 서버)', () => {
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
            overrides: { SERVER_ID: `e2e-a12-toss-h${n}`, TOSS_API_BASE_URL: fake.url },
        });
    });
    test.afterAll(async () => {
        await api?.stop();
        await fake?.close();
    });

    // 따로 띄운 백엔드는 토스 주소가 가짜 승인 서버라 진짜 토스 승인 요청이 안 나감

    /** 화면의 /economy 요청을 따로 띄운 백엔드로 돌림 (닫힌 창의 늦은 요청은 버림) */
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
    const successUrl = (order, paymentKey) => `/store?topup=success&orderId=${order.orderId}&paymentKey=${paymentKey}&amount=${order.amount}`;

    test('A12-H-004 느린 승인(pk_slow_) 성공 주소 → 확인 도는 중 창 닫음 → 새 브라우저 로그인 → 상점의 열린 주문 찾기로 지급, 장부 1줄 @hard @realtime', async ({ user, players }) => {
        // 서버 10초 한도·잠금 30초를 진짜로 지나야 끝남
        test.setTimeout(240_000);
        const { page, account, context } = user;
        const product = await makeProduct('DIAMOND_TOPUP', { pay: 1100, grant: 10 });
        const order = await createOrder(context, product);
        await routeEconomy(page);
        await st.gotoStore(page, successUrl(order, `pk_slow_${st.rand(6).toLowerCase()}`));
        // 서버가 주문을 잡아 결제사에 묻기 시작한 뒤(확인 중)에 창을 닫음
        await expect.poll(async () => (await query('SELECT status FROM economy_topup_orders WHERE order_id = ?', [order.orderId]))[0]?.status).not.toBe('CREATED');
        await context.close();

        const fresh = await players.add({ account });
        await routeEconomy(fresh.page);
        await st.gotoStore(fresh.page);
        await expect(async () => {
            const check = feedback(fresh.page).getByRole('button', { name: '결과 확인' });
            if (await check.isVisible()) await check.click();
            await expect(feedback(fresh.page)).toContainText(M.topupDone, { timeout: 3000 });
        }).toPass({ timeout: 150_000, intervals: [3000, 5000] });
        await expectReadable(feedback(fresh.page).getByText(M.topupDone));
        expect((await st.wallet(account.uuid)).diamond).toBe(10);
        expect(await topupRows(account.uuid)).toHaveLength(1);
    });

    test('A12-H-005 같은 성공 주소를 두 창에서 동시에 엶 → 둘 다 완료 글, 장부 1줄 @hard', async ({ user }) => {
        test.setTimeout(180_000);
        const { page, account, context } = user;
        const product = await makeProduct('DIAMOND_TOPUP', { pay: 1100, grant: 10 });
        const order = await createOrder(context, product);
        const url = successUrl(order, `pk_ok_${st.rand(6).toLowerCase()}`);
        const second = await secondTab(context);
        await routeEconomy(page);
        await routeEconomy(second.page);
        await Promise.all([st.gotoStore(page, url), st.gotoStore(second.page, url)]);
        for (const p of [page, second.page]) {
            await expect(async () => {
                const check = feedback(p).getByRole('button', { name: '결과 확인' });
                if (await check.isVisible()) await check.click();
                await expect(feedback(p)).toContainText(M.topupDone, { timeout: 3000 });
            }).toPass({ timeout: 60_000, intervals: [2000, 3000] });
        }
        expect((await st.wallet(account.uuid)).diamond).toBe(10);
        expect(await topupRows(account.uuid)).toHaveLength(1);
    });

    test('A12-H-009 새 계정 처음부터 끝까지: 충전(가짜 승인) → 골드 구매 → 스킨 사기 → 착용 → 내역 → 지갑 = 장부 합 @hard', async ({ user }) => {
        test.setTimeout(240_000);
        // 가입은 계정 도우미(실제 가입과 같은 모양: 인증 끝·약관·기본 지급)로 대신함
        const { page, account, context } = user;
        const dia = await makeProduct('DIAMOND_TOPUP', { pay: 5500, grant: 50 });
        const gold = await makeProduct('GOLD_PURCHASE', { pay: 50, grant: 500 });
        await routeEconomy(page);

        // 1) 충전 50다이아
        const order = await createOrder(context, dia);
        await st.gotoStore(page, successUrl(order, `pk_ok_${st.rand(6).toLowerCase()}`));
        await expect(feedback(page)).toContainText(M.topupDone);
        await expect(st.balance(page, '다이아', 50)).toBeVisible();

        // 2) 골드 구매 50다이아 → 500골드
        await st.pickCategory(page, '인게임 재화');
        await page.getByRole('button', { name: new RegExp(`^${gold.name}`) }).click();
        await buyButton(page, '골드 구매').click();
        await expect(page.getByTestId('gold-feedback')).toContainText(M.goldDone);
        await expect(st.balance(page, '골드', 500)).toBeVisible();

        // 3) 스킨 사기 500골드
        await st.pickCategory(page, '스킨');
        await st.pickItem(page, SKIN.slot);
        await buyButton(page).click();
        await expect(st.detail(page).getByText(M.done)).toBeVisible();
        await expect(st.balance(page, '골드', 0)).toBeVisible();

        // 4) 마이페이지 스킨&카드 착용
        await page.goto('/mypage');
        await page.getByRole('button', { name: '스킨&카드 착용', exact: true }).click();
        const wear = page.getByRole('dialog', { name: '스킨&카드 착용' });
        await wear.getByRole('button', { name: SKIN.name, exact: true }).click();
        await wear.getByRole('button', { name: '적용' }).click();
        await expect(wear).toBeHidden();
        await expect.poll(async () => (await st.loadout(account.uuid))?.selected_skin_noble ?? '').toContain('블러드');

        // 5) 내역: 다이아 충전 1 · 골드 구매 2 · 상점 구매 1
        await st.gotoStore(page);
        await st.pickCategory(page, '인게임 재화');
        const lines = page.getByRole('region', { name: '재화 거래 내역' }).getByRole('listitem');
        await expect(lines.filter({ hasText: '다이아 충전' })).toHaveCount(1);
        await expect(lines.filter({ hasText: '골드 구매' })).toHaveCount(2);
        await expect(lines.filter({ hasText: '상점 구매' })).toHaveCount(1);

        // 6) 지갑 = 장부 합
        expect(await st.wallet(account.uuid)).toEqual({ gold: 0, diamond: 0 });
        await expectWalletMatchesLedger(account.uuid);
    });
});
