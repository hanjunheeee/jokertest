'use strict';

// 상점 아이템 사기 브라우저 시험 (PC): 종류마다 사짐·일괄구매와 취소·빨리 두 번·응답 놓침·새로고침·산 테두리 끼우기
// 목록 A12 브라우저 간단 A12-E-017~026 (쓰는 동안 안 돌림: npx playwright test --list tests/store/a12-item-purchase.spec.js)
const { test, expect, E2E, ui } = require('../../helpers/fixtures');
const st = require('./store-tools');

const DONE = '구매가 완료되었습니다.';
const NETWORK = '인터넷 연결이 끊겨 구매 결과를 확인하지 못했습니다. 연결을 확인한 뒤 결과 확인을 눌러 주세요.';
const BULK_URL = `${E2E.apiUrl}/economy/purchases/bulk`;

// 파는 종류 넷 (분류·칸 이름·아이템 id·값)
const KINDS = Object.freeze([
    { id: 'A12-E-017', label: '프로필 테두리', category: '프로필 테두리', slot: '남작 200', itemId: 'profile-border-남작', price: 200 },
    { id: 'A12-E-018', label: '스킨', category: '스킨', slot: '귀족 블러드 500', itemId: 'player-skin-귀족1-블러드', price: 500 },
    { id: 'A12-E-019', label: '카드 테두리', category: '플레이어 카드', slot: '가고일 500', itemId: 'player-card-가고일', price: 500 },
    { id: 'A12-E-020', label: '상점 이모티콘', category: '이모티콘', slot: '깜짝 500', itemId: 'emoji-startled', price: 500 },
]);
const SKIN = KINDS[1];
const SKIN2 = Object.freeze({ slot: '귀족 로코코 500', itemId: 'player-skin-귀족2-로코코', price: 500 });

const buyButton = (page, name = '구매') => st.detail(page).getByRole('button', { name, exact: true });
const purchaseRows = async (uuid) => (await st.ledger(uuid)).filter((r) => r.reason === 'PURCHASE');
const ownedCount = async (uuid, itemId) => (await st.owned(uuid)).filter((id) => id === itemId).length;

/** 상점 열고 분류·칸 고름 */
async function openItem(page, category, slot) {
    await st.gotoStore(page);
    await st.pickCategory(page, category);
    await st.pickItem(page, slot);
}

/** 구매 요청(POST 묶음 구매)만 세기 */
function countBulkPosts(page) {
    const posts = [];
    page.on('request', (r) => { if (r.method() === 'POST' && r.url() === BULK_URL) posts.push(r.url()); });
    return posts;
}

/** 일괄구매로 스킨 둘 고르고 확인 창 열기 → 창 */
async function openBulkDialog(page) {
    await openItem(page, '스킨', SKIN.slot);
    // 일괄구매를 켜면 지금 고른 스킨이 먼저 들어감 → 하나 더
    await page.getByRole('button', { name: '일괄구매' }).click();
    await page.getByRole('button', { name: SKIN2.slot, exact: true }).click();
    await expect(page.getByRole('button', { name: SKIN2.slot, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await buyButton(page).click();
    const dialog = page.getByRole('dialog', { name: '선택 상품 구매 확인' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('1,000 골드')).toBeVisible();
    return dialog;
}

for (const kind of KINDS) {
    test(`${kind.id} ${kind.label}(${kind.slot}) 삼 → "보유중", 골드 ${kind.price} 줄어듦, 가진 것 1줄${kind.id === 'A12-E-017' ? ' @smoke' : ''}`, async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', 1000);
        await openItem(page, kind.category, kind.slot);
        await buyButton(page).click();
        await expect(st.detail(page).getByText(DONE)).toBeVisible();
        await expect(buyButton(page, '보유중')).toBeDisabled();
        await expect(st.balance(page, '골드', 1000 - kind.price)).toBeVisible();
        expect((await st.wallet(account.uuid)).gold).toBe(1000 - kind.price);
        expect(await ownedCount(account.uuid, kind.itemId)).toBe(1);
    });
}

test('A12-E-021 일괄구매로 스킨 둘 고름 → 확인 창 → 구매하기 → 둘 다 보유, 합(1,000)만큼 줄어듦', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 1200);
    const dialog = await openBulkDialog(page);
    await dialog.getByRole('button', { name: '구매하기' }).click();
    await expect(dialog.getByText(DONE)).toBeVisible();
    await expect.poll(async () => (await st.wallet(account.uuid)).gold).toBe(200);
    expect(await ownedCount(account.uuid, SKIN.itemId)).toBe(1);
    expect(await ownedCount(account.uuid, SKIN2.itemId)).toBe(1);
    expect(await purchaseRows(account.uuid)).toHaveLength(2);
});

test('A12-E-022 [지금 동작] 일괄구매 확인 창에서 닫기(취소) → 골드 안 빠짐, 장부 0, 구매 요청 0', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 1200);
    const posts = countBulkPosts(page);
    const dialog = await openBulkDialog(page);
    await dialog.getByRole('button', { name: '일괄구매 확인 닫기' }).click();
    await expect(dialog).toBeHidden();
    await expect(st.balance(page, '골드', 1200)).toBeVisible();
    expect(posts).toHaveLength(0);
    expect((await st.wallet(account.uuid)).gold).toBe(1200);
    expect(await purchaseRows(account.uuid)).toHaveLength(0);
});

