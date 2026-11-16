'use strict';

// 친구 초대로 대기방 들어오기 브라우저 시험 (PC) — 봇 방장·봇 손님 초대 수락, 사람 손님·방장이 초대, 거절돼도 "초대중", 가득 참·3번 쫓겨남·시작된 방·탈주·지운 방·판 중 수락 거절, 초대 창, 두 번 수락
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-547~560 — 받은 초대 거절 글은 그 초대 줄 안 글 칸(data-invite-error)에 뜸
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { createRoomUi } = require('./roomHelpers');
const K = require('./_a01b-join-kit');

const { R, W, seats, MSG, U } = K;

// 봇 방 차리고 그 방장 봇을 친구로 맺음 (방 들어가기 전이라야 친구 맺기·초대 받기가 됨)
async function friendRoom(bots, user, o) {
    const r = await K.botRoom(bots, o);
    await K.befriendBot(user, r.host);
    return r;
}

// 로비 친구 창 초대 탭에서 그 봇이 보낸 초대 줄 (보이고 수락 단추 있을 때까지)
async function inviteRowOf(page, bot) {
    await ui.gotoLobby(page);
    await K.openInvites(page);
    const row = K.inviteRow(page, bot.nickname);
    await expect(K.acceptButton(row)).toBeVisible({ timeout: 15_000 });
    return row;
}

test('A01-E-547 봇 방장이 초대 → 사람 수락 (정원 6 · 봇 3) → 대기방, 내 자리 "대기중" @smoke', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await friendRoom(bots, user, { max: 6, count: 3, ready: true });
    await K.botInvite(host, U(user));
    const row = await inviteRowOf(page, host);
    await K.acceptButton(row).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await K.expectSeats(page, seats(R, 3, W));
});

test('A01-E-548 봇 손님이 초대해도 됨 (정원 6 · 봇 방장 + 봇 손님) → 수락 → 대기방', async ({ user, bots }) => {
    const page = user.page;
    const { guests } = await K.botRoom(bots, { max: 6, count: 2 });
    const [guest] = guests;
    await K.befriendBot(user, guest);
    await K.botInvite(guest, U(user));
    const row = await inviteRowOf(page, guest);
    await K.acceptButton(row).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await K.expectParty(page, 3);
});

test('A01-E-549 사람이 손님으로 친구 초대 (정원 7 · 봇 방장 + 사람 손님) → 그 줄 "초대중", 봇 수락 → 인원 +1', async ({ user, bots }) => {
    const page = user.page;
    const [friend] = await bots.spawn(1);
    await K.befriendBot(user, friend);
    const { code } = await K.botRoom(bots, { max: 7, count: 1 });
    await ui.joinRoomByCodeUi(page, code);
    await K.waitVerified(page);
    await K.expectParty(page, 2);
    await K.openInviteModal(page);
    await K.inviteFriendButton(page, friend.nickname).click();
    const inviting = K.invitingButton(page, friend.nickname);
    await expect(inviting).toBeDisabled();
    await expect(inviting).toContainText('초대중');
    await K.botAccept(friend, U(user));
    await K.expectParty(page, 3);
});

test('A01-E-550 사람이 방장으로 초대 (정원 8 · 사람 방장) → "초대중" → 봇 수락 → 새 자리 "대기중"', async ({ user, bots }) => {
    const page = user.page;
    const [friend] = await bots.spawn(1);
    await K.befriendBot(user, friend);
    await createRoomUi(user, { maxPlayers: 8 });
    await K.waitVerified(page);
    await K.openInviteModal(page);
    await K.inviteFriendButton(page, friend.nickname).click();
    await expect(K.invitingButton(page, friend.nickname)).toContainText('초대중');
    await K.botAccept(friend, U(user));
    // 초대 창을 닫고 자리를 봄 (창이 자리를 덮음, Esc로 닫힘)
    await K.closeInviteModal(page);
    await K.expectSeats(page, seats(W, 2));
    await K.expectParty(page, 2);
});

