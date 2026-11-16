'use strict';

// 상점 재화 거래 내역 브라우저 시험 (PC): 사유 이름(다이아 충전·골드 구매·상점 구매·쿠폰 보상)·새 계정은 기본 지급 줄 없음·판 보상 줄
// 목록 A12 브라우저 간단 A12-E-053~055 (쓰는 동안 안 돌림: npx playwright test --list tests/store/a12-history.spec.js)
const { test, expect, E2E } = require('../../helpers/fixtures');
const { query, backend } = require('../../helpers/db');
const st = require('./store-tools');

const made = [];
test.afterEach(async () => {
    while (made.length) await query('DELETE FROM economy_currency_products WHERE product_id = ?', [made.pop()]);
});

/** 로그인 쿠키로 본 서버에 바로 보내기 (쿠폰은 시험마다 다른 ip로 — 같은 ip 10분 30번 제한) → { status, body } */
async function call(context, method, path, data, headers = {}) {
    const res = await context.request.fetch(`${E2E.apiUrl}${path}`, { method, data, headers: { origin: E2E.desktopUrl, ...headers } });
    return { status: res.status(), body: await res.json().catch(() => null) };
}
const randomIp = () => `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

/** 골드 상품 하나 만들기 (판매 중, 버전 1) */
async function makeGoldProduct({ pay = 5, grant = 50 } = {}) {
    const tag = st.rand(3);
    const productId = `e2e-a12-gold-${tag.toLowerCase()}`;
    const now = new Date();
    await query(
        'INSERT INTO economy_currency_products (product_id, kind, display_name, pay_currency, pay_amount, grant_currency, grant_amount, bonus_amount, status, sort_order, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [productId, 'GOLD_PURCHASE', `시험금화 ${tag}`, 'DIAMOND', pay, 'GOLD', grant, 0, 'ON_SALE', 900, 1, now, now],
    );
    made.push(productId);
    return { productId, version: 1 };
}

/** 상점 → 인게임 재화 → 거래 내역 칸 (다 받을 때까지) */
async function openHistory(page) {
    await st.gotoStore(page);
    await st.pickCategory(page, '인게임 재화');
    const history = page.getByRole('region', { name: '재화 거래 내역' });
    await expect(history).toBeVisible();
    await expect(history.getByText('거래 내역을 불러오는 중입니다…')).toHaveCount(0);
    return history;
}

test('A12-E-053 충전·골드 구매·상점 구매·쿠폰 한 번씩 → 내역에 "다이아 충전"·"골드 구매"·"상점 구매"·"쿠폰 보상" @smoke', async ({ user, context }) => {
    const { page, account } = user;
    // 충전: 승인 끝난(지급 대기) 주문을 주문 조회로 마저 지급 (결제사에 안 물음)
    const order = await st.createTopupOrder(account.uuid, { status: 'PENDING_GRANT' });
    const looked = await call(context, 'GET', `/economy/topup/orders/${order.orderId}`);
    expect(looked.body?.status).toBe('GRANTED');
    // 골드 구매: 다이아 5 → 골드 50
    const gold = await makeGoldProduct();
    const bought = await call(context, 'POST', '/economy/gold-purchases', { ...gold, referenceEventId: `e2e-a12:${st.rand(6)}` });
    expect(bought.status).toBeLessThan(300);
    // 쿠폰: 골드 300
    const code = await st.createCoupon({ amount: 300 });
    const redeemed = await call(context, 'POST', '/economy/coupons/redeem', { code }, { 'x-forwarded-for': randomIp() });
    expect(redeemed.status).toBeLessThan(300);
    // 상점 구매: 남작 테두리 200골드
    const purchased = await call(context, 'POST', '/economy/purchases/bulk', { items: [{ itemId: 'profile-border-남작' }], referenceEventId: `e2e-a12:${st.rand(6)}` });
    expect(purchased.status).toBeLessThan(300);

    const history = await openHistory(page);
    const lines = history.getByRole('listitem');
    await expect(lines.filter({ hasText: '다이아 충전' })).toHaveCount(1);
    await expect(lines.filter({ hasText: '골드 구매' })).toHaveCount(2);
    await expect(lines.filter({ hasText: '상점 구매' })).toHaveCount(1);
    await expect(lines.filter({ hasText: '쿠폰 보상' })).toHaveCount(1);
    await expect(lines.filter({ hasText: '쿠폰 보상' })).toContainText('+300');
    await expect(lines.filter({ hasText: '상점 구매' })).toContainText('-200');
});

test('A12-E-054 새 계정 → 내역에 기본 지급 줄 없음 ("거래 내역이 없습니다.")', async ({ user }) => {
    const history = await openHistory(user.page);
    await expect(history.getByText('거래 내역이 없습니다.')).toBeVisible();
    await expect(history.getByRole('listitem').filter({ hasText: '기본 지급' })).toHaveCount(0);
});

test('A12-E-055 장부에 판 보상(GAME_REWARD) +1골드를 넣어 둔 계정 → 내역 "판 보상 … +1"', async ({ user }) => {
    const { page, account } = user;
    // 판 끝 지급 자체는 A07 몫 → 여기선 같은 장부 거래로 한 줄만 넣어 둠
    const { db, economyService } = backend();
    await economyService.grantReward({ userId: account.uuid, amount: 1, currency: 'GOLD', reason: 'GAME_REWARD', referenceEventId: `game-reward:e2e-a12-${st.rand(6)}` }, db);
    const history = await openHistory(page);
    const line = history.getByRole('listitem').filter({ hasText: '판 보상' });
    await expect(line).toHaveCount(1);
    await expect(line).toContainText('골드');
    await expect(line.getByTestId('transaction-amount')).toHaveText('+1');
});
