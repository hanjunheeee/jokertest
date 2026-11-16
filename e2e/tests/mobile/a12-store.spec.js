'use strict';

// 모바일 상점 브라우저 시험: 잔액 부족이면 단추가 미리 꺼지고 바로 아래 "잔액이 부족합니다."(받은 버그 2)·서버 거절·끊김·지갑 못 받음·로그인 풀림 글, 폰 크기·가로, 사기·묶음, 쿠폰, 팔레트, 착용 시트
// 목록 A12 브라우저 간단 A12-E-081~093·103~107 (쓰는 동안 안 돌림: npx playwright test --list tests/mobile/a12-store.spec.js)
const { test, expect, E2E, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const st = require('../store/store-tools');

const M = Object.freeze({
    insufficient: '잔액이 부족합니다.',
    done: '구매가 완료되었습니다.',
    owned: '이미 보유한 상품입니다.',
    network: '인터넷 연결이 끊겨 구매 결과를 확인하지 못했습니다. 연결을 확인한 뒤 결과 확인을 눌러 주세요.',
    authLost: '구매 중 로그인이 풀려 결과를 확인하지 못했습니다. 다시 로그인한 뒤 결과 확인을 눌러 주세요.',
    walletError: '보유 재화를 불러오지 못해 구매할 수 없습니다. 보유 재화 칸의 재시도를 눌러 주세요.',
    saved: '팔레트를 저장했습니다.',
    conflict: '팔레트가 다른 곳에서 먼저 변경되어 최신 값을 불러왔습니다. 확인한 뒤 다시 저장해 주세요.',
});
const SKIN = Object.freeze({ slot: '귀족 블러드 500', id: 'player-skin-귀족1-블러드', price: 500 });
const SKIN2 = Object.freeze({ slot: '귀족 로코코 500', id: 'player-skin-귀족2-로코코', price: 500 });
const BULK_URL = `${E2E.apiUrl}/economy/purchases/bulk`;
const COUPON_URL = `${E2E.apiUrl}/economy/coupons/redeem`;

const buyButton = (page, name = '구매') => st.detail(page).getByRole('button', { name, exact: true });
const blockReason = (page) => st.detail(page).getByTestId('purchase-block-reason');

/** 모바일 상점 열기 (입장 영상 건너뛰기 → 위 줄 "쿠폰"이 보일 때까지) */
async function gotoStore(page, path = '/store') {
    await page.goto(path);
    await ui.skipIntro(page);
    await expect(page.getByRole('button', { name: '쿠폰', exact: true })).toBeVisible();
}

/** 상점 열고 분류·칸 고름 */
async function openItem(page, category, slot) {
    await gotoStore(page);
    await st.pickCategory(page, category);
    await st.pickItem(page, slot);
}

/**
 * 같은 브라우저 새 탭이 붙으면 옛 탭에 뜨는 "다른 창에서 접속" 안내 창 닫기
 * 모바일은 알림이 양피지 창이라 화면을 덮어 단추를 못 누름 (PC는 브라우저 대화상자라 알아서 닫힘), 안 뜨면 그냥 지나감
 */
async function closeOtherTabNotice(page) {
    const notice = page.getByRole('alertdialog', { name: '안내' });
    const shown = await notice.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (!shown) return;
    await notice.getByRole('button', { name: '확인' }).click();
    await expect(notice).toHaveCount(0);
}

/** 글이 단추 "바로 아래"인지: 단추 아래쪽에서 시작하고 사이가 60px 안 */
async function expectRightBelow(notice, button) {
    const n = await notice.boundingBox();
    const b = await button.boundingBox();
    expect(n, '글 자리 못 잼').not.toBeNull();
    expect(b, '단추 자리 못 잼').not.toBeNull();
    expect(n.y).toBeGreaterThanOrEqual(b.y + b.height - 2);
    expect(n.y - (b.y + b.height)).toBeLessThan(60);
}

/** E-081 모양: 골드 0 계정이 500골드 스킨 → 단추 꺼짐 + 바로 아래 "잔액이 부족합니다."가 읽힘 */
async function expectZeroGoldNotice(page) {
    await openItem(page, '스킨', SKIN.slot);
    await expect(st.balance(page, '골드', 0)).toBeVisible();
    await expect(buyButton(page)).toBeDisabled();
    await expect(blockReason(page)).toHaveText(M.insufficient);
    await expectReadable(blockReason(page));
    await expectRightBelow(blockReason(page), buyButton(page));
}

/** 쿠폰은 같은 ip 10분 30번 제한 → 이 화면의 쿠폰 요청만 시험마다 다른 ip로 (서버는 프록시 1단 뒤 주소를 믿음) */
async function spreadCouponIp(page) {
    const n = () => 1 + Math.floor(Math.random() * 250);
    const ip = `10.${n()}.${n()}.${n()}`;
    await page.route(COUPON_URL, (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }));
}

