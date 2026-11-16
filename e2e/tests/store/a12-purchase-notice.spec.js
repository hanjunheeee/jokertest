'use strict';

// 상점 구매 실패 글 브라우저 시험 (PC): 잔액이 모자라면 단추가 미리 꺼지고 "잔액이 부족합니다."가 단추 바로 아래 보임(받은 버그 2), 서버 거절·끊김·로그인 풀림·지갑 못 받음 글 자리
// 목록 A12 브라우저 간단 A12-E-001~016 (쓰는 동안 안 돌림: npx playwright test --list tests/store/a12-purchase-notice.spec.js)
const { test, expect, E2E, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const st = require('./store-tools');

// 화면 글 (화면 쪽 currencyMessages.js·StorePurchaseFeedback.jsx, 서버 거절 글)
const M = Object.freeze({
    insufficient: '잔액이 부족합니다.',
    rejected: '구매가 거부되었습니다. 재화는 차감되지 않았습니다.',
    done: '구매가 완료되었습니다.',
    owned: '이미 보유한 상품입니다.',
    network: '인터넷 연결이 끊겨 구매 결과를 확인하지 못했습니다. 연결을 확인한 뒤 결과 확인을 눌러 주세요.',
    authLost: '구매 중 로그인이 풀려 결과를 확인하지 못했습니다. 다시 로그인한 뒤 결과 확인을 눌러 주세요.',
    walletError: '보유 재화를 불러오지 못해 구매할 수 없습니다. 보유 재화 칸의 재시도를 눌러 주세요.',
});

// 500골드 스킨 둘 (칸 이름 = 직업 + 스킨 이름 + 값)
const SKIN = Object.freeze({ slot: '귀족 블러드 500', id: 'player-skin-귀족1-블러드', price: 500 });
const SKIN2 = Object.freeze({ slot: '귀족 로코코 500', id: 'player-skin-귀족2-로코코', price: 500 });
const BULK_URL = `${E2E.apiUrl}/economy/purchases/bulk`;

// 설명 칸 안 구매 단추 (일괄구매 단추와 안 섞이게 이름 딱 맞게)
const buyButton = (page, name = '구매') => st.detail(page).getByRole('button', { name, exact: true });
// 단추 아래 꺼진 까닭 줄
const blockReason = (page) => st.detail(page).getByTestId('purchase-block-reason');
// 상점 구매 장부 줄만
const purchaseRows = async (uuid) => (await st.ledger(uuid)).filter((r) => r.reason === 'PURCHASE');

/** 글이 단추 "바로 아래"인지: 단추 아래쪽에서 시작하고 사이가 60px 안 */
async function expectRightBelow(notice, button) {
    const n = await notice.boundingBox();
    const b = await button.boundingBox();
    expect(n, '글 자리 못 잼').not.toBeNull();
    expect(b, '단추 자리 못 잼').not.toBeNull();
    expect(n.y).toBeGreaterThanOrEqual(b.y + b.height - 2);
    expect(n.y - (b.y + b.height)).toBeLessThan(60);
}

/** 상점 열고 스킨 분류의 그 스킨 고름 */
async function openSkin(page, skin = SKIN) {
    await st.gotoStore(page);
    await st.pickCategory(page, '스킨');
    await st.pickItem(page, skin.slot);
}

/** 로그인된 쿠키로 서버에 바로 사기 (다른 길로 먼저 산 상황 만들기) */
async function buyByApi(context, itemIds) {
    const res = await context.request.post(BULK_URL, {
        data: { items: itemIds.map((itemId) => ({ itemId })), referenceEventId: `e2e-a12:${st.rand(6)}` },
        headers: { origin: E2E.desktopUrl },
    });
    expect(res.status()).toBeLessThan(300);
}

/** E-001 모양: 골드 0 계정이 500골드 스킨을 고르면 단추 꺼짐 + 바로 아래 "잔액이 부족합니다."가 읽힘 */
async function expectZeroGoldNotice(page) {
    await openSkin(page);
    await expect(st.balance(page, '골드', 0)).toBeVisible();
    await expect(buyButton(page)).toBeDisabled();
    await expect(blockReason(page)).toHaveText(M.insufficient);
    await expectReadable(blockReason(page));
    await expectRightBelow(blockReason(page), buyButton(page));
}

test('A12-E-001 [버그 2] 골드 0 새 계정이 500골드 스킨을 고름 → 구매 단추 꺼짐 + 바로 아래 "잔액이 부족합니다."가 읽힘 @smoke', async ({ user }) => {
    await expectZeroGoldNotice(user.page);
});

for (const [id, gold, enabled] of [['A12-E-002', 499, false], ['A12-E-003', 500, true], ['A12-E-004', 501, true]]) {
    test(`${id} [버그 2] 골드 ${gold} + 500골드 스킨 → ${enabled ? '단추 켜짐, 까닭 줄 없음' : '단추 꺼짐 + "잔액이 부족합니다." 읽힘'}`, async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', gold);
        await openSkin(page);
        await expect(st.balance(page, '골드', gold)).toBeVisible();
        if (enabled) {
            await expect(buyButton(page)).toBeEnabled();
            await expect(blockReason(page)).toHaveCount(0);
        } else {
            await expect(buyButton(page)).toBeDisabled();
            await expect(blockReason(page)).toHaveText(M.insufficient);
            await expectReadable(blockReason(page));
            await expectRightBelow(blockReason(page), buyButton(page));
        }
    });
}

