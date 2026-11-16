'use strict';

// 관리자 운영 현황 브라우저 시험 (휴대폰 크기 375×812) — 숫자 카드가 화면 폭 안에 보이고 가로로 넘치지 않음
// 목록 시험목록/A14-관리자.md 번호 A14-E-081 — 모임만: npx playwright test --list tests/admin/phone/a14-dashboard.spec.js
const { test, expect } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const k = require('../_a14-kit');

const { E } = k;
const TITLES = ['새 신고', '새 문의', '전체 가입자', '오늘 총 판 수', '지금 진행 중 판', '지금 접속', '점검'];
const PHONE_WIDTH = 375;

test(`${E(81)} 휴대폰 크기 운영 현황 → 숫자 카드, 가로 넘침 없음 @smoke`, async ({ browser }) => {
    const w = await k.openAdmin(browser, { phone: true });
    try {
        await expect(k.heading(w.page, '운영 현황')).toBeVisible();
        for (const title of TITLES) {
            const card = w.page.getByRole('listitem').filter({ has: w.page.getByRole('heading', { name: title, exact: true }) });
            await expect(card).toHaveCount(1);
            await expectReadable(card.getByRole('heading', { name: title, exact: true }));
            const box = await card.boundingBox();
            expect(box.x + box.width, `${title} 카드가 화면 폭 안`).toBeLessThanOrEqual(PHONE_WIDTH + 1);
        }
        await k.expectNoSideScroll(w.page);
    } finally {
        await w.close();
    }
});
