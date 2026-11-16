'use strict';

// 관리자 두 명이 같은 신고를 거의 같이 처리하는 어려운 브라우저 시험 (관리자 PC 창 2 + 사람 1 + 봇 6 = 7명 판) — 하나만 되고 늦은 창엔 "이미 처리했어요"·누가
// 목록 시험목록/A14-관리자.md 번호 A14-H-002 — 모임만: npx playwright test --list tests/admin/a14-reports-race.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const A = require('../ingame/_a04-multi');
const N = require('../ingame/b-night/_night');
const k = require('./_a14-kit');

const { H } = k;

// 신고 상세 열고 처리 확인 창까지 (누르기 직전) → 확인 단추
async function readyToHandle(page, reportId, kind) {
    await page.goto(`/reports/${reportId}`);
    await expect(page.getByRole('heading', { level: 1, name: `신고 #${reportId}` })).toBeVisible();
    if (kind === 'ban') {
        await page.getByRole('button', { name: '정지', exact: true }).click();
        const box = k.dialog(page, '정지하고 신고 처리');
        await box.getByLabel('정지 사유', { exact: true }).fill('동시 처리 시험');
        return box.getByRole('button', { name: '정지', exact: true });
    }
    await page.getByRole('button', { name: '기각', exact: true }).click();
    return k.dialog(page, '신고 기각').getByRole('button', { name: '기각', exact: true });
}

test(`${H(2)} 7명 판 신고 → 관리자 창 둘이 거의 같이 정지·기각 → 하나만 됨, 늦은 창 "이미 처리했어요"·누가 @game @hard @smoke`, async ({ browser, players, table }) => {
    test.setTimeout(240_000);
    const player = await k.openPlayer(players);
    const t = await A.openTable(table, { humans: [player], bots: 6, roles: A.plainRoles() });
    await N.toDay(t);
    const reportId = await k.reportInGame(player, { target: t.bots[2], gameId: t.gameId });
    const [ban, dismiss] = [await k.openAdmin(browser), await k.openAdmin(browser)];
    try {
        const pressBan = await readyToHandle(ban.page, reportId, 'ban');
        const pressDismiss = await readyToHandle(dismiss.page, reportId, 'dismiss');
        await Promise.all([pressBan.click(), pressDismiss.click()]);

        const done = { ban: '정지하고 신고를 처리했어요.', dismiss: '신고를 기각했어요.' };
        const notice = (w) => w.page.getByRole('status').filter({ hasText: /했어요\.$/ });
        await expect(notice(ban)).toBeVisible();
        await expect(notice(dismiss)).toBeVisible();
        const banText = await notice(ban).innerText();
        const dismissText = await notice(dismiss).innerText();
        const banWon = banText === done.ban;
        const dismissWon = dismissText === done.dismiss;
        expect(Number(banWon) + Number(dismissWon), `둘 중 하나만 됨 (정지 창: ${banText} / 기각 창: ${dismissText})`).toBe(1);

        // 늦은 창: 먼저 처리한 관리자 아이디가 보이는 "이미 처리했어요"
        const [late, winner] = banWon ? [dismiss, ban] : [ban, dismiss];
        const lateNotice = notice(late);
        await expect(lateNotice).toContainText('이미 처리했어요.');
        await expect(lateNotice).toContainText(winner.admin.loginId);
        await expectReadable(lateNotice);
        // 처리 결과는 이긴 쪽 그대로 (정지면 처리됨, 기각이면 기각)
        await expect(late.page.locator('dl').first()).toContainText(banWon ? '처리됨' : '기각');
    } finally {
        await ban.close();
        await dismiss.close();
    }
});