test('A12-E-005 [버그 2] 골드 700 + 500골드 스킨 둘을 일괄구매로 고름 → 단추 꺼짐 + "잔액이 부족합니다." 읽힘', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 700);
    await openSkin(page);
    // 일괄구매를 켜면 지금 고른 스킨이 먼저 들어감 → 하나 더 고름
    await page.getByRole('button', { name: '일괄구매' }).click();
    await page.getByRole('button', { name: SKIN2.slot, exact: true }).click();
    await expect(page.getByRole('button', { name: SKIN2.slot, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: SKIN.slot, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(buyButton(page)).toBeDisabled();
    await expect(blockReason(page)).toHaveText(M.insufficient);
    await expectReadable(blockReason(page));
});

test('A12-E-006 다른 탭에서 같은 스킨을 먼저 삼 → 이 탭에서 구매 → "이미 보유한 상품입니다."가 단추 아래 읽힘', async ({ user }) => {
    const { page, account, context } = user;
    // 거절 까닭이 잔액이 아니라 "이미 가짐"이 되게 넉넉히
    await st.grant(account.uuid, 'GOLD', 1000);
    await openSkin(page);
    await expect(buyButton(page)).toBeEnabled();

    const other = await context.newPage();
    await openSkin(other);
    await buyButton(other).click();
    await expect(st.detail(other).getByText(M.done)).toBeVisible();

    // 이 탭은 아직 산 줄 모름 → 눌러서 서버 거절
    await buyButton(page).click();
    const notice = st.detail(page).getByText(M.owned);
    await expectReadable(notice);
    await expectRightBelow(notice, buyButton(page));
    expect(await purchaseRows(account.uuid)).toHaveLength(1);
});

test('A12-E-007 이 탭에 잔액 500 보임 → 다른 탭에서 500 씀 → 이 탭에서 구매 → 거부 글 + "잔액이 부족합니다." 단추 아래, 골드 0 그대로', async ({ user }) => {
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 500);
    await openSkin(page);
    await expect(st.balance(page, '골드', 500)).toBeVisible();
    await expect(buyButton(page)).toBeEnabled();

    const other = await context.newPage();
    await openSkin(other, SKIN2);
    await buyButton(other).click();
    await expect(st.detail(other).getByText(M.done)).toBeVisible();
    await expect.poll(async () => (await st.wallet(account.uuid)).gold).toBe(0);

    await buyButton(page).click();
    await expectReadable(st.detail(page).getByText(M.rejected));
    // 서버 거절 글 (지갑을 다시 받아 꺼진 까닭 줄이 같이 떠도 첫 줄만 봄)
    const notice = st.detail(page).getByText(M.insufficient, { exact: true }).first();
    await expectReadable(notice);
    await expectRightBelow(notice, buyButton(page));
    expect((await st.wallet(account.uuid)).gold).toBe(0);
    expect(await st.owned(account.uuid)).not.toContain(SKIN.id);
});