/** 위 줄 "쿠폰" → 코드 넣고 사용하기 → 창 */
async function redeem(page, code) {
    await page.getByRole('button', { name: '쿠폰', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '쿠폰 입력' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: '쿠폰 코드' }).fill(code);
    await dialog.getByRole('button', { name: '사용하기' }).click();
    return dialog;
}

// 팔레트 화면 칸
const slot = (page, n) => page.getByRole('group', { name: '팔레트 슬롯' }).getByRole('button', { name: `${n}번 슬롯`, exact: true });
const slotEmoji = (page, n) => slot(page, n).locator('img');
async function slotNames(page) {
    const names = [];
    for (let n = 1; n <= 8; n += 1) names.push(await slotEmoji(page, n).getAttribute('alt'));
    return names;
}
/** 마이페이지 → "이모티콘" → 팔레트 화면 (불러오기 끝날 때까지) */
async function openPalette(page) {
    await page.goto('/mypage');
    await page.getByRole('button', { name: '이모티콘', exact: true }).click();
    await expect(page).toHaveURL(/\/mypage\/emoticons$/);
    await expect(slot(page, 1)).toBeEnabled();
    await expect(slotEmoji(page, 1)).toHaveAttribute('alt', /.+/);
}
/** a번 칸에 b번 칸 것을 넣음 (둘이 자리를 바꿈) */
async function swap(page, a, b) {
    const name = await slotEmoji(page, b).getAttribute('alt');
    await slot(page, a).click();
    await page.getByRole('list', { name: '이모티콘 목록' }).getByRole('button', { name: `${name} 팔레트에 넣기`, exact: true }).click();
    await expect(slotEmoji(page, a)).toHaveAttribute('alt', name);
}

test('A12-E-081 [버그 2] 골드 0 계정이 스킨을 고름 → 단추 꺼짐 + 바로 아래 "잔액이 부족합니다."가 읽힘 (모바일) @smoke @safari', async ({ user }) => {
    await expectZeroGoldNotice(user.page);
});

for (const [id, gold, enabled] of [['A12-E-082', 499, false], ['A12-E-083', 500, true]]) {
    test(`${id} [버그 2] 골드 ${gold} + 500골드 스킨 → ${enabled ? '단추 켜짐, 까닭 줄 없음' : '단추 꺼짐 + "잔액이 부족합니다." 읽힘'} (모바일)`, async ({ user }) => {
        const { page, account } = user;
        await st.grant(account.uuid, 'GOLD', gold);
        await openItem(page, '스킨', SKIN.slot);
        await expect(st.balance(page, '골드', gold)).toBeVisible();
        if (enabled) {
            await expect(buyButton(page)).toBeEnabled();
            await expect(blockReason(page)).toHaveCount(0);
        } else {
            await expect(buyButton(page)).toBeDisabled();
            await expect(blockReason(page)).toHaveText(M.insufficient);
            await expectReadable(blockReason(page));
        }
    });
}

