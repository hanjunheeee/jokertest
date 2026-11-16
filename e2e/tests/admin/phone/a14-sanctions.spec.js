'use strict';

// 관리자 제재 브라우저 시험 (휴대폰 크기 375×812) — 휴대폰에서 영구 정지 → 플레이어 정지 안내 → 해제 → 플레이어 다시 로그인 됨
// 목록 시험목록/A14-관리자.md 번호 A14-E-032 — 모임만: npx playwright test --list tests/admin/phone/a14-sanctions.spec.js
const { test, expect, ui } = require('../../../helpers/fixtures');
const k = require('../_a14-kit');

const { E, TEXT } = k;

test(`${E(32)} 휴대폰 크기 영구 정지 → 해제 → 플레이어 로그인 됨 @smoke`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const w = await k.openAdmin(browser, { phone: true });
    try {
        const box = await k.banUi(w.page, player, { kind: 'PERMANENT', reason: '휴대폰 영구 정지' });
        const pushed = await ui.captureAlert(player.page, () => k.confirmBan(w.page, box));
        expect(pushed).toContain(TEXT.bannedPush);
        expect(await k.loginAlert(player.page, player.account)).toBe(TEXT.bannedLogin('휴대폰 영구 정지'));

        const lift = await k.reasonDialog(w.page, player, '제재 해제', '제재 해제', '휴대폰 해제');
        await lift.getByRole('button', { name: '해제하기' }).click();
        await expect(lift).toBeHidden();
        await k.loginUi(player.page, player.account);
        await expect(player.page).toHaveURL(/\/lobby/);
    } finally {
        await w.close();
    }
});
