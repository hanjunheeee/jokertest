'use strict';

// 세 길로 다섯 사람이 모이는 브라우저 시험 (어려움, 사람 5: PC 3 + 모바일 2) — 코드·공개 목록·초대로 들어와 서로 "대기중"이 보이고, 각자 준비하면 다섯 화면 모두 "준비완료"
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-H-514
const { test, expect, ui } = require('../../helpers/fixtures');
const { makeFriends } = require('../../helpers/friends');
const { createRoomUi } = require('./roomHelpers');
const K = require('./_a01b-join-kit');

const { R, W, seats } = K;

test('A01-H-514 세 길로 모여 전원 준비 (정원 5 · 사람 5: PC 3 + 모바일 2) → 다섯 화면 모두 서로 "대기중" → 각자 준비 → 다섯 화면 모두 5자리 "준비완료" @hard @smoke', async ({ user, players }) => {
    test.setTimeout(300_000);
    const a = user; // PC 방장
    const b = await players.add(); // PC 코드
    const c = await players.add(); // PC 공개 목록
    const d = await players.add({ mobile: true }); // 모바일 초대
    const e = await players.add({ mobile: true }); // 모바일 코드
    await makeFriends(a, d);

    // A가 공개 방(정원 5)을 만듦
    const room = await createRoomUi(a, { maxPlayers: 5, code: false });
    const title = `${a.account.nickname}의 방`;
    await K.waitVerified(a.page);

    // B 코드 · C 공개 목록 · D 초대 · E(모바일) 코드
    await ui.joinRoomByCodeUi(b.page, room.roomCode);
    await K.pickRow(c.page, title);
    await K.enterButton(c.page).click();
    await expect(c.page).toHaveURL(/\/game-matching/);
    await K.openInviteModal(a.page);
    await K.inviteFriendButton(a.page, d.account.nickname).click();
    await expect(K.invitingButton(a.page, d.account.nickname)).toBeDisabled();
    await K.closeInviteModal(a.page);
    await K.openInvites(d.page);
    const row = K.inviteRow(d.page, a.account.nickname);
    await K.acceptButton(row).click();
    await expect(d.page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await ui.joinRoomByCodeUi(e.page, room.roomCode);

    // 다섯 화면 모두 다섯 자리 "대기중"
    const everyone = [a, b, c, d, e];
    for (const p of everyone) {
        await K.expectParty(p.page, 5);
        await K.expectSeats(p.page, seats(W, 5));
    }
    // 각자 준비 → 다섯 화면 모두 다섯 자리 "준비완료"
    for (const p of everyone) {
        await K.waitVerified(p.page);
        await ui.readyUi(p.page);
        await expect(p.page.getByRole('button', { name: '준비취소' })).toBeEnabled();
    }
    for (const p of everyone) await K.expectSeats(p.page, seats(R, 5));
});
