'use strict';

// 관리자 통계 브라우저 시험 (PC 크기) — 기간을 7일로 고르면 날짜별 막대가 7개
// 목록 시험목록/A14-관리자.md 번호 A14-E-082 — 모임만: npx playwright test --list tests/admin/a14-stats.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('./_a14-kit');

const { E } = k;
const DAY_MS = 24 * 60 * 60 * 1000;

test(`${E(82)} 통계 기간 7일(오늘 포함) 고름 → 막대 7개 @smoke`, async ({ browser }) => {
    const w = await k.openAdmin(browser);
    try {
        await k.goMenu(w.page, '통계');
        await expect(k.heading(w.page, '통계')).toBeVisible();
        await w.page.getByLabel('시작 날짜', { exact: true }).fill(k.kstDay(Date.now() - 6 * DAY_MS));
        await w.page.getByLabel('끝 날짜', { exact: true }).fill(k.kstDay(Date.now()));
        await w.page.getByRole('button', { name: '보기', exact: true }).click();
        const chart = w.page.getByRole('img', { name: '가입 수 날짜별 막대' });
        await expect(chart.locator('rect[data-date]')).toHaveCount(7);
        await expect(chart.locator('rect[data-date]').first()).toHaveAttribute('data-date', k.kstDay(Date.now() - 6 * DAY_MS));
        await expect(chart.locator('rect[data-date]').last()).toHaveAttribute('data-date', k.kstDay(Date.now()));
        await expect(k.listRows(w.page, '날짜별 통계')).toHaveCount(7);
        await expectReadable(w.page.getByText('가입 수', { exact: true }));
    } finally {
        await w.close();
    }
});
