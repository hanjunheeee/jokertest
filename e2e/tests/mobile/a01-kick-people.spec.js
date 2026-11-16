'use strict';

// 대기방 추방 브라우저 시험 (모바일 방장 + PC 손님, 어려움) — 받은 버그 7: 폰 방장이 한 번 탭하면 PC 손님이 바로 방 목록으로
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-H-503 (사람 2 + 봇 4, 판 안 씀)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const K = require('../room/_a01b-kick-kit');

const { U } = K;

test('A01-H-503 [버그 7] 모바일 방장 + PC 손님 — 폰에서 한 번 탭 → PC 손님 방 목록, 폰 시트 닫힘 (정원 7 · 사람 2 + 봇 4) @hard @smoke', async ({ user, players, bots }) => {
    const a = user;
    // 손님은 PC 화면 (mobile 프로젝트라도 PC 창으로 엶)
    const b = await players.add({ mobile: false });
    const room = await K.humanRoom(a, { maxPlayers: 7 });
    await ui.joinRoomByCodeUi(b.page, room.roomCode);
    await K.joinBots(bots, 4, room.roomCode);
    await K.expectParty(a.page, 6);

    await K.openKick(a.page);
    await K.kickRowButton(a.page, b).click();

    await expect(K.kickDialog(a.page)).toHaveCount(0);
    await K.expectParty(a.page, 5);
    await expect(b.page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    expect(await e2e.roomOf(U(b)), '손님 방 자리 없음').toBeNull();
});