test('A12-E-084 다른 탭에서 같은 스킨을 먼저 삼 → 이 탭에서 구매 → "이미 보유한 상품입니다."가 단추 아래 읽힘 (모바일)', async ({ user }) => {
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    await openItem(page, '스킨', SKIN.slot);
    const other = await context.newPage();
    await openItem(other, '스킨', SKIN.slot);
    await buyButton(other).click();
    await expect(st.detail(other).getByText(M.done)).toBeVisible();

    // 새 탭이 붙어 이 탭에 뜬 안내 창부터 닫음 (화면을 덮음)
    await closeOtherTabNotice(page);
    await buyButton(page).click();
    const notice = st.detail(page).getByText(M.owned);
    await expectReadable(notice);
    await expectRightBelow(notice, buyButton(page));
});

test('A12-E-085 구매 요청만 인터넷 끊김 → 우리말 끊김 글이 읽힘, "Failed to fetch" 같은 영어 없음 (모바일) @safari', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 500);
    await openItem(page, '스킨', SKIN.slot);
    await page.route(BULK_URL, (route) => route.abort('internetdisconnected'));
    await buyButton(page).click();
    await expectReadable(st.detail(page).getByText(M.network));
    await expect(page.getByText(/Failed to fetch|Load failed|NetworkError/i)).toHaveCount(0);
});

test('A12-E-086 지갑 요청만 500 → 단추 꺼짐 + 까닭 글이 읽힘 (모바일)', async ({ user }) => {
    const { page, account } = user;
    await page.route(`${E2E.apiUrl}/economy/accounts/${account.uuid}/wallet`, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'x' }) }));
    await openItem(page, '스킨', SKIN.slot);
    await expect(buyButton(page)).toBeDisabled();
    await expect(blockReason(page)).toHaveText(M.walletError);
    await expectReadable(blockReason(page));
});

test('A12-E-087 구매 직전 로그인 쿠키 지움 → 구매 → 다시 로그인 → 상점에 로그인 풀림 안내가 읽힘 (모바일)', async ({ user }) => {
    const { page, account, context } = user;
    await st.grant(account.uuid, 'GOLD', 500);
    await openItem(page, '스킨', SKIN.slot);
    await context.clearCookies();
    await buyButton(page).click();
    await expect(page).toHaveURL(/\/login/);
    await ui.loginViaUi(page, account);
    await gotoStore(page);
    await expectReadable(st.detail(page).getByText(M.authLost));
});

for (const [id, width, height] of [['A12-E-088', 375, 667], ['A12-E-089', 390, 844], ['A12-E-090', 360, 640]]) {
    test(`${id} 폰 ${width}×${height}에서 E-081 글("잔액이 부족합니다.")이 화면 안에서 읽힘`, async ({ user }) => {
        await user.page.setViewportSize({ width, height });
        await expectZeroGoldNotice(user.page);
    });
}

test('A12-E-091 "잔액이 부족합니다." 글이 뜬 채 가로로 돌림(812×375) → 글이 남고 읽힘', async ({ user }) => {
    const { page } = user;
    await expectZeroGoldNotice(page);
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(blockReason(page)).toHaveText(M.insufficient);
    await expectReadable(blockReason(page));
});

test('A12-E-092 남작 테두리 삼 → "보유중", 골드 200 줄어듦 (모바일)', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    await openItem(page, '프로필 테두리', '남작 200');
    await buyButton(page).click();
    await expect(st.detail(page).getByText(M.done)).toBeVisible();
    await expect(buyButton(page, '보유중')).toBeDisabled();
    await expect(st.balance(page, '골드', 800)).toBeVisible();
    expect(await st.owned(account.uuid)).toContain('profile-border-남작');
});

