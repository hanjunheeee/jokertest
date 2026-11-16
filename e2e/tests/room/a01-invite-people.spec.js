'use strict';

// 사람끼리 친구 초대 브라우저 시험 (어려움, 사람 2) — 초대 3분이 지나면 수락 안 됨(진짜 시간), 탈주 대기 중엔 코드·공개 목록·초대 수락 세 길 다 같은 글로 막힘
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-H-511·512
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { sleep } = require('../../helpers/wait');
const { makeFriends } = require('../../helpers/friends');
const { createRoomUi } = require('./roomHelpers');
const K = require('./_a01b-join-kit');

// 초대가 살아 있는 시간 3분 + 넘긴 5초 (결정「들어옴」 "친구 초대 3분")
const INVITE_TTL_MS = 180_000;
const PAST_TTL_MS = 5_000;

// 사람 방장이 대기방 친구 초대 창에서 친구 하나 초대 → "초대중"이 될 때까지 → 그 뒤 창 닫음
async function hostInvites(host, friendNickname) {
    await K.waitVerified(host.page);
    await K.openInviteModal(host.page);
    await K.inviteFriendButton(host.page, friendNickname).click();
    await expect(K.invitingButton(host.page, friendNickname)).toBeDisabled();
    await K.closeInviteModal(host.page);
}

test('A01-H-511 초대 3분 지나면 수락 안 됨 (정원 6 · 사람 2) → 3분 5초 기다림 → 수락 → 실패 글, 대기방 안 감 @hard @realtime @smoke', async ({ user, players }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    await makeFriends(a, b);
    await createRoomUi(a, { maxPlayers: 6 });
    // B는 받은 초대 탭을 먼저 띄워 둠 (초대가 오면 줄에 수락 단추가 생김, 그대로 3분 넘게 둠)
    await K.openInvites(b.page);
    await hostInvites(a, b.account.nickname);
    const sentAt = Date.now();
    const row = K.inviteRow(b.page, a.account.nickname);
    await expect(K.acceptButton(row)).toBeVisible({ timeout: 15_000 });
    // 확인하려는 시간 규칙이라 손잡이 없이 진짜로 기다림
    await sleep(Math.max(0, sentAt + INVITE_TTL_MS + PAST_TTL_MS - Date.now()));
    await K.acceptButton(row).click();
    const error = K.inviteError(row);
    await expect(error).not.toBeEmpty();
    await expectReadable(error);
    await expect(b.page).not.toHaveURL(/\/game-matching/);
    expect(await K.roomSize(K.U(a))).toBe(1);
});

test('A01-H-512 탈주 대기 중 세 길 다 막힘 (정원 6 · 사람 2 + 봇 3) → 코드·공개 목록·초대 수락 셋 다 "탈주로 …뒤에 참여할 수 있습니다." @hard @game', async ({ user, players, bots, table }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    await makeFriends(a, b);
    // B 탈주 → 5분 막힘
    await K.desert(table, b);
    // A가 공개 방을 만들고 봇 3이 들어옴
    const room = await createRoomUi(a, { maxPlayers: 6, code: false });
    await K.botsIntoHumanRoom(bots, K.U(a), 3);
    await K.expectParty(a.page, 4);
    const title = `${a.account.nickname}의 방`;

    // 1) 코드 입장
    expect(await K.codeAlert(b.page, room.roomCode)).toMatch(K.DESERTED);
    await expect(b.page).not.toHaveURL(/\/game-matching/);
    // 2) 공개 목록 입장
    await K.pickRow(b.page, title);
    expect(await ui.captureAlert(b.page, () => K.enterButton(b.page).click())).toMatch(K.DESERTED);
    await expect(b.page).not.toHaveURL(/\/game-matching/);
    // 3) A가 보낸 초대 수락
    await hostInvites(a, b.account.nickname);
    await ui.gotoLobby(b.page);
    await K.openInvites(b.page);
    const row = K.inviteRow(b.page, a.account.nickname);
    await K.acceptButton(row).click();
    await expect(K.inviteError(row)).toHaveText(K.DESERTED);
    await expectReadable(K.inviteError(row));
    await expect(b.page).not.toHaveURL(/\/game-matching/);
    expect(await K.roomSize(K.U(a))).toBe(4);
});
