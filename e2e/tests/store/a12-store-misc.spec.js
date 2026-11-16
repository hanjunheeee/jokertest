'use strict';

// 상점 그 밖 브라우저 시험 (PC): 로그인 없이·계정 바뀜·충전 상품 없음/목록 실패/순서/덤·가격 글·설정 대기 재누름·골드 구매 응답 놓침·묶음 중 하나 먼저 삼·다시 들어옴·다른 상품 고르면 안내 지움
// 목록 A12 브라우저 간단 A12-E-068~080 (쓰는 동안 안 돌림: npx playwright test --list tests/store/a12-store-misc.spec.js)
const { test, expect, E2E, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { query, sqlTime } = require('../../helpers/db');
const st = require('./store-tools');

const M = Object.freeze({
    done: '구매가 완료되었습니다.',
    rejected: '구매가 거부되었습니다. 재화는 차감되지 않았습니다.',
    owned: '이미 보유한 상품입니다.',
    topupUnknown: '결제 결과 확인이 필요합니다. 확인 전까지 다이아는 지급된 것으로 보지 않습니다.',
    configPending: '결제 설정이 아직 준비되지 않았습니다(설정 대기). 상품 목록을 새로고침한 뒤 다시 시도해 주세요.',
    goldUnknown: '골드 구매 결과 확인이 필요합니다.',
    goldDone: '골드 구매가 완료되었습니다.',
});
const SKIN = Object.freeze({ slot: '귀족 블러드 500', id: 'player-skin-귀족1-블러드' });
const SKIN2 = Object.freeze({ slot: '귀족 로코코 500', id: 'player-skin-귀족2-로코코' });
const BULK_URL = `${E2E.apiUrl}/economy/purchases/bulk`;

const buyButton = (page, name = '구매') => st.detail(page).getByRole('button', { name, exact: true });

// 시험마다 자기 재화 상품을 만들어 씀 (공용 시험 상품 값이 바뀌어도 안 흔들리게), 끝나면 지움
const made = [];
test.afterEach(async () => {
    while (made.length) await query('DELETE FROM economy_currency_products WHERE product_id = ?', [made.pop()]);
});

/** 재화 상품 하나 만들기 (판매 중, 버전 1) → { productId, name } */
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
    return { productId, name };
}

/** 상점 → 인게임 재화 → 그 상품 고름 */
async function openCurrency(page, product) {
    await st.gotoStore(page);
    await st.pickCategory(page, '인게임 재화');
    const slot = page.getByRole('button', { name: new RegExp(`^${product.name}`) });
    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');
}

/** 상점 열고 분류·칸 고름 */
async function openItem(page, category, slot) {
    await st.gotoStore(page);
    await st.pickCategory(page, category);
    await st.pickItem(page, slot);
}

/** 로그인 쿠키로 서버에 바로 사기 */
async function buyByApi(context, itemIds) {
    const res = await context.request.post(BULK_URL, {
        data: { items: itemIds.map((itemId) => ({ itemId })), referenceEventId: `e2e-a12:${st.rand(6)}` },
        headers: { origin: E2E.desktopUrl },
    });
    expect(res.status()).toBeLessThan(300);
}

/** 주문 만들기 답을 503 CONFIG_MISSING으로 바꿔 둠 (보낸 수 셈) */
async function configMissing(page) {
    const sent = [];
    await page.route(`${E2E.apiUrl}/economy/topup/orders`, (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        sent.push(route.request().url());
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'CONFIG_MISSING', message: '결제 설정이 없습니다.' }) });
    });
    return sent;
}

test('A12-E-068 [지금 동작] 로그인 없이 /store → 로그인 화면 @smoke', async ({ page }) => {
    await page.goto('/store');
    await expect(page).toHaveURL(/\/login/);
});

test('A12-E-069 A 로그아웃 → B 로그인 → 상점에 A 잔액·열린 주문·구매 안내 없음', async ({ user, accounts }) => {
    const { page, account } = user;
    // A: 골드 777로 남작(200) 삼 → 577, 다른 요청이 확인 중인(잠금 10분) 열린 주문 하나 → 결제사에 안 물음
    await st.grant(account.uuid, 'GOLD', 777);
    const order = await st.createTopupOrder(account.uuid);
    await query('UPDATE economy_topup_orders SET status = ?, lease_token = ?, lease_expires_at = ? WHERE order_id = ?',
        ['CONFIRMING', `e2e-lease-${st.rand(4)}`, sqlTime(Date.now() + 10 * 60_000), order.orderId]);
    await openItem(page, '프로필 테두리', '남작 200');
    await buyButton(page).click();
    await expect(st.detail(page).getByText(M.done)).toBeVisible();
    // A 화면엔 A 것들이 보임 (열린 주문 안내·잔액·구매 안내)
    await expect(page.getByTestId('topup-feedback')).toContainText(M.topupUnknown);
    await expect(st.balance(page, '골드', 577)).toBeVisible();

    // 로비 메뉴 "종료" = 로그아웃
    await ui.gotoLobby(page);
    await page.getByRole('navigation', { name: '로비 메뉴' }).getByRole('button', { name: '종료' }).click();
    await expect(page).toHaveURL(/\/login/);

    const b = await accounts.create();
    await ui.loginViaUi(page, b);
    await st.gotoStore(page);
    await expect(st.balance(page, '골드', 0)).toBeVisible();
    await expect(st.balance(page, '골드', 577)).toHaveCount(0);
    await expect(page.getByText(M.done)).toHaveCount(0);
    await expect(page.getByText(M.topupUnknown)).toHaveCount(0);
    await expect(page.getByTestId('topup-feedback')).toHaveCount(0);
});

