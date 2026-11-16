'use strict';

// 신고 → 정지 → 판 밖으로 어려운 브라우저 시험 (관리자 PC 창 + 사람 2 + 봇 8 = 10명 판) — 판 중 ㄱ이 ㄴ 신고 → 관리자 정지 처리 → ㄴ 창 튕김, ㄱ 판 계속, 신고 "처리됨"
// 목록 시험목록/A14-관리자.md 번호 A14-H-009 — 모임만: npx playwright test --list tests/admin/a14-report-ban-in-game.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const A = require('../ingame/_a04-multi');
const N = require('../ingame/b-night/_night');
const k = require('./_a14-kit');

const { H, U, TEXT } = k;

test(`${H(9)} 10명 판 중 ㄱ이 ㄴ 신고 → 관리자 정지 처리 → ㄴ 창 튕김, ㄱ 판 계속, 신고 "처리됨" @game @hard @smoke`, async ({ browser, players, table }) => {
    test.setTimeout(300_000);
    const a = await k.openPlayer(players);
    const b = await k.openPlayer(players);
    const t = await A.openTable(table, { humans: [a, b], bots: 8, roles: A.plainRoles() });
    expect((await t.state()).players).toHaveLength(10);
    await N.toDay(t);
    await A.calm(a.page);
    const reportId = await k.reportInGame(a, { target: b, gameId: t.gameId, memo: '판에서 욕함' });

    const w = await k.openAdmin(browser);
    try {
        await w.page.goto(`/reports/${reportId}`);
        await expect(w.page.getByRole('heading', { level: 1, name: `신고 #${reportId}` })).toBeVisible();
        await w.page.getByRole('button', { name: '정지', exact: true }).click();
        const box = k.dialog(w.page, '정지하고 신고 처리');
        await box.getByLabel('정지 사유', { exact: true }).fill('판 중 욕설');
        const pushed = await ui.captureAlert(b.page, () => box.getByRole('button', { name: '정지', exact: true }).click());
        expect(pushed).toContain(TEXT.bannedPush);
        await expect(b.page).toHaveURL(/\/login/);
        await expectReadable(w.page.getByRole('status').filter({ hasText: '정지하고 신고를 처리했어요.' }));
        await expect(w.page.locator('dl').first()).toContainText('처리됨');
    } finally {
        await w.close();
    }
    // ㄱ은 판 화면 그대로, 판도 끝나지 않음
    await expect(a.page).toHaveURL(/\/ingame/);
    const s = await t.state();
    expect(s?.phase).not.toBe('ENDED');
    expect(s.players.find((p) => p.uuid === U(a))?.alive).toBe(true);
});
