'use strict';

// 점검 중 로비 입장 정리 시험 (PC) — 점검이 켜져 있어도 로비에 오면 대기방 자리는 지워지고, 방 만들기는 점검 안내로 거절
// 목록 A10-로비-입장-방어.md 번호 A10-E-050 (@serial: 점검은 서버 전체에 걸림, 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const db = require('../../helpers/db');
const { clearMaintenance, noticeButton } = require('../maintenance/_maint');
const { openSetup } = require('../room/roomHelpers');

const MESSAGE = '시험 점검 중이에요 (로비 정리)';
const U = (x) => x.account?.uuid ?? x.uuid;

/**
 * 점검 켜기: 시작 시각 없이 켬 → 새 방·새 판만 막고 있던 대기방은 안 닫음 (결정 2026-11-16 아침 15번)
 * 시작 시각을 주면 점검 시계가 대기방을 다 닫아 로비 정리를 못 봄
 */
async function maintenanceOn(internal) {
    await db.query(
        'UPDATE maintenance_state SET is_enabled = 1, message = ?, starts_at = NULL, ends_at = ?, updated_at = NOW() WHERE id = 1',
        [MESSAGE, db.sqlTime(Date.now() + 3600e3)],
    );
    await internal.reloadMaintenance();
}

/** 점검 큰 안내 창이 떠 있으면 "확인했어요"로 닫고 "게임 만들기"가 눌릴 수 있을 때까지 */
async function readyToCreate(page) {
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(async () => {
        const ok = noticeButton(page, '확인했어요');
        if (await ok.isVisible().catch(() => false)) await ok.click({ timeout: 1000 });
        await make.click({ trial: true, timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    return make;
}

test('A10-E-050 PC 대기방 손님 → 점검 켬 → /lobby → 방 자리 정리됨, 방 만들기는 점검 안내 @serial @smoke', async ({ user, bots, internal }) => {
    const page = user.page;
    const [host, ...rest] = await bots.spawn(4);
    const room = await host.createRoom({ maxPlayers: 5 });
    for (const bot of rest) await bot.joinByCode(room.roomCode);
    await ui.joinRoomByCodeUi(page, room.roomCode);
    try {
        await maintenanceOn(internal);
        // 점검만으로는 방이 안 닫힘 (정리는 로비 입장이 함)
        expect((await e2e.roomOf(U(user)))?.roomId, '점검 켠 뒤에도 방에 있음').toBe(room.roomId);
        await page.goto('/lobby');
        await expect.poll(() => e2e.roomOf(U(user)), { message: '내 대기방 자리' }).toBeNull();
        await expect.poll(async () => (await e2e.roomOf(host.uuid))?.players.length, { message: '남은 명단' }).toBe(4);

        await openSetup(page);
        const make = await readyToCreate(page);
        const text = await ui.captureAlert(page, () => make.click());
        expect(text).toContain(MESSAGE);
        await expect(page).toHaveURL(/\/game-setup/);
        expect(await e2e.roomOf(U(user)), '방 안 생김').toBeNull();
    } finally {
        await clearMaintenance(internal);
    }
});