test('A12-E-093 일괄구매로 스킨 둘 삼 → 둘 다 보유 (모바일)', async ({ user }) => {
    const { page, account } = user;
    await st.grant(account.uuid, 'GOLD', 1000);
    await openItem(page, '스킨', SKIN.slot);
    await page.getByRole('button', { name: '일괄구매' }).click();
    await page.getByRole('button', { name: SKIN2.slot, exact: true }).click();
    await buyButton(page).click();
    const dialog = page.getByRole('dialog', { name: '선택 상품 구매 확인' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '구매하기' }).click();
    await expect(dialog.getByText(M.done)).toBeVisible();
    await expect.poll(async () => (await st.wallet(account.uuid)).gold).toBe(0);
    const owned = await st.owned(account.uuid);
    expect(owned).toContain(SKIN.id);
    expect(owned).toContain(SKIN2.id);
});

test('A12-E-103 위 줄 "쿠폰" → 맞는 코드 → 골드 300 늘어남 (모바일)', async ({ user }) => {
    const { page, account } = user;
    await spreadCouponIp(page);
    const code = await st.createCoupon({ amount: 300 });
    await gotoStore(page);
    const dialog = await redeem(page, code);
    await expect(dialog.getByRole('status')).toHaveText('골드 300개를 받았습니다.');
    await expectReadable(dialog.getByRole('status'));
    await expect(st.balance(page, '골드', 300)).toBeVisible();
    expect((await st.wallet(account.uuid)).gold).toBe(300);
});

test('A12-E-104 이미 쓴 쿠폰 → "이미 사용한 쿠폰입니다."가 읽힘, 골드 그대로 (모바일)', async ({ user }) => {
    const { page, account } = user;
    await spreadCouponIp(page);
    const code = await st.createCoupon({ amount: 300 });
    await gotoStore(page);
    const dialog = await redeem(page, code);
    await expect(dialog.getByRole('status')).toHaveText('골드 300개를 받았습니다.');
    await dialog.getByRole('textbox', { name: '쿠폰 코드' }).fill(code);
    await dialog.getByRole('button', { name: '사용하기' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('이미 사용한 쿠폰입니다.');
    await expectReadable(dialog.getByRole('alert'));
    expect((await st.wallet(account.uuid)).gold).toBe(300);
});

test('A12-E-105 마이페이지 이모티콘 → 칸 바꿔 저장 → 다시 열면 그대로 (모바일)', async ({ user }) => {
    const { page } = user;
    await openPalette(page);
    const before = await slotNames(page);
    await swap(page, 3, 1);
    const expected = [...before];
    [expected[0], expected[2]] = [before[2], before[0]];
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expectReadable(page.getByText(M.saved));
    await page.getByRole('dialog').getByRole('button', { name: '확인', exact: true }).click();
    await openPalette(page);
    expect(await slotNames(page)).toEqual(expected);
});

test('A12-E-106 두 탭 팔레트 저장 → 늦은 탭에 충돌 안내가 읽힘 (모바일)', async ({ user }) => {
    const { page, context } = user;
    const other = await context.newPage();
    await openPalette(page);
    await openPalette(other);
    // 새 탭이 붙어 첫 탭에 뜬 안내 창부터 닫음 (화면을 덮음)
    await closeOtherTabNotice(page);
    await swap(page, 2, 1);
    const firstSaved = await slotNames(page);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByText(M.saved)).toBeVisible();

    await swap(other, 4, 3);
    await other.getByRole('button', { name: '저장', exact: true }).click();
    await expectReadable(other.getByText(M.conflict));
    expect(await slotNames(other)).toEqual(firstSaved);
});

test('A12-E-107 [지금 동작] 착용 시트 → 안 산 스킨(귀족-블러드)은 미보유로 못 고름 (모바일)', async ({ user }) => {
    const { page } = user;
    await page.goto('/mypage');
    await page.getByRole('button', { name: '스킨&카드 착용', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: '스킨&카드 착용' });
    await expect(sheet).toBeVisible();
    const locked = sheet.getByRole('button', { name: '귀족-블러드, 미보유', exact: true });
    await expect(locked).toBeDisabled();
    await locked.click({ force: true });
    await expect(locked).toHaveAttribute('aria-pressed', 'false');
});
