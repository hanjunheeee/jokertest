'use strict';

// 점검 중 로비 입장 정리 어려움 시험 (PC) — 점검이 켜진 대기방에서 손님 A가 로비로 가면 같은 방 손님 B 화면에서 A가 빠짐
// 목록 A10-로비-입장-방어.md 번호 A10-H-026 (사람 2 + 봇 3, @serial: 점검은 서버 전체에 걸림 — 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const db = require('../../helpers/db');
const { clearMaintenance } = require('../maintenance/_maint');
const H = require('../result/_a08-hard-kit');

const MESSAGE = '시험 점검 중이에요 (로비 정리 어려움)';
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

test('A10-H-026 사람 2 + 봇 3 = 5명 대기방 → 점검 켬 → A /lobby → B 화면에서 A 빠짐 @hard @serial @smoke', async ({ user, players, bots, internal }) => {
    test.setTimeout(240_000);
    const a = user;
    const b = await players.add();
    const [host, ...rest] = await bots.spawn(3);
    const room = await host.createRoom({ maxPlayers: 5 });
    for (const bot of rest) await bot.joinByCode(room.roomCode);
    await ui.joinRoomByCodeUi(a.page, room.roomCode);
    await ui.joinRoomByCodeUi(b.page, room.roomCode);
    await H.expectParty(b.page, 5);
    try {
        await maintenanceOn(internal);
        // 점검만으로는 방이 안 닫힘 (정리는 로비 입장이 함)
        expect((await e2e.roomOf(U(a)))?.roomId, '점검 켠 뒤에도 A 방에 있음').toBe(room.roomId);
        await a.page.goto('/lobby');
        await expect.poll(() => e2e.roomOf(U(a)), { message: 'A 대기방 자리' }).toBeNull();
        await H.expectParty(b.page, 4);
        expect(await H.seatsOf(U(b))).not.toContain(U(a));
    } finally {
        await clearMaintenance(internal);
    }
});
