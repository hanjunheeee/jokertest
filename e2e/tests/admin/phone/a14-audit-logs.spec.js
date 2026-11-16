'use strict';

// 관리자 처리 이력 브라우저 시험 (휴대폰 크기 375×812) — 휴대폰에서 이력이 카드로 보이고 가로로 넘치지 않음
// 목록 시험목록/A14-관리자.md 번호 A14-E-079 — 모임만: npx playwright test --list tests/admin/phone/a14-audit-logs.spec.js
const { test, expect } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const k = require('../_a14-kit');

const { E } = k;

test(`${E(79)} 휴대폰 크기 처리 이력 → 카드, 가로 넘침 없음 @smoke`, async ({ browser }) => {
    const w = await k.openAdmin(browser, { phone: true });
    try {
        const cards = await k.auditRows(w.page, w.admin);
        await expect(w.page.getByRole('table')).toHaveCount(0);
        const login = cards.filter({ hasText: '로그인' });
        await expect(login.first()).toBeVisible();
        await expect(login.first()).toContainText(`처리: ${w.admin.loginId}`);
        await expectReadable(login.first().getByText('로그인', { exact: true }));
        await k.expectNoSideScroll(w.page);
    } finally {
        await w.close();
    }
});
