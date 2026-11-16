'use strict';

// 관리자 문의 답 브라우저 시험 (휴대폰 크기 375×812) — 휴대폰에서 문의 카드 → 답 → 플레이어 알림(종)에 답 알림
// 목록 시험목록/A14-관리자.md 번호 A14-E-063 — 문의는 플레이어 API로 씀 / 모임만: npx playwright test --list tests/admin/phone/a14-inquiries.spec.js
const { test, expect } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const k = require('../_a14-kit');

const { E } = k;

test(`${E(63)} 휴대폰 크기 문의 답 → 플레이어 알림 @smoke`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const { title } = await k.createInquiry(player);
    const w = await k.openAdmin(browser, { phone: true });
    try {
        await k.goMenu(w.page, '문의');
        const card = w.page.getByRole('list', { name: '문의 목록' }).getByRole('listitem').filter({ hasText: title });
        await expect(card).toHaveCount(1);
        await card.getByRole('link', { name: title }).click();
        await expect(k.heading(w.page, title)).toBeVisible();
        await w.page.getByLabel('답', { exact: true }).fill('휴대폰에서 단 답');
        await w.page.getByRole('button', { name: '답 보내기' }).click();
        await expectReadable(w.page.getByRole('status').filter({ hasText: '답을 달았어요.' }));
    } finally {
        await w.close();
    }
    const bell = await k.openBell(player.page);
    const item = k.bellItems(bell, title).filter({ hasText: '문의에 답이 왔어요' });
    await expect(item).toHaveCount(1);
    await expectReadable(item.getByText('문의에 답이 왔어요', { exact: true }));
});