test('A12-E-070 충전·골드 상품을 전부 판매 중지 → 인게임 재화에 빈 목록 안내 @serial', async ({ user }) => {
    // 상품 표 전체를 바꿔 다른 시험에 걸림 → serial(다른 시험 다 끝난 뒤 하나씩)로
    const { page } = user;
    const onSale = await query("SELECT product_id FROM economy_currency_products WHERE status = 'ON_SALE'");
    const ids = onSale.map((r) => r.product_id);
    try {
        if (ids.length) await query(`UPDATE economy_currency_products SET status = 'STOPPED' WHERE product_id IN (${ids.map(() => '?').join(',')})`, ids);
        await st.gotoStore(page);
        await st.pickCategory(page, '인게임 재화');
        await expectReadable(page.getByText('판매 중인 재화 상품이 없습니다.'));
        await expect(page.getByText('준비된 상품이 없습니다.')).toBeVisible();
    } finally {
        if (ids.length) await query(`UPDATE economy_currency_products SET status = 'ON_SALE' WHERE product_id IN (${ids.map(() => '?').join(',')})`, ids);
    }
});

test('A12-E-071 상품 목록 요청만 500 → 까닭 글이 읽힘 + 새로고침 → 다시 됨', async ({ user }) => {
    const { page } = user;
    const listUrl = `${E2E.apiUrl}/economy/currency-products`;
    await page.route(listUrl, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'x' }) }));
    await st.gotoStore(page);
    await st.pickCategory(page, '인게임 재화');
    const controls = page.getByTestId('currency-list-controls');
    await expectReadable(controls.getByRole('alert'));
    await expect(controls.getByRole('alert')).toContainText('상품 목록을 불러오지 못했습니다.');
    await page.unroute(listUrl);
    await controls.getByRole('button', { name: '상품 목록 새로고침' }).click();
    await expect(controls.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^다이아 \d+개/ }).first()).toBeVisible();
});

test('A12-E-072 상품은 sort_order 순으로 보임 (시험 상품 8개의 앞뒤 차례)', async ({ user }) => {
    const { page } = user;
    const rows = await query("SELECT display_name FROM economy_currency_products WHERE product_id LIKE 'test-%' AND status = 'ON_SALE' ORDER BY sort_order, product_id");
    const expected = rows.map((r) => r.display_name);
    expect(expected.length).toBeGreaterThan(1);
    await st.gotoStore(page);
    await st.pickCategory(page, '인게임 재화');
    await expect(page.getByRole('button', { name: new RegExp(`^${expected[0]}`) })).toBeVisible();
    // 칸 차례 (다른 시험이 잠깐 넣은 상품은 빼고 시험 상품끼리 앞뒤만 봄)
    const slotTexts = await page.locator('button[aria-pressed]').evaluateAll((els) => els.map((el) => el.textContent ?? ''));
    const order = expected.map((name) => slotTexts.findIndex((text) => text.startsWith(name)));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
});

test('A12-E-073 덤 있는 충전 상품(덤 5) → 설명에 "보너스 +5"', async ({ user }) => {
    const { page } = user;
    const product = await makeProduct('DIAMOND_TOPUP', { pay: 11000, grant: 100, bonus: 5 });
    await openCurrency(page, product);
    await expect(st.detail(page).getByTestId('currency-bonus')).toContainText('보너스 +5');
});

test('A12-E-074 원화 충전 상품 → 가격 글 "11,000 원 → 지급 100 다이아" (원화만 쉼표)', async ({ user }) => {
    const { page } = user;
    const product = await makeProduct('DIAMOND_TOPUP', { pay: 11000, grant: 100 });
    await openCurrency(page, product);
    await expect(st.detail(page).getByTestId('currency-pay')).toHaveText('11,000 원');
    await expect(st.detail(page).getByTestId('currency-grant')).toHaveText('지급 100 다이아');
});

test('A12-E-075 설정 대기(E-049 상황) 뒤 충전을 다시 눌러도 → 주문 요청 더 안 감', async ({ user }) => {
    const { page } = user;
    const product = await makeProduct('DIAMOND_TOPUP', { pay: 1100, grant: 10 });
    const sent = await configMissing(page);
    await openCurrency(page, product);
    await buyButton(page, '충전').click();
    const waiting = buyButton(page, '설정 대기');
    await expect(waiting).toBeDisabled();
    await expect(page.getByText(M.configPending)).toBeVisible();
    expect(sent).toHaveLength(1);
    // 꺼진 단추를 사람처럼 다시 눌러 봄
    await waiting.click({ force: true });
    await waiting.click({ force: true });
    await expect(waiting).toBeDisabled();
    expect(sent).toHaveLength(1);
});

