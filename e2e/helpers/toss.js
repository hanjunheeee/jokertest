'use strict';

// 토스 결제창 파일, 시험 키(test_ck_)로 상점 다이아 충전 결제창(토스 샌드박스 iframe)을 열고 닫기만
// 카드·간편결제 고르기·카드 번호 입력·결제 완료는 절대 안 함 (README '토스 결제창'), store·mobile 시험이 씀
const { expect } = require('@playwright/test');

const TOSS_HOST = 'tosspayments.com';

/**
 * 상점 → 인게임 재화 → 다이아 상품 고르고 충전 → 토스 결제창 iframe이 뜰 때까지
 * @param {import('@playwright/test').Page} page 로그인된 page
 * @param {object} [o]
 * @param {string|RegExp} [o.product=/다이아 10개/] 상품 버튼 이름
 * @returns {Promise<import('@playwright/test').Frame>} 토스 결제창 frame (읽기만)
 */
async function openTossWindow(page, { product = /다이아 10개/, gotoStore = true } = {}) {
    if (gotoStore) await page.goto('/store');
    await page.getByRole('button', { name: '인게임 재화' }).click();
    await page.getByRole('button', { name: product }).first().click();
    await page.getByRole('button', { name: '충전' }).click();
    const frame = await waitTossFrame(page);
    await expect(frame.getByRole('heading', { name: /결제 방법/ })).toBeVisible({ timeout: 20000 });
    return frame;
}

async function waitTossFrame(page, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const frame = page.frames().find((f) => f.url().includes(TOSS_HOST));
        if (frame) return frame;
        await page.waitForTimeout(200);
    }
    throw new Error('토스 결제창이 안 뜸 (시험 키·네트워크 확인)');
}

/** 결제창 닫기 (창 안 닫기 버튼) → iframe이 사라질 때까지 */
async function closeTossWindow(page) {
    const frame = await waitTossFrame(page, 5000);
    await frame.getByRole('button', { name: /닫기|close|취소/i }).first().click();
    await expect.poll(() => page.frames().some((f) => f.url().includes(TOSS_HOST)), { timeout: 10000 }).toBe(false);
}

module.exports = { openTossWindow, closeTossWindow, waitTossFrame, TOSS_HOST };
