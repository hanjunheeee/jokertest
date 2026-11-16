'use strict';

// 관리자 결제 환불 브라우저 시험 (PC 크기) — 지급된 충전 주문 환불(사유) → "환불됨", 플레이어 상점 다이아가 그만큼 줄어듦 / 다이아를 다 쓴 주문은 멈춤 글·상태 그대로
// 목록 시험목록/A14-관리자.md 번호 A14-E-084~085 — 주문 줄은 시험 DB에 바로 넣음(결제창 안 거침) / 모임만: npx playwright test --list tests/admin/a14-payments.spec.js
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { query } = require('../../helpers/db');
const store = require('../store/store-tools');
const k = require('./_a14-kit');

const { E, U } = k;
const statusCell = (page) => page.getByTestId('order-status');

// 지급된 충전 주문 하나 (주문 줄만, 다이아는 따로) → { orderId, needed: 되돌릴 다이아 }
async function grantedOrder(uuid) {
    const { orderId } = await store.createTopupOrder(uuid, { status: 'GRANTED' });
    const [order] = await query('SELECT grant_amount, bonus_amount FROM economy_topup_orders WHERE order_id = ?', [orderId]);
    return { orderId, needed: Number(order.grant_amount) + Number(order.bonus_amount) };
}

// 주문 화면 → 환불 → 사유 → 확인 창 "환불" 누름 → 창
async function refundUi(page, orderId, reason) {
    await page.goto(`/payments/orders/${orderId}`);
    await expect(statusCell(page)).toHaveText('지급됨');
    await page.getByRole('button', { name: '환불', exact: true }).click();
    const box = k.dialog(page, '이 주문을 환불할까요?');
    await box.getByLabel('사유', { exact: true }).fill(reason);
    await box.getByRole('button', { name: '환불', exact: true }).click();
    return box;
}

test(`${E(84)} 지급된 주문 환불(사유) → "환불됨", 플레이어 다이아가 그만큼 줄어듦 @smoke`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const { orderId, needed } = await grantedOrder(U(player));
    await store.grant(U(player), 'DIAMOND', needed);
    const before = (await store.wallet(U(player))).diamond;
    await store.gotoStore(player.page);
    await expect(store.balance(player.page, '다이아', before)).toBeVisible();
    const w = await k.openAdmin(browser);
    try {
        const box = await refundUi(w.page, orderId, '사용자 요청 환불');
        await expect(box).toBeHidden();
        await expect(statusCell(w.page)).toHaveText('환불됨');
        await expectReadable(statusCell(w.page));
        await expect(w.page.getByRole('status').filter({ hasText: '환불했어요.' })).toContainText(`다이아 -${needed}`);
    } finally {
        await w.close();
    }
    expect((await store.wallet(U(player))).diamond).toBe(before - needed);
    await store.gotoStore(player.page);
    await expect(store.balance(player.page, '다이아', before - needed)).toBeVisible();
});

test(`${E(85)} 다이아를 다 쓴 주문 환불 → 멈춤 글, 상태 "지급됨" 그대로`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const { orderId, needed } = await grantedOrder(member.uuid);
    const w = await k.openAdmin(browser);
    try {
        // 지갑 다이아를 되돌릴 양보다 하나 적게 (다 써 버린 것과 같음)
        const now = (await store.wallet(member.uuid)).diamond;
        if (now !== needed - 1) {
            await k.adminApi(w.page, 'POST', `/members/${member.uuid}/wallet/adjust`, {
                requestId: crypto.randomUUID(), currency: 'DIAMOND', amount: needed - 1 - now, reason: '시험 준비',
            });
        }
        const box = await refundUi(w.page, orderId, '다 쓴 주문 환불');
        const refused = box.getByRole('alert');
        await expect(refused).toContainText('다이아가 모자라 환불을 멈췄어요.');
        await expectReadable(refused);
        await box.getByRole('button', { name: '취소', exact: true }).click();
        await expect(statusCell(w.page)).toHaveText('지급됨');
        await w.page.reload();
        await expect(statusCell(w.page)).toHaveText('지급됨');
        expect((await store.wallet(member.uuid)).diamond).toBe(needed - 1);
    } finally {
        await w.close();
    }
});