test('A12-E-008 구매 요청만 인터넷 끊김 → 우리말 끊김 글이 읽힘, "Failed to fetch" 글자 없음', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 500);
    await openSkin(page);
    await page.route(BULK_URL, (route) => route.abort('internetdisconnected'));
    await buyButton(page).click();
    await expectReadable(st.detail(page).getByText(M.network));
    await expect(page.getByText(/Failed to fetch/i)).toHaveCount(0);
});

test('A12-E-009 서버엔 닿고 답만 버림 → 결과 확인 → "보유중", 장부 1줄', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 500);
    await openSkin(page);
    // 서버는 처리하고 브라우저만 답을 못 받음
    await page.route(BULK_URL, async (route) => {
        await route.fetch();
        await route.abort('failed');
    });
    await buyButton(page).click();
    await expect(st.detail(page).getByText(M.network)).toBeVisible();
    await page.unroute(BULK_URL);
    await st.detail(page).getByRole('button', { name: '결과 확인' }).click();
    await expect(st.detail(page).getByText(M.done)).toBeVisible();
    await expect(buyButton(page, '보유중')).toBeDisabled();
    expect(await purchaseRows(account.uuid)).toHaveLength(1);
});

test('A12-E-010 구매 직전 로그인 쿠키 지움 → 구매 → 로그인 화면 → 다시 로그인 → 상점에 로그인 풀림 안내가 읽힘', async ({ user }) => {
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 500);
    await openSkin(page);
    await context.clearCookies();
    await buyButton(page).click();
    await expect(page).toHaveURL(/\/login/);
    await ui.loginViaUi(page, account);
    await st.gotoStore(page);
    await expectReadable(st.detail(page).getByText(M.authLost));
});

test('A12-E-011 지갑 요청만 500 → 단추 꺼짐 + 까닭 글 읽힘 → 바꿈 풂 → 재시도 → 단추 켜짐', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    const walletUrl = `${E2E.apiUrl}/economy/accounts/${account.uuid}/wallet`;
    await page.route(walletUrl, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'x' }) }));
    await openSkin(page);
    await expect(buyButton(page)).toBeDisabled();
    await expect(blockReason(page)).toHaveText(M.walletError);
    await expectReadable(blockReason(page));

    await page.unroute(walletUrl);
    await page.locator('[aria-label="보유 재화"]').getByRole('button', { name: '재시도' }).first().click();
    await expect(st.balance(page, '골드', 1000)).toBeVisible();
    await expect(buyButton(page)).toBeEnabled();
    await expect(blockReason(page)).toHaveCount(0);
});

test('A12-E-012 구매 실패 → 글은 단추 아래 한 곳만, 판 맨 위 상자에 같은 글 없음', async ({ user }) => {
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    await openSkin(page);
    // 다른 길로 먼저 사 둠 → 화면에서 누르면 서버가 "이미 가짐"으로 거절
    await buyByApi(context, [SKIN.id]);
    await buyButton(page).click();
    await expect(st.detail(page).getByText(M.owned)).toBeVisible();
    await expect(page.getByText(M.owned)).toHaveCount(1);
    await expect(page.getByText(M.rejected)).toHaveCount(1);
    await expect(st.detail(page).getByText(M.rejected)).toHaveCount(1);
});

for (const [id, width, height] of [['A12-E-013', 1280, 720], ['A12-E-014', 1920, 1080], ['A12-E-015', 1024, 768]]) {
    test(`${id} 창 ${width}×${height}에서 E-001 글("잔액이 부족합니다.")이 화면 안에서 읽힘`, async ({ user }) => {
        await user.page.setViewportSize({ width, height });
        await expectZeroGoldNotice(user.page);
    });
}

test('A12-E-016 골드 600 + 500골드 스킨 삼 → "보유중", 위 골드 100, 장부 상점 구매 1줄', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 600);
    await openSkin(page);
    await buyButton(page).click();
    await expect(st.detail(page).getByText(M.done)).toBeVisible();
    await expect(buyButton(page, '보유중')).toBeDisabled();
    await expect(st.balance(page, '골드', 100)).toBeVisible();
    const rows = await purchaseRows(account.uuid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ currency: 'GOLD', amount: -SKIN.price, item_id: SKIN.id, balance_after: 100 });
});
