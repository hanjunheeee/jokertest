'use strict';

// 관리자 신고 처리 브라우저 시험 (휴대폰 크기 375×812) — 신고 카드 → 상세 → 정지 → "처리됨"
// 목록 시험목록/A14-관리자.md 번호 A14-E-039 — 신고 줄은 시험 DB에 바로 넣음 / 모임만: npx playwright test --list tests/admin/phone/a14-reports.spec.js
const { test, expect } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const k = require('../_a14-kit');

const { E } = k;

test(`${E(39)} 휴대폰 크기 신고 상세 → 정지 → 처리됨 @smoke`, async ({ browser, accounts }) => {
    const [reporter, target] = await accounts.createMany(2);
    const reportId = await k.insertReport({ reporter, target });
    const w = await k.openAdmin(browser, { phone: true });
    try {
        await k.goMenu(w.page, '신고');
        const card = w.page.getByRole('list', { name: '신고 목록' }).getByRole('listitem').filter({ hasText: target.nickname });
        await expect(card).toHaveCount(1);
        await card.getByRole('link').click();
        await expect(w.page.getByRole('heading', { level: 1, name: `신고 #${reportId}` })).toBeVisible();
        await w.page.getByRole('button', { name: '정지', exact: true }).click();
        const box = k.dialog(w.page, '정지하고 신고 처리');
        await box.getByLabel('정지 사유', { exact: true }).fill('욕설');
        await box.getByRole('button', { name: '정지', exact: true }).click();
        await expect(box).toBeHidden();
        await expectReadable(w.page.getByRole('status').filter({ hasText: '정지하고 신고를 처리했어요.' }));
        await expect(w.page.locator('dl').first()).toContainText('처리됨');
        await k.expectNoSideScroll(w.page);
    } finally {
        await w.close();
    }
});
