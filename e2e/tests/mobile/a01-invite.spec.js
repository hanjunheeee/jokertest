'use strict';

// 친구 초대로 대기방 들어오기 브라우저 시험 (모바일) — 로비 친구 시트에서 초대 수락, 손님이 초대하면 "초대중", 3번 쫓겨난 방·탈주 대기 수락 거절 글이 보임
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-561~564 — 받은 초대 거절 글은 그 초대 줄 안 글 칸(data-invite-error)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('../room/_a01b-join-kit');

const { MSG, U } = K;

// 로비 친구 시트 초대 탭에서 그 봇이 보낸 초대 줄 (수락 단추가 보일 때까지)
async function inviteRowOf(page, bot) {
    await ui.gotoLobby(page);
    await K.openInvites(page);
    const row = K.inviteRow(page, bot.nickname);
    await expect(K.acceptButton(row)).toBeVisible({ timeout: 15_000 });
    return row;
}

test('A01-E-561 모바일 초대 수락 (정원 6 · 봇 3) → 모바일 로비 초대 → 수락 → 대기방 @smoke @safari', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await K.botRoom(bots, { max: 6, count: 3 });
    await K.befriendBot(user, host);
    await K.botInvite(host, U(user));
    const row = await inviteRowOf(page, host);
    await K.acceptButton(row).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await K.expectParty(page, 4);
});

test('A01-E-562 모바일 손님이 초대 (정원 7) → 모바일 손님 초대 → "초대중"', async ({ user, bots }) => {
    const page = user.page;
    const [friend] = await bots.spawn(1);
    await K.befriendBot(user, friend);
    const { code } = await K.botRoom(bots, { max: 7, count: 1 });
    await ui.joinRoomByCodeUi(page, code);
    await K.waitVerified(page);
    await page.getByRole('button', { name: '친구 초대' }).click();
    await K.inviteFriendButton(page, friend.nickname).click();
    const inviting = K.invitingButton(page, friend.nickname);
    await expect(inviting).toBeDisabled();
    await expect(inviting).toContainText('초대중');
});

test('A01-E-563 모바일 3번 쫓겨난 방 초대 (정원 6) → 수락 → 3번 추방 글 보임', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const { host, code } = await K.botRoom(bots, { max: 6, count: 2 });
    await K.befriendBot(user, host);
    await K.kickedThrice(user, host, code);
    await K.botInvite(host, U(user));
    const row = await inviteRowOf(page, host);
    await K.acceptButton(row).click();
    await expect(K.inviteError(row)).toHaveText(MSG.KICK3);
    await expectReadable(K.inviteError(row));
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-564 모바일 탈주 대기 초대 (정원 6) → 수락 → 탈주 글 보임 @game', async ({ user, bots, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const [friend] = await bots.spawn(1);
    await K.befriendBot(user, friend);
    await K.desert(table, user);
    await friend.createRoom({ maxPlayers: 6 });
    await K.botInvite(friend, U(user));
    const row = await inviteRowOf(page, friend);
    await K.acceptButton(row).click();
    await expect(K.inviteError(row)).toHaveText(K.DESERTED);
    await expectReadable(K.inviteError(row));
    await expect(page).not.toHaveURL(/\/game-matching/);
});
