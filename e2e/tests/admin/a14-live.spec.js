'use strict';

// 관리자 열린 방 브라우저 시험 (PC 크기) — 플레이어가 화면으로 8명 정원 방을 만들면 열린 방 목록에 그 방 코드·"1 / 8명"
// 목록 시험목록/A14-관리자.md 번호 A14-E-083 — 모임만: npx playwright test --list tests/admin/a14-live.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi } = require('../room/roomHelpers');
const k = require('./_a14-kit');

const { E } = k;

test(`${E(83)} 플레이어 8명 정원 방 만들기 → 열린 방 목록에 보임 @smoke`, async ({ browser, players }) => {
    const player = await k.openPlayer(players);
    const room = await createRoomUi(player, { maxPlayers: 8 });
    const w = await k.openAdmin(browser);
    try {
        await k.goMenu(w.page, '열린 방');
        await expect(k.heading(w.page, '열린 방·판')).toBeVisible();
        await w.page.getByRole('button', { name: '지금 새로 읽기' }).click();
        const row = k.listRows(w.page, '대기방').filter({ hasText: room.roomCode });
        await expect(row).toHaveCount(1);
        await expect(row).toContainText('1 / 8명');
        await expectReadable(row.getByText(room.roomCode, { exact: true }));
    } finally {
        await w.close();
    }
});