test('A01-E-551 거절당해도 "초대중" 그대로 (정원 6 · 사람 방장) → 봇 친구 거절 → 그 줄 "초대중"·단추 꺼짐', async ({ user, bots }) => {
    const page = user.page;
    const [friend] = await bots.spawn(1);
    await K.befriendBot(user, friend);
    await createRoomUi(user, { maxPlayers: 6 });
    await K.waitVerified(page);
    await K.openInviteModal(page);
    await K.inviteFriendButton(page, friend.nickname).click();
    await expect(K.invitingButton(page, friend.nickname)).toBeDisabled();
    await K.botDecline(friend, U(user));
    // 창을 닫았다 다시 열어도 (친구 목록을 새로 받음) 한 번 초대한 친구는 다시 초대 못 함
    await K.closeInviteModal(page);
    await K.openInviteModal(page);
    const inviting = K.invitingButton(page, friend.nickname);
    await expect(inviting).toBeDisabled();
    await expect(inviting).toContainText('초대중');
    await expect(K.inviteFriendButton(page, friend.nickname)).toHaveCount(0);
});

test('A01-E-552 가득 찬 방 초대 수락 (정원 5, 초대 뒤 봇으로 꽉 참) → 초대 줄에 "방이 가득 찼습니다." 보임', async ({ user, bots }) => {
    const page = user.page;
    const { host, room } = await friendRoom(bots, user, { max: 5, count: 2 });
    await K.botInvite(host, U(user));
    await K.addBots(bots, room, 3);
    const row = await inviteRowOf(page, host);
    await K.acceptButton(row).click();
    await expect(K.inviteError(row)).toHaveText(MSG.FULL);
    await expectReadable(K.inviteError(row));
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-553 3번 쫓겨난 방 초대 (정원 6) → 수락 → "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다." 보임', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const { host, code } = await friendRoom(bots, user, { max: 6, count: 2 });
    await K.kickedThrice(user, host, code);
    await K.botInvite(host, U(user));
    const row = await inviteRowOf(page, host);
    await K.acceptButton(row).click();
    await expect(K.inviteError(row)).toHaveText(MSG.KICK3);
    await expectReadable(K.inviteError(row));
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-554 시작된 방 초대 (판 5명 봇) → 대기방 때 받은 초대를 판 시작 뒤 수락 → "방을 찾을 수 없습니다." 보임 @game', async ({ user, bots }) => {
    const page = user.page;
    // 판이 시작되면 서버가 그 방 초대를 취소하고 알림을 보냄 → 그 알림만 늦게 온 때를 만듦 (안 막으면 수락 단추가 사라짐)
    const lateUpdate = K.eventFrame('game_invite_updated');
    const tap = await K.tapSocket(page, { down: (m, t) => (t.on && lateUpdate(m) ? 'drop' : null) });
    const r = await friendRoom(bots, user, { max: 6, count: 5, ready: true, settings: customRoleSettings({ JOKER: 1 }) });
    const { host, room } = r;
    await K.fixBotRoles(r);
    await K.botInvite(host, U(user));
    const row = await inviteRowOf(page, host);
    tap.on = true;
    await host.startGame(room.roomId, room.settingsVersion);
    await K.acceptButton(row).click();
    await expect(K.inviteError(row)).toHaveText(MSG.ROOM_GONE);
    await expectReadable(K.inviteError(row));
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-555 탈주 대기 중 초대 수락 (정원 6) → "탈주로 …뒤에 참여할 수 있습니다." 보임 @game', async ({ user, bots, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    // 친구는 판에 들어가기 전에 맺어 둠
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

test('A01-E-556 방이 삭제된 뒤 수락 (정원 6) → 봇 방장 삭제 → 수락 → 실패 글 보임', async ({ user, bots }) => {
    const page = user.page;
    // 방을 지우면 서버가 초대를 취소하고 알림을 보냄 → 그 알림만 늦게 온 때 (안 막으면 수락 단추가 사라짐)
    const lateUpdate = K.eventFrame('game_invite_updated');
    const tap = await K.tapSocket(page, { down: (m, t) => (t.on && lateUpdate(m) ? 'drop' : null) });
    const { host } = await friendRoom(bots, user, { max: 6, count: 2 });
    await K.botInvite(host, U(user));
    const row = await inviteRowOf(page, host);
    tap.on = true;
    await K.botDelete(host);
    await K.acceptButton(row).click();
    await expect(K.inviteError(row)).toHaveText(MSG.ROOM_GONE);
    await expectReadable(K.inviteError(row));
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-557 판 중 받은 초대 (사람 판 6명 진행 중) → 판 중 화면에 남은 초대 수락은 막힘, 판 그대로 @game', async ({ user, bots, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    // 초대는 판에 들어가기 전에 받아 둠 (판 중인 사람에겐 초대를 못 보냄)
    const { host } = await friendRoom(bots, user, { max: 6, count: 1 });
    await K.botInvite(host, U(user));
    // 직업은 정해 둠: 나 시민 · 첫 봇 광대 · 나머지 시민 (직접 지정 구성)
    const t = await table.setup({
        humans: [user], bots: 5, settings: customRoleSettings({ JOKER: 1 }),
        roles: ({ bots: list }) => Object.fromEntries([[U(user), 'CITIZEN'], ...list.map((b, i) => [b.account.uuid, i === 0 ? 'JOKER' : 'CITIZEN'])]),
    });
    expect((await t.player(U(user)))?.role, '정한 내 직업').toBe('CITIZEN');
    // 판 중 산 사람은 로비를 열면 판 화면으로 돌려보내짐 → 그 정리 요청(enter_lobby)만 막아 로비 친구 창의 초대가 남은 때를 만듦
    const lobbyEntry = K.eventFrame('enter_lobby');
    await K.tapSocket(page, { up: (m) => (lobbyEntry(m) ? 'drop' : null) });
    const row = await inviteRowOf(page, host);
    await K.acceptButton(row).click();
    await expect(K.inviteError(row)).toHaveText(MSG.IN_GAME);
    await expect(page).not.toHaveURL(/\/game-matching/);
    // 판은 그대로: 나는 아직 산 채로 그 판에 있고, 초대한 방 인원도 그대로
    const me = await t.player(U(user));
    expect(me?.alive, '판에 산 채로 남음').toBe(true);
    expect(await K.roomSize(host.uuid)).toBe(1);
});

test('A01-E-558 친구 초대 창은 대기방 안에서만 (정원 6) → 대기방 친구 초대 단추 → 창, 친구 줄마다 초대 단추', async ({ user, bots }) => {
    const page = user.page;
    const friends = await bots.spawn(2);
    for (const f of friends) await K.befriendBot(user, f);
    // 로비엔 초대 단추가 없음 (친구 목록 단추만)
    await ui.gotoLobby(page);
    await expect(page.getByRole('button', { name: '친구 초대' })).toHaveCount(0);
    const { code } = await K.botRoom(bots, { max: 6, count: 1 });
    await ui.joinRoomByCodeUi(page, code);
    await K.waitVerified(page);
    const dialog = await K.openInviteModal(page);
    const list = dialog.getByRole('list', { name: '초대할 친구 목록' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    for (const f of friends) await expect(K.inviteFriendButton(page, f.nickname)).toBeEnabled();
});

test('A01-E-559 가득 찬 방에서 초대 보내기 (정원 5 · 사람 방장 + 봇 4) → "방이 가득 차 초대를 보낼 수 없습니다."', async ({ user, bots }) => {
    const page = user.page;
    const [friend] = await bots.spawn(1);
    await K.befriendBot(user, friend);
    await createRoomUi(user, { maxPlayers: 5 });
    await K.botsIntoHumanRoom(bots, U(user), 4);
    await K.expectParty(page, 5);
    await K.waitVerified(page);
    const dialog = await K.openInviteModal(page);
    await K.inviteFriendButton(page, friend.nickname).click();
    const error = dialog.getByRole('alert');
    await expect(error).toHaveText(MSG.INVITE_FULL);
    await expectReadable(error);
});

test('A01-E-560 수락 두 번 빠르게 (정원 6) → 대기방 한 번, 인원 +1만', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await friendRoom(bots, user, { max: 6, count: 2 });
    await K.botInvite(host, U(user));
    const row = await inviteRowOf(page, host);
    await K.acceptButton(row).dblclick();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await K.expectParty(page, 3);
    expect(await K.roomSize(host.uuid)).toBe(3);
    await expect(K.seatBadges(page)).toHaveCount(3);
});
