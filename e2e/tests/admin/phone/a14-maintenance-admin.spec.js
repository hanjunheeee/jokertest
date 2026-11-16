'use strict';

// 관리자 점검 화면 브라우저 시험 (휴대폰 크기 375×812) — 휴대폰에서 점검 예약 → "예약됨" → 끄기 → "예약 전"
// 목록 시험목록/A14-관리자.md 번호 A14-E-048 — 점검은 서버 전체에 걸려 @serial(admin-phone-serial), 끝에 꼭 끔 / 모임만: npx playwright test --list tests/admin/phone/a14-maintenance-admin.spec.js
const { test, expect } = require('../../../helpers/fixtures');
const { expectReadable } = require('../../../helpers/visible');
const k = require('../_a14-kit');

const { E } = k;
const stage = (page) => page.getByTestId('maintenance-stage');

test(`${E(48)} 휴대폰 크기 점검 예약 → 끄기 @serial @smoke`, async ({ browser }) => {
    const w = await k.openAdmin(browser, { phone: true });
    try {
        await k.maintenanceOff(w.page);
        await k.goMenu(w.page, '점검');
        await expect(k.heading(w.page, '점검')).toBeVisible();
        await w.page.getByLabel('시작 시각 (한국 시각)', { exact: true }).fill(k.kstInput(Date.now() + 30 * 60 * 1000));
        await w.page.getByLabel('안내 문구', { exact: true }).fill('휴대폰 점검 시험');
        await w.page.getByRole('button', { name: '점검 예약하기', exact: true }).click();
        const box = k.dialog(w.page, '점검을 예약할까요?');
        await box.getByRole('button', { name: '예약하기', exact: true }).click();
        await expect(box).toBeHidden();
        await expect(stage(w.page)).toHaveText('3단계 · 예약됨');
        await expectReadable(stage(w.page));

        await w.page.getByRole('button', { name: '점검 끄기', exact: true }).click();
        const off = k.dialog(w.page, '점검을 끌까요?');
        await expectReadable(off.getByRole('button', { name: '끄기', exact: true }));
        await off.getByRole('button', { name: '끄기', exact: true }).click();
        await expect(off).toBeHidden();
        await expect(stage(w.page)).toHaveText('1단계 · 예약 전');
        await k.expectNoSideScroll(w.page);
    } finally {
        await k.maintenanceOff(w.page).catch(() => {});
        await w.close();
    }
});
