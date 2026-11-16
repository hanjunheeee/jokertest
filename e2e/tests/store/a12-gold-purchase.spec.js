'use strict';

// 다이아로 골드 사기 브라우저 시험 (PC): 다이아 경계·충전하러 가기·되면 잔액과 내역·보는 사이 값 바뀜·판매 중지·빨리 두 번
// 목록 A12 브라우저 간단 A12-E-027~034 (쓰는 동안 안 돌림: npx playwright test --list tests/store/a12-gold-purchase.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { query } = require('../../helpers/db');
const st = require('./store-tools');

// 화면 글 (화면 쪽 currencyMessages.js GOLD_MESSAGES)
const M = Object.freeze({
    insufficient: '다이아가 부족합니다. 잔액은 변하지 않았습니다.',
    done: '골드 구매가 완료되었습니다.',
    priceChanged: '상품 정보가 변경되었습니다. 새 조건을 확인한 뒤 다시 구매해 주세요.',
    rejected: '골드 구매에 실패했습니다. 재화는 차감되지 않았습니다.',
});

// 시험마다 자기 골드 상품을 만들어 씀 (같이 도는 시험이 공용 상품 값을 바꿔도 안 흔들리게), 끝나면 지움
const made = [];
test.afterEach(async () => {
    while (made.length) await query('DELETE FROM economy_currency_products WHERE product_id = ?', [made.pop()]);
});

/** 골드 상품 하나 만들기 (판매 중, 버전 1) → { productId, name } */
async function makeGoldProduct({ pay = 5, grant = 50 } = {}) {
    const tag = st.rand(3);
    const productId = `e2e-a12-gold-${tag.toLowerCase()}`;
    const name = `시험금화 ${tag}`;
    const now = new Date();
    await query(
        'INSERT INTO economy_currency_products (product_id, kind, display_name, pay_currency, pay_amount, grant_currency, grant_amount, bonus_amount, status, sort_order, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [productId, 'GOLD_PURCHASE', name, 'DIAMOND', pay, 'GOLD', grant, 0, 'ON_SALE', 900, 1, now, now],
    );
    made.push(productId);
    return { productId, name, pay, grant };
}

const goldFeedback = (page) => page.getByTestId('gold-feedback');
const goldButton = (page, name = '골드 구매') => st.detail(page).getByRole('button', { name, exact: true });
const goldRows = async (uuid) => (await st.ledger(uuid)).filter((r) => r.reason === 'GOLD_PURCHASE');

/** 상점 → 인게임 재화 → 그 골드 상품 고름 */
async function openGold(page, product) {
    await st.gotoStore(page);
    await st.pickCategory(page, '인게임 재화');
    const slot = page.getByRole('button', { name: new RegExp(`^${product.name}`) });
    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');
    await expect(st.detail(page).getByRole('heading', { name: product.name })).toBeVisible();
}

for (const [id, diamond] of [['A12-E-027', 0], ['A12-E-028', 4]]) {
    test(`${id} 다이아 ${diamond} + 5다이아 골드 상품 → 부족 글 + "다이아 충전하러 가기"가 읽힘, 다이아 그대로`, async ({ user }) => {
        const { page, account } = user;
        const product = await makeGoldProduct();
        if (diamond > 0) await st.grant(account.uuid, 'DIAMOND', diamond);
        await openGold(page, product);
        await goldButton(page).click();
        await expectReadable(goldFeedback(page).getByText(M.insufficient));
        await expectReadable(goldFeedback(page).getByRole('button', { name: '다이아 충전하러 가기' }));
        expect(await st.wallet(account.uuid)).toEqual({ gold: 0, diamond });
        expect(await goldRows(account.uuid)).toHaveLength(0);
    });
}

test('A12-E-029 다이아 5 + 5다이아 골드 상품 → 골드 구매 됨, 다이아 0·골드 50', async ({ user }) => {
    const { page, account } = user;
    const product = await makeGoldProduct();
    await st.grant(account.uuid, 'DIAMOND', 5);
    await openGold(page, product);
    await goldButton(page).click();
    await expect(goldFeedback(page)).toContainText(M.done);
    expect(await st.wallet(account.uuid)).toEqual({ gold: 50, diamond: 0 });
});