test('A12-E-076 골드 구매 응답만 버림 → 결과 확인 → 골드 한 번만 늘어남', async ({ user }) => {
    const { page, account } = user;
    const product = await makeProduct('GOLD_PURCHASE', { pay: 5, grant: 50 });
    await st.grant(account.uuid, 'DIAMOND', 10);
    const goldUrl = `${E2E.apiUrl}/economy/gold-purchases`;
    // 서버는 처리하고 브라우저만 답을 못 받음
    await page.route(goldUrl, async (route) => {
        await route.fetch();
        await route.abort('failed');
    });
    await openCurrency(page, product);
    await buyButton(page, '골드 구매').click();
    const fb = page.getByTestId('gold-feedback');
    await expect(fb).toContainText(M.goldUnknown);
    await page.unroute(goldUrl);
    await fb.getByRole('button', { name: '결과 확인' }).click();
    await expect(fb).toContainText(M.goldDone);
    await expect(st.balance(page, '골드', 50)).toBeVisible();
    expect(await st.wallet(account.uuid)).toEqual({ gold: 50, diamond: 5 });
    expect((await st.ledger(account.uuid)).filter((r) => r.reason === 'GOLD_PURCHASE')).toHaveLength(2);
});

test('A12-E-077 일괄구매(스킨 둘) 확인 창을 연 사이 다른 탭에서 그중 하나를 삼 → 전체 거절 글, 하나도 안 빠짐', async ({ user }) => {
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 1500);
    await openItem(page, '스킨', SKIN.slot);
    await page.getByRole('button', { name: '일괄구매' }).click();
    await page.getByRole('button', { name: SKIN2.slot, exact: true }).click();
    await buyButton(page).click();
    const dialog = page.getByRole('dialog', { name: '선택 상품 구매 확인' });
    await expect(dialog).toBeVisible();

    const other = await context.newPage();
    await openItem(other, '스킨', SKIN2.slot);
    await buyButton(other).click();
    await expect(st.detail(other).getByText(M.done)).toBeVisible();
    await expect.poll(async () => (await st.wallet(account.uuid)).gold).toBe(1000);

    await dialog.getByRole('button', { name: '구매하기' }).click();
    await expectReadable(dialog.getByText(M.rejected));
    await expect(dialog.getByText(M.owned)).toBeVisible();
    expect((await st.wallet(account.uuid)).gold).toBe(1000);
    expect(await st.owned(account.uuid)).not.toContain(SKIN.id);
});

test('A12-E-078 다른 탭에서 산 뒤 상점에 다시 들어옴 → 잔액·보유중이 맞음', async ({ user }) => {
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    await st.gotoStore(page);
    await expect(st.balance(page, '골드', 1000)).toBeVisible();

    const other = await context.newPage();
    await openItem(other, '프로필 테두리', '남작 200');
    await buyButton(other).click();
    await expect(st.detail(other).getByText(M.done)).toBeVisible();

    await ui.gotoLobby(page);
    await openItem(page, '프로필 테두리', '남작 200');
    await expect(st.balance(page, '골드', 800)).toBeVisible();
    await expect(buyButton(page, '보유중')).toBeDisabled();
});

test('A12-E-079 [지금 동작] 구매 실패 뒤 다른 상품을 고름 → 새 상품 단추 아래 비어 있음', async ({ user }) => {
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    await openItem(page, '스킨', SKIN.slot);
    await buyByApi(context, [SKIN.id]);
    await buyButton(page).click();
    await expect(st.detail(page).getByText(M.rejected)).toBeVisible();

    await st.pickItem(page, SKIN2.slot);
    await expect(st.detail(page).getByRole('heading', { name: '귀족-로코코' })).toBeVisible();
    await expect(page.getByText(M.rejected)).toHaveCount(0);
    await expect(page.getByText(M.owned)).toHaveCount(0);
    await expect(st.detail(page).getByRole('status')).toHaveCount(0);
    await expect(buyButton(page)).toBeEnabled();
});

test('A12-E-080 [지금 동작] 남작(200) 산 뒤 상점을 닫았다(뒤로 가기 → 로비) 다시 엶 → 위 골드 숫자가 200 줄어 있음', async ({ user }) => {
    // 로비·마이페이지 배너엔 골드 숫자가 없어 상점 위 숫자로 봄 (반장 결정으로 목록 줄을 바꿈)
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    await openItem(page, '프로필 테두리', '남작 200');
    await buyButton(page).click();
    await expect(st.detail(page).getByText(M.done)).toBeVisible();
    await page.getByRole('button', { name: '뒤로 가기' }).click();
    await expect(page).toHaveURL(/\/lobby/);
    await st.gotoStore(page);
    await expect(st.balance(page, '골드', 800)).toBeVisible();
    await expect(st.balance(page, '골드', 1000)).toHaveCount(0);
    expect((await st.wallet(account.uuid)).gold).toBe(800);
});
