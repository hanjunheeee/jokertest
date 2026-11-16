'use strict';

// 관리자 운영 현황 브라우저 시험 (PC 크기) — 10명 판이 도는 동안 "지금 진행 중 판" 1 이상·"오늘 총 판 수" 숫자
// 목록 시험목록/A14-관리자.md 번호 A14-E-080 — 모임만: npx playwright test --list tests/admin/a14-dashboard.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const A = require('../ingame/_a04-multi');
const k = require('./_a14-kit');

const { E } = k;

// 운영 현황 숫자 카드 (제목으로) → 큰 숫자 줄
const cardValue = (page, title) => page.getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) }).locator('p').first();
const numberOf = async (locator) => Number((await locator.innerText()).replace(/[^\d]/g, ''));

test(`${E(80)} 사람 1 + 봇 9 = 10명 판 진행 → 운영 현황 "지금 진행 중 판" 1 이상·"오늘 총 판 수" @game @smoke`, async ({ browser, players, table }) => {
    const player = await k.openPlayer(players);
    const t = await A.openTable(table, { humans: [player], bots: 9, roles: A.plainRoles() });
    expect((await t.state()).players).toHaveLength(10);
    const w = await k.openAdmin(browser);
    try {
        await expect(k.heading(w.page, '운영 현황')).toBeVisible();
        const live = cardValue(w.page, '지금 진행 중 판');
        await expect(live).toHaveText(/^[\d,]+판$/);
        expect(await numberOf(live)).toBeGreaterThanOrEqual(1);
        await expectReadable(live);
        const today = cardValue(w.page, '오늘 총 판 수');
        await expect(today).toHaveText(/^[\d,]+판$/);
        await expectReadable(today);
        // 아래 줄에 진행 중 숫자도 같이 (예: '끝난 판 7 · 진행 중 3')
        await expect(w.page.getByText(/^끝난 판 \d+ · 진행 중 \d+$/)).toBeVisible();
    } finally {
        await w.close();
    }
});
