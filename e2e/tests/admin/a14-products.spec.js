'use strict';

// 관리자 상품 값 바꾸기 브라우저 시험 (PC 크기) — 시험 상품 값을 관리자 화면에서 1,100원 → 1,300원으로 바꾸면 플레이어 상점 상품 칸에 새 값
// 목록 시험목록/A14-관리자.md 번호 A14-E-086 — 상점 상품 목록은 모두가 같이 봐서 @serial, 끝에 시험 상품은 판매 중지 / 모임만: npx playwright test --list tests/admin/a14-products.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const store = require('../store/store-tools');
const k = require('./_a14-kit');

const { E } = k;

test(`${E(86)} 상품 값 바꿈 → 플레이어 상점 새 값 @serial @smoke`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const productId = `e2e-a14-${k.rand(4)}`;
    const displayName = `시험다이아${k.rand(2)}`;
    const w = await k.openAdmin(browser);
    let made = null;
    try {
        made = (await k.adminApi(w.page, 'POST', '/products', {
            productId, kind: 'DIAMOND_TOPUP', displayName, payAmount: 1100, grantAmount: 11, bonusAmount: 0, status: 'ON_SALE', sortOrder: 0,
        })).product;
        await k.goMenu(w.page, '상품');
        await w.page.getByRole('button', { name: `${displayName} 고치기` }).click();
        const form = w.page.getByRole('form', { name: '상품 고치기' });
        await form.getByLabel('값(원)', { exact: true }).fill('1300');
        await form.getByRole('button', { name: '저장', exact: true }).click();
        await expect(w.page.getByRole('status').filter({ hasText: `'${displayName}' 저장했어요 (2판).` })).toBeVisible();
        await expect(k.listRows(w.page, '상품 목록').filter({ hasText: displayName })).toContainText('1,300원');

        await store.gotoStore(player.page);
        await store.pickCategory(player.page, '인게임 재화');
        await store.pickItem(player.page, displayName);
        const pay = store.detail(player.page).getByTestId('currency-pay');
        await expect(pay).toHaveText('1,300 원');
        await expectReadable(pay);
    } finally {
        // 시험 상품은 판매 중지 (지우는 길 없음)
        if (made) {
            const now = (await k.adminApi(w.page, 'GET', '/products')).items.find((p) => p.productId === productId);
            if (now) await k.adminApi(w.page, 'PATCH', `/products/${productId}`, { expectedVersion: now.version, status: 'STOPPED' }).catch(() => {});
        }
        await w.close();
    }
});