test('A12-E-030 다이아 부족 뒤 "다이아 충전하러 가기" 누름 → 다이아 충전 상품 칸이 골라짐(단추 "충전")', async ({ user }) => {
    const { page } = user;
    const product = await makeGoldProduct();
    await openGold(page, product);
    await goldButton(page).click();
    await goldFeedback(page).getByRole('button', { name: '다이아 충전하러 가기' }).click();
    await expect(st.detail(page).getByRole('button', { name: '충전', exact: true })).toBeVisible();
    await expect(st.detail(page).getByText(/원/).first()).toBeVisible();
    await expect(st.detail(page).getByRole('heading', { name: product.name })).toHaveCount(0);
});

test('A12-E-031 다이아 10으로 골드 구매 됨 → 위 골드 50·다이아 5로 바뀜, 재화 내역에 골드 구매 두 줄 @smoke', async ({ user }) => {
    const { page, account } = user;
    const product = await makeGoldProduct();
    await st.grant(account.uuid, 'DIAMOND', 10);
    await openGold(page, product);
    await expect(st.balance(page, '다이아', 10)).toBeVisible();
    await goldButton(page).click();
    await expect(goldFeedback(page)).toContainText(M.done);
    await expect(st.balance(page, '골드', 50)).toBeVisible();
    await expect(st.balance(page, '다이아', 5)).toBeVisible();
    const lines = page.getByRole('region', { name: '재화 거래 내역' }).getByRole('listitem').filter({ hasText: '골드 구매' });
    await expect(lines).toHaveCount(2);
    await expect(lines.filter({ hasText: '다이아' })).toContainText('-5');
    await expect(lines.filter({ hasText: '+50' })).toHaveCount(1);
});

test('A12-E-032 상점 연 뒤 상품 값·버전이 바뀜 → 구매 → 새 조건 글 → 새 조건 확인 → 새 값(4다이아 → 40골드)으로 됨', async ({ user }) => {
    const { page, account } = user;
    const product = await makeGoldProduct({ pay: 3, grant: 30 });
    await st.grant(account.uuid, 'DIAMOND', 100);
    await openGold(page, product);
    // 보는 사이 운영이 값을 바꿈 (값이 바뀌면 버전도 올림)
    await query('UPDATE economy_currency_products SET pay_amount = 4, grant_amount = 40, version = 2 WHERE product_id = ?', [product.productId]);
    await goldButton(page).click();
    await expectReadable(goldFeedback(page).getByText(M.priceChanged));
    await expect(goldFeedback(page)).toContainText('새 조건: 4 다이아 → 골드 40');
    expect(await st.wallet(account.uuid)).toEqual({ gold: 0, diamond: 100 });

    await goldFeedback(page).getByRole('button', { name: '새 조건 확인' }).click();
    await goldButton(page).click();
    await expect(goldFeedback(page)).toContainText(M.done);
    expect(await st.wallet(account.uuid)).toEqual({ gold: 40, diamond: 96 });
});

test('A12-E-033 보는 사이 판매 중지 → 구매 → 실패 글이 읽힘, 다이아 그대로', async ({ user }) => {
    const { page, account } = user;
    const product = await makeGoldProduct();
    await st.grant(account.uuid, 'DIAMOND', 10);
    await openGold(page, product);
    await query('UPDATE economy_currency_products SET status = ? WHERE product_id = ?', ['STOPPED', product.productId]);
    await goldButton(page).click();
    await expectReadable(goldFeedback(page).getByText(M.rejected));
    expect(await st.wallet(account.uuid)).toEqual({ gold: 0, diamond: 10 });
    expect(await goldRows(account.uuid)).toHaveLength(0);
});

test('A12-E-034 골드 구매 단추를 빨리 두 번 → 한 번만 됨(장부 2줄: 다이아 −5·골드 +50)', async ({ user }) => {
    const { page, account } = user;
    const product = await makeGoldProduct();
    await st.grant(account.uuid, 'DIAMOND', 20);
    await openGold(page, product);
    await goldButton(page).dblclick();
    await expect(goldFeedback(page)).toContainText(M.done);
    const rows = await goldRows(account.uuid);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => `${r.currency}:${r.amount}`).sort()).toEqual(['DIAMOND:-5', 'GOLD:50']);
    expect(await st.wallet(account.uuid)).toEqual({ gold: 50, diamond: 15 });
});