test('A12-E-023 구매 단추를 빨리 두 번 누름 → 구매 요청 1번, 장부 1줄', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    const posts = countBulkPosts(page);
    await openItem(page, '스킨', SKIN.slot);
    await buyButton(page).dblclick();
    await expect(st.detail(page).getByText(DONE)).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(await purchaseRows(account.uuid)).toHaveLength(1);
    expect((await st.wallet(account.uuid)).gold).toBe(500);
});

test('A12-E-024 구매 응답만 버림 → 결과 확인 → 장부 1줄, 골드 다시 안 빠짐(구매 요청 더 안 감)', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    await openItem(page, '스킨', SKIN.slot);
    // 서버는 처리하고 브라우저만 답을 못 받음
    await page.route(BULK_URL, async (route) => {
        await route.fetch();
        await route.abort('failed');
    });
    await buyButton(page).click();
    await expect(st.detail(page).getByText(NETWORK)).toBeVisible();
    await page.unroute(BULK_URL);
    const posts = countBulkPosts(page);
    await st.detail(page).getByRole('button', { name: '결과 확인' }).click();
    await expect(st.detail(page).getByText(DONE)).toBeVisible();
    await expect(st.balance(page, '골드', 500)).toBeVisible();
    expect(posts).toHaveLength(0);
    expect(await purchaseRows(account.uuid)).toHaveLength(1);
    expect((await st.wallet(account.uuid)).gold).toBe(500);
});

test('A12-E-025 산 뒤 새로고침 → "보유중" 그대로', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 500);
    await openItem(page, '스킨', SKIN.slot);
    await buyButton(page).click();
    await expect(st.detail(page).getByText(DONE)).toBeVisible();
    await page.reload();
    await ui.skipIntro(page);
    await expect(page.getByRole('button', { name: '쿠폰 입력' })).toBeVisible();
    await st.pickCategory(page, '스킨');
    await st.pickItem(page, SKIN.slot);
    await expect(buyButton(page, '보유중')).toBeDisabled();
    await expect(st.balance(page, '골드', 0)).toBeVisible();
});

test('A12-E-026 상점에서 남작 테두리 삼 → 마이페이지 프로필 수정 "테두리 수정"에서 끼움 → 내 테두리가 남작', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 200);
    await openItem(page, '프로필 테두리', '남작 200');
    await buyButton(page).click();
    await expect(st.detail(page).getByText(DONE)).toBeVisible();

    await page.goto('/mypage');
    await page.getByRole('button', { name: '프로필 수정', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '프로필 수정' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: '테두리 수정' }).click();
    const grid = dialog.getByRole('region', { name: '프로필 테두리 목록' });
    // 가진 테두리 = 기본 평민(끼워져 있음) + 산 남작 → 산 것은 기본 뒤에 붙어 안 눌린 칸 중 마지막
    await expect(grid.locator('button[aria-pressed="false"]')).not.toHaveCount(0);
    await grid.locator('button[aria-pressed="false"]').last().click();
    await dialog.getByRole('button', { name: '수정하기' }).click();
    await expect.poll(async () => (await st.loadout(account.uuid))?.selected_profile_border_id ?? '').toBe('profile-border-남작');
});
