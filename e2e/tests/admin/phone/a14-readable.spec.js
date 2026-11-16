'use strict';

// 관리자 화면 "보임" 브라우저 시험 (휴대폰 크기 375×812) — 정지 확인 창 단추가 화면 안·누르는 곳 44px 이상, 메뉴 서랍이 닫히고 화면 제목이 읽힘
// 목록 시험목록/A14-관리자.md 번호 A14-E-089~090 — 모임만: npx playwright test --list tests/admin/phone/a14-readable.spec.js
const { test, expect } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const k = require('../_a14-kit');

const { E } = k;
const TOUCH_PX = 44;

test(`${E(89)} 휴대폰 정지 확인 창 단추가 화면 안, 누르는 곳 44px 이상 @smoke`, async ({ browser, accounts }) => {
    const member = await accounts.create();
    const w = await k.openAdmin(browser, { phone: true });
    try {
        const box = await k.banUi(w.page, member, { days: 7, reason: '휴대폰 보임 확인' });
        for (const name of ['취소', '정지하기']) {
            const button = box.getByRole('button', { name, exact: true });
            const r = await expectReadable(button);
            expect(r.inViewport, `${name} 화면 안`).toBe(true);
            expect(r.rect.height, `${name} 높이`).toBeGreaterThanOrEqual(TOUCH_PX);
            expect(r.rect.width, `${name} 너비`).toBeGreaterThanOrEqual(TOUCH_PX);
        }
    } finally {
        await w.close();
    }
});

test(`${E(90)} 휴대폰 메뉴 서랍 열고 "회원" 누름 → 서랍 닫히고 그 화면 제목이 읽힘`, async ({ browser }) => {
    const w = await k.openAdmin(browser, { phone: true });
    try {
        await w.page.getByRole('button', { name: '메뉴 열기' }).click();
        const menu = w.page.getByRole('navigation', { name: '관리자 메뉴' });
        await expect(menu).toBeVisible();
        await menu.getByRole('link', { name: '회원', exact: true }).click();
        await expect(menu).toHaveCount(0);
        await expect(w.page.getByRole('button', { name: '메뉴 닫기' })).toHaveCount(0);
        await expectReadable(k.heading(w.page, '회원'));
    } finally {
        await w.close();
    }
});
