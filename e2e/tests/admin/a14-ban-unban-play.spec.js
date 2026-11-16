'use strict';

// 정지 → 해제 → 다시 판 어려운 브라우저 시험 (관리자 PC 창 + 사람 1 + 봇 4 = 5명 판) — 로비 플레이어 정지·튕김 → 해제 → 로그인 → 판 시작·역할 확인까지
// 목록 시험목록/A14-관리자.md 번호 A14-H-004 — 모임만: npx playwright test --list tests/admin/a14-ban-unban-play.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const A = require('../ingame/_a04-multi');
const k = require('./_a14-kit');

const { H, U, TEXT } = k;

test(`${H(4)} 로비 플레이어 정지 → 튕김 → 해제 → 로그인 → 5명 판 시작·역할 확인 @game @hard @smoke`, async ({ browser, players, table }) => {
    test.setTimeout(240_000);
    const player = await k.openPlayer(players);
    const w = await k.openAdmin(browser);
    try {
        const reason = `잠깐 정지 ${k.rand()}`;
        const box = await k.banUi(w.page, player, { days: 3, reason });
        const pushed = await ui.captureAlert(player.page, () => k.confirmBan(w.page, box));
        expect(pushed).toContain(TEXT.bannedPush);
        await expect(player.page).toHaveURL(/\/login/);
        expect(await k.loginAlert(player.page, player.account)).toBe(TEXT.bannedLogin(reason));

        const lift = await k.reasonDialog(w.page, player, '제재 해제', '제재 해제', '오해로 해제');
        await lift.getByRole('button', { name: '해제하기' }).click();
        await expect(lift).toBeHidden();
    } finally {
        await w.close();
    }
    await k.loginUi(player.page, player.account);
    await expect(player.page).toHaveURL(/\/lobby/);
    await ui.skipIntro(player.page);

    // 해제 뒤 바로 판: 사람 시민 + 봇 4 (첫 봇 광대)
    const t = await table.setup({ humans: [player], bots: 4, roles: A.plainRoles() });
    await A.expectRoles(t, { [U(player)]: 'CITIZEN' });
    const dialog = player.page.getByRole('dialog', { name: '내 역할 보기' });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expectReadable(dialog.getByText(ui.ROLE_LABELS.CITIZEN, { exact: true }));
    expect(await ui.readRoleReveal(player.page)).toBe(ui.ROLE_LABELS.CITIZEN);
    expect((await t.state()).players).toHaveLength(5);
});
